import unittest
from unittest.mock import patch
from app import create_app

class GetJpdbDataInputValidationTestCase(unittest.TestCase):
    """Test input validation logic for the /api/get_jpdb_data endpoint."""

    def setUp(self):
        """Create test client and mock external requests."""
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        patcher = patch('app.routes.api.requests.post')
        self.mock_post = patcher.start()
        self.addCleanup(patcher.stop)

    def test_no_json_payload(self):
        """Request without JSON should return 400."""
        resp = self.client.post(
            '/api/get_jpdb_data', data='', content_type='application/json'
        )
        self.assertEqual(resp.status_code, 400)

    def test_text_segments_not_list(self):
        """Non-list text_segments should trigger a 400 response."""
        payload = {'text_segments': 'notalist', 'jpdb_api_key': 'key'}
        resp = self.client.post('/api/get_jpdb_data', json=payload)
        self.assertEqual(resp.status_code, 400)

    def test_non_string_items_in_text_segments(self):
        """Lists with non-string items should return 400."""
        payload = {'text_segments': ['ok', 1], 'jpdb_api_key': 'key'}
        resp = self.client.post('/api/get_jpdb_data', json=payload)
        self.assertEqual(resp.status_code, 400)

    def test_missing_jpdb_api_key(self):
        """Omitting jpdb_api_key should return 400."""
        payload = {'text_segments': ['test']}
        resp = self.client.post('/api/get_jpdb_data', json=payload)
        self.assertEqual(resp.status_code, 400)

    def test_whitespace_segments_return_empty_list(self):
        """Whitespace-only segments should yield an empty list and no API call."""
        payload = {'text_segments': ['   ', '\n\t'], 'jpdb_api_key': 'key'}
        resp = self.client.post('/api/get_jpdb_data', json=payload)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json(), [])
        self.mock_post.assert_not_called()

if __name__ == '__main__':
    unittest.main()
