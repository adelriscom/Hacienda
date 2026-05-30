/**
 * PDF bank statement import — Playwright smoke test
 * Run: npx playwright test tests/pdf-import.spec.js
 * Requires: dev server running on :5173
 */
import { test, expect } from '@playwright/test'

const SUPABASE_HOST = 'msdswuzscfowsxecjqxh.supabase.co'
const STORAGE_KEY   = 'sb-msdswuzscfowsxecjqxh-auth-token'

const MOCK_SESSION = {
  access_token: 'mock', token_type: 'bearer',
  expires_in: 3600, expires_at: 9999999999, refresh_token: 'mock',
  user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'test@test.com',
    email_confirmed_at: '2020-01-01T00:00:00Z', app_metadata: {}, user_metadata: {},
    created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z' },
}

const MOCK_ACCOUNTS = [
  { id: 'acct-1', name: 'TD Chequing', type: 'checking', currency: 'CAD', balance: 5000, is_active: true },
]

// Mocked transactions Claude would return
const PDF_TRANSACTIONS = [
  { date: '2025-05-01', description: 'Tim Hortons', amount: -3.75,    type: 'expense' },
  { date: '2025-05-05', description: 'Payroll Deposit', amount: 2500.00, type: 'income' },
  { date: '2025-05-10', description: 'Shoppers Drug Mart', amount: -18.40, type: 'expense' },
]

// Generates a minimal valid PDF that pdfjs-dist can parse (no text content, but structurally correct).
// Byte offsets are computed from actual string lengths so the xref table is always accurate.
function makeMinimalPdf() {
  const objs = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n',
  ]

  let body = '%PDF-1.4\n'
  const offsets = []
  for (const o of objs) {
    offsets.push(body.length)
    body += o
  }

  const xrefPos = body.length
  body += 'xref\n'
  body += `0 ${objs.length + 1}\n`
  body += '0000000000 65535 f \n'
  for (const off of offsets) {
    body += off.toString().padStart(10, '0') + ' 00000 n \n'
  }
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\n`
  body += `startxref\n${xrefPos}\n%%EOF`

  return Buffer.from(body, 'ascii')
}

async function setupMocks(page, { mockPdfApi = true, captureInsert } = {}) {
  await page.addInitScript(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session))
    localStorage.setItem('hacienda_onboarded', 'true')
  }, { key: STORAGE_KEY, session: MOCK_SESSION })

  // Mock Supabase
  await page.route(`**/${SUPABASE_HOST}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()

    if (path.startsWith('/auth/v1/')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_SESSION.user) })
    }
    if (path.includes('/accounts')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_ACCOUNTS) })
    }
    if (path.includes('/transactions')) {
      if (method === 'POST' && captureInsert) {
        const body = route.request().postDataJSON()
        captureInsert(Array.isArray(body) ? body : [body])
        return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    if (path.includes('/categories')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  // Mock the Vercel API function
  if (mockPdfApi) {
    await page.route('**/api/parse-statement', async route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ transactions: PDF_TRANSACTIONS }),
      })
    })
  }
}

