from __future__ import annotations

from typing import List, Optional

from ....models import db, Vocabulary as VocabularyModel
from ..ports import VocabularyRepositoryPort
from ..schemas import Vocabulary as VocabularySchema


class SqlAlchemyVocabularyRepository(VocabularyRepositoryPort):
    def add_vocabulary_word(
        self,
        user_id: Optional[str],
        word: str,
        translation: str,
        language: str,
        book_id: Optional[str] = None,
        context: Optional[str] = None,
        difficulty: Optional[str] = None,
    ) -> VocabularySchema:
        """Add a vocabulary word to the user's collection."""
        vocab = VocabularyModel(
            user_id=user_id,
            word=word,
            translation=translation,
            language=language,
            book_id=book_id,
            context=context,
            difficulty=difficulty,
        )
        db.session.add(vocab)
        db.session.commit()
        return VocabularySchema(
            id=str(vocab.id),
            word=vocab.word,
            translation=vocab.translation,
            language=vocab.language,
            bookId=vocab.book_id,
            context=vocab.context,
            difficulty=vocab.difficulty,
            mastered=vocab.mastered,
            createdAt=vocab.created_at.isoformat() if vocab.created_at else None,
        )

    def get_user_vocabulary(
        self,
        user_id: Optional[str],
        language: Optional[str] = None,
        mastered: Optional[bool] = None,
        book_id: Optional[str] = None,
    ) -> List[VocabularySchema]:
        """Get user's vocabulary words with optional filters."""
        query = VocabularyModel.query
        if user_id:
            query = query.filter_by(user_id=user_id)
        if language:
            query = query.filter_by(language=language)
        if mastered is not None:
            query = query.filter_by(mastered=mastered)
        if book_id:
            query = query.filter_by(book_id=book_id)

        vocab_words = query.order_by(VocabularyModel.created_at.desc()).all()
        return [
            VocabularySchema(
                id=str(v.id),
                word=v.word,
                translation=v.translation,
                language=v.language,
                bookId=v.book_id,
                context=v.context,
                difficulty=v.difficulty,
                mastered=v.mastered,
                createdAt=v.created_at.isoformat() if v.created_at else None,
            )
            for v in vocab_words
        ]

    def toggle_mastered(self, user_id: Optional[str], word_id: int, mastered: bool) -> Optional[VocabularySchema]:
        """Toggle mastered status for a vocabulary word."""
        vocab = VocabularyModel.query.filter_by(id=word_id).first()
        if not vocab:
            return None
        if user_id and vocab.user_id != user_id:
            return None  # User doesn't own this word

        vocab.mastered = mastered
        db.session.commit()
        return VocabularySchema(
            id=str(vocab.id),
            word=vocab.word,
            translation=vocab.translation,
            language=vocab.language,
            bookId=vocab.book_id,
            context=vocab.context,
            difficulty=vocab.difficulty,
            mastered=vocab.mastered,
            createdAt=vocab.created_at.isoformat() if vocab.created_at else None,
        )

    def delete_vocabulary_word(self, user_id: Optional[str], word_id: int) -> bool:
        """Delete a vocabulary word."""
        vocab = VocabularyModel.query.filter_by(id=word_id).first()
        if not vocab:
            return False
        if user_id and vocab.user_id != user_id:
            return False  # User doesn't own this word

        db.session.delete(vocab)
        db.session.commit()
        return True


__all__ = ["SqlAlchemyVocabularyRepository"]

