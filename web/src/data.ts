import type { Course } from './types'
import coursesJson from '../../data/lehrgaenge.json'

const courses = coursesJson as Course[]

export function loadCourses(): Course[] {
  return courses
}

export function loadCourseMap(): Map<string, Course> {
  return new Map(courses.map(c => [c.id, c]))
}
