import unittest
from unittest.mock import patch, MagicMock
from app import create_app


class JpdbMiscEndpointsTestCase(unittest.TestCase):
    """Tests for JPDB-related API endpoints."""

    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

    def test_mine_jpdb_word_success(self):
        """A valid request returns success for mining a word."""
        payload = {
            'vid': 1,
            'sid': 2,
            'jpdb_api_key': 'key'
        }
        resp = self.client.post('/api/mine_jpdb_word', json=payload)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.get_json()['success'])

    def test_update_jpdb_word_state_success(self):
        """A valid state update request returns newState."""
        payload = {
            'vid': 1,
            'sid': 2,
            'flag': 'blacklist',
            'state': True,
            'jpdb_api_key': 'key'
        }
        resp = self.client.post('/api/update_jpdb_word_state', json=payload)
        self.assertEqual(resp.status_code, 200)
        self.assertIn('newState', resp.get_json())

    def test_review_jpdb_card_success(self):
        """Reviewing a card with a rating succeeds."""
        payload = {
            'vid': 1,
            'sid': 2,
            'rating': 'good',
            'jpdb_api_key': 'key'
        }
        resp = self.client.post('/api/review_jpdb_card', json=payload)
        self.assertEqual(resp.status_code, 200)
        self.assertIn('newState', resp.get_json())

    @patch('app.routes.api.OpenAI')
    def test_translate_streaming(self, mock_openai):
        """Streaming translation yields SSE events with final completion."""
        self.app.config['OPENAI_API_KEY'] = 'server-key'

        chunk1 = MagicMock(choices=[MagicMock(delta=MagicMock(content='hola '))])
        chunk2 = MagicMock(choices=[MagicMock(delta=MagicMock(content='mundo'))])
        mock_openai.return_value.chat.completions.create.return_value = [
            chunk1,
            chunk2
        ]

        payload = {
            'content': '<p>hello</p>',
            'target_language': 'Spanish',
            'model': 'gpt-test',
            'stream': True
        }
        resp = self.client.post('/api/translate', json=payload)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.mimetype, 'text/event-stream')
        data = b''.join(resp.response).decode('utf-8')
        self.assertIn('"status"', data)
        self.assertIn('"complete"', data)
        self.assertIn('hola mundo', data)


if __name__ == '__main__':
    unittest.main()
