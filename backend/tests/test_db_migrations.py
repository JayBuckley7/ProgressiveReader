from __future__ import annotations

from sqlalchemy import create_engine, inspect, text

from app.bootstrap.db import migrate_bookmark_locator


def test_bookmark_locator_migration_is_idempotent_and_preserves_existing_rows(tmp_path):
    database_path = tmp_path / "legacy.db"
    engine = create_engine(f"sqlite:///{database_path}")

    try:
        with engine.begin() as connection:
            connection.execute(text(
                """
                CREATE TABLE bookmark (
                    id INTEGER PRIMARY KEY,
                    user_id VARCHAR(255),
                    book_id VARCHAR(255) NOT NULL,
                    chapter_index INTEGER NOT NULL,
                    position INTEGER NOT NULL,
                    note VARCHAR(255),
                    created_at DATETIME
                )
                """
            ))
            connection.execute(text(
                """
                INSERT INTO bookmark (id, user_id, book_id, chapter_index, position, note)
                VALUES (1, 'legacy-user', 'legacy-book', 4, 125, 'keep me')
                """
            ))

        migrate_bookmark_locator(engine)
        migrate_bookmark_locator(engine)

        columns = {column["name"]: column for column in inspect(engine).get_columns("bookmark")}
        assert "locator_json" in columns
        assert columns["locator_json"]["nullable"] is True

        with engine.connect() as connection:
            row = connection.execute(text(
                """
                SELECT id, user_id, book_id, chapter_index, position, note, locator_json
                FROM bookmark
                """
            )).mappings().one()
        assert dict(row) == {
            "id": 1,
            "user_id": "legacy-user",
            "book_id": "legacy-book",
            "chapter_index": 4,
            "position": 125,
            "note": "keep me",
            "locator_json": None,
        }
    finally:
        engine.dispose()
