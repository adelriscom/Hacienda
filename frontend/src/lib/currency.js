// Central multi-currency conversion. Base currency = CAD.
// Rates are stored as "rate_to_base": amount_in_base = amount * rate_to_base.
// (e.g. COP rate_to_base ≈ 0.00032 → 1 COP = 0.00032 CAD)

export const BASE_CURRENCY = 'CAD'

// Known currencies for pickers. `accounts.currency` is free text, so any
// 3-letter code works even if it's not listed here.
export const CURRENCIES = [
  { code: 'CAD', label: 'Canadian Dollar' },
  { code: 'COP', label: 'Colombian Peso' },
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'MXN', label: 'Mexican Peso' },
]

export function currencyLabel(code) {
  return CURRENCIES.find(c => c.code === code)?.label || code
}

// Convert `amount` (in `currency`) to the base currency using a rate map
// { CODE: rate_to_base }. Base-currency amounts and currencies with no known
// rate pass through unchanged (the UI prompts the user to set a rate).
export function toBase(amount, currency, rateMap) {
  if (!currency || currency === BASE_CURRENCY) return amount
  const rate = rateMap?.[currency]
  return rate ? amount * rate : amount
}

// Build an effective { code: rate_to_base } map for `monthStr` from all rate rows.
// Per currency: use the latest rate on or before the month (carry forward); if the
// month precedes every saved rate, fall back to that currency's earliest saved rate
// (carry backward) so months before the first saved rate are still converted instead
// of showing raw foreign amounts.
export function buildRateMap(rows, monthStr) {
  const sorted = [...(rows || [])].sort((a, b) =>
    a.month < b.month ? -1 : a.month > b.month ? 1 : 0)
  const onBefore = {}   // latest rate with month <= target
  const earliest = {}   // earliest rate overall (first seen, ascending)
  for (const r of sorted) {
    const code = r.currency_code
    const rate = Number(r.rate_to_base)
    if (!(code in earliest)) earliest[code] = rate
    if (r.month <= monthStr) onBefore[code] = rate
  }
  const eff = {}
  for (const code of new Set([...Object.keys(onBefore), ...Object.keys(earliest)])) {
    eff[code] = code in onBefore ? onBefore[code] : earliest[code]
  }
  return eff
}

// Format an amount already expressed in the base currency.
export function fmtBase(n) {
  return '$' + Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
