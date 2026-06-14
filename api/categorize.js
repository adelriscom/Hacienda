const Anthropic = require('@anthropic-ai/sdk')

const MODEL = 'claude-haiku-4-5-20251001'
const BATCH  = 30 // transactions per AI call
const MAX_EXAMPLES_PER_CATEGORY = 6 // few-shot samples drawn from the user's own history

// Build a few-shot block from the user's already-categorized transactions so the
// model learns this household's specific conventions (merchant → category, language, etc.)
function buildExamplesBlock(examples, categories) {
  if (!Array.isArray(examples) || !examples.length) return ''

  const nameById = Object.fromEntries(categories.map(c => [c.id, c.name]))
  const byCat = new Map() // category_id → Set of distinct descriptions

  for (const e of examples) {
    if (!e.category_id || !e.description || !nameById[e.category_id]) continue
    const set = byCat.get(e.category_id) || new Set()
    if (set.size < MAX_EXAMPLES_PER_CATEGORY) set.add(e.description.trim())
    byCat.set(e.category_id, set)
  }

  if (!byCat.size) return ''

  const lines = []
  for (const [catId, descs] of byCat) {
    lines.push(`${nameById[catId]}:`)
    for (const d of descs) lines.push(`  - "${d}"`)
  }

  return `\nHere are examples of how THIS user has already categorized their own transactions. Use these as the primary guide — match new transactions to the same patterns:\n${lines.join('\n')}\n`
}

function buildPrompt(transactions, categories, examplesBlock) {
  const catList = categories.map(c => `${c.id} → ${c.name}`).join('\n')
  const txList  = transactions.map(t =>
    `${t.id} | "${t.description}" | ${t.amount > 0 ? '+' : ''}${t.amount} | ${t.type}`
  ).join('\n')

  return `You are a financial transaction categorizer for a personal finance app.

Available categories (id → name):
${catList}
${examplesBlock}
Transactions to categorize (id | description | amount | type):
${txList}

For each transaction, pick the single best matching category from the list above.
Lean on the user's own examples when a description is similar to one they already categorized.
Also rate your confidence:
  - "high"   = clear match (matches an example or an obvious merchant)
  - "medium" = plausible match but some ambiguity
  - "low"    = a guess; the user should double-check
If no category fits at all, skip that transaction entirely.

Return ONLY a raw JSON array — no markdown, no explanation:
[{"id":"<transaction-id>","category_id":"<category-id>","confidence":"high|medium|low"},...]`
}

function parseJson(raw) {
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(clean)
}

const CONFIDENCE = new Set(['high', 'medium', 'low'])

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { transactions, categories, examples } = req.body || {}
  if (!Array.isArray(transactions) || !transactions.length)
    return res.status(400).json({ error: 'transactions array required' })
  if (!Array.isArray(categories) || !categories.length)
    return res.status(400).json({ error: 'categories array required' })

  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured.' })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const results = []
    const examplesBlock = buildExamplesBlock(examples, categories)

    // Process in batches
    for (let i = 0; i < transactions.length; i += BATCH) {
      const batch = transactions.slice(i, i + BATCH)
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: buildPrompt(batch, categories, examplesBlock) }],
      })
      const parsed = parseJson(msg.content[0].text)
      if (Array.isArray(parsed)) results.push(...parsed)
    }

    // Validate: only return items with valid category IDs; normalize confidence
    const validCatIds = new Set(categories.map(c => c.id))
    const valid = results
      .filter(r => r.id && validCatIds.has(r.category_id))
      .map(r => ({
        id: r.id,
        category_id: r.category_id,
        confidence: CONFIDENCE.has(r.confidence) ? r.confidence : 'medium',
      }))

    res.status(200).json(valid)
  } catch (err) {
    console.error('categorize error:', err)
    res.status(500).json({ error: err.message || 'AI categorization failed' })
  }
}
