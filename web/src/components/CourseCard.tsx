import type { Course } from '../types'

interface Props {
  course: Course
}

export function CourseCard({ course }: Props) {
  return (
    <div className="course-card">
      <div className="course-card-name">{course.name}</div>
      <div className="course-card-meta">
        {course.category} · {course.duration_hours} UE
      </div>
      <div className="course-card-desc">{course.description}</div>
    </div>
  )
}
