from __future__ import annotations

import ast
from pathlib import Path


def _domains_dir() -> Path:
    backend_dir = Path(__file__).resolve().parents[1]
    domains_dir = backend_dir / "app" / "domains"
    assert domains_dir.exists(), f"Missing domains dir: {domains_dir}"
    return domains_dir


def _iter_domain_py_files():
    yield from _domains_dir().rglob("*.py")


def _iter_imports(path: Path) -> list[tuple[str, int]]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    try:
        tree = ast.parse(text, filename=str(path))
    except SyntaxError:
        return []

    imports: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append((alias.name, node.lineno))
        elif isinstance(node, ast.ImportFrom):
            if node.module is None:
                continue
            prefix = "." * node.level if node.level else ""
            imports.append((prefix + node.module, node.lineno))
    return imports


def _is_routes_py(path: Path) -> bool:
    return path.name == "routes.py"


def _is_adapter_path(path: Path) -> bool:
    return "adapters" in path.parts


def _domain_name_for_path(path: Path) -> str | None:
    parts = list(path.parts)
    if "domains" not in parts:
        return None
    idx = parts.index("domains")
    if idx + 1 >= len(parts):
        return None
    return parts[idx + 1]


def test_domains_only_routes_import_flask() -> None:
    """Enforce a basic hex boundary: Flask stays in routes (web adapter) only."""
    offenders: list[str] = []
    for path in _iter_domain_py_files():
        for mod, lineno in _iter_imports(path):
            if mod == "flask" or mod.startswith("flask."):
                if not _is_routes_py(path):
                    offenders.append(f"{path}:{lineno} imports {mod}")

    assert not offenders, "Flask imports must live only in routes.py:\n" + "\n".join(offenders)


def test_domains_only_adapters_import_openai_sdk() -> None:
    """Keep vendor SDK usage in adapters."""
    offenders: list[str] = []
    for path in _iter_domain_py_files():
        for mod, lineno in _iter_imports(path):
            if mod == "openai" or mod.startswith("openai."):
                if not _is_adapter_path(path):
                    offenders.append(f"{path}:{lineno} imports {mod}")

    assert not offenders, "OpenAI SDK imports must live only under adapters/:\n" + "\n".join(offenders)


def test_domains_only_adapters_import_requests() -> None:
    """Keep generic HTTP client usage in outbound adapters."""
    offenders: list[str] = []
    for path in _iter_domain_py_files():
        for mod, lineno in _iter_imports(path):
            if mod == "requests" or mod.startswith("requests."):
                if not _is_adapter_path(path):
                    offenders.append(f"{path}:{lineno} imports {mod}")

    assert not offenders, "requests imports must live only under adapters/:\n" + "\n".join(offenders)


def test_domains_only_adapters_import_sqlalchemy_and_models() -> None:
    """Keep DB + ORM details in adapters."""
    offenders: list[str] = []
    for path in _iter_domain_py_files():
        for mod, lineno in _iter_imports(path):
            is_sqlalchemy = mod == "sqlalchemy" or mod.startswith("sqlalchemy.")
            is_flask_sqlalchemy = mod == "flask_sqlalchemy" or mod.startswith("flask_sqlalchemy.")
            is_app_models = (
                mod == "app.models"
                or mod.startswith("app.models.")
                or mod == "models"
                or (mod.startswith(".") and mod.endswith("models"))
            )

            if is_sqlalchemy or is_flask_sqlalchemy or is_app_models:
                if not _is_adapter_path(path):
                    offenders.append(f"{path}:{lineno} imports {mod}")

    assert not offenders, (
        "SQLAlchemy + app.models imports must live only under adapters/:\n" + "\n".join(offenders)
    )


def test_domains_only_adapters_import_ocr_vendors() -> None:
    """Keep OCR vendor SDKs in adapters."""
    offenders: list[str] = []
    for path in _iter_domain_py_files():
        for mod, lineno in _iter_imports(path):
            is_google_cloud = mod == "google.cloud" or mod.startswith("google.cloud.")
            is_google_oauth2 = mod == "google.oauth2" or mod.startswith("google.oauth2.")
            is_fitz = mod == "fitz" or mod.startswith("fitz.")
            if is_google_cloud or is_google_oauth2 or is_fitz:
                if not _is_adapter_path(path):
                    offenders.append(f"{path}:{lineno} imports {mod}")

    assert not offenders, (
        "google-cloud-vision/google-oauth/PyMuPDF imports must live only under adapters/:\n"
        + "\n".join(offenders)
    )


def test_domain_routes_do_not_import_outbound_adapters() -> None:
    """Routes are inbound adapters; they should call services, not other adapters."""
    offenders: list[str] = []
    for path in _iter_domain_py_files():
        if not _is_routes_py(path):
            continue
        for mod, lineno in _iter_imports(path):
            parts = [p for p in mod.split(".") if p]
            if "adapters" in parts:
                offenders.append(f"{path}:{lineno} imports {mod}")

    assert not offenders, "routes.py must not import from adapters/:\n" + "\n".join(offenders)


def test_domain_core_does_not_import_adapters() -> None:
    """Core domain modules (services/schemas/ports/etc) must not import adapters."""
    offenders: list[str] = []
    for path in _iter_domain_py_files():
        if _is_routes_py(path) or _is_adapter_path(path):
            continue
        for mod, lineno in _iter_imports(path):
            parts = [p for p in mod.split(".") if p]
            if "adapters" in parts:
                offenders.append(f"{path}:{lineno} imports {mod}")

    assert not offenders, (
        "Domain core must not import adapters/ (use ports + container wiring):\n" + "\n".join(offenders)
    )


def test_domains_do_not_import_other_domains_directly() -> None:
    """Prevent domain-to-domain coupling (prefer ports injected via the container).

    Allow importing from:
    - the same domain (relative imports)
    - app.core (shared kernel)
    """
    offenders: list[str] = []
    for path in _iter_domain_py_files():
        domain = _domain_name_for_path(path)
        if not domain:
            continue

        for mod, lineno in _iter_imports(path):
            mod_no_dots = mod.lstrip(".")

            # Absolute: app.domains.<other>
            if mod_no_dots.startswith("app.domains."):
                parts = mod_no_dots.split(".")
                if len(parts) >= 3:
                    other = parts[2]
                    if other != domain:
                        offenders.append(f"{path}:{lineno} imports {mod} (domain={domain})")

            # Relative from within app package: ...domains.<other>
            if mod_no_dots.startswith("domains."):
                parts = mod_no_dots.split(".")
                if len(parts) >= 2:
                    other = parts[1]
                    if other != domain:
                        offenders.append(f"{path}:{lineno} imports {mod} (domain={domain})")

    assert not offenders, (
        "Domain modules must not import other domains directly (use ports + container wiring):\n"
        + "\n".join(offenders)
    )
