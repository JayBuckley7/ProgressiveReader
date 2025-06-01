import unittest
from pathlib import Path

class ConvexBooksEndpointsTest(unittest.TestCase):
    """Ensure Convex books module exposes delete and updateCover mutations."""

    def test_books_exports(self):
        books_ts = Path(__file__).resolve().parents[2] / "frontend" / "convex" / "books.ts"
        content = books_ts.read_text()
        self.assertIn("export { _deleteBook as delete }", content)
        self.assertIn("export const updateCover", content)

if __name__ == "__main__":
    unittest.main()

