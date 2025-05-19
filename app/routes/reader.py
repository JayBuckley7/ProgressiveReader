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
@reader_bp.route("/read/<book_id>/<int:item_index>", endpoint="read_item_at_index")
@reader_bp.route("/read/<book_id>", defaults={'item_index': None}, endpoint="read_item_no_index")
def reader(book_id: str, item_index: int = None):
    """
    Serve the minimal reader shell; the browser does all EPUB work.
    """
    current_app.logger.debug(
        "Reader view for book %s (URL index: %s, actual start determined by client or this URL index)", book_id, item_index
    )

    # Ensure current_index passed to template is explicitly None if item_index is None
    template_current_index = item_index if item_index is not None else None

    return render_template(
        "reader.html",
        book_id=book_id,
        current_index=template_current_index, # Use the explicitly set None or the integer value
        model_name=current_app.config.get("SERVER_DEFAULT_MODEL", "gpt-4o-mini"),
        show_jlpt_filter=session.get("show_jlpt_filter", False),
        jlpt_enabled=session.get("jlpt_highlighting_enabled", False),
        openai_key_configured=bool(current_app.config.get("OPENAI_API_KEY")),
    )


@reader_bp.route("/demo/read/<book_id>/<int:item_index>", endpoint="read_demo_item_at_index")
@reader_bp.route("/demo/read/<book_id>", defaults={'item_index': None}, endpoint="read_demo_item_no_index")
def reader_demo(book_id: str, item_index: int = None):
    # Ensure current_index passed to template is explicitly None if item_index is None
    template_current_index = item_index if item_index is not None else None

    return render_template(
        "reader.html",
        book_id          = book_id,
        current_index    = template_current_index, # Use the explicitly set None or the integer value
        is_demo          = True,        # -- new flag
        model_name       = "demo",
        show_jlpt_filter = False,
        jlpt_enabled     = False,
        openai_key_configured = False,
    )


