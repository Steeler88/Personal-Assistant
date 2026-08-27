import { PageShell } from './design-kit'
import JournalToday from './components/JournalToday'
import Todos from './components/Todos'
import Calendar from './components/Calendar'

export default function App() {
  return (
    <PageShell>
      <JournalToday />
      <Todos />
      <Calendar />
    </PageShell>
  )
}
