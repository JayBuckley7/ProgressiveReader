"""Read-only checks for a staged web/OCR release (no provider or Drive writes)."""
import argparse
import hashlib
import json
import re
from urllib.parse import urljoin

import requests


def check(base):
    session = requests.Session()
    session.headers['Cache-Control'] = 'no-cache'

    def get(path):
        response = session.get(urljoin(base, path), timeout=(10, 45))
        response.raise_for_status()
        return response

    health = get('/health').json()
    assert health['status'] == 'healthy' and health['clerk_overall_healthy'], health
    drive = get('/drive/health').json()
    html = get('/').text
    script = re.search(r'<script[^>]+src="([^"]+)"', html)
    assert script, 'Missing web entry script'
    entry = get(script[1])
    assert 'javascript' in entry.headers['Content-Type'], entry.headers
    worker = get('/ocr-runtime/worker.min.js')
    assert 'javascript' in worker.headers['Content-Type'] and len(worker.content) > 10000
    wasm = get('/ocr-runtime/tesseract-core-lstm.wasm')
    assert wasm.content.startswith(b'\x00asm'), 'Missing OCR WASM runtime'
    dictionary = get('/ocr-runtime/dict/tid.dat.gz')
    assert dictionary.content.startswith(b'\x1f\x8b'), 'Missing Japanese tokenizer data'
    assert not dictionary.headers.get('Content-Encoding'), 'Dictionary loader must receive compressed bytes'
    path = '/drive/ocr/pages/' + 'a' * 64
    for method, headers in [('GET', {}), ('PUT', {}), ('GET', {'Authorization': 'Bearer invalid-release-check'})]:
        response = session.request(method, urljoin(base, path), headers=headers, timeout=(10, 45))
        assert response.status_code == 401, (method, response.status_code)
        assert response.json()['code'] == 'AUTH_REQUIRED', response.text
    cors = session.options(urljoin(base, path), headers={
        'Origin': 'https://progressivereader.net',
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'authorization,content-type,x-ocr-account',
    }, timeout=(10, 45))
    assert cors.ok
    assert 'PUT' in cors.headers.get('Access-Control-Allow-Methods', '')
    assert 'x-ocr-account' in cors.headers.get('Access-Control-Allow-Headers', '').lower()
    result = {'base': base, 'health': health, 'drive': drive, 'entry': script[1],
              'entrySha256': hashlib.sha256(entry.content).hexdigest(),
              'anonymousAndInvalidOcr': '401', 'ocrRuntime': 'passed', 'cors': 'passed'}
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    print(json.dumps(check(parser.parse_args().url), indent=2))
