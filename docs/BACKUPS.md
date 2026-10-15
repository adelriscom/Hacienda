# Backups & rollback

Two independent safety nets:

1. **Data backups** — nightly encrypted `pg_dump` of the `public` schema, so you can
   recover deleted/corrupted rows or roll the whole database back to a prior night.
2. **Schema rollback** — `down` migrations in `supabase/migrations/down/` that reverse
   each structural change.

> **Status: backups are ACTIVE** (configured 2026-06-17). Both GitHub secrets are set
> and the workflow runs nightly — check the **Actions** tab for run history. You do
> **not** need to set this up again; the setup steps below are kept for reference and
> disaster recovery only.

> 🛑 **NEVER change `BACKUP_PASSPHRASE` once backups exist.** Each dump is encrypted
> with the passphrase in effect when it ran. Rotating it makes every *existing*
> encrypted backup undecryptable. **Before touching any backup secret, run
> `gh secret list`** to see what's already configured. If you genuinely must rotate the
> passphrase: keep the old one safe (you need it to decrypt old dumps), set the new one,
> then trigger a fresh run so a current dump exists under the new key — and prune dumps
> made under the old key to avoid mixing keys.

---

## 1. Data backups (automated)

A GitHub Action (`.github/workflows/db-backup.yml`) runs every night, dumps the
`public` schema, gzips + encrypts it with AES-256, and commits it to an **orphan
`db-backups` branch** under `backups/`. The 30 most recent dumps are kept; older ones
are pruned automatically.

Files are named `hacienda-<UTC-timestamp>.sql.gz.gpg` and are **encrypted** — useless
without the passphrase, so financial data never sits in the repo in cleartext.

### One-time setup (step by step)

You add **two secrets** in GitHub, then run the workflow once. ~5 minutes.

**Step 1 — Get your database connection string (`SUPABASE_DB_URL`)**

1. Open Supabase → your project → **Project Settings** (gear) → **Database**.
2. Find the **Connection string** section and pick the **Session pooler** tab.
   - ⚠️ **Use the Session pooler, NOT "Direct connection".** GitHub Actions runs on
     IPv4 and Supabase's direct connection is IPv6-only, so the direct one will fail to
     connect. The Session pooler is IPv4 and works with `pg_dump`.
   - ⚠️ Do **not** use the **Transaction pooler** (port 6543) — it can't do `pg_dump`.
3. Copy the URI. It looks like:
   ```
   postgresql://postgres.<your-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
   Replace `[YOUR-PASSWORD]` with your database password (reset it on that same page if
   you don't have it). Make sure it ends with `?sslmode=require` (add it if missing).
   - ⚠️ Use an **alphanumeric-only** DB password. Symbols (especially `\`, `/`, `@`, `:`)
     break the URI and the workflow's shell parsing — reset it to letters+digits in
     Supabase if needed.

**Step 2 — Choose an encryption passphrase (`BACKUP_PASSPHRASE`)**

Pick a long random phrase (e.g. from a password manager). It encrypts every backup.
**Save it somewhere safe — if you lose it, the backups can't be decrypted.**

**Step 3 — Add both as GitHub secrets**

GitHub → your repo → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**. Create two, with these **exact** names:

| Name | Value |
|------|-------|
| `SUPABASE_DB_URL` | the Session pooler URI from Step 1 |
| `BACKUP_PASSPHRASE` | the passphrase from Step 2 |

**Step 4 — Run it once to verify**

GitHub → **Actions** tab → **Nightly DB backup** → **Run workflow**. It should finish
green and create a `db-backups` branch with one encrypted file under `backups/`.

> Note: GitHub disables scheduled workflows on a repo with no activity for 60 days.
> The nightly commit to `db-backups` counts as activity, so this stays alive on its own.

### Run a manual backup locally (optional)

```bash
export SUPABASE_DB_URL="postgresql://postgres.<ref>:[PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"
export BACKUP_PASSPHRASE="your-long-passphrase"
./scripts/db/backup-local.sh ./backups
```

---

## 2. Restoring data

> ⚠️ Restore is **destructive**: the dump uses `--clean --if-exists`, so it drops and
> recreates the public-schema objects it contains. **Restore into a fresh/staging
> Supabase project first** to verify, before ever pointing it at production.

1. Get a backup file:
   - From the branch: `git fetch origin db-backups && git checkout db-backups`, then
     look in `backups/` (newest timestamp = latest).
2. Restore it:
   ```bash
   export SUPABASE_DB_URL="postgresql://postgres.<ref>:[PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"
   export BACKUP_PASSPHRASE="your-long-passphrase"
   ./scripts/db/restore.sh backups/hacienda-<stamp>.sql.gz.gpg
   ```

**About `auth.users`:** the dump only covers the `public` schema. The `user_id`
columns reference Supabase's `auth.users`, which Supabase manages. Restoring into the
**same** project is fine (those users still exist). Restoring into a **brand-new**
project requires recreating the users (same UUIDs) first, or the FKs will fail.

---

## 3. Schema rollback (down migrations)

To undo a structural change (a column/table/function added by a migration), run the
matching script in `supabase/migrations/down/` in the Supabase SQL Editor. See
`supabase/migrations/down/README.md` for ordering and caveats.

Down migrations revert **structure**, not deleted **data** — for data loss, restore a
backup (section 2).

---

## What this does and doesn't cover

| Scenario | Covered by |
|----------|-----------|
| "I deleted/messed up transactions, roll back to last night" | Restore latest data backup |
| "A migration broke the schema" | Down migration, or restore a backup |
| "Supabase project deleted / total loss" | Restore data backup into a new project (recreate `auth.users` first) |
| Sub-day (point-in-time) recovery | **Not covered** — needs Supabase Pro PITR |
| `auth.users` / Storage objects | **Not covered** — `public` schema only |
