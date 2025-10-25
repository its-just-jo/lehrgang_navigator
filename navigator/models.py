from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Course:
    """Dataclass describing a single course in the qualification graph."""

    id: str
    name: str
    description: str
    category: str
    duration_hours: int
    prerequisites: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Return a serialisable representation of the course."""

        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "duration_hours": self.duration_hours,
            "prerequisites": list(self.prerequisites),
        }
