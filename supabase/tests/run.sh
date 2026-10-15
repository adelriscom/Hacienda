#!/usr/bin/env bash
#
# Applies every migration to a throwaway Postgres cluster, runs the *.test.sql
# suites against it, then checks each down migration reverses cleanly and is
# safe to re-run.
#
# Nothing touches the live Supabase project — the cluster is created in a temp
# directory and destroyed on exit.
#
#   ./supabase/tests/run.sh
#
# Needs local Postgres binaries. Override the location if they aren't on PATH:
#   PGBIN="/c/Program Files/PostgreSQL/16/bin" ./supabase/tests/run.sh

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../migrations"
PORT="${PGPORT:-55432}"
PGDATA="$(mktemp -d)/cluster"

if [ -n "${PGBIN:-}" ]; then
  INITDB="$PGBIN/initdb"; PGCTL="$PGBIN/pg_ctl"; PSQLBIN="$PGBIN/psql"
else
  INITDB=initdb; PGCTL=pg_ctl; PSQLBIN=psql
fi

command -v "$INITDB" >/dev/null 2>&1 || [ -x "$INITDB" ] || [ -x "$INITDB.exe" ] || {
  echo "Postgres binaries not found. Set PGBIN to the directory holding initdb/pg_ctl/psql." >&2
  exit 1
}

psql_run() { "$PSQLBIN" -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 "$@"; }

cleanup() {
  "$PGCTL" -D "$PGDATA" stop -m immediate >/dev/null 2>&1
  rm -rf "$(dirname "$PGDATA")"
}
trap cleanup EXIT

echo "▸ creating a throwaway cluster on port $PORT"
"$INITDB" -D "$PGDATA" -U postgres -A trust -E UTF8 >/dev/null 2>&1 || { echo "initdb failed"; exit 1; }
"$PGCTL" -D "$PGDATA" -o "-p $PORT" -l "$PGDATA/server.log" start >/dev/null 2>&1

for _ in $(seq 1 20); do
  psql_run -tAc "select 1" >/dev/null 2>&1 && break
  sleep 1
done
psql_run -tAc "select 1" >/dev/null 2>&1 || { echo "server did not start"; tail -5 "$PGDATA/server.log"; exit 1; }

psql_run -c "create database hacienda_test" >/dev/null 2>&1
db() { psql_run -q -d hacienda_test "$@"; }

fails=0
step() {  # step <label> <file>
  if out=$(db -f "$2" 2>&1); then
    printf '  ok   %s\n' "$1"
  else
    printf '  FAIL %s\n' "$1"; echo "$out" | sed 's/^/       /' | head -6; fails=$((fails + 1))
  fi
}

echo "▸ applying migrations"
step "harness" "$HERE/harness.sql"
# Globs, not `ls` — the repo path contains spaces. Seed files insert demo data
# and aren't part of the schema under test.
shopt -s nullglob
for f in "$MIGRATIONS"/*.sql; do
  case "$(basename "$f")" in *seed*) continue ;; esac
  step "$(basename "$f")" "$f"
done

echo "▸ running test suites"
for f in "$HERE"/*.test.sql; do
  if out=$(psql_run -d hacienda_test -f "$f" 2>&1); then
    echo "$out" | grep -E 'PASS' | sed 's/^.*NOTICE:  /  /'
  else
    printf '  FAIL %s\n' "$(basename "$f")"
    echo "$out" | grep -E 'ERROR|FAIL' | sed 's/^/       /' | head -6
    fails=$((fails + 1))
  fi
done

# Only migrations that have a test suite. Asserting that every historical down
# migration is re-runnable would hold old files to a standard they were never
# written to, and the noise would bury a real failure.
echo "▸ checking down migrations reverse and re-run cleanly"
for t in "$HERE"/*.test.sql; do
  prefix="$(basename "$t")"; prefix="${prefix%%_*}"
  for f in "$MIGRATIONS"/down/"$prefix"_*.down.sql; do
    name=$(basename "$f")
    # Twice: a rollback you can't repeat is a footgun when you aren't sure it ran.
    if db -f "$f" >/dev/null 2>&1 && db -f "$f" >/dev/null 2>&1; then
      printf '  ok   %s (reversed, then re-run)\n' "$name"
    else
      printf '  FAIL %s is not safely re-runnable\n' "$name"; fails=$((fails + 1))
    fi
    # Re-apply so the schema is whole again for anything that follows.
    for up in "$MIGRATIONS/$prefix"_*.sql; do db -f "$up" >/dev/null 2>&1; done
  done
done

if [ "$fails" -eq 0 ]; then
  echo "▸ all clean"
else
  echo "▸ $fails failure(s)"
fi
exit "$fails"
