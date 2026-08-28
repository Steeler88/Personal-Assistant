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
  insight       text,                      -- filled in later by the AI layer
  skipped       jsonb                      -- symbols the plan/quota could not serve
);

alter table market_briefings enable row level security;

drop policy if exists "single user full access" on market_briefings;
create policy "single user full access" on market_briefings
  for all to anon using (true) with check (true);

-- ---------------------------------------------------------------------------
-- The watchlist.
--
-- The symbols used to be a constant in api/market-briefing.js, which meant
-- changing them was a deploy. They live here so the app can edit them, and the
-- server reads this table when it builds a briefing.
--
-- Symbols are stored bare ("NVDA"); the ".US" suffix EODHD wants is added at
-- call time, so the exchange is the API's business rather than the data's.
--
-- Seeded with the seven that were hardcoded, so nothing changes on first run.
-- ---------------------------------------------------------------------------
create table if not exists watchlist (
  symbol   text primary key check (symbol = upper(symbol) and length(symbol) between 1 and 12),
  name     text,                                  -- as EODHD knows it, for display
  added_at timestamptz not null default now()
);

insert into watchlist (symbol) values
  ('VOO'), ('QQQ'), ('PLTR'), ('NVDA'), ('AMZN'), ('TSLA'), ('SOXL')
on conflict (symbol) do nothing;

alter table watchlist enable row level security;

drop policy if exists "single user full access" on watchlist;
create policy "single user full access" on watchlist
  for all to anon using (true) with check (true);
