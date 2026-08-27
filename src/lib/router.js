/* A hash router in thirty lines, because this app has seven screens and no
 * need for a routing dependency. The hash keeps deep links and the browser's
 * back button working without any server-side rewrite on Vercel. */

import { useEffect, useState } from 'react'

export const SECTIONS = [
  { id: 'home', label: 'Home', title: 'Today' },
  { id: 'journal', label: 'Journal', title: 'Journal' },
  { id: 'calendar', label: 'Calendar', title: 'Calendar' },
  { id: 'todos', label: 'Tasks', title: 'Tasks' },
  { id: 'nutrition', label: 'Nutrition', title: 'Nutrition' },
  { id: 'whoop', label: 'Recovery', title: 'Recovery' },
  { id: 'market', label: 'Market', title: 'Market' },
]

const IDS = new Set(SECTIONS.map((s) => s.id))

function currentRoute() {
  const raw = window.location.hash.replace(/^#\/?/, '')
  return IDS.has(raw) ? raw : 'home'
}

export function useRoute() {
  const [route, setRoute] = useState(currentRoute)

  useEffect(() => {
    const sync = () => {
      setRoute(currentRoute())
      // A tab switch is a new screen, not a scroll position to preserve
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  return route
}

export function go(id) {
  window.location.hash = `#/${id}`
}

export const sectionOf = (id) => SECTIONS.find((s) => s.id === id) ?? SECTIONS[0]
