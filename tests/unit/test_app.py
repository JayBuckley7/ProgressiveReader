import io
import pytest
from app import create_app
from app.utils.helpers import allowed_file

@pytest.fixture
def app_instance():
    app = create_app()
    app.config['TESTING'] = True
    app.config['ALLOWED_EXTENSIONS'] = {'epub', 'txt', 'docx', 'pdf', 'mobi'}
    return app

@pytest.fixture
def client(app_instance):
    return app_instance.test_client()


def test_hello_route(client):
    resp = client.get('/hello')
    assert resp.status_code == 200
    assert resp.data.decode('utf-8') == 'Hello, World from create_app!'


def test_index_route(client):
    resp = client.get('/')
    assert resp.status_code == 200


def test_allowed_file():
    app = create_app()
    app.config['ALLOWED_EXTENSIONS'] = {'epub'}
    with app.app_context():
        assert allowed_file('book.epub')
        assert not allowed_file('notes.txt')


def test_api_translate_missing_fields(client):
    resp = client.post('/api/translate', json={})
    assert resp.status_code == 400


def test_book_upload_missing_file(client):
    resp = client.post('/book/upload', data={})
    assert resp.status_code == 400


def test_book_upload_valid_file(client):
    data = {
        'file': (io.BytesIO(b'data'), 'sample.epub')
    }
    resp = client.post('/book/upload', data=data, content_type='multipart/form-data')
    assert resp.status_code == 200
    assert resp.get_json().get('success') is True


def test_reader_route(client):
    resp = client.get('/read/testbook')
    assert resp.status_code == 200
