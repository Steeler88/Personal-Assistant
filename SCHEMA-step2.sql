-- Step 2: journal entries. Single-user, no auth.
-- Run in Supabase → SQL Editor.
--
-- LOCKED DECISION (2026-08-16): exactly one wake entry and one bedtime entry
-- per day, edited in place. That is what `unique (entry_date, kind)` enforces,
-- and it lets the app upsert on that key instead of inserting duplicates.
--
-- Changing to multiple-entries-per-day later means dropping that constraint and
-- reworking the UI into a list. Existing rows survive as the first entry of
-- their day, so it is a clean migration if you ever want it.

create table journal_entries (
  id          uuid primary key default gen_random_uuid(),
  entry_date  date not null,
  kind        text not null check (kind in ('wake','bed')),
  body        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (entry_date, kind)
);

-- RLS on, with a policy that lets the anon key read/write.
-- Functionally open, but explicit — so tightening later (if you ever add auth)
-- is a policy edit rather than a redesign.
alter table journal_entries enable row level security;

create policy "single user full access"
  on journal_entries for all
  to anon
  using (true)
  with check (true);

-- No extra index needed: the unique constraint already indexes
-- (entry_date, kind), which also serves lookups by entry_date alone.
