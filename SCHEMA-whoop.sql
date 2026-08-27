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

-- ---------------------------------------------------------------------------
-- Day strain, and sleep need as a column.
--
-- Strain is a separate Whoop resource (/v2/cycle) that the original sync never
-- called, so it needs a table and a re-sync. Sleep need does not: it has been
-- inside whoop_sleep.raw all along, and the backfill below lifts it out. That
-- is why `raw` is kept whole.
-- ---------------------------------------------------------------------------

alter table whoop_sleep add column if not exists sleep_needed_min integer;

-- Whoop's recommendation for that night: a baseline, plus what sleep debt and
-- recent strain added, minus what a nap already covered. The nap component
-- arrives already negative, so this is a straight sum.
update whoop_sleep
set sleep_needed_min = round((
        coalesce((raw->'score'->'sleep_needed'->>'baseline_milli')::numeric, 0)
      + coalesce((raw->'score'->'sleep_needed'->>'need_from_sleep_debt_milli')::numeric, 0)
      + coalesce((raw->'score'->'sleep_needed'->>'need_from_recent_strain_milli')::numeric, 0)
      + coalesce((raw->'score'->'sleep_needed'->>'need_from_recent_nap_milli')::numeric, 0)
    ) / 60000)
where raw -> 'score' ? 'sleep_needed';

create table if not exists whoop_cycles (
  id           text primary key,      -- Whoop cycle id; whoop_recovery.cycle_id joins to this
  recorded_on  date not null,
  strain       numeric(4,1),          -- 0-21, Whoop's own scale
  avg_hr_bpm   numeric(5,1),
  max_hr_bpm   numeric(5,1),
  kilojoule    numeric(9,1),
  start_at     timestamptz,
  end_at       timestamptz,
  raw          jsonb,
  synced_at    timestamptz not null default now()
);
create index if not exists whoop_cycles_date_idx on whoop_cycles (recorded_on desc);

alter table whoop_cycles enable row level security;

drop policy if exists "single user full access" on whoop_cycles;
create policy "single user full access" on whoop_cycles
  for all to anon using (true) with check (true);
