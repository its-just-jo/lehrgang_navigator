const ENTRIES: [string, string][] = [
  ['Basisausbildung', '#d40511'],
  ['Aufbaumodul',     '#005b7f'],
  ['Einsatz',         '#d4a600'],
  ['Sanitätswesen',   '#b90036'],
  ['Bootsdienst',     '#005b7f'],
  ['Führung',         '#b35c00'],
  ['Tauchen',         '#00848c'],
  ['Ausbilder',       '#7b3fa3'],
  ['Multiplikator',   '#1f7a1f'],
]

export function Legend() {
  return (
    <div className="legend">
      {ENTRIES.map(([name, color]) => (
        <div key={name} className="legend-item">
          <span className="legend-swatch" style={{ background: color }} />
          {name}
        </div>
      ))}
    </div>
  )
}
