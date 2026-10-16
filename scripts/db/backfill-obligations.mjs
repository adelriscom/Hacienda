#!/usr/bin/env node
/**
 * Backfill declared obligations from the recurring transactions that imply them.
 *
 * Until migration 018 a recurring series existed only as a GROUP BY over
 * transactions sharing a description. This turns each of those inferred series
 * into a real scheduled_payments row and links its transactions to it.
 *
 * Grouping and cadence detection come from the app's own paymentSchedule module,
 * so the rules this creates match exactly what the screens were already showing.
 * Re-implementing that logic here would repeat the mistake that gave Hacienda
 * three disagreeing schedulers in the first place.
 *
 *   export SUPABASE_DB_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres?sslmode=require"
 *   node scripts/db/backfill-obligations.mjs            # dry run — writes nothing
 *   node scripts/db/backfill-obligations.mjs --apply    # writes, in one transaction
 *
 * Take a backup first: ./scripts/db/backup-local.sh
 *
 * Safe to run more than once. A series that already has an obligation is skipped,
 * so a partial run can simply be repeated.
 */
import pg from 'pg'
import {
  groupRecurring, toObligation, ruleFromObligation, startOfDay,
} from '../../frontend/src/lib/paymentSchedule.js'

const APPLY = process.argv.includes('--apply')
const DB    = process.env.SUPABASE_DB_URL

if (!DB) {
  console.error('Set SUPABASE_DB_URL. See scripts/db/backup-local.sh for the format.')
  process.exit(1)
}

const money = n => '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2 })

// The lib decides what a series is worth, when it started, whether it has ended
// and whether its amount is an estimate — the same code the adopt action in the
// UI uses, so a rule created either way comes out identical.
function describe(item, today) {
  const ob = toObligation(item)
  return { key: item._key, account_id: item.account_id ?? null,
           category_id: item.category_id ?? null, ...ruleFromObligation(ob, { today }) }
}

async function main() {
  const client = new pg.Client({
    connectionString: DB,
    ssl: DB.includes('localhost') || DB.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
  })
  await client.connect()

  try {
    // Preflight — refuse to guess if 018 hasn't been applied.
    const { rows: cols } = await client.query(`
      SELECT 1 FROM information_schema.columns
       WHERE table_name = 'transactions' AND column_name = 'obligation_id'`)
    if (!cols.length) {
      console.error('Migration 018 has not been applied — transactions.obligation_id is missing.')
      process.exit(1)
    }

    const { rows } = await client.query(`
      SELECT t.id, t.user_id, t.account_id, t.category_id, t.occurred_at,
             t.description, t.amount, t.person, t.exchange_rate, t.obligation_id
        FROM transactions t
       WHERE t.is_recurring = true
         AND t.status NOT IN ('ghost', 'duplicate')
       ORDER BY t.occurred_at DESC`)

    const today  = startOfDay(new Date())
    const series = groupRecurring(rows)

    // A series is already done if any of its transactions carries a link.
    const existing = new Set(
      rows.filter(r => r.obligation_id).map(r => `${r.user_id || ''}|${r.description.toLowerCase().trim()}`)
    )

    const planned = []
    const skipped = []
    for (const item of series) {
      if (existing.has(item._key)) { skipped.push(item); continue }
      planned.push(describe(item, today))
    }

    console.log(`\n${rows.length} recurring transactions → ${series.length} series`)
    if (skipped.length) console.log(`${skipped.length} already linked, skipping`)
    console.log(`${planned.length} obligation${planned.length === 1 ? '' : 's'} to create\n`)

    if (!planned.length) {
      console.log('Nothing to do.')
      return
    }

    const pad = (s, n) => String(s).padEnd(n)
    console.log(
      pad('NAME', 22) + pad('AMOUNT', 14) + pad('CADENCE', 14) +
      pad('ANCHOR', 12) + pad('TXNS', 6) + pad('STATE', 10) + 'LAST SEEN')
    console.log('─'.repeat(96))
    for (const p of planned) {
      console.log(
        pad(p.name.slice(0, 20), 22) +
        pad(money(p.amount) + (p.is_variable ? ' ~' : ''), 14) +
        pad(p._freqLabel, 14) +
        pad(p.anchor_date, 12) +
        pad(p._count, 6) +
        pad(p.is_active ? 'active' : 'ended', 10) +
        p._lastSeen)
    }
    const variable = planned.filter(p => p.is_variable).length
    const inactive = planned.filter(p => !p.is_active).length
    console.log('─'.repeat(96))
    console.log(`~ = variable amount (${variable})   ·   ended = no recent payment (${inactive})`)

    if (!APPLY) {
      console.log('\nDry run — nothing was written. Re-run with --apply to commit.')
      return
    }

    // One transaction: either every rule and link lands, or none does.
    await client.query('BEGIN')
    let linked = 0
    for (const p of planned) {
      const { rows: [rule] } = await client.query(
        `INSERT INTO scheduled_payments
           (user_id, account_id, category_id, name, amount, type, frequency,
            anchor_date, ends_on, person, is_variable, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [p.user_id, p.account_id, p.category_id, p.name, p.amount, p.type,
         p.frequency, p.anchor_date, p.ends_on, p.person, p.is_variable, p.is_active])

      const res = await client.query(
        `UPDATE transactions SET obligation_id = $1 WHERE id = ANY($2::uuid[])`,
        [rule.id, p._txnIds])
      linked += res.rowCount
    }
    await client.query('COMMIT')

    console.log(`\nCreated ${planned.length} obligations, linked ${linked} transactions.`)
    console.log('No transaction amount, date, description or category was modified.')
  } catch (err) {
    if (APPLY) await client.query('ROLLBACK').catch(() => {})
    console.error('\nFailed — nothing was committed.')
    console.error(err.message)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

main()
