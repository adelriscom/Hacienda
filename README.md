# Hacienda — Household Finance

A multi-user, multi-currency personal finance app for tracking a household's
transactions, budgets, accounts, debts, and recurring payments. Spanish/English/French
UI, dark theme, installable as a PWA.

> Built for a two-person household (CAD + COP) but works for any single user or family.

---

## Features

- **Dashboard** — true available balance, monthly cash flow, KPIs, upcoming payments.
- **Transactions** — searchable/filterable ledger (all / income / expenses), inline
  status badges (`match` / `review` / `ghost` / `duplicate`), linked transfer pairs,
  bulk category assignment.
- **Import** — bank statements via Excel/CSV (`xlsx`) or PDF. PDFs are parsed
  client-side with `pdfjs-dist`, then sent to an AI endpoint that extracts structured
  transactions. Duplicate detection on import; accounts auto-created from the file.
- **AI categorization** — categorize uncategorized transactions in bulk, using
  few-shot examples drawn from the household's own history, with a confidence rating
  per row and per-row exclude.
- **Budgets** — monthly category envelopes, per-currency (CAD + COP) with a monthly
  exchange rate and a consolidated CAD total; per-envelope detail with drill-down.
- **Accounts** — checking/savings/credit/cash/investment, net-worth summary, grouped
  by currency.
- **Obligations** — debt tracker with payoff projections, due dates, progress bars.
- **Recurring** — recurring payments with frequency auto-detection and bell reminders.
- **Calendar** — scheduled payments and future bills.
- **Reports** — spending breakdowns, tax-deductible summary (T1) with CSV export.
- **Categories** — nested one level (parent/child subcategories), colors/icons,
  tax-deductible flags.
- **Family view** — side-by-side per-member KPIs, trends, and category breakdown.
- **Settings** — household management and 8-character invite codes.
- **Cross-cutting** — auth + password reset, household sharing via RLS, dark/light
  theme, i18n (en/es/fr), onboarding wizard, accessibility pass, PWA/offline shell.

---

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite, React Router, react-i18next |
| Backend | Supabase (Postgres + Row Level Security + Auth + Storage) |
| Serverless | Vercel Functions in `/api` (AI extraction & categorization) |
| AI | Anthropic Claude (default `claude-haiku-4-5-20251001`); Google Gemini & Groq selectable for PDF parsing |
| Import | `pdfjs-dist` (PDF text), `xlsx` (Excel/CSV) |
| PWA | `vite-plugin-pwa` (Workbox) |
| Tests | Playwright |
| Hosting | Vercel (frontend + `/api`), Supabase (database) |

There is **no custom server** — the frontend talks to Supabase directly; the only
backend code is the two stateless functions in `/api`.

---

## Project structure

```
.
├── api/                      # Vercel serverless functions
│   ├── categorize.js         #   AI bulk categorization (Anthropic)
│   └── parse-statement.js    #   AI statement → transactions (Anthropic/Gemini/Groq)
├── frontend/                 # React + Vite app
│   ├── src/
│   │   ├── screens/          #   one file per route (Dashboard, Budgets, …)
│   │   ├── components/       #   Shell, Sidebar, modals, Icon
│   │   ├── hooks/            #   useTransactions, useAccounts, useBudgets, …
│   │   ├── lib/              #   supabase client, auth, household, sidebar contexts
│   │   └── i18n.js           #   en / es / fr
│   └── tests/                #   Playwright specs
├── supabase/
│   ├── migrations/           #   001–015 schema migrations (run in order)
│   │   └── down/             #   schema-rollback (down) migrations
│   └── scripts/              #   one-off data/seed/categorization scripts
├── scripts/db/               # backup-local.sh / restore.sh
├── docs/BACKUPS.md           # backup & rollback guide
└── vercel.json               # build + SPA rewrites
```

Routes (defined in `frontend/src/components/Shell.jsx`): `/dashboard`,
`/transactions`, `/expenses`, `/income`, `/budgets`, `/calendar`, `/review`,
`/reports`, `/recurring`, `/accounts`, `/categories`, `/obligations`, `/settings`,
`/family`.

---

## Getting started

### Prerequisites
- Node.js 18+
- A Supabase project
- (For AI features) an Anthropic API key

### 1. Configure the frontend

```bash
cd frontend
cp .env.example .env.local
```

Fill in:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 2. Set up the database

Run the migrations in `supabase/migrations/` **in order** (001 → 015) in the Supabase
Dashboard → SQL Editor. They are applied manually (this repo does not use the Supabase
CLI). To roll back a schema change, use the matching script in
`supabase/migrations/down/` (see its README for ordering).

### 3. Install & run

```bash
cd frontend
npm install
npm run dev        # Vite dev server
npm run build      # production build → frontend/dist
npm run preview    # serve the build locally
```

---

## AI features (serverless)

`/api/categorize.js` and `/api/parse-statement.js` run as Vercel Functions. Configure
these environment variables in Vercel (Project → Settings → Environment Variables):

| Variable | Required | Used by |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes (default model) | categorize + parse-statement |
| `GEMINI_API_KEY` | Optional | parse-statement (Gemini models) |
| `GROQ_API_KEY` | Optional | parse-statement (Groq/Llama models) |

A single shared `ANTHROPIC_API_KEY` is used for all users (no per-user key); cost is
roughly $0.01–0.05 per statement / categorization run.

---

## Backups & rollback

- **Data:** a nightly GitHub Action (`.github/workflows/db-backup.yml`) takes an
  encrypted `pg_dump` of the `public` schema and keeps the last 30 on a `db-backups`
  branch. Manual dump/restore via `scripts/db/backup-local.sh` and
  `scripts/db/restore.sh`.
- **Schema:** down migrations in `supabase/migrations/down/`.

Full setup (required GitHub secrets), restore steps, and scope limits are in
**[docs/BACKUPS.md](docs/BACKUPS.md)**.

---

## Testing

```bash
cd frontend
npx playwright test
```

Tests inject a Supabase session via the REST API (bypassing the login UI) and need
`PW_PASSWORD` in `frontend/.env.test`.

---

## Deployment

Vercel builds the frontend and serves `/api/*` as functions (`vercel.json` handles the
build command, output directory, and SPA rewrites). Pushing to `main` auto-deploys.
Remember to set the AI env vars (above) in the Vercel project.

---

## Notes

- **Multi-currency:** CAD and COP. The exchange rate is stored as `cop_to_cad`; the UI
  lets you edit it as “1 CAD = X COP”.
- **Household sharing:** RLS scopes rows by `user_id`; a `get_my_household_id()`
  SECURITY DEFINER function lets household members see each other's data in Family view.
- **Primarily desktop-used**, with a responsive layout down to mobile.
