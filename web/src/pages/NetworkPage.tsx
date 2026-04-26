import type { Course } from '../types'
import { NetworkGraph } from '../components/NetworkGraph'
import { Legend } from '../components/Legend'

interface Props {
  courses: Map<string, Course>
  pathIds: Set<string>
}

export function NetworkPage({ courses, pathIds }: Props) {
  return (
    <div className="page">
      <h1 style={{ color: '#002b45', marginBottom: '0.5rem' }}>Lehrgangsnetzplan</h1>
      <p style={{ color: '#555', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
        Alle Qualifikationen und ihre Voraussetzungen auf einen Blick.
        Klick auf einen Knoten hebt den Voraussetzungs- und Folgelehrgangs-Pfad hervor.
      </p>

      {pathIds.size > 0 && (
        <div className="info-box">
          🗺️ {pathIds.size} Kurse aus deinem geplanten Pfad sind hervorgehoben.
        </div>
      )}

      <NetworkGraph courses={courses} pathIds={pathIds} />
      <Legend />

      <div className="footer" style={{ marginTop: '1.5rem' }}>
        Quelle:{' '}
        <a
          href="https://www.dlrg.de/fileadmin/user_upload/DLRG.de/Fuer-Mitglieder/Einsatz/Pruefungsordnungen/11401204_PO_WRD_2018_internet.pdf"
          target="_blank"
          rel="noreferrer"
        >
          Prüfungsordnung Wasserrettungsdienst 2018
        </a>
      </div>
    </div>
  )
}
