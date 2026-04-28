-- Hacienda · Database Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query → Run)
-- Requires: auth.users (provided by Supabase Auth)

-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Accounts ─────────────────────────────────────────────────────────────────
-- Bank accounts, credit cards, cash, investment accounts
create table accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users on delete cascade not null,
  name           text not null,                   -- e.g. "BBVA •• 4821"
  type           text not null                    -- 'checking' | 'savings' | 'credit' | 'cash' | 'investment'
                   check (type in ('checking','savings','credit','cash','investment')),
  currency       text not null default 'MXN',
  balance        numeric(14,2) not null default 0,
  credit_limit   numeric(14,2),                   -- credit cards only
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ─── Categories ───────────────────────────────────────────────────────────────
create table categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users on delete cascade not null,
  name       text not null,       -- e.g. "Alimentación"
  color      text not null,       -- CSS var or hex, e.g. "var(--cat-food)"
  icon       text not null,       -- icon key, e.g. "wallet"
  created_at timestamptz not null default now()
);

-- ─── Transactions ─────────────────────────────────────────────────────────────
create table transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users on delete cascade not null,
  account_id       uuid references accounts on delete restrict not null,
  category_id      uuid references categories on delete set null,
  occurred_at      timestamptz not null,
  description      text not null,
  amount           numeric(14,2) not null,  -- positive = income, negative = expense/transfer
  type             text not null
                     check (type in ('income','expense','transfer')),
  status           text not null default 'match'
                     check (status in ('match','review','ghost','duplicate')),
  is_recurring     boolean not null default false,
  transfer_pair_id uuid references transactions on delete set null,  -- links debit+credit sides
  notes            text,
  created_at       timestamptz not null default now()
);

-- ─── Budgets ──────────────────────────────────────────────────────────────────
-- Monthly envelope per category
create table budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete cascade not null,
  category_id uuid references categories on delete cascade not null,
  month       date not null,         -- first day of the month, e.g. '2026-04-01'
  amount      numeric(14,2) not null check (amount > 0),
  created_at  timestamptz not null default now(),
  unique (user_id, category_id, month)
);

-- ─── Scheduled Payments ───────────────────────────────────────────────────────
-- Recurring bills, income, and transfers shown in the Smart Calendar
create table scheduled_payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete cascade not null,
  account_id  uuid references accounts on delete set null,
  category_id uuid references categories on delete set null,
  name        text not null,
  amount      numeric(14,2) not null,
  type        text not null check (type in ('income','expense','transfer')),
  frequency   text not null check (frequency in ('once','weekly','biweekly','monthly','yearly')),
  next_date   date not null,
  auto_debit  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ─── Import Sources ───────────────────────────────────────────────────────────
-- Bank statement files imported for reconciliation
create table import_sources (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users on delete cascade not null,
  name         text not null,          -- "BBVA · Estado de cuenta"
  file_type    text not null check (file_type in ('PDF','CSV','DOCX','manual')),
  month        date not null,
  total_rows   integer,
  matched_rows integer,
  status       text not null default 'pending'
                 check (status in ('ok','warn','missing','pending')),
  imported_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- ─── Audit Log ────────────────────────────────────────────────────────────────
-- Tracks all reconciliation actions (shown in the Bitácora panel)
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete cascade not null,
  action      text not null,     -- "Importó", "Resolvió", "Marcó como duplicado"
  target      text not null,     -- human-readable description
  entity_type text check (entity_type in ('transaction','import','budget','payment')),
  entity_id   uuid,
  created_at  timestamptz not null default now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table accounts          enable row level security;
alter table categories        enable row level security;
alter table transactions      enable row level security;
alter table budgets            enable row level security;
alter table scheduled_payments enable row level security;
alter table import_sources    enable row level security;
alter table audit_log         enable row level security;

-- Each user can only see and modify their own rows
create policy "owner" on accounts          for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner" on categories        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner" on transactions      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner" on budgets            for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner" on scheduled_payments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner" on import_sources    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner" on audit_log         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
create index on transactions (user_id, occurred_at desc);
create index on transactions (account_id);
create index on transactions (category_id);
create index on transactions (status) where status in ('review','ghost','duplicate');
create index on budgets (user_id, month);
create index on scheduled_payments (user_id, next_date);
create index on audit_log (user_id, created_at desc);
