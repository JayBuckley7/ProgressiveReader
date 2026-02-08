from __future__ import annotations

from pathlib import Path
from typing import List

from ..ports import StorageProviderPort
from ..schemas import Book


class LocalDemoStorageProvider(StorageProviderPort):
    def __init__(self, root_dir: Path | None) -> None:
        # Handle None gracefully - Path(None) fails, so use a clearly non-existent path.
        if root_dir is None:
            self._root_dir = Path("/nonexistent/demo/books")
        else:
            self._root_dir = Path(root_dir)

    def list_books(self) -> List[Book]:
        if not self._root_dir.exists():
            return []
        books: List[Book] = []
        for file in sorted(self._root_dir.glob("*.epub")):
            title = file.stem.replace("_", " ").title()
            books.append(
                Book(
                    id=file.stem,
                    title=title,
                    fileType="epub",
                    filename=file.name,
                    source="demo",
                    path=str(file),
                )
            )
        return books


__all__ = ["LocalDemoStorageProvider"]

