# Down migrations (schema rollback)

Each `NNN_*.down.sql` reverses the matching `../NNN_*.sql` migration. Use these to
roll back a **schema** change. They do **not** restore deleted row data — for that,
restore a data backup (see `docs/BACKUPS.md`).

## How to roll back

1. Open Supabase Dashboard → SQL Editor.
2. Paste and run the relevant `*.down.sql` file(s).
3. **Run them in reverse order** (highest number first) when undoing several at once,
   because later migrations may depend on earlier ones.

Example — undo migrations 015 down to 013:

```
015_auto_categorize_trigger.down.sql
014_transaction_exchange_rate.down.sql
013_subcategories.down.sql
```

## Dependency notes

- Run `011_household_invites.down.sql` **before** `007_households.down.sql`
  (household_invites has an FK to households).
- Down scripts marked `WARNING` drop tables/columns and therefore drop the data
  they hold. Take a backup first.

## What is NOT provided

- **001 (base schema):** no down script. Tearing down the base tables destroys the
  entire database. If you truly need this, restore from a backup into a fresh project
  instead.
- **002 / 004 / 005 / seed scripts:** these insert data, not schema. To undo them,
  delete the seeded rows or restore a backup.
