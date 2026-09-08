"""OCR requires shared budgets before it can be enabled."""
from flask import Blueprint
from ...utils.clerk_auth import require_auth
from ...utils.access_policy import server_ai_disabled

ocr_bp = Blueprint('ocr', __name__, url_prefix='/api/ocr')

@ocr_bp.route('/process', methods=['POST'])
@require_auth
def process_ocr():
    return server_ai_disabled()

@ocr_bp.route('/layout/page', methods=['POST'])
@require_auth
def process_ocr_page_layout():
    return server_ai_disabled()
