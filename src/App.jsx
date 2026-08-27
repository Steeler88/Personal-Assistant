import { useEffect, useState } from 'react'
import { SECTIONS, useRoute, go, sectionOf } from './lib/router'
import { clock } from './lib/dates'
import { longDate } from './lib/today'

import Home from './views/Home'
import JournalToday from './components/JournalToday'
import Todos from './components/Todos'
import Calendar from './components/Calendar'
import MarketBriefing from './components/MarketBriefing'
import Nutrition from './components/Nutrition'
import Whoop from './components/Whoop'

/** The readout says the time, so it has to keep saying the right one. */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

const stamp = (d) =>
  d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

/* One line of context under each section's title — what this screen covers,
   not a restatement of its name. */
const META = {
  journal: () => longDate(),
  calendar: () => 'events and dated tasks',
  todos: () => 'everything open and everything done',
  nutrition: () => longDate(),
  whoop: () => 'sleep and recovery',
  market: () => 'quotes, metrics and the written read',
}

function View({ route }) {
  switch (route) {
    case 'journal': return <JournalToday />
    case 'calendar': return <Calendar />
    case 'todos': return <Todos />
    case 'nutrition': return <Nutrition />
    case 'whoop': return <Whoop />
    case 'market': return <MarketBriefing />
    default: return <Home />
  }
}

export default function App() {
  const route = useRoute()
  const now = useNow()
  const section = sectionOf(route)

  return (
    <div className="pa-app">
      <header className="pa-topbar">
        <div className="pa-topbar__inner">
          <span className="pa-clock">
            <span className="pa-clock__pip" aria-hidden="true" />
            <span className="pa-clock__date">{stamp(now)}&nbsp;·&nbsp;</span>
            {clock(now)}
          </span>

          <nav className="pa-nav" aria-label="Sections">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className="pa-nav__btn"
                aria-current={route === s.id ? 'page' : undefined}
                onClick={() => go(s.id)}
              >
                <span className="pa-emoji" aria-hidden="true">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="pa-main">
        {route !== 'home' && (
          <div className="pa-page__head">
            <h1 className="pa-page__title">
              <span className="pa-emoji" aria-hidden="true">{section.icon}</span> {section.title}
            </h1>
            <span className="pa-page__meta">{META[route]?.()}</span>
          </div>
        )}
        <View route={route} />
      </main>
    </div>
  )
}
