import { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import Icon from './Icon'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'
import { supabase } from '../lib/supabase'
import { BASE_CURRENCY } from '../lib/currency'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc

const PDF_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku',   provider: 'Anthropic', badge: 'Fast · ~$0.01/stmt',  envKey: 'ANTHROPIC_API_KEY' },
  { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet',  provider: 'Anthropic', badge: 'Best · ~$0.05/stmt',  envKey: 'ANTHROPIC_API_KEY' },
  { id: 'gemini-1.5-flash',          label: 'Gemini Flash',   provider: 'Google',    badge: 'Free tier',           envKey: 'GEMINI_API_KEY'    },
  { id: 'llama-3.3-70b-versatile',   label: 'Llama 3.3 70B', provider: 'Groq',      badge: 'Free tier · Fast',    envKey: 'GROQ_API_KEY'      },
]
const DEFAULT_PDF_MODEL = 'claude-haiku-4-5-20251001'

async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  let text = ''
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    text += content.items.map(item => item.str).join(' ') + '\n'
  }
  return text
}

function serialToISO(serial) {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
}

function matchName(name, list) {
  if (!name) return null
  const n = name.toLowerCase().trim()
  return list.find(item => item.name.toLowerCase() === n) || null
}

function inferAccount(name) {
  const n = name.toLowerCase()
  const isCOP = /davivienda|bancolombia|occidente|colpensiones|propulsar|nequi|banco de/.test(n)
  const currency = isCOP ? 'COP' : 'CAD'
  let type = 'checking'
  if (/visa|mastercard|credit|costco|\btc\b|tarjeta/.test(n)) type = 'credit'
  else if (/rrsp/.test(n))                                     type = 'savings'
  else if (/tfsa|afc|ahorro|saving/.test(n))                   type = 'savings'
  else if (/investment|propulsar|colpensiones/.test(n))        type = 'investment'
  else if (/cash|efectivo/.test(n))                            type = 'cash'
  return { currency, type }
}

function parseDate(raw) {
  if (typeof raw === 'number' && raw > 40000) return serialToISO(raw) + 'T12:00:00'
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + 'T12:00:00'
  // try common date formats: MM/DD/YYYY, DD/MM/YYYY
  const parts = s.split(/[\/\-]/)
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number)
    // YYYY-MM-DD already handled above; try MM/DD/YYYY
    if (c > 1900) return `${c}-${String(b).padStart(2,'0')}-${String(a).padStart(2,'0')}T12:00:00`
  }
  const d = new Date(s)
  return isNaN(d) ? null : d.toISOString().slice(0, 10) + 'T12:00:00'
}

// Normalize header: lowercase, remove accents, trim
function norm(s) {
  return String(s).toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Map from canonical field name → accepted aliases (first match wins, so higher-priority aliases come first)
const ALIASES = {
  fecha:       ['fecha', 'date', 'fecha de pago', 'dia', 'day', 'periodo', 'f.'],
  descripcion: ['descripcion', 'description', 'concepto', 'detail', 'detalle', 'comercio', 'merchant'],
  monto:       ['signed amount', 'monto', 'amount', 'valor', 'value', 'importe', 'total', 'costo', 'cost'],
  tipo:        ['direction', 'tipo', 'type', 'class', 'clase'],
  categoria:   ['categoria', 'category', 'cat', 'rubro'],
  cuenta:      ['account name', 'cuenta', 'account', 'banco', 'bank', 'tarjeta'],
  quien:       ['quien', 'who', 'persona', 'person', 'responsable'],
  notas:       ['transaction category', 'notas', 'notes', 'nota', 'note', 'comentario', 'comment'],
}

function buildHeaderMap(rawHeaders) {
  const normed = rawHeaders.map(norm)
  const map = {}
  // Check aliases in priority order so earlier aliases win over later ones
  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      const i = normed.indexOf(alias)
      if (i >= 0) { map[field] = i; break }
    }
  }
  return map
}

