from __future__ import annotations

from pathlib import Path

from app.domains.books.integrations import LocalDemoStorageProvider
from app.domains.books.repository import BooksRepository
from app.domains.books.service import BooksService


def test_local_demo_storage_provider_lists_epubs(tmp_path):
    (tmp_path / 'static').mkdir()
    demo_dir = tmp_path / 'static' / 'demo_books'
    demo_dir.mkdir()
    (demo_dir / 'alpha.epub').write_text('dummy')
    (demo_dir / 'beta.epub').write_text('dummy')
    (demo_dir / 'ignore.txt').write_text('nope')

    provider = LocalDemoStorageProvider(demo_dir)
    service = BooksService(BooksRepository(), provider)
    books = service.list_books()

    assert len(books) == 2
    titles = sorted(book.title for book in books)
    assert titles == ['Alpha', 'Beta']
    assert all(book.fileType == 'epub' for book in books)



