# Personal Assistant

A single-page personal dashboard — journal, to-dos, calendar, nutrition, market
briefing and Whoop — built for one person, no login.

React + Vite, Supabase for data, Vercel for hosting and serverless functions.

## Running it

```bash
npm install
npm run dev          # UI only
npx vercel dev       # UI + serverless functions (needed for market, Whoop, macros)
```

Serverless functions read secrets from `.env.local`, which is gitignored. See
`CLAUDE.md` for what each variable is and which ones must never reach the browser.

## Deploying

```bash
npx vercel --prod
```

Pushing to GitHub does not deploy on its own.

## Database

One idempotent SQL file per feature (`SCHEMA-*.sql`), run in the Supabase SQL
editor. They are safe to re-run and will not delete existing data.

## Notes

`CLAUDE.md` holds the working notes: architecture, conventions, API limits, and
the gotchas already hit.
