-- Calendar events. Single-user, no auth.
-- Run in Supabase → SQL Editor. SAFE TO RE-RUN — will not delete existing events.

create table if not exists calendar_events (
  id         uuid primary key default gen_random_uuid(),
  event_date date not null,
  start_time time,                 -- null means an all-day event
  title      text not null,
  note       text,                 -- optional
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The month view queries a date range and orders within a day by time.
create index if not exists calendar_events_date_idx on calendar_events (event_date, start_time);

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists calendar_events_touch on calendar_events;
create trigger calendar_events_touch before update on calendar_events
  for each row execute function touch_updated_at();

alter table calendar_events enable row level security;

drop policy if exists "single user full access" on calendar_events;
create policy "single user full access" on calendar_events
  for all to anon using (true) with check (true);
