import unittest
from unittest.mock import patch, MagicMock
from app import create_app
import types


class MetadataApiTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        self.client.post('/auth/register', json={'email': 'm@test.com', 'password': 'pw'})

    @patch('app.routes.metadata.firestore.ArrayUnion')
    @patch('app.routes.metadata.fs_db')
    def test_store_and_fetch(self, mock_fs, mock_au):
        storage = {}

        mock_au.side_effect = lambda vals: types.SimpleNamespace(values=vals)

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
                for k, v in data.items():
                    if hasattr(v, 'values') and isinstance(existing.get(k), list):
                        existing[k].extend(list(v.values))
                    elif hasattr(v, 'values'):
                        existing[k] = list(v.values)
                    elif isinstance(v, list) and isinstance(existing.get(k), list):
                        existing[k].extend(v)
                    else:
                        existing[k] = v
                storage[self.key] = existing

        class FakeCollection:
            def document(self, doc_id):
                return FakeDoc(doc_id)

        mock_fs.collection.return_value = FakeCollection()

        metadata = {'id': 'book1', 'title': 'Test', 'coverDriveId': 'c123'}
        with self.client as c:
            c.post('/auth/login', json={'email': 'm@test.com', 'password': 'pw'})
            resp = c.post('/metadata/books', json=metadata)
            self.assertEqual(resp.status_code, 200)

            resp = c.get('/metadata/books')
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.get_json(), [metadata])

    @patch('app.routes.metadata.firestore.ArrayUnion')
    @patch('app.routes.metadata.fs_db')
    def test_store_book_invalid_json(self, mock_fs, mock_au):
        mock_fs.collection.return_value = MagicMock()
        mock_au.side_effect = lambda vals: types.SimpleNamespace(values=vals)
        with self.client as c:
            c.post('/auth/login', json={'email': 'm@test.com', 'password': 'pw'})
            resp = c.post('/metadata/books', json=['bad'])
            self.assertEqual(resp.status_code, 400)
