import { useReducer } from 'react'
import { PageShell } from './design-kit'
import Summary from './components/Summary'
import JournalToday from './components/JournalToday'
import Todos from './components/Todos'
import Calendar from './components/Calendar'

export default function App() {
  // Bumped by any card that writes, so the summary strip stays truthful.
  const [version, bump] = useReducer((n) => n + 1, 0)

  return (
    <PageShell>
      <Summary version={version} />

      <div className="pa-grid">
        <div className="pa-col">
          <JournalToday onChange={bump} />
        </div>
        <div className="pa-col">
          <Calendar onChange={bump} refreshKey={version} />
          <Todos onChange={bump} />
        </div>
      </div>
    </PageShell>
  )
}
