-- Journal: structured Morning + Night entries. Single-user, no auth.
-- Run in Supabase → SQL Editor. Supersedes the old free-text journal_entries.
--
-- SAFE TO RE-RUN. Uses "if not exists" / "drop ... if exists" throughout, so
-- running it twice is harmless and will NOT delete entries you've already made.
--
-- SHAPE: one row per day per section. Structured fields are the chartable data;
-- `notes` is optional prose that is deliberately NOT charted.
--
-- Two tables rather than one wide table with a `kind` discriminator: every column
-- here is meaningful for its own table, so the constraints are real instead of
-- half the columns being null on every row. Join on entry_date when you need both.
--
-- Scale/choice columns are nullable so a partially-filled form still saves.
-- CHECK constraints pass on NULL, so they still guard any value that IS entered.

drop table if exists journal_entries;   -- old free-text version, verified empty

create table if not exists morning_entries (
  entry_date    date primary key,
  sleep_quality smallint check (sleep_quality between 1 and 10),
  soreness      smallint check (soreness between 1 and 10),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists night_entries (
  entry_date      date primary key,
  productivity    smallint check (productivity between 1 and 10),
  finances        text     check (finances in ('positive','negative')),
  nutrition_ok    boolean,
  nutrition_issue text,                 -- only meaningful when nutrition_ok = false
  fitness_ok      boolean,
  fitness_issue   text,                 -- only meaningful when fitness_ok = false
  social          smallint check (social between 1 and 10),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Let Postgres own updated_at. Previously the browser set it, which produced an
-- updated_at one second BEFORE created_at due to clock skew between the two.
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists morning_entries_touch on morning_entries;
create trigger morning_entries_touch before update on morning_entries
  for each row execute function touch_updated_at();

drop trigger if exists night_entries_touch on night_entries;
create trigger night_entries_touch before update on night_entries
  for each row execute function touch_updated_at();

alter table morning_entries enable row level security;
alter table night_entries   enable row level security;

drop policy if exists "single user full access" on morning_entries;
create policy "single user full access" on morning_entries
  for all to anon using (true) with check (true);

drop policy if exists "single user full access" on night_entries;
create policy "single user full access" on night_entries
  for all to anon using (true) with check (true);
