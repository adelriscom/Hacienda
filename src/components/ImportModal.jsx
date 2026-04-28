import { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import Modal from './Modal'
import Icon from './Icon'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'

function serialToISO(serial) {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
}

function matchName(name, list) {
  if (!name) return null
  const n = name.toLowerCase().trim()
  return list.find(item => item.name.toLowerCase() === n) || null
}

function parseDate(raw) {
  if (typeof raw === 'number' && raw > 40000) return serialToISO(raw) + 'T12:00:00'
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + 'T12:00:00'
  const d = new Date(s)
  return isNaN(d) ? null : d.toISOString().slice(0, 10) + 'T12:00:00'
}

function parseSheet(ws, categories, accounts) {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (!raw.length) return { rows: [], isSheet1: false }

  // Sheet1 format: no headers, col A = serial date, B = category, C = description, D = amount
  const isSheet1 = typeof raw[0]?.[0] === 'number' && raw[0][0] > 40000

  let parsed = []
  if (isSheet1) {
    parsed = raw
      .filter(r => typeof r[0] === 'number' && r[0] > 40000)
      .map(r => ({
        occurred_at:   new Date(serialToISO(r[0]) + 'T12:00:00').toISOString(),
        category_name: String(r[1] || '').trim(),
        description:   String(r[2] || '').trim(),
        amount:        r[3] !== '' ? -Math.abs(parseFloat(r[3]) || 0) : 0,
        type:          'expense',
        account_name:  '',
        person:        '',
        notes:         null,
        is_recurring:  false,
        status:        'review',
      }))
  } else {
    // Standard format with header row
    const headers = (raw[0] || []).map(h => String(h).toLowerCase().trim())
    const idx  = name => headers.indexOf(name)
    const get  = (row, name) => { const i = idx(name); return i >= 0 ? String(row[i] ?? '').trim() : '' }

    parsed = raw.slice(1)
      .filter(r => r.some(c => c !== ''))
      .map(r => {
        const rawDate = idx('fecha') >= 0 ? r[idx('fecha')] : ''
        const isoTs   = rawDate ? parseDate(rawDate) : null
        const rawAmt  = parseFloat(get(r, 'monto')) || 0
        const tipo    = (get(r, 'tipo') || 'expense').toLowerCase()
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

  let catMatched = 0, catUnmatched = 0
  const resolved = parsed.map(r => {
    const cat  = matchName(r.category_name, categories)
    const acct = matchName(r.account_name, accounts)
    if (r.category_name) { cat ? catMatched++ : catUnmatched++ }
    return { ...r, category_id: cat?.id || null, _resolved_acct_id: acct?.id || null, _cat_warn: !!r.category_name && !cat }
  })

  return { rows: resolved, isSheet1, catMatched, catUnmatched }
}

// ─── Steps: 'upload' → 'sheet' → 'preview' ───────────────────────────────────

export default function ImportModal({ onClose, onSave }) {
  const { accounts } = useAccounts()
  const { categories } = useCategories()

  const [step, setStep]           = useState('upload')   // upload | sheet | preview
  const [wb, setWb]               = useState(null)       // workbook
  const [sheetNames, setSheetNames] = useState([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [rows, setRows]           = useState(null)
  const [preview, setPreview]     = useState(null)
  const [stats, setStats]         = useState(null)
  const [dragOver, setDragOver]   = useState(false)
  const [defaultAcct, setDefaultAcct] = useState('')
  const [defaultPerson, setDefaultPerson] = useState('Alexander')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState(null)
  const fileRef = useRef()

  const cadAccounts = accounts.filter(a => a.currency === 'CAD')
  const copAccounts = accounts.filter(a => a.currency === 'COP')

  // Step 1 → load file, decide next step
  const loadFile = useCallback((f) => {
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
        setWb(workbook)
        const names = workbook.SheetNames
        setSheetNames(names)

        if (names.length === 1) {
          // Only one sheet — parse directly
          const { rows: r, ...s } = parseSheet(workbook.Sheets[names[0]], categories, accounts)
          setSelectedSheet(names[0])
          setRows(r)
          setPreview(r.slice(0, 15))
          setStats({ total: r.length, ...s })
          setStep('preview')
        } else {
          // Multiple sheets — let user pick
          setSelectedSheet(names[0])
          setStep('sheet')
        }
      } catch (err) {
        setError('No se pudo leer el archivo: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(f)
  }, [accounts, categories])

  // Step 2 → user picked a sheet
  function handleSheetConfirm() {
    if (!wb || !selectedSheet) return
    const { rows: r, ...s } = parseSheet(wb.Sheets[selectedSheet], categories, accounts)
    setRows(r)
    setPreview(r.slice(0, 15))
    setStats({ total: r.length, ...s })
    setStep('preview')
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) loadFile(f)
  }

  async function handleImport() {
    if (!rows?.length) return
    if (stats.isSheet1 && !defaultAcct) {
      setError('Selecciona una cuenta antes de importar.')
      return
    }
    setSaving(true); setError(null)
    try {
      const toInsert = rows.map(({ _cat_warn, _resolved_acct_id, category_name, account_name, ...r }) => ({
        ...r,
        account_id: _resolved_acct_id || defaultAcct || null,
        person:     r.person || defaultPerson,
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
  }

  return (
    <Modal title="Importar movimientos" onClose={onClose} wide>
      <div className="modal-body">

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
            <h3>Arrastra tu archivo aquí</h3>
            <p>Formatos soportados: .xlsx, .xls, .csv</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={e => e.target.files[0] && loadFile(e.target.files[0])} />
          </div>
        )}

        {/* ── Step 2: Sheet selector ── */}
        {step === 'sheet' && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--ink-1)', marginBottom: 16 }}>
              Tu archivo tiene <strong>{sheetNames.length} pestañas</strong>. Selecciona cuál contiene los movimientos:
            </p>
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
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 10 }}>
              Pestaña: <strong style={{ color: 'var(--ink-1)' }}>{selectedSheet}</strong>
              {' · '}Formato: <strong style={{ color: 'var(--ink-1)' }}>{stats.isSheet1 ? 'Sin encabezados (Sheet1)' : 'Con encabezados'}</strong>
            </div>

            <div className="import-stats">
              <div className="import-stat">
                <div className="import-stat-num">{stats.total}</div>
                <div className="import-stat-label">Movimientos</div>
              </div>
              <div className="import-stat">
                <div className="import-stat-num" style={{ color: stats.catUnmatched ? 'var(--warn)' : 'var(--pos)' }}>
                  {stats.catMatched}
                </div>
                <div className="import-stat-label">Categorías OK</div>
              </div>
              {stats.catUnmatched > 0 && (
                <div className="import-stat">
                  <div className="import-stat-num" style={{ color: 'var(--warn)' }}>{stats.catUnmatched}</div>
                  <div className="import-stat-label">Sin categoría</div>
                </div>
              )}
            </div>

            {/* Sheet1 defaults */}
            {stats.isSheet1 && (
              <div className="form-grid" style={{ marginBottom: 14 }}>
                <div className="form-field">
                  <label>Cuenta (para todos los movimientos)</label>
                  <select value={defaultAcct} onChange={e => setDefaultAcct(e.target.value)}>
                    <option value="">— Seleccionar cuenta —</option>
                    {cadAccounts.length > 0 && (
                      <optgroup label="CAD">
                        {cadAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </optgroup>
                    )}
                    {copAccounts.length > 0 && (
                      <optgroup label="COP">
                        {copAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
                <div className="form-field">
                  <label>Persona</label>
                  <select value={defaultPerson} onChange={e => setDefaultPerson(e.target.value)}>
                    <option value="Alexander">Alexander</option>
                    <option value="Marcela">Marcela</option>
                    <option value="Shared">Compartido</option>
                  </select>
                </div>
              </div>
            )}

            {stats.total === 0 ? (
              <p style={{ color: 'var(--warn)', fontSize: 13, padding: '16px 0' }}>
                No se encontraron filas con datos en esta pestaña. Intenta con otra.
              </p>
            ) : (
              <>
                <div className="preview-table-wrap">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Descripción</th>
                        <th>Categoría</th>
                        {!stats.isSheet1 && <th>Cuenta</th>}
                        {!stats.isSheet1 && <th>Quien</th>}
                        <th className="num">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className={r._cat_warn ? 'warn-row' : ''}>
                          <td>{new Date(r.occurred_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                          <td>{r.description || '—'}</td>
                          <td style={{ color: r._cat_warn ? 'var(--warn)' : undefined }}>{r.category_name || '—'}</td>
                          {!stats.isSheet1 && <td>{r.account_name || '—'}</td>}
                          {!stats.isSheet1 && <td>{r.person || '—'}</td>}
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
                    Mostrando 15 de {rows.length} filas
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
            ← Cambiar archivo
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>

        {step === 'sheet' && (
          <button type="button" className="btn primary" onClick={handleSheetConfirm} disabled={!selectedSheet}>
            Continuar →
          </button>
        )}
        {step === 'preview' && stats?.total > 0 && (
          <button type="button" className="btn primary" onClick={handleImport} disabled={saving}>
            {saving ? 'Importando…' : `Importar ${rows.length} movimientos`}
          </button>
        )}
        {step === 'preview' && stats?.total === 0 && (
          <button type="button" className="btn ghost" onClick={() => setStep('sheet')}>
            ← Elegir otra pestaña
          </button>
        )}
      </div>
    </Modal>
  )
}