// Find the row index where actual column headers live (skip title rows like "EXPENDITURES")
function findHeaderRow(raw) {
  const allAliases = new Set(Object.values(ALIASES).flat())
  for (let i = 0; i < Math.min(raw.length, 6); i++) {
    if (raw[i].some(h => allAliases.has(norm(String(h))))) return i
  }
  return 0
}

function parseAmount(raw) {
  return parseFloat(String(raw).replace(/[$,\s]/g, '')) || 0
}

function parseSheet(ws, categories, accounts) {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (!raw.length) return { rows: [], isSheet1: false, detectedHeaders: [] }

  // Sheet1 format: col A = serial date (no headers)
  const isSheet1 = typeof raw[0]?.[0] === 'number' && raw[0][0] > 40000

  let parsed = []
  let detectedHeaders = []

  if (isSheet1) {
    parsed = raw
      .filter(r => typeof r[0] === 'number' && r[0] > 40000)
      .map(r => ({
        occurred_at:   new Date(serialToISO(r[0]) + 'T12:00:00').toISOString(),
        category_name: String(r[1] || '').trim(),
        description:   String(r[2] || '').trim(),
        amount:        r[3] !== '' ? -Math.abs(parseAmount(r[3])) : 0,
        type:          'expense',
        account_name:  '',
        person:        '',
        notes:         null,
        is_recurring:  false,
        status:        'review',
      }))
  } else {
    // Find real header row (skip title rows like "EXPENDITURES")
    const headerRowIdx  = findHeaderRow(raw)
    const fullHeaderRow = raw[headerRowIdx] || []

    // Find the DATE column that has CATEGORY within the next 4 columns.
    // Uses a tight window so that a side-by-side income table (DATE, DESCRIPTION, AMOUNT)
    // is skipped while the expenditure table (DATE, CATEGORY, DESCRIPTION, AMOUNT) is found.
    let dateColIdx = -1
    for (let i = 0; i < fullHeaderRow.length; i++) {
      if (!ALIASES.fecha.includes(norm(String(fullHeaderRow[i])))) continue
      const nearby = fullHeaderRow.slice(i + 1, i + 4).map(h => norm(String(h)))
      if (nearby.some(h => ALIASES.categoria.includes(h))) { dateColIdx = i; break }
    }
    // Fallback: first DATE column if no DATE+CATEGORY pair found
    if (dateColIdx < 0)
      dateColIdx = fullHeaderRow.findIndex(h => ALIASES.fecha.includes(norm(String(h))))
    const startCol = dateColIdx >= 0 ? dateColIdx : 0

    const rawHeaders = fullHeaderRow.slice(startCol)
    detectedHeaders  = rawHeaders.map(h => String(h).trim()).filter(Boolean)
    const hmap       = buildHeaderMap(rawHeaders)  // indices relative to startCol

    const get = (row, field) => {
      const i = hmap[field]
      return i !== undefined ? String(row[startCol + i] ?? '').trim() : ''
    }

    parsed = raw.slice(headerRowIdx + 1)
      // Only keep rows that have a value in the DATE column (filters out left-side table rows)
      .filter(r => dateColIdx >= 0
        ? r[dateColIdx] !== '' && r[dateColIdx] != null
        : r.some(c => c !== ''))
      .map(r => {
        const rawDateVal = dateColIdx >= 0 ? r[dateColIdx] : ''
        const isoTs  = rawDateVal !== '' ? parseDate(rawDateVal) : null
        const rawAmt = parseAmount(get(r, 'monto'))
        let tipo = (get(r, 'tipo') || 'expense').toLowerCase()
        if (tipo === 'credit') tipo = 'income'
        else if (tipo === 'debit') tipo = 'expense'
        return {
          occurred_at:   isoTs ? new Date(isoTs).toISOString() : new Date().toISOString(),
          category_name: get(r, 'categoria'),
          description:   get(r, 'descripcion'),
          amount:        tipo === 'income' ? Math.abs(rawAmt) : -Math.abs(rawAmt),
          type:          tipo,
          account_name:  get(r, 'cuenta'),
          person:        get(r, 'quien'),
          notes:         get(r, 'notas') || null,
          is_recurring:  false,
          status:        'review',
        }
      })
  }

  let catMatched = 0, catUnmatched = 0, acctMatched = 0, acctNew = 0
  const resolved = parsed.map(r => {
    const cat  = matchName(r.category_name, categories)
    const acct = matchName(r.account_name, accounts)
    if (r.category_name) { cat ? catMatched++ : catUnmatched++ }
    if (r.account_name)  { acct ? acctMatched++ : acctNew++ }
    return {
      ...r,
      category_id:       cat?.id  || null,
      _resolved_acct_id: acct?.id || null,
      _cat_warn:         !!r.category_name && !cat,
      _acct_new:         !!r.account_name  && !acct,
    }
  })

  return { rows: resolved, isSheet1, catMatched, catUnmatched, acctMatched, acctNew, detectedHeaders }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ImportModal({ onClose, onSave }) {
  const { accounts } = useAccounts()
  const { categories, ensureCategories } = useCategories()
  const { t } = useTranslation()

  const [step, setStep]             = useState('upload')
  const [wb, setWb]                 = useState(null)
  const [sheetNames, setSheetNames] = useState([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [rows, setRows]             = useState(null)
  const [preview, setPreview]       = useState(null)
  const [stats, setStats]           = useState(null)
  const [dragOver, setDragOver]     = useState(false)
  const [parsingMsg, setParsingMsg] = useState('')
  const [pdfModel, setPdfModel]     = useState(() => localStorage.getItem('hacienda_pdf_model') || DEFAULT_PDF_MODEL)
  const [defaultAcct, setDefaultAcct]     = useState('')
  const [defaultPerson, setDefaultPerson] = useState('Alexander')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState(null)
  const [dupCount, setDupCount]     = useState(0)
  const [skipDups, setSkipDups]     = useState(true)
  const [newAcctNames, setNewAcctNames] = useState([])
  const fileRef = useRef()

  // Group accounts by currency for the picker (base currency first)
  const accountGroups = Object.entries(
    accounts.reduce((acc, a) => {
      const cur = a.currency || BASE_CURRENCY
      ;(acc[cur] = acc[cur] || []).push(a)
      return acc
    }, {})
  ).sort(([a], [b]) => (a === BASE_CURRENCY ? -1 : b === BASE_CURRENCY ? 1 : a.localeCompare(b)))

  const loadFile = useCallback(async (f) => {
    setError(null)

    if (f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf') {
      setStep('parsing')
      setParsingMsg('Extracting text from PDF…')
      try {
        const text = await extractPdfText(f)
        const modelLabel = PDF_MODELS.find(m => m.id === pdfModel)?.label || 'AI'
        setParsingMsg(`Analyzing with ${modelLabel} — this takes a few seconds…`)
        const res = await fetch('/api/parse-statement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, model: pdfModel }),
        })
        if (!res.ok) {
          if (res.status === 404) throw new Error('PDF parsing requires a deployed environment. Run `vercel dev` locally or deploy to Vercel.')
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Server error ${res.status}`)
        }
        const { transactions } = await res.json()
        if (!Array.isArray(transactions) || transactions.length === 0) {
          throw new Error('No transactions found in this PDF. Try a different statement.')
        }
        const rows = transactions.map(tx => ({
          occurred_at:       new Date(((tx.date && /^\d{4}-\d{2}-\d{2}$/.test(tx.date)) ? tx.date : new Date().toISOString().slice(0, 10)) + 'T12:00:00').toISOString(),
          description:       String(tx.description || '').trim(),
          amount:            typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount).replace(/[$, ]/g, '')) || 0,
          type:              ['expense', 'income', 'transfer'].includes(tx.type) ? tx.type : 'expense',
          category_name:     '',
          category_id:       null,
          account_name:      '',
          person:            '',
          notes:             null,
          is_recurring:      false,
          status:            'review',
          _cat_warn:         false,
          _acct_new:         false,
          _resolved_acct_id: null,
        }))
        const dates = rows.map(r => r.occurred_at.slice(0, 10)).filter(Boolean)
        let taggedRows = rows
        let dups = 0
        if (dates.length > 0) {
          const minDate = dates.reduce((a, b) => a < b ? a : b)
          const maxDate = dates.reduce((a, b) => a > b ? a : b)
          const { data: existing } = await supabase
            .from('transactions')
            .select('occurred_at, amount, description')
            .gte('occurred_at', minDate)
            .lte('occurred_at', maxDate + 'T23:59:59')
          const existingSet = new Set(
            (existing || []).map(t => `${t.occurred_at.slice(0, 10)}|${t.amount}|${t.description?.toLowerCase()}`)
          )
          taggedRows = rows.map(r => ({
            ...r,
            _isDup: existingSet.has(`${r.occurred_at.slice(0, 10)}|${r.amount}|${r.description?.toLowerCase()}`),
          }))
          dups = taggedRows.filter(r => r._isDup).length
        }
        setSelectedSheet('PDF')
        setStats({ total: rows.length, isSheet1: false, isPdf: true, catMatched: 0, catUnmatched: 0, detectedHeaders: [] })
        setRows(taggedRows)
        setPreview(taggedRows.slice(0, 15))
        setDupCount(dups)
        setSkipDups(dups > 0)
        setNewAcctNames([])
        setStep('preview')
      } catch (err) {
        setError(err.message)
        setStep('upload')
      }
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
        setWb(workbook)
        const names = workbook.SheetNames
        setSheetNames(names)

        if (names.length === 1) {
          applySheet(workbook, names[0])
        } else {
          setSelectedSheet(names[0])
          setStep('sheet')
        }
      } catch (err) {
        setError(t('import.parseError', { msg: err.message }))
      }
    }
    reader.readAsArrayBuffer(f)
  }, [accounts, categories]) // eslint-disable-line

  async function applySheet(workbook, sheetName) {
    const result = parseSheet(workbook.Sheets[sheetName], categories, accounts)

    // Duplicate detection: query existing transactions for the same date range
    const dates = result.rows.map(r => r.occurred_at.slice(0, 10)).filter(Boolean)
    let taggedRows = result.rows
    let dups = 0
    if (dates.length > 0) {
      const minDate = dates.reduce((a, b) => a < b ? a : b)
      const maxDate = dates.reduce((a, b) => a > b ? a : b)
      const { data: existing } = await supabase
        .from('transactions')
        .select('occurred_at, amount, description')
        .gte('occurred_at', minDate)
        .lte('occurred_at', maxDate + 'T23:59:59')
      const existingSet = new Set(
        (existing || []).map(t =>
          `${t.occurred_at.slice(0,10)}|${t.amount}|${t.description?.toLowerCase()}`
        )
      )
      taggedRows = result.rows.map(r => ({
        ...r,
        _isDup: existingSet.has(
          `${r.occurred_at.slice(0,10)}|${r.amount}|${r.description?.toLowerCase()}`
        ),
      }))
      dups = taggedRows.filter(r => r._isDup).length
    }
    const unmatchedAccts = [...new Set(
      result.rows.filter(r => r._acct_new).map(r => r.account_name).filter(Boolean)
    )]
    // Set all state together after the await so React batches into one render
    // and the preview table never sees preview=null while step='preview'
    setSelectedSheet(sheetName)
    setStats({ total: result.rows.length, ...result })
    setRows(taggedRows)
    setPreview(taggedRows.slice(0, 15))
    setDupCount(dups)
    setSkipDups(dups > 0)
    setNewAcctNames(unmatchedAccts)
    setStep('preview')
  }

  function handleSheetConfirm() {
    if (wb && selectedSheet) applySheet(wb, selectedSheet)
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) loadFile(f)
  }

  async function handleImport() {
    if (!rows?.length) return
    setSaving(true); setError(null)
    try {
      const activeRows = skipDups ? rows.filter(r => !r._isDup) : rows
      if (!activeRows.length) { setError('All rows are duplicates — nothing to import.'); setSaving(false); return }

      const unmatchedNames = [...new Set(
        activeRows.filter(r => r._cat_warn && r.category_name).map(r => r.category_name)
      )]
      let catMap = {}
      if (unmatchedNames.length > 0) catMap = await ensureCategories(unmatchedNames)

      // Auto-create accounts that were detected in the file but don't exist yet
      let newAcctMap = {}
      if (newAcctNames.length > 0) {
        const { data: { session } } = await supabase.auth.getSession()
        const user_id = session?.user?.id
        const { data: created, error: acctErr } = await supabase
          .from('accounts')
          .insert(newAcctNames.map(name => ({ user_id, name, ...inferAccount(name), balance: 0, is_active: true })))
          .select()
        if (acctErr) throw acctErr
        ;(created || []).forEach(a => { newAcctMap[a.name.toLowerCase()] = a.id })
      }

      const VALID_PERSONS = new Set(['Alexander', 'Marcela', 'Shared'])
      const toInsert = activeRows.map(({ _cat_warn, _acct_new, _isDup, _resolved_acct_id, category_name, account_name, ...r }) => ({
        ...r,
        category_id: r.category_id || (category_name ? catMap[category_name.toLowerCase()] : null) || null,
        account_id:  _resolved_acct_id
                     || (account_name ? newAcctMap[account_name.toLowerCase()] : null)
                     || defaultAcct || null,
        person:      VALID_PERSONS.has(r.person) ? r.person : defaultPerson,
      }))
      await onSave(toInsert)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setStep('upload'); setWb(null); setRows(null); setPreview(null)
    setStats(null); setError(null); setSheetNames([]); setSelectedSheet('')
    setDefaultAcct(''); setDefaultPerson('Alexander')
    setDupCount(0); setSkipDups(true); setNewAcctNames([])
    setParsingMsg('')
  }

  return (
    <Modal title={t('import.title')} onClose={onClose} wide>
      <div className="modal-body">

        {/* ── PDF parsing spinner ── */}
        {step === 'parsing' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 0' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              border: '3px solid rgba(99,102,241,.25)',
              borderTopColor: 'var(--accent)',
              animation: 'spin 0.7s linear infinite',
            }} />
            <p style={{ fontSize: 14, color: 'var(--ink-1)', margin: 0 }}>{parsingMsg}</p>
            <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: 0 }}>Usually 5–15 seconds</p>
          </div>
        )}

        {/* ── Step 1: Drop zone ── */}
        {step === 'upload' && (
          <div
            className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current.click()}
          >
            <div className="drop-zone-icon"><Icon name="upload" size={20} /></div>
            <h3>{t('import.dropTitle')}</h3>
            <p>{t('import.dropSub')}</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf"
              style={{ display: 'none' }}
              onChange={e => e.target.files[0] && loadFile(e.target.files[0])} />
          </div>
        )}

        {/* ── PDF model selector (only on upload step) ── */}
        {step === 'upload' && (
          <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              AI model for PDF parsing
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {PDF_MODELS.map(m => (
                <button key={m.id} type="button"
                  onClick={() => { setPdfModel(m.id); localStorage.setItem('hacienda_pdf_model', m.id) }}
                  style={{
                    padding: '8px 10px', borderRadius: 8, border: '1px solid', cursor: 'pointer',
                    borderColor: pdfModel === m.id ? 'var(--accent)' : 'var(--border)',
                    background:  pdfModel === m.id ? 'rgba(99,102,241,.1)' : 'var(--bg-2)',
                    textAlign: 'left',
                  }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: pdfModel === m.id ? 'var(--accent)' : 'var(--ink-0)' }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                    {m.provider} · {m.badge}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 2: Sheet selector ── */}
        {step === 'sheet' && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--ink-1)', marginBottom: 16 }}
              dangerouslySetInnerHTML={{ __html: t('import.multiSheet', { count: sheetNames.length }) }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sheetNames.map(name => (
                <label key={name} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  background: selectedSheet === name ? 'rgba(99,102,241,.12)' : 'var(--bg-2)',
                  border: `1px solid ${selectedSheet === name ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  color: selectedSheet === name ? 'var(--accent)' : 'var(--ink-1)',
                }}>
                  <input type="radio" name="sheet" value={name}
                    checked={selectedSheet === name}
                    onChange={() => setSelectedSheet(name)}
                    style={{ accentColor: 'var(--accent)' }} />
                  {name}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3: Preview ── */}
        {step === 'preview' && stats && (
          <>
            {!stats.isPdf && (
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12 }}>
                {t('import.sheetInfo')}<strong style={{ color: 'var(--ink-1)' }}>{selectedSheet}</strong>
                {' · '}{t('import.formatInfo')}
                <strong style={{ color: 'var(--ink-1)' }}>
                  {stats.isSheet1 ? t('import.formatNoHeaders') : t('import.formatWithHeaders')}
                </strong>
              </div>
            )}
            {stats.isPdf && (
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12 }}>
                <strong style={{ color: 'var(--accent)' }}>✦ AI-parsed PDF</strong>
                {' · '}{PDF_MODELS.find(m => m.id === pdfModel)?.label || 'AI'}
                {' · '}{stats.total} transactions extracted — review before importing
              </div>
            )}

            {!stats.isSheet1 && !stats.isPdf && stats.detectedHeaders?.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 12,
                background: 'var(--bg-2)', borderRadius: 8, padding: '8px 12px' }}>
                {t('import.detectedCols')} {stats.detectedHeaders.map((h, i) => (
                  <span key={i} style={{
                    display: 'inline-block', margin: '2px 3px', padding: '1px 6px', borderRadius: 4,
                    background: Object.values(ALIASES).flat().includes(norm(h)) ? 'rgba(99,102,241,.18)' : 'var(--bg-1)',
                    color: Object.values(ALIASES).flat().includes(norm(h)) ? 'var(--accent)' : 'var(--ink-3)',
                    border: '1px solid var(--border)',
                  }}>{h}</span>
                ))}
                <span style={{ display: 'block', marginTop: 4 }}>{t('import.recognizedNote')}</span>
              </div>
            )}

            <div className="import-stats">
              <div className="import-stat">
                <div className="import-stat-num">{stats.total}</div>
                <div className="import-stat-label">{t('import.statsTotal')}</div>
              </div>
              {!stats.isPdf && (
                <div className="import-stat">
                  <div className="import-stat-num" style={{ color: stats.catUnmatched ? 'var(--warn)' : 'var(--pos)' }}>
                    {stats.catMatched}
                  </div>
                  <div className="import-stat-label">{t('import.statsCatOk')}</div>
                </div>
              )}
              {!stats.isPdf && stats.catUnmatched > 0 && (
                <div className="import-stat">
                  <div className="import-stat-num" style={{ color: 'var(--warn)' }}>{stats.catUnmatched}</div>
                  <div className="import-stat-label">{t('import.statsCatNo')}</div>
                </div>
              )}
            </div>

            {/* Auto-create accounts banner */}
            {newAcctNames.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
                background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.25)',
                borderRadius: 8, marginBottom: 14,
              }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>✦</span>
                <div style={{ fontSize: 12.5, color: 'var(--ink-1)', flex: 1 }}>
                  <strong style={{ color: 'var(--accent)' }}>
                    {newAcctNames.length} new account{newAcctNames.length > 1 ? 's' : ''} will be created automatically:
                  </strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {newAcctNames.map(name => {
                      const { currency, type } = inferAccount(name)
                      return (
                        <span key={name} style={{
                          padding: '2px 8px', borderRadius: 6, fontSize: 11.5,
                          background: 'rgba(99,102,241,.15)', color: 'var(--accent)',
                          border: '1px solid rgba(99,102,241,.3)',
                        }}>
                          {name} <span style={{ opacity: 0.7 }}>· {currency} · {type}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Duplicate warning */}
            {dupCount > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.4)',
                borderRadius: 8, marginBottom: 14,
              }}>
                <Icon name="review" size={14} style={{ color: 'var(--warn)', flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: 'var(--ink-1)', flex: 1 }}>
                  <strong style={{ color: 'var(--warn)' }}>{dupCount} duplicate{dupCount > 1 ? 's' : ''}</strong>
                  {' '}found — these rows already exist in your data.
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={skipDups} onChange={e => setSkipDups(e.target.checked)}
                    style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
                  Skip duplicates
                </label>
              </div>
            )}

            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="form-field">
                <label>{t('import.defaultAccount')} {!stats.isSheet1 && t('import.defaultAccountNote')}</label>
                <select value={defaultAcct} onChange={e => setDefaultAcct(e.target.value)}>
                  <option value="">{t('import.accountSelect')}</option>
                  {accountGroups.map(([cur, accts]) => (
                    <optgroup key={cur} label={cur}>
                      {accts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>{t('import.defaultPerson')} {!stats.isSheet1 && t('import.defaultPersonNote')}</label>
                <select value={defaultPerson} onChange={e => setDefaultPerson(e.target.value)}>
                  <option value="Alexander">Alexander</option>
                  <option value="Marcela">Marcela</option>
                  <option value="Shared">{t('person.shared')}</option>
                </select>
              </div>
            </div>

            {stats.total === 0 ? (
              <p style={{ color: 'var(--warn)', fontSize: 13, padding: '16px 0' }}>{t('import.noData')}</p>
            ) : (
              <>
                <div className="preview-table-wrap">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>{t('import.colDate')}</th>
                        <th>{t('import.colDesc')}</th>
                        {!stats.isPdf && <th>{t('import.colCat')}</th>}
                        {!stats.isSheet1 && !stats.isPdf && <th>{t('import.colAcct')}</th>}
                        {!stats.isSheet1 && !stats.isPdf && <th>{t('import.colPerson')}</th>}
                        {stats.isPdf && <th>Type</th>}
                        <th className="num">{t('import.colAmt')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className={r._isDup ? 'warn-row' : ''}>
                          <td>{new Date(r.occurred_at).toLocaleDateString('en-CA', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                          <td>{r.description || '—'}</td>
                          {!stats.isPdf && <td style={{ color: r._cat_warn ? 'var(--warn)' : undefined }}>{r.category_name || '—'}</td>}
                          {!stats.isSheet1 && !stats.isPdf && <td>{r.account_name || '—'}</td>}
                          {!stats.isSheet1 && !stats.isPdf && <td>{r.person || '—'}</td>}
                          {stats.isPdf && <td style={{ color: r.type === 'income' ? 'var(--pos)' : r.type === 'transfer' ? 'var(--accent)' : 'var(--ink-2)', fontSize: 11 }}>{r.type}</td>}
                          <td className="num" style={{ color: r.amount > 0 ? 'var(--pos)' : 'var(--ink-0)' }}>
                            {r.amount > 0 ? '+' : '−'}${Math.abs(r.amount).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 15 && (
                  <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6, textAlign: 'right' }}>
                    {t('import.showingRows', { total: rows.length })}
                  </p>
                )}
              </>
            )}
          </>
        )}

        {error && <p style={{ color: 'var(--neg)', fontSize: 12, marginTop: 12 }}>{error}</p>}
      </div>

      <div className="modal-footer">
        {step !== 'upload' && (
          <button type="button" className="btn ghost" onClick={reset} style={{ marginRight: 'auto' }}>
            {t('import.changeFile')}
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onClose}>{t('import.cancel')}</button>

        {step === 'sheet' && (
          <button type="button" className="btn primary" onClick={handleSheetConfirm} disabled={!selectedSheet}>
            {t('import.continue')}
          </button>
        )}
        {step === 'preview' && stats?.total > 0 && (
          <button type="button" className="btn primary" onClick={handleImport} disabled={saving}>
            {saving ? t('import.importing') : t('import.importBtn', { count: skipDups ? (rows?.length ?? 0) - dupCount : rows?.length ?? 0 })}
            {!defaultAcct && !saving && (
              <span style={{ fontSize: 10, opacity: 0.75, display: 'block', lineHeight: 1 }}>
                {t('import.noAccountNote')}
              </span>
            )}
          </button>
        )}
        {step === 'preview' && stats?.total === 0 && sheetNames.length > 1 && (
          <button type="button" className="btn ghost" onClick={() => setStep('sheet')}>
            {t('import.chooseOtherTab')}
          </button>
        )}
      </div>
    </Modal>
  )
}

