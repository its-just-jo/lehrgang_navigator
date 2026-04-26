import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'
import type { Core, NodeSingular } from 'cytoscape'
import cytoscapeDagre from 'cytoscape-dagre'
import type { Course } from '../types'

cytoscape.use(cytoscapeDagre as cytoscape.Ext)

const CATEGORY_COLORS: Record<string, [string, string]> = {
  Basisausbildung: ['#fff1f2', '#d40511'],
  Aufbaumodul:     ['#e8f0ff', '#005b7f'],
  Einsatz:         ['#fff9ce', '#d4a600'],
  Sanitätswesen:   ['#ffe6ea', '#b90036'],
  Bootsdienst:     ['#e6f5ff', '#005b7f'],
  Führung:         ['#fff1db', '#b35c00'],
  Tauchen:         ['#e2f7f8', '#00848c'],
  Ausbilder:       ['#f4e9ff', '#7b3fa3'],
  Multiplikator:   ['#e9f8ea', '#1f7a1f'],
}

const CLS = 'dim hl-selected hl-prereq hl-dependent hl-edge-prereq hl-edge-dependent'

interface Props {
  courses: Map<string, Course>
  pathIds: Set<string>
}

export function NetworkGraph({ courses, pathIds }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef   = useRef<HTMLDivElement>(null)
  const cyRef        = useRef<Core | null>(null)

  // Build and mount the Cytoscape instance once per catalogue
  useEffect(() => {
    if (!containerRef.current) return

    const elements: cytoscape.ElementDefinition[] = []

    for (const course of courses.values()) {
      const [bg, border] = CATEGORY_COLORS[course.category] ?? ['#ffffff', '#d40511']
      elements.push({
        data: {
          id:          course.id,
          label:       course.name,
          category:    course.category,
          duration:    course.duration_hours,
          description: course.description || '',
          bg,
          border,
          inPath: pathIds.has(course.id),
        },
      })
    }

    for (const course of courses.values()) {
      for (const prereq of course.prerequisites) {
        if (courses.has(prereq)) {
          elements.push({
            data: { id: `${prereq}__${course.id}`, source: prereq, target: course.id },
          })
        }
      }
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: ([
        {
          selector: 'node',
          style: {
            'background-color': 'data(bg)',
            'border-color':     'data(border)',
            'border-width': 2,
            label:              'data(label)',
            'text-wrap':        'wrap',
            'text-max-width':   '130px',
            'font-size':        '11px',
            'font-family':      '"Helvetica Neue", Helvetica, Arial, sans-serif',
            color:              '#002b45',
            'text-valign':      'center',
            'text-halign':      'center',
            padding:            '12px',
            shape:              'roundrectangle',
            width:              'label',
            height:             'label',
            'transition-property': 'background-color, border-color, border-width, opacity',
            'transition-duration': '200ms',
          },
        },
        {
          selector: 'node[?inPath]',
          style: {
            'border-width':     4,
            'border-color':     '#ffed00',
            'background-color': '#fffde7',
          },
        },
        {
          selector: 'edge',
          style: {
            width:                1.5,
            'line-color':         '#b0bec5',
            'target-arrow-color': '#b0bec5',
            'target-arrow-shape': 'triangle',
            'curve-style':        'bezier',
            'arrow-scale':        0.75,
            'transition-property': 'line-color, target-arrow-color, width, opacity',
            'transition-duration': '200ms',
          },
        },
        { selector: '.dim',          style: { opacity: 0.12 } },
        { selector: '.hl-selected',  style: { 'background-color': '#fff9ce', 'border-color': '#d4a600', 'border-width': 4, opacity: 1 } },
        { selector: '.hl-prereq',    style: { 'background-color': '#e6ffe9', 'border-color': '#1f7a1f', 'border-width': 3, opacity: 1 } },
        { selector: '.hl-dependent', style: { 'background-color': '#e3f2fd', 'border-color': '#005b7f', 'border-width': 3, opacity: 1 } },
        { selector: '.hl-edge-prereq',    style: { 'line-color': '#1f7a1f', 'target-arrow-color': '#1f7a1f', width: 2.5, opacity: 1 } },
        { selector: '.hl-edge-dependent', style: { 'line-color': '#005b7f', 'target-arrow-color': '#005b7f', width: 2.5, opacity: 1 } },
      ] as cytoscape.StylesheetStyle[]),
      layout: {
        name: 'dagre',
        // @ts-expect-error cytoscape-dagre extends LayoutOptions
        rankDir: 'TB',
        padding: 50,
        spacingFactor: 1.3,
        nodeSep: 50,
        rankSep: 90,
        animate: true,
        animationDuration: 700,
      },
      minZoom: 0.2,
      maxZoom: 3,
    })

    // ── Tooltip ──────────────────────────────────────────────────────────
    const tooltip = tooltipRef.current!
    const ttName  = tooltip.querySelector<HTMLElement>('#tt-name')!
    const ttMeta  = tooltip.querySelector<HTMLElement>('#tt-meta')!
    const ttDesc  = tooltip.querySelector<HTMLElement>('#tt-desc')!

    cy.on('mouseover', 'node', e => {
      const d = (e.target as NodeSingular).data()
      ttName.textContent = d.label
      ttMeta.textContent = `${d.category as string} · ${d.duration as number} UE`
      ttDesc.textContent = (d.description as string) || 'Keine Beschreibung.'
      tooltip.style.display = 'block'
    })

    cy.on('mousemove', e => {
      if (tooltip.style.display !== 'block') return
      const { clientX: mx, clientY: my } = e.originalEvent as MouseEvent
      const tw = tooltip.offsetWidth, th = tooltip.offsetHeight, pad = 16
      tooltip.style.left = (mx + pad + tw > window.innerWidth  ? mx - tw - pad : mx + pad) + 'px'
      tooltip.style.top  = (my + pad + th > window.innerHeight ? my - th - pad : my + pad) + 'px'
    })

    cy.on('mouseout', 'node', () => { tooltip.style.display = 'none' })

    // ── Click highlight ───────────────────────────────────────────────────
    function reset() { cy.elements().removeClass(CLS) }

    cy.on('tap', 'node', e => {
      const node = e.target as NodeSingular
      reset()
      const pre  = node.predecessors()
      const post = node.successors()
      cy.elements().addClass('dim')
      pre.nodes().removeClass('dim').addClass('hl-prereq')
      post.nodes().removeClass('dim').addClass('hl-dependent')
      pre.edges().removeClass('dim').addClass('hl-edge-prereq')
      post.edges().removeClass('dim').addClass('hl-edge-dependent')
      node.removeClass('dim').addClass('hl-selected')
    })

    cy.on('tap', e => { if (e.target === cy) reset() })

    cyRef.current = cy
    return () => { cy.destroy(); cyRef.current = null }
  }, [courses]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update path highlights without rebuilding the graph
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.nodes().forEach(node => {
      node.data('inPath', pathIds.has(node.id()))
    })
  }, [pathIds])

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '720px', borderRadius: '16px', overflow: 'hidden', background: '#f2f4f7' }}
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{
          position: 'fixed', background: '#fff', borderRadius: '12px',
          padding: '12px 16px', boxShadow: '0 8px 32px rgba(0,0,0,.15)',
          border: '1px solid rgba(0,43,69,.12)', maxWidth: '300px',
          pointerEvents: 'none', display: 'none', zIndex: 9999,
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        }}
      >
        <h4 id="tt-name" style={{ color: '#d40511', marginBottom: '3px', fontSize: '0.88rem' }} />
        <div id="tt-meta" style={{ color: '#777', fontSize: '0.74rem', marginBottom: '5px' }} />
        <p id="tt-desc" style={{ color: '#002b45', fontSize: '0.78rem', lineHeight: 1.45 }} />
      </div>

      {/* Hint */}
      <div style={{
        position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,43,69,.72)', color: '#fff', padding: '5px 14px',
        borderRadius: '999px', fontSize: '0.71rem', pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>
        Klick auf Knoten = Abhängigkeiten hervorheben &nbsp;·&nbsp; Klick auf Hintergrund = zurücksetzen
      </div>
    </div>
  )
}