async function openImportModal(page) {
  await page.goto('http://localhost:5173/transactions')
  await page.waitForSelector('.topbar', { timeout: 10000 })
  // Find the Import button
  const importBtn = page.getByRole('button', { name: /import/i })
  await importBtn.click()
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('Import modal file input accepts .pdf', async ({ page }) => {
  await setupMocks(page)
  await openImportModal(page)

  const accept = await page.locator('input[type="file"]').getAttribute('accept')
  console.log('File input accept:', accept)

  expect(accept).toContain('.pdf')
  expect(accept).toContain('.xlsx')
  expect(accept).toContain('.csv')

  console.log('PASS: file input accepts .pdf, .xlsx, .csv')
})

test('Uploading a PDF shows spinner then AI-parsed preview', async ({ page }) => {
  await setupMocks(page)
  await openImportModal(page)

  // Upload the minimal valid PDF
  await page.locator('input[type="file"]').setInputFiles({
    name: 'statement.pdf',
    mimeType: 'application/pdf',
    buffer: makeMinimalPdf(),
  })

  // Spinner / parsing message should appear
  await page.waitForSelector('text=Extracting text', { timeout: 5000 })
  console.log('Spinner appeared: "Extracting text"')

  // Preview table should appear (after API mock returns)
  await page.waitForSelector('.preview-table', { timeout: 15000 })
  console.log('Preview table appeared')

  // AI badge should be visible
  await expect(page.getByText('AI-parsed PDF')).toBeVisible()
  console.log('AI-parsed PDF badge visible')

  // All 3 mocked transactions should appear
  await expect(page.getByText('Tim Hortons')).toBeVisible()
  await expect(page.getByText('Payroll Deposit')).toBeVisible()
  await expect(page.getByText('Shoppers Drug Mart')).toBeVisible()
  console.log('All 3 mocked transactions visible in preview')

  // Type column should show for PDF (not category)
  await expect(page.getByText('expense').first()).toBeVisible()
  await expect(page.getByText('income').first()).toBeVisible()
  console.log('"expense" and "income" type labels shown')

  // "From account" picker should be visible
  await expect(page.getByText('Default account', { exact: false })).toBeVisible()

  console.log('PASS: PDF upload → spinner → AI-parsed preview with transactions')
})

test('PDF preview amounts are signed correctly', async ({ page }) => {
  await setupMocks(page)
  await openImportModal(page)

  await page.locator('input[type="file"]').setInputFiles({
    name: 'rbc-may.pdf',
    mimeType: 'application/pdf',
    buffer: makeMinimalPdf(),
  })

  await page.waitForSelector('.preview-table', { timeout: 15000 })

  const amountCells = await page.locator('.preview-table .num').allInnerTexts()
  console.log('Amount cells:', amountCells)

  // Payroll Deposit (+2500) should be positive
  const hasPositive = amountCells.some(c => c.startsWith('+'))
  // Tim Hortons (−3.75) should be negative
  const hasNegative = amountCells.some(c => c.startsWith('−'))

  expect(hasPositive).toBe(true)
  expect(hasNegative).toBe(true)

  console.log('PASS: positive amounts start with +, negative with −')
})

test('Importing PDF transactions inserts with status=review', async ({ page }) => {
  const inserted = []
  await setupMocks(page, { captureInsert: rows => inserted.push(...rows) })
  await openImportModal(page)

  await page.locator('input[type="file"]').setInputFiles({
    name: 'statement.pdf',
    mimeType: 'application/pdf',
    buffer: makeMinimalPdf(),
  })

  await page.waitForSelector('.preview-table', { timeout: 15000 })

  // Wait for account options to populate (useAccounts async load)
  const acctSelect = page.locator('[role="dialog"] select').first()
  await page.waitForFunction(() => {
    const sel = document.querySelector('[role="dialog"] select')
    return sel && Array.from(sel.options).some(o => o.value === 'acct-1')
  }, { timeout: 5000 })
  await acctSelect.selectOption('acct-1')
  await page.getByRole('button', { name: /import/i }).last().click()

  await page.waitForTimeout(1500)

  console.log('Inserted rows:', JSON.stringify(inserted, null, 2))

  expect(inserted.length).toBe(PDF_TRANSACTIONS.length)
  for (const row of inserted) {
    expect(row.status).toBe('review')
  }

  // Amounts should be signed correctly
  const outgoing = inserted.filter(r => r.amount < 0)
  const incoming = inserted.filter(r => r.amount > 0)
  expect(outgoing.length).toBe(2) // Tim Hortons + Shoppers
  expect(incoming.length).toBe(1) // Payroll

  console.log(`PASS: ${inserted.length} rows inserted, all status=review`)
  console.log(`  ${outgoing.length} expenses, ${incoming.length} income`)
})
