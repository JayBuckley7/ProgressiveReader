from flask import Blueprint, current_app, jsonify, request
from pydantic import ValidationError
from ...utils.clerk_auth import require_auth, get_user_id
from ...core.comic_library import ComicChange
from ...core.errors import AppError
from ...infrastructure.comic_library import ComicLibrary

comic_library_bp = Blueprint('comic_library', __name__, url_prefix='/api/comic-library')


@comic_library_bp.route('', methods=['GET'])
@comic_library_bp.route('/operations', methods=['POST'])
@require_auth
def comic_library():
    try:
        owner = get_user_id()
        if request.headers.get('X-Comic-Account') != owner:
            raise AppError('ACCOUNT_CHANGED', 'Your account changed. Reopen the library to sync.', 409)
        service = current_app.extensions.get('comic_library')
        if service is None:
            provider = current_app.extensions['container'].drive_service.integration.provider
            service = ComicLibrary(provider)
            current_app.extensions['comic_library'] = service
        if request.method == 'GET':
            return jsonify(service.read(owner))
        body = request.stream.read(262145)
        if len(body) > 262144:
            raise AppError('RECORD_TOO_LARGE', 'This comic edit is too large.', 413)
        change = ComicChange.model_validate_json(body)
        key = request.headers.get('Idempotency-Key')
        if key and key != change.operationId:
            raise AppError('IDEMPOTENCY_CONFLICT', 'Save identifiers do not match.', 409)
        return jsonify(service.write(owner, change))
    except AppError as exc:
        return jsonify(code=exc.code, error=exc.message), exc.status
    except ValidationError:
        return jsonify(code='COMIC_INVALID', error='The comic edit is invalid.'), 422
    except (ValueError, KeyError):
        return jsonify(code='COMIC_SYNC_UNAVAILABLE', error='Comic changes remain on this device. Drive sync is unconfirmed.'), 503
