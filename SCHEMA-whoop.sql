-- Whoop integration. Single-user, no auth.
-- Run in Supabase → SQL Editor. SAFE TO RE-RUN — deletes nothing.

-- ---------------------------------------------------------------------------
-- OAuth tokens.
--
-- These are stored ENCRYPTED (AES-256-GCM, key held only on the server as
-- WHOOP_TOKEN_SECRET). The anon key is readable by anyone who views the app
-- bundle, and unlike a journal entry these tokens grant access to a Whoop
-- account — so what the anon key can reach here is ciphertext, not credentials.
-- ---------------------------------------------------------------------------
create table if not exists whoop_tokens (
  id            smallint primary key default 1 check (id = 1),  -- exactly one row
  access_token  text not null,          -- ciphertext
  refresh_token text,                   -- ciphertext
  expires_at    timestamptz not null,
  scope         text,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sleep and recovery. Columns for the figures worth charting; raw kept whole
-- so a later question can be answered without re-syncing.
-- ---------------------------------------------------------------------------
create table if not exists whoop_sleep (
  id               text primary key,     -- Whoop sleep UUID (v2 uses UUIDs)
  night_of         date not null,
  start_at         timestamptz,
  end_at           timestamptz,
  performance_pct  numeric(5,1),
  total_sleep_min  integer,
  efficiency_pct   numeric(5,1),
  raw              jsonb,
  synced_at        timestamptz not null default now()
);
create index if not exists whoop_sleep_night_idx on whoop_sleep (night_of desc);

create table if not exists whoop_recovery (
  cycle_id       text primary key,
  recorded_on    date not null,
  recovery_score numeric(5,1),
  hrv_ms         numeric(7,2),
  rhr_bpm        numeric(5,1),
  raw            jsonb,
  synced_at      timestamptz not null default now()
);
create index if not exists whoop_recovery_date_idx on whoop_recovery (recorded_on desc);

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists whoop_tokens_touch on whoop_tokens;
create trigger whoop_tokens_touch before update on whoop_tokens
  for each row execute function touch_updated_at();

alter table whoop_tokens   enable row level security;
alter table whoop_sleep    enable row level security;
alter table whoop_recovery enable row level security;

drop policy if exists "single user full access" on whoop_tokens;
create policy "single user full access" on whoop_tokens
  for all to anon using (true) with check (true);

drop policy if exists "single user full access" on whoop_sleep;
create policy "single user full access" on whoop_sleep
  for all to anon using (true) with check (true);

drop policy if exists "single user full access" on whoop_recovery;
create policy "single user full access" on whoop_recovery
  for all to anon using (true) with check (true);
