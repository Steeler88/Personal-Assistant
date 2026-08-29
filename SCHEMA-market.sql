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

-- ---------------------------------------------------------------------------
-- Stored price history.
--
-- The free plan returns exactly one year of EOD, however far back you ask —
-- from=1980 still comes back with 251 bars. So this table is not a cache, it
-- is the only way this app will ever hold more than a year: each day's sync
-- appends the newest bars and nothing is ever discarded. In twelve months
-- there are two years here that the API would never hand over at once.
--
-- Everything the expanded ticker view draws — moving averages, RSI, drawdown,
-- volatility, beta, monthly returns — is computed from this table, so adding
-- a chart costs nothing.
-- ---------------------------------------------------------------------------
create table if not exists eod_bars (
  symbol    text not null,
  bar_date  date not null,
  open      numeric(14,4),
  high      numeric(14,4),
  low       numeric(14,4),
  close     numeric(14,4),   -- raw. Never changes.
  adjusted  numeric(14,4),   -- split/dividend adjusted; shifts retroactively
  volume    bigint,
  primary key (symbol, bar_date)
);
create index if not exists eod_bars_symbol_idx on eod_bars (symbol, bar_date desc);

-- Reference data and sync bookkeeping. Deliberately not keyed to the
-- watchlist: drop a ticker and add it back and its history is still here.
create table if not exists tickers (
  symbol       text primary key,
  name         text,
  type         text,
  exchange     text,
  currency     text,
  isin         text,
  reference_at timestamptz,   -- name and ISIN never change; fetched once
  actions_at   timestamptz,   -- dividends and splits; quarterly is plenty
  history_at   timestamptz    -- last full backfill
);

create table if not exists dividends (
  symbol           text not null,
  ex_date          date not null,
  amount           numeric(12,6),
  currency         text,
  declaration_date date,
  record_date      date,
  payment_date     date,
  period           text,
  primary key (symbol, ex_date)
);

-- A new row here means every adjusted close before it has moved, so the
-- symbol's history has to be refetched rather than appended to.
create table if not exists splits (
  symbol     text not null,
  split_date date not null,
  ratio      text,
  factor     numeric(12,6),
  primary key (symbol, split_date)
);

create table if not exists ticker_news (
  id           uuid primary key default gen_random_uuid(),
  symbol       text not null,
  published_at timestamptz not null,
  title        text not null,
  link         text,
  sentiment    jsonb,          -- {polarity, pos, neu, neg}
  tags         jsonb,
  fetched_at   timestamptz not null default now(),
  unique (symbol, link)
);
create index if not exists ticker_news_symbol_idx on ticker_news (symbol, published_at desc);

alter table eod_bars    enable row level security;
alter table tickers     enable row level security;
alter table dividends   enable row level security;
alter table splits      enable row level security;
alter table ticker_news enable row level security;

drop policy if exists "single user full access" on eod_bars;
create policy "single user full access" on eod_bars for all to anon using (true) with check (true);
drop policy if exists "single user full access" on tickers;
create policy "single user full access" on tickers for all to anon using (true) with check (true);
drop policy if exists "single user full access" on dividends;
create policy "single user full access" on dividends for all to anon using (true) with check (true);
drop policy if exists "single user full access" on splits;
create policy "single user full access" on splits for all to anon using (true) with check (true);
drop policy if exists "single user full access" on ticker_news;
create policy "single user full access" on ticker_news for all to anon using (true) with check (true);
