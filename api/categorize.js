const Anthropic = require('@anthropic-ai/sdk')

const MODEL = 'claude-haiku-4-5-20251001'
const BATCH  = 30 // transactions per AI call

function buildPrompt(transactions, categories) {
  const catList = categories.map(c => `${c.id} → ${c.name}`).join('\n')
  const txList  = transactions.map(t =>
    `${t.id} | "${t.description}" | ${t.amount > 0 ? '+' : ''}${t.amount} | ${t.type}`
  ).join('\n')

  return `You are a financial transaction categorizer for a personal finance app.

Available categories (id → name):
${catList}

Transactions to categorize (id | description | amount | type):
${txList}

For each transaction, pick the single best matching category from the list above.
If no category fits well, skip that transaction entirely.

Return ONLY a raw JSON array — no markdown, no explanation:
[{"id":"<transaction-id>","category_id":"<category-id>"},...]`
}

function parseJson(raw) {
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(clean)
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { transactions, categories } = req.body || {}
  if (!Array.isArray(transactions) || !transactions.length)
    return res.status(400).json({ error: 'transactions array required' })
  if (!Array.isArray(categories) || !categories.length)
    return res.status(400).json({ error: 'categories array required' })

  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured.' })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const results = []

    // Process in batches
    for (let i = 0; i < transactions.length; i += BATCH) {
      const batch = transactions.slice(i, i + BATCH)
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: buildPrompt(batch, categories) }],
      })
      const parsed = parseJson(msg.content[0].text)
      if (Array.isArray(parsed)) results.push(...parsed)
    }

    // Validate: only return items with valid category IDs
    const validCatIds = new Set(categories.map(c => c.id))
    const valid = results.filter(r => r.id && validCatIds.has(r.category_id))

    res.status(200).json(valid)
  } catch (err) {
    console.error('categorize error:', err)
    res.status(500).json({ error: err.message || 'AI categorization failed' })
  }
}
