from __future__ import annotations

from app.domains.books.adapters.local_demo_storage import LocalDemoStorageProvider
from app.domains.books.ports import BooksRepositoryPort, CoverLookupPort
from app.domains.books.schemas import Bookmark
from app.domains.books.service import BooksService


class _NoopRepo(BooksRepositoryPort):
    def get_bookmarks(self, book_id: str, user_id=None):
        return []

    def add_bookmark(self, book_id: str, chapter_index: int, position: int, note=None, user_id=None) -> Bookmark:
        raise AssertionError("not used in this test")


class _NullCoverLookup(CoverLookupPort):
    def lookup_cover_bytes(self, title: str):
        return None


def test_local_demo_storage_provider_lists_epubs(tmp_path):
    (tmp_path / 'static').mkdir()
    demo_dir = tmp_path / 'static' / 'demo_books'
    demo_dir.mkdir()
    (demo_dir / 'alpha.epub').write_text('dummy')
    (demo_dir / 'beta.epub').write_text('dummy')
    (demo_dir / 'ignore.txt').write_text('nope')

    provider = LocalDemoStorageProvider(demo_dir)
    service = BooksService(_NoopRepo(), provider, _NullCoverLookup())
    books = service.list_books()

    assert len(books) == 2
    titles = sorted(book.title for book in books)
    assert titles == ['Alpha', 'Beta']
    assert all(book.fileType == 'epub' for book in books)




