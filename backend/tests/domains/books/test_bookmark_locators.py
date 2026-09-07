from __future__ import annotations

import json
from unittest.mock import Mock

import pytest
from flask import Flask
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.domains.books.adapters.sqlalchemy_repository import SqlAlchemyBooksRepository
from app.domains.books.routes import books_bp
from app.domains.books.schemas import Bookmark, ReaderLocator
from app.infrastructure.sqlalchemy.models import Bookmark as BookmarkModel


def _reflow_locator() -> ReaderLocator:
    return ReaderLocator(
        version=2,
        kind="reflow",
        chapterIndex=3,
        segmentId="chapter-3:segment-8",
        textOffset=14,
        quote="stable quote",
        progression=0.42,
    )


def test_reader_locator_requires_kind_specific_fields():
    assert ReaderLocator(version=2, kind="pdf", pageNumber=7).pageNumber == 7

    with pytest.raises(ValidationError, match="segmentId"):
        ReaderLocator(
            version=2,
            kind="reflow",
            chapterIndex=3,
            textOffset=14,
            progression=0.42,
        )

    with pytest.raises(ValidationError, match="pageNumber"):
        ReaderLocator(version=2, kind="pdf")


def test_bookmark_route_accepts_and_returns_locator():
    app = Flask(__name__)
    app.config["TESTING"] = True
    container = Mock()
    locator = _reflow_locator()
    container.books_service.add_bookmark.return_value = Bookmark(
        id=10,
        bookId="book-1",
        chapterIndex=3,
        position=120,
        note="resume here",
        createdAt="2026-09-06T12:00:00",
        locator=locator,
    )
    app.extensions["container"] = container
    app.register_blueprint(books_bp)

    response = app.test_client().post("/api/bookmarks", json={
        "bookId": "book-1",
        "chapterIndex": 3,
        "position": 120,
        "note": "resume here",
        "locator": locator.model_dump(mode="json"),
    })

    assert response.status_code == 201
    assert response.get_json()["locator"] == locator.model_dump(mode="json")
    container.books_service.add_bookmark.assert_called_once_with(
        book_id="book-1",
        chapter_index=3,
        position=120,
        note="resume here",
        user_id="test-user",
        locator=locator,
    )


def test_bookmark_route_rejects_incomplete_locator():
    app = Flask(__name__)
    app.config["TESTING"] = True
    container = Mock()
    app.extensions["container"] = container
    app.register_blueprint(books_bp)

    response = app.test_client().post("/api/bookmarks", json={
        "bookId": "book-1",
        "chapterIndex": 3,
        "position": 120,
        "locator": {"version": 2, "kind": "pdf"},
    })

    assert response.status_code == 400
    container.books_service.add_bookmark.assert_not_called()


def test_sqlalchemy_repository_round_trips_locator_and_reads_legacy_rows():
    engine = create_engine("sqlite:///:memory:")
    BookmarkModel.__table__.create(engine)

    try:
        with Session(engine) as session:
            repository = SqlAlchemyBooksRepository(session)
            locator = _reflow_locator()
            saved = repository.add_bookmark(
                book_id="book-1",
                chapter_index=3,
                position=120,
                note="resume here",
                user_id="user-1",
                locator=locator,
            )

            assert saved.locator == locator
            persisted = session.get(BookmarkModel, saved.id)
            assert json.loads(persisted.locator_json) == locator.model_dump(mode="json")

            session.add(BookmarkModel(
                user_id="user-1",
                book_id="book-1",
                chapter_index=1,
                position=20,
                locator_json=None,
            ))
            session.add(BookmarkModel(
                user_id="user-1",
                book_id="book-1",
                chapter_index=2,
                position=40,
                locator_json="not-json",
            ))
            session.commit()

            bookmarks = repository.get_bookmarks("book-1", "user-1")
            locators_by_chapter = {bookmark.chapterIndex: bookmark.locator for bookmark in bookmarks}
            assert locators_by_chapter == {1: None, 2: None, 3: locator}
    finally:
        engine.dispose()
