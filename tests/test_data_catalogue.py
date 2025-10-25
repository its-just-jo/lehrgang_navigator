from navigator import load_courses


def test_course_catalogue_not_empty():
    courses = load_courses()
    assert len(courses) > 0


def test_courses_have_unique_ids():
    courses = load_courses()
    ids = [course.id for course in courses]
    assert len(ids) == len(set(ids))


def test_prerequisites_exist_in_catalogue():
    courses = load_courses()
    id_set = {course.id for course in courses}
    for course in courses:
        for prereq in course.prerequisites:
            assert prereq in id_set
