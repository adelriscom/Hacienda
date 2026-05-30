const Anthropic = require('@anthropic-ai/sdk')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { text } = req.body || {}
  if (!text || typeof text !== 'string' || text.trim().length < 20) {
    return res.status(400).json({ error: 'Missing or too-short text' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on this server.' })
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Extract every individual transaction from this bank statement text.

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
${text.slice(0, 60000)}`,
      }],
    })

    const raw = (message.content[0]?.text || '[]').trim()
    const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let transactions
    try {
      transactions = JSON.parse(json)
    } catch {
      return res.status(500).json({ error: 'AI returned invalid JSON — try a different PDF.', raw: raw.slice(0, 500) })
    }

    if (!Array.isArray(transactions)) {
      return res.status(500).json({ error: 'Expected a JSON array from AI.', raw: raw.slice(0, 200) })
    }

    return res.status(200).json({ transactions })
  } catch (err) {
    console.error('parse-statement error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}
