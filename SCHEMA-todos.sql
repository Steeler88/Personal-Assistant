-- To-Do list. Single-user, no auth.
-- Run in Supabase → SQL Editor. SAFE TO RE-RUN — will not delete existing tasks.

create table if not exists todos (
  id         uuid primary key default gen_random_uuid(),
  task       text not null,
  due_date   date,                                        -- optional
  priority   text check (priority in ('high','medium','low')),  -- optional
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sort order is "not done first, then soonest due" — index the pair that drives it.
create index if not exists todos_open_due_idx on todos (done, due_date);

-- Postgres owns updated_at (same reasoning as the journal tables).
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists todos_touch on todos;
create trigger todos_touch before update on todos
  for each row execute function touch_updated_at();

alter table todos enable row level security;

drop policy if exists "single user full access" on todos;
create policy "single user full access" on todos
  for all to anon using (true) with check (true);
