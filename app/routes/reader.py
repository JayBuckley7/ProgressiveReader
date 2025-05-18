"""
reader.py – Flask blueprint that serves the EPUB reader shell.

All EPUB parsing now happens in the browser.  The server only renders the
`reader.html` template so the client-side code (reader.js, epubProcessor.js,
dbService.js …) can load the book from IndexedDB and render chapters.

The endpoint name is set to **read_item** so legacy template calls
`url_for('reader.read_item', …)` continue to work.
"""

from flask import (
    Blueprint,
    render_template,
    session,
    current_app,
    Response,
    redirect,
    url_for,
)

reader_bp = Blueprint("reader", __name__)


# ──────────────────────────────────────────────────────────────────────────
#  Main reader route
# ──────────────────────────────────────────────────────────────────────────
@reader_bp.route(
    "/read/<book_id>/",
    defaults={"page": None},
    endpoint="read_item",  # keep old endpoint name alive
)
@reader_bp.route("/read/<book_id>/<int:page>", endpoint="read_item")
def reader(book_id: str, page: int | None = None):
    """
    Serve the minimal reader shell; the browser does all EPUB work.
    """
    if page is None:
        current_app.logger.debug(
            "No page specified for %s – redirecting to page 0", book_id
        )
        return redirect(url_for("reader.read_item", book_id=book_id, page=0))

    current_app.logger.debug(
        "Reader view for book %s page %s (actual start index determined by client)",
        book_id,
        page,
    )

    return render_template(
        "reader.html",
        book_id=book_id,
        model_name=current_app.config.get("SERVER_DEFAULT_MODEL", "gpt-4o-mini"),
        show_jlpt_filter=session.get("show_jlpt_filter", False),
        jlpt_enabled=session.get("jlpt_highlighting_enabled", False),
        openai_key_configured=bool(current_app.config.get("OPENAI_API_KEY")),
    )


@reader_bp.route("/demo/read/<book_id>", endpoint="read_demo_item")
def reader_demo(book_id: str):
    return render_template(
        "reader.html",
        book_id          = book_id,
        is_demo          = True,        # -- new flag
        model_name       = "demo",
        show_jlpt_filter = False,
        jlpt_enabled     = False,
        openai_key_configured = False,
    )


# ──────────────────────────────────────────────────────────────────────────
#  Legacy /image/ route (should never be called)
# ──────────────────────────────────────────────────────────────────────────
@reader_bp.route("/image/<book_id>/<path:image_href>")
def serve_epub_image(book_id: str, image_href: str):
    """
    Fallback for stray <img src="/image/…"> links.  The modern client
    rewrites every image to a blob: URL, so this route should not be hit.
    It returns a 1×1 transparent GIF to avoid 404s in old cached HTML.
    """
    current_app.logger.info(
        "Mock image request: book=%s image=%s – returning 1×1 GIF",
        book_id,
        image_href,
    )

    transparent_gif = (
        b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff"
        b"\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00"
        b"\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
    )
    return Response(transparent_gif, mimetype="image/gif")
