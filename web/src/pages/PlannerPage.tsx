import type { Course } from '../types'
import { Hero } from '../components/Hero'
import { CourseSelector } from '../components/CourseSelector'
import { Timeline } from '../components/Timeline'
import { CourseCard } from '../components/CourseCard'

interface Props {
  courses: Course[]
  path: Course[]
  ownedIds: string[]
  desiredIds: string[]
  onOwnedChange:   (ids: string[]) => void
  onDesiredChange: (ids: string[]) => void
}

export function PlannerPage({ courses, path, ownedIds, desiredIds, onOwnedChange, onDesiredChange }: Props) {
  const totalHours = path.reduce((sum, c) => sum + c.duration_hours, 0)

  return (
    <div className="page">
      <Hero />

      <div className="selection-grid">
        <CourseSelector
          courses={courses}
          label="Aktuelle Qualifikationen"
          placeholder="Welche Lehrgänge hast du bereits abgeschlossen?"
          value={ownedIds}
          onChange={onOwnedChange}
        />
        <CourseSelector
          courses={courses}
          label="Zielqualifikationen"
          placeholder="Welche Qualifikationen möchtest du erreichen?"
          value={desiredIds}
          onChange={onDesiredChange}
        />
      </div>

      {desiredIds.length === 0 && (
        <div className="warning">
          Bitte wähle mindestens eine Zielqualifikation aus, um den Pfad zu berechnen.
        </div>
      )}

      {desiredIds.length > 0 && path.length === 0 && (
        <div className="info-box">
          ✅ Alle ausgewählten Ziele sind bereits abgedeckt – Glückwunsch!
        </div>
      )}

      {path.length > 0 && (
        <>
          <h2 className="section-title">Empfohlene Reihenfolge</h2>
          <Timeline path={path} />

          <div className="metric">
            <div className="metric-label">Gesamtumfang</div>
            <div className="metric-value">{totalHours} UE</div>
          </div>

          <h2 className="section-title">Details zu allen beteiligten Lehrgängen</h2>
          {path.map(course => (
            <CourseCard key={course.id} course={course} />
          ))}
        </>
      )}

      <div className="footer">
        Alle Angaben basieren auf der{' '}
        <a
          href="https://www.dlrg.de/fileadmin/user_upload/DLRG.de/Fuer-Mitglieder/Einsatz/Pruefungsordnungen/11401204_PO_WRD_2018_internet.pdf"
          target="_blank"
          rel="noreferrer"
        >
          Prüfungsordnung Wasserrettungsdienst 2018
        </a>
        . Eine individuelle Beratung durch deine Gliederung bleibt dennoch empfehlenswert.
      </div>
    </div>
  )
}
