from ..ports import VocabularyRepositoryPort
from ..schemas import Vocabulary
from ....core.errors import AppError


class DriveVocabularyRepository(VocabularyRepositoryPort):
    def __init__(self, records):
        self.records = records

    def add_vocabulary_word(self, user_id, word, translation, language, book_id=None, context=None, difficulty=None):
        data = self.records.write(user_id, 'vocabulary', 'create', {
            'word': word, 'translation': translation, 'language': language,
            'bookId': book_id, 'context': context, 'difficulty': difficulty, 'mastered': False,
        })
        return Vocabulary(**data)

    def get_user_vocabulary(self, user_id, language=None, mastered=None, book_id=None):
        result = []
        for data in self.records.read(user_id, 'vocabulary').values():
            try:
                word = Vocabulary(**data)
            except ValueError as exc:
                raise AppError('RECORDS_CORRUPT', 'A saved vocabulary record needs recovery.') from exc
            if language and word.language != language or mastered is not None and word.mastered != mastered or book_id and word.bookId != book_id:
                continue
            result.append(word)
        return sorted(result, key=lambda word: (word.createdAt or '', word.id), reverse=True)

    def toggle_mastered(self, user_id, word_id, mastered):
        data = self.records.write(user_id, 'vocabulary', 'mastered', {'mastered': mastered}, word_id)
        return Vocabulary(**data) if data else None

    def delete_vocabulary_word(self, user_id, word_id):
        return self.records.write(user_id, 'vocabulary', 'delete', {}, word_id) is not None
