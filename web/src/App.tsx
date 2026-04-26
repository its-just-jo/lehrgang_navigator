import { useState, useMemo } from 'react'
import { PlannerPage } from './pages/PlannerPage'
import { NetworkPage } from './pages/NetworkPage'
import { loadCourses, loadCourseMap } from './data'
import { buildLearningPath } from './path'
import './theme.css'

type Tab = 'planner' | 'network'

const courses    = loadCourses()
const courseMap  = loadCourseMap()

export function App() {
  const [tab,        setTab]        = useState<Tab>('planner')
  const [ownedIds,   setOwnedIds]   = useState<string[]>([])
  const [desiredIds, setDesiredIds] = useState<string[]>([])

  const path = useMemo(() => {
    if (desiredIds.length === 0) return []
    try {
      return buildLearningPath(desiredIds, courseMap, ownedIds)
    } catch {
      return []
    }
  }, [desiredIds, ownedIds])

  const pathIds = useMemo(() => new Set(path.map(c => c.id)), [path])

  return (
    <>
      <nav className="nav">
        <div
          className={`nav-tab${tab === 'planner' ? ' active' : ''}`}
          onClick={() => setTab('planner')}
        >
          🚤 Lehrgangsplanung
        </div>
        <div
          className={`nav-tab${tab === 'network' ? ' active' : ''}`}
          onClick={() => setTab('network')}
        >
          🧭 Netzplan
        </div>
      </nav>

      {tab === 'planner' && (
        <PlannerPage
          courses={courses}
          path={path}
          ownedIds={ownedIds}
          desiredIds={desiredIds}
          onOwnedChange={setOwnedIds}
          onDesiredChange={setDesiredIds}
        />
      )}

      {tab === 'network' && (
        <NetworkPage courses={courseMap} pathIds={pathIds} />
      )}
    </>
  )
}
