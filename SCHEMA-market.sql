-- Market briefings. Single-user, no auth.
-- Run in Supabase → SQL Editor. SAFE TO RE-RUN — deletes nothing.
--
-- Stores the result of a briefing so the dashboard can show the last one
-- without spending API quota. EODHD is only called when you press the button;
-- opening the page just reads this table.

create table if not exists market_briefings (
  briefing_date date primary key,          -- one briefing per day, refreshable
  generated_at  timestamptz not null default now(),
  quotes        jsonb not null,            -- [{symbol, close, change, change_p, ...}]
  headlines     jsonb,                     -- [{title, date, link}]
  insight       text                       -- filled in later by the AI layer
);

alter table market_briefings enable row level security;

drop policy if exists "single user full access" on market_briefings;
create policy "single user full access" on market_briefings
  for all to anon using (true) with check (true);
