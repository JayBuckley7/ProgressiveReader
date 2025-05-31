import unittest
from unittest.mock import patch, MagicMock
from app import create_app


class SettingsBlueprintTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

    def _login(self):
        resp = self.client.post('/auth/register', json={'email': 'a@test.com', 'password': 'pw'})
        if resp.status_code != 200:
            resp = self.client.post('/auth/login', json={'email': 'a@test.com', 'password': 'pw'})
            self.assertEqual(resp.status_code, 200)
        self.user_id = str(resp.get_json()['id'])

    @patch('app.routes.settings.fs_db')
    def test_unauthenticated(self, mock_fs):
        resp = self.client.get('/settings')
        self.assertEqual(resp.status_code, 401)
        resp = self.client.post('/settings', json={'foo': 'bar'})
        self.assertEqual(resp.status_code, 401)

    @patch('app.routes.settings.fs_db')
    def test_store_and_fetch(self, mock_fs):
        storage = {}

        class FakeDoc:
            def __init__(self, key):
                self.key = key

            def get(self):
                data = storage.get(self.key)
                snap = MagicMock()
                snap.exists = data is not None
                snap.to_dict.return_value = data or {}
                return snap

            def set(self, data, merge=False):
                existing = storage.get(self.key, {})
                if merge:
                    for k, v in data.items():
                        if isinstance(v, dict) and isinstance(existing.get(k), dict):
                            existing[k].update(v)
                        else:
                            existing[k] = v
                    storage[self.key] = existing
                else:
                    storage[self.key] = data

        class FakeCollection:
            def document(self, doc_id):
                return FakeDoc(doc_id)

        mock_fs.collection.return_value = FakeCollection()

        self._login()

        resp = self.client.post('/settings', json={'theme': 'dark'})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.get_json()['success'])

        resp = self.client.get('/settings')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json(), {'theme': 'dark'})

        resp = self.client.post('/settings', json={'font': 'serif'})
        self.assertEqual(resp.status_code, 200)

        resp = self.client.get('/settings')
        self.assertEqual(resp.get_json(), {'theme': 'dark', 'font': 'serif'})


if __name__ == '__main__':
    unittest.main()
