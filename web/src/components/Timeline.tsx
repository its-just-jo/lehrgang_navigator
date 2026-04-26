import type { Course } from '../types'

interface Props {
  path: Course[]
}

export function Timeline({ path }: Props) {
  return (
    <div className="timeline">
      {path.map(course => (
        <div key={course.id} className="timeline-step">
          <h4>{course.name}</h4>
          <p>{course.description || 'Keine Beschreibung verfügbar.'}</p>
        </div>
      ))}
    </div>
  )
}
