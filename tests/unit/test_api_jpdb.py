import unittest
from unittest.mock import patch
from app import create_app


class ApiJpdbTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

    @patch('app.utils.jpdb_due.fetch_all_due_cards')
    def test_due_cards_returns_list(self, mock_fetch):
        mock_fetch.return_value = [{'id': 1}]
        resp = self.client.post('/api/due_cards', json={})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json(), [{'id': 1}])

    @patch('app.utils.jpdb_due.fetch_all_due_cards')
    def test_due_cards_empty_list(self, mock_fetch):
        mock_fetch.return_value = []
        resp = self.client.post('/api/due_cards', json={})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('error', resp.get_json())

    def test_mine_jpdb_word_missing_params(self):
        resp = self.client.post('/api/mine_jpdb_word', json={})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('error', resp.get_json())

        payload = {'jpdb_api_key': 'key'}
        resp = self.client.post('/api/mine_jpdb_word', json=payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('error', resp.get_json())

    def test_mine_jpdb_word_success(self):
        payload = {
            'jpdb_api_key': 'key',
            'vid': 1,
            'sid': 2,
            'forq': False,
            'sentence': 'test',
            'mining_deck_id': 3,
            'forq_deck_id': 4
        }
        resp = self.client.post('/api/mine_jpdb_word', json=payload)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json(), {'success': True})

    def test_update_jpdb_word_state_missing_params(self):
        resp = self.client.post('/api/update_jpdb_word_state', json={})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('error', resp.get_json())

        payload = {
            'jpdb_api_key': 'key',
            'vid': 1,
            'sid': 2,
            'flag': 'blacklist'
        }
        resp = self.client.post('/api/update_jpdb_word_state', json=payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('error', resp.get_json())

    def test_update_jpdb_word_state_success(self):
        payload = {
            'jpdb_api_key': 'key',
            'vid': 1,
            'sid': 2,
            'flag': 'blacklist',
            'state': True
        }
        resp = self.client.post('/api/update_jpdb_word_state', json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data['success'])
        self.assertIn('newState', data)

    def test_review_jpdb_card_missing_params(self):
        resp = self.client.post('/api/review_jpdb_card', json={})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('error', resp.get_json())

        payload = {
            'jpdb_api_key': 'key',
            'vid': 1,
            'sid': 2
        }
        resp = self.client.post('/api/review_jpdb_card', json=payload)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('error', resp.get_json())

    def test_review_jpdb_card_success(self):
        payload = {
            'jpdb_api_key': 'key',
            'vid': 1,
            'sid': 2,
            'rating': 'good'
        }
        resp = self.client.post('/api/review_jpdb_card', json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data['success'])
        self.assertIn('newState', data)


if __name__ == '__main__':
    unittest.main()

