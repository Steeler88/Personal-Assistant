# Personal Assistant — Dashboard

A static, dependency-free dashboard. `index.html` is the home page and the entry
point that links out to every other page.

## Structure

```
index.html        Dashboard home — KPIs, weekly activity chart, schedule,
                  priorities, goal rings, "Jump to" hub, recent activity
tasks.html        Board / list / completed views, filter chips
calendar.html     Month grid + daily agenda + meeting-load meters
notes.html        Tagged note cards + recently-edited table
habits.html       Streak stats, 26-week heatmap, weekly completion bars
settings.html     Profile form, notifications, integrations, appearance
assets/css/app.css   Design tokens + all components
assets/js/app.js     Theme, drawer, tabs, chips, toasts, tooltips
design-system/       Generated design-system reference (MASTER + page overrides)
```

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 4173
```

## Design system

Generated with the `ui-ux-pro-max` skill and recorded in `design-system/`.

- **Style** — Data-Dense Dashboard: KPI cards, tight grids, maximum data per screen
- **Type** — Fira Sans for prose, Fira Code for numerals, labels and axes
- **Colour** — monochrome neutrals with a single blue accent, five-colour chart ramp
- **Themes** — light and dark, following the OS by default; a manual choice
  persists in `localStorage` under `pa-theme`

Two deliberate departures from the generated recommendation:

1. **Fira Code is not used for headings.** Monospace at heading sizes hurts
   scanning. It is reserved for numerals, metric labels and chart axes, which is
   where it earns its place.
2. **Hand-written CSS instead of Tailwind.** There is no build tooling in this
   project, and the Tailwind Play CDN ships a JIT compiler to the browser. Tokens
   in `:root` give the same consistency with an instant first paint.

## Accessibility

Verified rather than assumed:

- Every text/background pair meets **WCAG AA (4.5:1)** in both themes; chart marks
  meet 3:1. The accent is split into `--cta` (text) and `--cta-bg` (fills) because
  no single blue passes both roles in dark mode.
- Every interactive target is **≥44×44px** on coarse pointers.
- No horizontal scroll at 375px.
- Skip link, one `<h1>` per page, labelled form controls, named icon buttons,
  `aria-current` on the active nav item, keyboard-driven tabs (arrows/Home/End).
- Charts carry a `<desc>` summary and a **"View chart data as a table"** disclosure.
- Decorative SVG is hidden from assistive tech; `prefers-reduced-motion` respected.

## Shortcuts

`⌘K` or `/` focus search · `Esc` closes the drawer · `← →` move between tabs

## Note on maintenance

The sidebar and topbar markup is repeated in each page so the site stays static
with no build step and working navigation without JavaScript. Changing a nav item
means editing that block in all six files.
