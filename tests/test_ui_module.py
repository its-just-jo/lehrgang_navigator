from __future__ import annotations

import importlib
import sys
import types

import pytest


def test_ui_constants_available_without_streamlit(monkeypatch):
    """The UI helpers should be importable even if Streamlit is missing."""

    monkeypatch.delitem(sys.modules, "navigator.ui", raising=False)
    monkeypatch.setitem(sys.modules, "streamlit", None)

    module = importlib.import_module("navigator.ui")

    assert module.MID_BLUE == "#005b7f"
    assert module.PRIMARY_RED == "#d40511"


def test_inject_custom_css_requires_streamlit(monkeypatch):
    """Calling inject_custom_css without Streamlit should raise a helpful error."""

    module = importlib.import_module("navigator.ui")

    def _raise():
        raise RuntimeError("Streamlit fehlt")

    monkeypatch.setattr(module, "_load_streamlit", _raise)

    with pytest.raises(RuntimeError, match="Streamlit"):
        module.inject_custom_css()


def test_render_helpers_use_streamlit(monkeypatch):
    """The rendering helpers should call the Streamlit markdown function."""

    module = importlib.import_module("navigator.ui")

    calls: list[tuple[tuple, dict]] = []

    fake_streamlit = types.SimpleNamespace(
        markdown=lambda *args, **kwargs: calls.append((args, kwargs))
    )

    monkeypatch.setattr(module, "_load_streamlit", lambda: fake_streamlit)

    module.inject_custom_css()
    module.render_timeline([])
    module.render_course_overview([])

    assert calls, "Expected Streamlit markdown to be invoked"
