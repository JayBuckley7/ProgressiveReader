"""Recovery tool. Exports/outputs must be placed in an access-controlled archive.

Examples:
  python migrate_records.py export --database /recovery/app.db --source revision-instance --output export.json
  python migrate_records.py reconcile --exports export.json other.json --output plan.json
  python migrate_records.py import --plan plan.json --output verified-state.json [--apply]

Import defaults to read-only verification. Set CLERK_SECRET_KEY externally; no secrets
are read from the repository or printed. Do not switch traffic based on a dry run.
"""
import argparse
import json
import os
from pathlib import Path
from app.infrastructure.record_migration import export_sqlite, reconcile, import_records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    export = commands.add_parser('export')
    export.add_argument('--database', required=True)
    export.add_argument('--source', required=True)
    merge = commands.add_parser('reconcile')
    merge.add_argument('--exports', nargs='+', required=True)
    load = commands.add_parser('import')
    load.add_argument('--plan', required=True)
    load.add_argument('--apply', action='store_true')
    for command in (export, merge, load):
        command.add_argument('--output', required=True)
    args = parser.parse_args()
    output = Path(args.output)
    if output.exists():
        parser.error('Output already exists; preserve it and choose a new output file.')
    if args.command == 'export':
        result = export_sqlite(args.database, args.source)
    elif args.command == 'reconcile':
        result = reconcile([json.loads(Path(path).read_text(encoding='utf-8')) for path in args.exports])
    else:
        from app.infrastructure.drive_records import DriveOperationStorage
        from app.domains.drive.adapters.clerk import ClerkDriveProvider
        secret = os.environ.get('CLERK_SECRET_KEY')
        if not secret:
            parser.error('CLERK_SECRET_KEY must be supplied by the operator.')
        result = import_records(json.loads(Path(args.plan).read_text(encoding='utf-8')),
            DriveOperationStorage(ClerkDriveProvider(secret)), apply=args.apply)
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
    print('Report written. Review all pending owners and quarantine entries before cutover.')


if __name__ == '__main__':
    main()
