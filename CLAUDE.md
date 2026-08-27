# Personal Assistant — working notes

A single-page personal dashboard: journal, to-dos, calendar, nutrition, market
briefing, and Whoop. Built for one person (Johnny), no login.

## Stack

React 18 + Vite (plain JS, not TS), Supabase for data, Vercel for hosting and
serverless functions. `src/design-kit.tsx` is a **vendored** design system —
dark, mint accent, Newsreader italic headings. Don't edit it; build components
from its CSS variables instead (see `src/components/controls.jsx`).

## Where things are

| | |
|---|---|
| Repo | `Steeler88/Personal-Assistant` (**private**) |
| Production | https://personal-assistant-rho-nine.vercel.app (stable alias) |
| Supabase | project `zcyrktnrynxylklmayff` |

**`rho-nine` is the stable alias.** Every deploy also gets a throwaway hostname;
Whoop's OAuth redirect is registered against `rho-nine`, so never substitute a
per-deploy URL there.

## Deploying — not automatic

Pushing to GitHub does **not** deploy. Vercel builds only when told:

```bash
npx vercel --prod
```

## Secrets

All in `.env.local` (gitignored) and Vercel's encrypted env store. Never commit
them, never let them reach the browser.

`VITE_`-prefixed vars are compiled into the client bundle. That prefix is the
security boundary, not a naming convention:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — public by design, RLS-guarded
- `EODHD_API_KEY`, `ANTHROPIC_API_KEY`, `WHOOP_CLIENT_SECRET`, `WHOOP_TOKEN_SECRET`
  — real secrets, **server-side only**, must never gain a `VITE_` prefix
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — unprefixed copies for the functions

Before any commit: `git diff --cached | grep -E "sk-ant-|eyJhbGciOi|service_role"`.

## Database

One SQL file per feature (`SCHEMA-*.sql`). **All are idempotent — safe to
re-run.** Claude does not run them; hand them to Johnny to paste into the
Supabase SQL editor (`pbcopy < SCHEMA-x.sql` and give him the `/sql/new` link).

Tables: `morning_entries`, `night_entries`, `todos`, `calendar_events`,
`market_briefings`, `meals`, `whoop_tokens`, `whoop_sleep`, `whoop_recovery`.

Single-user, so RLS is enabled with a permissive `anon` policy everywhere —
except Whoop tokens, which are AES-256-GCM encrypted before storage because the
anon key is readable from the bundle and those tokens are account access.

## Conventions that matter

**Verify, don't assume.** Every feature here was checked against real data
before being called done — constraints actually rejecting bad input, a row
actually landing in Postgres, the live bundle actually containing the change.
Several real bugs were caught this way that a green build hid.

**Clean up test data.** Johnny's real entries are in these tables. Delete only
rows you created, matched exactly. Check before destructive SQL.

**"push my changes"** means add + commit + push, no confirmation. It does *not*
deploy.

## Gotchas already paid for

- **Local dates, never `toISOString()`** — it converts to UTC and rolls the date
  over at night, misfiling bedtime entries. Use `src/lib/today.js` / `dates.js`.
- **`[hidden]` needs `display: none !important`** — any class setting `display`
  outranks the UA rule. Set globally in `index.css`; don't re-solve per component.
- **`.dk-shell` sets `overflow: hidden`** — popovers must portal to `<body>` with
  fixed positioning or they get clipped (see `DatePicker.jsx`, `TimePicker.jsx`).
- **Vercel runs UTC** — the browser sends its local date for anything day-stamped.
- **`vercel dev` caches env at startup** — restart it after adding a variable.

## EODHD (market data) — free plan

20 calls/day **plus a 500-call buffer** that is consumed automatically once the
daily allowance runs out. `/api/user` is free and reports both.

Available: EOD history, real-time quotes, news, dividends, splits, search.
**Not available (403): intraday, fundamentals, earnings calendar, technical
indicators, screener.**

RSI and moving averages are computed locally from EOD bars (`api/_metrics.js`) —
the paid `/technical` endpoint would be paying for arithmetic.

Costs: first briefing of the day ~14 calls, later ones ~7 (live quotes only —
EOD context is fetched once daily). A refresh with no new close costs 1.

**Prices only move after the ~4pm ET close.** A morning refresh legitimately
returns yesterday's numbers and says so.

## Claude API usage

`claude-opus-5`, adaptive thinking (`budget_tokens` is rejected on this model),
official SDK. Two uses: the market read (`api/_insight.js`) and macro estimation
(`api/estimate-macros.js`, schema-constrained JSON).

The market prompt is deliberately **descriptive, not advisory** — it reports what
moved, never recommends buying or selling. Keep it that way.

## Status

**Built and working:** journal (structured morning/night, collapses when saved),
to-dos, calendar (recurring events, dated to-dos shown on it), summary strip,
market briefing (live quotes + AI read), nutrition (meal log + macro estimates),
Whoop (sleep + recovery, connected and syncing).

**Open:**
- **Fidelity** — deliberately last. No public API; the only safe route is an
  aggregator (Plaid/SnapTrade) where Johnny authenticates directly. Never handle
  brokerage credentials.
- **Reminders** — never decided. The calendar may already cover it; ask before
  building a second card that overlaps to-dos.
- **Journal trends and charts** — wanted in his notes, but there are only a few
  entries so far. Revisit once a real series exists.
- **Schoolwork, baseball, options** — explicitly deferred.
- Skipping one occurrence of a recurring event (rained-out practice) isn't built;
  deleting removes the whole series.
- The Whoop sync button is manual and pulls the last 30 days.
