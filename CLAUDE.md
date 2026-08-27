# Personal Assistant — working notes

A personal dashboard: journal, to-dos, calendar, nutrition, market briefing,
and Whoop. Built for one person (Johnny), no login.

**Home is a summary; each section gets its own screen.** The home screen reads
all six sections at once and carries only the daily actions (tick a task, log a
meal, open the journal); everything else lives behind a tab. Navigation is a
hash router hand-rolled in `src/lib/router.js` — seven screens did not warrant a
routing dependency, and the hash keeps deep links and the back button working
with no Vercel rewrite.

## Stack

React 18 + Vite (plain JS, not TS), Supabase for data, Vercel for hosting and
serverless functions. `src/design-kit.tsx` is a **vendored** design system.
Don't edit it; build components from its CSS variables instead (see
`src/components/controls.jsx`).

**The visual direction is "Instrument"** — mono-first, dense, with colour
carrying state (mint good, amber watch, red bad) rather than decorating. It is
applied entirely as token overrides and app classes in the INSTRUMENT block at
the bottom of `src/index.css`; the kit itself is untouched. Those overrides use
`html:root` rather than `:root` because the kit injects its own `<style>` at
import time and tag order isn't ours to control. The kit's Newsreader serif is
no longer loaded — five places that used it are redirected to mono or sans in
that same block.

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
`market_briefings`, `meals`, `whoop_tokens`, `whoop_sleep`, `whoop_recovery`,
`whoop_cycles`.

Single-user, so RLS is enabled with a permissive `anon` policy everywhere —
except Whoop tokens, which are AES-256-GCM encrypted before storage because the
anon key is readable from the bundle and those tokens are account access.

## Daily targets

Around **3000 kcal** and **200g of protein** — ranges to sit near, not lines to
cross, so `src/lib/targets.js` bands them symmetrically: within 10% is on target,
within 25% is close, beyond that is off. Overshooting is a miss too.

**A day still being eaten is not judged.** Today shows progress in neutral grey;
only finished days get a colour. Sleep is not a fixed number — the goal is
whatever Whoop asked for that night, which already accounts for strain.

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
- **Whoop's `sleep_performance_percentage` is not sleep ÷ need.** It comes out
  of their model, and dividing gives a visibly different number — 105% against
  a stated 95% on 27 Aug, 108% against 82% on the 24th. Both are stored; the app
  bands against need and keeps Whoop's percentage off the same panel. Don't
  "reconcile" them, they don't reconcile.
- **`whoop_sleep.raw` earns its keep** — sleep need was recovered from it with a
  SQL backfill and no re-sync. Keep storing responses whole.
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

**Built and working:** the summary home, journal (structured morning/night,
collapses when saved), to-dos, calendar (recurring events, dated to-dos shown on
it), market briefing (live quotes + AI read), nutrition (meal log + macro
estimates), Whoop (sleep + recovery, connected and syncing).

**Open:**
- **Fidelity** — deliberately last. No public API; the only safe route is an
  aggregator (Plaid/SnapTrade) where Johnny authenticates directly. Never handle
  brokerage credentials.
- **Reminders** — never decided. The calendar may already cover it; ask before
  building a second card that overlaps to-dos.
- **Deeper section screens** — the tabs currently show each section laid out
  full width, which is where the shell-first rebuild stopped. The intent is that
  each becomes genuinely more detailed than its home panel: history lists,
  weekly aggregates, trends. Most of it needs no new integration, since the
  tables already hold the history.
- **Journal trends and charts** — wanted in his notes, but there are only a few
  entries so far. Revisit once a real series exists.
- **Schoolwork, baseball, options** — explicitly deferred.
- Skipping one occurrence of a recurring event (rained-out practice) isn't built;
  deleting removes the whole series.
- The Whoop sync button is manual and pulls the last 30 days. **Deliberately
  so** — Johnny chose a visible staleness indicator over a cron. The Recovery
  panel and screen show how far behind the newest night is and turn the Sync
  button primary once it matters.
- **Strain needs a sync before it shows.** `whoop_cycles` is populated from
  `/v2/cycle`, which the sync only started calling after the table existed, so
  the column reads `—` until Sync is pressed once.
