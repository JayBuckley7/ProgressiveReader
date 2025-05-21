import unittest, os, re

class MetadataSanitizationTest(unittest.TestCase):
    """Ensure coverImageBlob is removed before metadata POSTs."""

    def setUp(self):
        base = os.path.join(os.path.dirname(os.path.dirname(__file__)), '..')
        with open(os.path.join(base, 'app', 'static', 'js', 'uploadHandler.js'), encoding='utf-8') as f:
            self.upload_js = f.read()
        with open(os.path.join(base, 'app', 'static', 'js', 'driveSync.js'), encoding='utf-8') as f:
            self.drive_js = f.read()
        with open(os.path.join(base, 'app', 'static', 'js', 'metadataSync.js'), encoding='utf-8') as f:
            self.meta_js = f.read()

    def test_upload_handler_sanitizes_metadata(self):
        pattern = r"coverImageBlob\s*,\s*\.\.\.\s*metaWithoutCover"
        self.assertRegex(self.upload_js, pattern)

    def test_drive_sync_sanitizes_book_upload(self):
        pattern = r"getBookMetadata\(bookId\)[^\n]*\n[^\n]*coverImageBlob\s*,\s*\.\.\.\s*metaWithoutCover"
        self.assertRegex(self.drive_js, pattern)

    def test_drive_sync_sanitizes_cover_upload(self):
        pattern = r"getBookMetadata\(bookId\)[^\n]*\n[^\n]*coverImageBlob\s*,\s*\.\.\.\s*metaWithoutCover"
        matches = re.findall(pattern, self.drive_js)
        self.assertGreaterEqual(len(matches), 2)

    def test_metadata_sync_ignores_cover_blob(self):
        pattern = r"\{\s*id\s*,\s*title\s*,\s*coverImageBlob\s*,\s*\.\.\.\s*rest\s*\}\s*=\s*book"
        self.assertRegex(self.meta_js, pattern)

if __name__ == '__main__':
    unittest.main()
