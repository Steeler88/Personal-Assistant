import { PageShell } from './design-kit'
import JournalToday from './components/JournalToday'
import Todos from './components/Todos'

export default function App() {
  return (
    <PageShell>
      <JournalToday />
      <Todos />
    </PageShell>
  )
}
