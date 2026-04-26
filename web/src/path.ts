import type { Course } from './types'

export class CycleError extends Error {}

const CASCADE_COMPLETION_IDS = new Set(['fachausbildung_wasserrettungsdienst'])

function expandCompleted(
  completedIds: Iterable<string>,
  courseMap: Map<string, Course>,
): Set<string> {
  const expanded = new Set<string>()
  const stack = [...completedIds]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (expanded.has(id)) continue
    expanded.add(id)
    const course = courseMap.get(id)
    if (!course) continue
    if (CASCADE_COMPLETION_IDS.has(id)) stack.push(...course.prerequisites)
  }
  return expanded
}

export function collectRequiredCourses(
  targetIds: Iterable<string>,
  courseMap: Map<string, Course>,
  completedIds: Iterable<string> = [],
): Set<string> {
  const completed = expandCompleted(completedIds, courseMap)
  const required = new Set<string>()

  function dfs(id: string) {
    if (required.has(id) || completed.has(id)) return
    required.add(id)
    const course = courseMap.get(id)
    if (!course) throw new Error(`Unbekannter Lehrgang '${id}'`)
    for (const prereq of course.prerequisites) dfs(prereq)
  }

  for (const id of targetIds) dfs(id)
  return required
}

export function buildLearningPath(
  targetIds: Iterable<string>,
  courseMap: Map<string, Course>,
  completedIds: Iterable<string> = [],
): Course[] {
  const completed = expandCompleted(completedIds, courseMap)
  const requiredIds = collectRequiredCourses(targetIds, courseMap, completed)
  const orderedIds = topologicalSort(requiredIds, courseMap, completed)
  return orderedIds.map(id => courseMap.get(id)!)
}

function topologicalSort(
  requiredIds: Set<string>,
  courseMap: Map<string, Course>,
  completedIds: Set<string>,
): string[] {
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, Set<string>>()

  for (const id of requiredIds) {
    const course = courseMap.get(id)!
    const filteredPrereqs = course.prerequisites.filter(
      p => requiredIds.has(p) && !completedIds.has(p),
    )
    inDegree.set(id, filteredPrereqs.length)
    for (const p of filteredPrereqs) {
      if (!dependents.has(p)) dependents.set(p, new Set())
      dependents.get(p)!.add(id)
    }
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const ordered: string[] = []
  const processed = new Set<string>()

  while (queue.length > 0) {
    const id = queue.shift()!
    if (processed.has(id)) continue
    processed.add(id)
    if (!completedIds.has(id)) ordered.push(id)
    for (const depId of dependents.get(id) ?? []) {
      const deg = inDegree.get(depId)! - 1
      inDegree.set(depId, deg)
      if (deg === 0) queue.push(depId)
    }
  }

  if (processed.size !== requiredIds.size) {
    throw new CycleError('Zyklus in den Voraussetzungen erkannt')
  }
  return ordered
}
