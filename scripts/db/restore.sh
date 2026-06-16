#!/usr/bin/env bash
# Restore an encrypted backup produced by backup-local.sh or the nightly workflow.
#
# Usage:
#   export SUPABASE_DB_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres?sslmode=require"
#   export BACKUP_PASSPHRASE="your-long-passphrase"
#   ./scripts/db/restore.sh path/to/hacienda-<stamp>.sql.gz.gpg
#
# The dump was taken with --clean --if-exists, so it drops and recreates the
# public-schema objects it contains before reloading data.
#
# !! DESTRUCTIVE: overwrites the public schema of the target database. !!
# Restore into a fresh / staging Supabase project first to verify before prod.
# Requires: psql, gzip, gpg.

set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}"

FILE="${1:?Pass the path to a .sql.gz.gpg backup file}"
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }

echo "About to restore $FILE into:"
echo "  ${SUPABASE_DB_URL%%@*}@***"
read -r -p "This OVERWRITES the public schema. Type 'yes' to continue: " ok
[ "$ok" = "yes" ] || { echo "Aborted."; exit 1; }

gpg --batch --yes --decrypt --passphrase "$BACKUP_PASSPHRASE" "$FILE" \
| gunzip \
| psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1

echo "Restore complete."
