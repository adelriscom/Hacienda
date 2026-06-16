# Backups & rollback

Two independent safety nets:

1. **Data backups** — nightly encrypted `pg_dump` of the `public` schema, so you can
   recover deleted/corrupted rows or roll the whole database back to a prior night.
2. **Schema rollback** — `down` migrations in `supabase/migrations/down/` that reverse
   each structural change.

---

## 1. Data backups (automated)

A GitHub Action (`.github/workflows/db-backup.yml`) runs every night, dumps the
`public` schema, gzips + encrypts it with AES-256, and commits it to an **orphan
`db-backups` branch** under `backups/`. The 30 most recent dumps are kept; older ones
are pruned automatically.

Files are named `hacienda-<UTC-timestamp>.sql.gz.gpg` and are **encrypted** — useless
without the passphrase, so financial data never sits in the repo in cleartext.

### One-time setup

Add two repository secrets (GitHub → repo → Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|-------|
| `SUPABASE_DB_URL` | The Postgres connection string. Supabase Dashboard → Project Settings → **Database** → Connection string → **URI**. Use the direct connection (port 5432) and keep `?sslmode=require`. It contains your DB password — treat it as a secret. |
| `BACKUP_PASSPHRASE` | A long random passphrase **you choose** to encrypt the dumps. Store it somewhere safe (password manager). **If you lose it, the backups are unrecoverable.** |

Then trigger the first run manually: Actions → *Nightly DB backup* → **Run workflow**.

> Note: GitHub disables scheduled workflows on a repo with no activity for 60 days.
> The nightly commit to `db-backups` counts as activity, so this stays alive on its own.

### Run a manual backup locally (optional)

```bash
export SUPABASE_DB_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres?sslmode=require"
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
   export SUPABASE_DB_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres?sslmode=require"
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
