from __future__ import annotations

from io import BytesIO
from unittest.mock import Mock

import pytest
from flask import Flask

from app.domains.ocr.layout_schemas import OcrPageLayoutResponse
from app.domains.ocr.routes import ocr_bp


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.extensions["container"] = Mock()
    app.register_blueprint(ocr_bp)
    return app


@pytest.fixture
def client(app):
    return app.test_client()


def test_ocr_layout_route_success(client):
    service = Mock()
    service.extract_or_get_cached.return_value = OcrPageLayoutResponse(
        cacheHit=False,
        contentHash="abc123",
        ocrProfile="ja-pdf-overlay-v1",
        pageIndex=0,
        image={"width": 100, "height": 200},
        lines=[],
        atoms=[],
    )
    container = Mock()
    container.ocr_layout_service = service
    container.ocr_init_error = None
    client.application.extensions["container"] = container

    response = client.post(
        "/api/ocr/layout/page",
        data={
            "page_index": "0",
            "ocr_profile": "ja-pdf-overlay-v1",
            "image": (BytesIO(b"fakepng"), "page-1.png"),
        },
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "ready"
    assert data["contentHash"] == "abc123"


def test_ocr_layout_route_requires_image(client):
    container = Mock()
    container.ocr_layout_service = Mock()
    container.ocr_init_error = None
    client.application.extensions["container"] = container

    response = client.post(
        "/api/ocr/layout/page",
        data={"page_index": "0"},
        content_type="multipart/form-data",
    )

    assert response.status_code == 400
