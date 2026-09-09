"""Prepare an allowlisted web/OCR image context on a verified serving backend.

Does not activate the pending saved-record migration. The caller must resolve
the serving revision to its source commit and immutable image digest first.
"""
import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OVERLAY = (
    'app/domains/drive/routes.py',
    'app/domains/books/schemas.py',
    'app/utils/clerk_auth.py',
    'app/core/errors.py',
    'app/core/record_operations.py',
    'app/infrastructure/drive_records.py',
    'app/infrastructure/drive_ocr.py',
)


def prepare(destination, base_commit, base_image):
    destination = destination.resolve()
    if not destination.is_relative_to(ROOT / '.tmp') or destination.exists():
        raise ValueError('Use a new directory under .tmp for the release context.')
    if not re.fullmatch(r'[a-z0-9./-]+@sha256:[a-f0-9]{64}', base_image):
        raise ValueError('The serving image must be pinned by digest.')
    base_commit = subprocess.check_output(['git', 'rev-parse', '--verify', base_commit + '^{commit}'], cwd=ROOT, text=True).strip()
    destination.mkdir(parents=True)
    # Explicitly include only frontend source tracked by git or new source files.
    names = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard', 'frontend'], cwd=ROOT).decode().split('\0')
    for name in names:
        if not name:
            continue
        source = ROOT / name
        if source.name.startswith('.env') or not source.is_file():
            continue
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    for name in OVERLAY:
        target = destination / 'overlay' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / 'backend' / name, target)
    # CORS is the only bootstrap change. Preserve the serving backend's health
    # and factory behavior until its separate migration release is verified.
    web = subprocess.check_output(['git', 'show', f'{base_commit}:backend/app/bootstrap/web.py'], cwd=ROOT).decode()
    methods = '"methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"]'
    headers = '"allow_headers": ["Content-Type", "Authorization"]'
    if web.count(methods) != 1 or web.count(headers) != 1:
        raise ValueError('Serving CORS configuration changed; review the overlay before releasing.')
    web = web.replace(methods, '"methods": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]')
    web = web.replace(headers, '"allow_headers": ["Content-Type", "Authorization", "Idempotency-Key", "X-OCR-Account"]')
    target = destination / 'overlay/app/bootstrap/web.py'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(web, encoding='utf-8')
    for source, target in [('ci/web-release.Dockerfile', 'Dockerfile'), ('ci/web-release.cloudbuild.yaml', 'cloudbuild.yaml'), ('ci/01-load-frontend-env.sh', 'ci/01-load-frontend-env.sh')]:
        out = destination / target
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text((ROOT / source).read_text(encoding='utf-8'), encoding='utf-8', newline='\n')
    (destination / 'Dockerfile').write_text((destination / 'Dockerfile').read_text().replace('VERIFIED_SERVING_IMAGE', base_image), encoding='utf-8', newline='\n')
    provenance = {'baseCommit': base_commit, 'baseImage': base_image, 'overlay': list(OVERLAY) + ['app/bootstrap/web.py']}
    (destination / 'release.json').write_text(json.dumps(provenance, indent=2), encoding='utf-8')
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--base-commit', required=True)
    parser.add_argument('--base-image', required=True)
    args = parser.parse_args()
    print(prepare(args.destination, args.base_commit, args.base_image))
