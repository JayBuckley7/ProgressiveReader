import gzip
import pytest

from flask import Flask

from app.bootstrap.web import register_spa_routes


@pytest.mark.parametrize('static_url_path', [None, ''])
def test_dictionary_is_not_http_decoded_before_kuromoji_decompresses_it(tmp_path, static_url_path):
    dictionary = tmp_path / 'ocr-runtime' / 'dict' / 'tid.dat.gz'
    dictionary.parent.mkdir(parents=True)
    compressed = gzip.compress(b'synthetic dictionary')
    dictionary.write_bytes(compressed)
    app = Flask(__name__, static_folder=str(tmp_path), static_url_path=static_url_path)
    register_spa_routes(app)
    response = app.test_client().get('/ocr-runtime/dict/tid.dat.gz')
    assert response.status_code == 200
    assert response.content_type == 'application/gzip'
    assert 'Content-Encoding' not in response.headers
    assert response.data == compressed
