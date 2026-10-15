# Migration tests

Applies every migration to a throwaway Postgres cluster, runs the behavioural
suites against it, then checks that the matching down migration reverses cleanly
and is safe to run twice.

Nothing touches the live Supabase project. The cluster is created in a temp
directory and destroyed when the script exits, pass or fail.

```sh
./supabase/tests/run.sh
```

Needs local Postgres binaries. If they aren't on `PATH`:

```sh
PGBIN="/c/Program Files/PostgreSQL/16/bin" ./supabase/tests/run.sh
```

Exit code is the number of failures, so it drops straight into CI.

## Files

| File | Purpose |
|---|---|
| `run.sh` | The runner. Creates the cluster, applies, tests, tears down. |
| `harness.sql` | The Supabase-provided pieces a plain cluster lacks — the `auth` schema, a stub `auth.uid()` driven by the `test.uid` setting, the `authenticated` role, and the two user ids migration 007 seeds against. |
| `<nnn>_*.test.sql` | One suite per migration worth testing. |

Seed migrations (`*seed*.sql`) are skipped — they insert demo data rather than
define schema.

## Writing a suite

Name it after the migration it covers (`018_*.test.sql`) so the runner can pair
it with `migrations/down/018_*.down.sql`.

Raise on failure and `RAISE NOTICE 'PASS …'` on success — the runner greps for
`PASS` and treats a non-zero exit as a failure:

```sql
DO $$
BEGIN
  IF (SELECT count(*) FROM …) <> 1 THEN
    RAISE EXCEPTION 'FAIL: explain what went wrong';
  END IF;
  RAISE NOTICE 'PASS n · what this proves';
END $$;
```

To exercise RLS, become a non-superuser (policies are bypassed for the table
owner) and set the stub uid:

```sql
SET ROLE rls_tester;
SET test.uid = '<a user id>';
```

Use `SET`, not `SET LOCAL` — outside a transaction block `SET LOCAL` is a no-op,
which silently makes `auth.uid()` NULL and every policy check meaningless.
