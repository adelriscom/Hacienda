#!/usr/bin/env bash
# Manual local backup — encrypted pg_dump of the Supabase public schema.
#
# Usage:
#   export SUPABASE_DB_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres?sslmode=require"
#   export BACKUP_PASSPHRASE="your-long-passphrase"
#   ./scripts/db/backup-local.sh [output-dir]
#
# Produces: <output-dir>/hacienda-<UTC timestamp>.sql.gz.gpg
# Requires: pg_dump (v15+), gzip, gpg.

set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}"

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
OUT="$OUT_DIR/hacienda-${STAMP}.sql.gz.gpg"

pg_dump \
  --schema=public \
  --no-owner --no-privileges \
  --clean --if-exists \
  "$SUPABASE_DB_URL" \
| gzip -9 \
| gpg --batch --yes --symmetric --cipher-algo AES256 \
      --passphrase "$BACKUP_PASSPHRASE" \
      -o "$OUT"

echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
