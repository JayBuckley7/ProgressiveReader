from ..ports import BooksRepositoryPort
from ..schemas import Bookmark
from ....core.errors import AppError


class DriveBooksRepository(BooksRepositoryPort):
    def __init__(self, records):
        self.records = records

    def get_bookmarks(self, book_id, user_id=None):
        result = []
        for data in self.records.read(user_id, 'bookmark').values():
            try:
                bookmark = Bookmark(**data)
            except ValueError as exc:
                raise AppError('RECORDS_CORRUPT', 'A saved bookmark needs recovery.') from exc
            if bookmark.bookId == book_id:
                result.append(bookmark)
        return sorted(result, key=lambda b: (b.createdAt or '', int(b.id)))

    def add_bookmark(self, book_id, chapter_index, position, note=None, user_id=None, locator=None):
        data = self.records.write(user_id, 'bookmark', 'create', {
            'bookId': book_id, 'chapterIndex': chapter_index, 'position': position, 'note': note,
            **({'locator': locator.model_dump(mode='json')} if locator is not None else {}),
        })
        return Bookmark(**data)
