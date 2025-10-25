from navigator import build_learning_path, collect_required_courses, load_course_map


def test_collect_required_courses_includes_nested_dependencies():
    course_map = load_course_map()
    required = collect_required_courses([
        "einsatzleiter_wasserrettung"
    ], course_map, completed_ids={"rettungsschwimmer_silber"})

    assert "leitung_wachdienst" in required
    assert "bootfuehrer_wasserrettungsdienst" in required
    assert "fachausbildung_wasserrettungsdienst" in required


def test_learning_path_is_topologically_sorted():
    course_map = load_course_map()
    path = build_learning_path(
        ["einsatzleiter_wasserrettung"],
        course_map,
        completed_ids={"rettungsschwimmer_silber"},
    )

    acquired = {"rettungsschwimmer_silber"}
    for course in path:
        assert all(prereq in acquired for prereq in course.prerequisites)
        acquired.add(course.id)


def test_learning_path_skips_completed_courses():
    course_map = load_course_map()
    path = build_learning_path(
        ["rettungstaucher_2"],
        course_map,
        completed_ids={"rettungsschwimmer_silber", "sanitaetsausbildung_a", "fachausbildung_wasserrettungsdienst", "rettungstaucher_1"},
    )

    ids = [course.id for course in path]
    assert "rettungstaucher_1" not in ids
    assert ids[-1] == "rettungstaucher_2"
