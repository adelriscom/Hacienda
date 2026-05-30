const Anthropic          = require('@anthropic-ai/sdk')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const Groq               = require('groq-sdk')

const ANTHROPIC_MODELS = new Set(['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7'])
const GOOGLE_MODELS    = new Set(['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'])
const GROQ_MODELS      = new Set(['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile'])

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

const PROMPT = (text) => `Extract every individual transaction from this bank statement text.

Return a JSON array. Each object must have exactly these fields:
- "date": ISO date "YYYY-MM-DD"
- "description": merchant or payee name, cleaned up (remove trailing codes/numbers)
- "amount": a number — NEGATIVE for money leaving (debit, purchase, withdrawal, payment, fee), POSITIVE for money coming in (credit, deposit, refund, interest earned)
- "type": "expense", "income", or "transfer"

Rules:
- Purchases, debits, withdrawals = negative amount, type "expense"
- Deposits, credits, refunds = positive amount, type "income"
- Transfers between own accounts = type "transfer"
- SKIP: opening balance, closing balance, subtotals, running balance, header/footer rows
- Credit card statements: charges are negative, card payments are positive
- Parse dates in any format (May 10 2025, 10/05/2025, 2025-05-10, etc.) → YYYY-MM-DD
- Strip $ signs, commas, and spaces from amounts before converting to number

Respond with ONLY the raw JSON array — no markdown code fences, no explanation, no commentary.

Bank statement text:
${text.slice(0, 60000)}`

function parseJson(raw) {
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(clean)
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { text, model: rawModel } = req.body || {}
  if (!text || typeof text !== 'string' || text.trim().length < 20) {
    return res.status(400).json({ error: 'Missing or too-short text' })
  }

  const allModels = new Set([...ANTHROPIC_MODELS, ...GOOGLE_MODELS, ...GROQ_MODELS])
  const model = allModels.has(rawModel) ? rawModel : DEFAULT_MODEL

  try {
    let raw

    if (ANTHROPIC_MODELS.has(model)) {
      if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured.' })
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const message = await client.messages.create({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: PROMPT(text) }],
      })
      raw = message.content[0]?.text?.trim() || '[]'

    } else if (GOOGLE_MODELS.has(model)) {
      if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' })
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
      const geminiModel = genAI.getGenerativeModel({ model })
      const result = await geminiModel.generateContent(PROMPT(text))
      raw = result.response.text().trim()

    } else if (GROQ_MODELS.has(model)) {
      if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY is not configured.' })
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
      const completion = await groq.chat.completions.create({
        model,
        messages: [{ role: 'user', content: PROMPT(text) }],
        max_tokens: 4096,
      })
      raw = completion.choices[0]?.message?.content?.trim() || '[]'
    }

    let transactions
    try {
      transactions = parseJson(raw)
    } catch {
      return res.status(500).json({ error: 'AI returned invalid JSON — try a different model or PDF.', raw: raw.slice(0, 500) })
    }

    if (!Array.isArray(transactions)) {
      return res.status(500).json({ error: 'Expected a JSON array from AI.', raw: raw.slice(0, 200) })
    }

    return res.status(200).json({ transactions, model })

  } catch (err) {
    console.error('parse-statement error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}
