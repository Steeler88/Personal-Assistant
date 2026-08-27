-- Meal log. Single-user, no auth.
-- Run in Supabase → SQL Editor. SAFE TO RE-RUN — deletes nothing.
--
-- You write what you ate; macros are estimated from that text and stored
-- alongside it. Keeping the original description means an estimate can be
-- recomputed later without you re-entering anything.

create table if not exists meals (
  id           uuid primary key default gen_random_uuid(),
  eaten_on     date not null,
  meal         text not null check (meal in ('breakfast','lunch','dinner','snack')),
  description  text not null,
  calories     integer,
  protein_g    numeric(6,1),
  fat_g        numeric(6,1),
  carbs_g      numeric(6,1),
  estimate_note text,                    -- assumptions the estimate rests on
  estimated_at timestamptz,              -- null until an estimate lands
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Daily totals and trends both read by date.
create index if not exists meals_date_idx on meals (eaten_on);

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists meals_touch on meals;
create trigger meals_touch before update on meals
  for each row execute function touch_updated_at();

alter table meals enable row level security;

drop policy if exists "single user full access" on meals;
create policy "single user full access" on meals
  for all to anon using (true) with check (true);
