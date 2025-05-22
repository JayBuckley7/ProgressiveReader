import unittest
from app import create_app


class DueCardsAuthTestCase(unittest.TestCase):
    """Tests for the due_cards endpoint authentication."""

    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

    def test_missing_auth_returns_401(self):
        resp = self.client.post('/api/due_cards', json={})
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.get_json()['error'], 'Authentication required')


if __name__ == '__main__':
    unittest.main()
