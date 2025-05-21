import unittest
from unittest.mock import patch, MagicMock
from app import create_app


class MetadataApiTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

    @patch('app.routes.metadata.redis.Redis')
    def test_store_and_fetch(self, mock_redis_cls):
        storage = {}
        mock_redis = MagicMock()

        def fake_get(key):
            return storage.get(key)

        def fake_set(key, value):
            storage[key] = value

        mock_redis.get.side_effect = fake_get
        mock_redis.set.side_effect = fake_set
        mock_redis_cls.from_url.return_value = mock_redis

        metadata = {'id': 'book1', 'title': 'Test', 'coverDriveId': 'c123'}
        resp = self.client.post('/metadata/user1/book/book1', json=metadata)
        self.assertEqual(resp.status_code, 200)

        resp = self.client.get('/metadata/user1/books')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json(), [metadata])

    @patch('app.routes.metadata.redis.Redis')
    def test_delete_book(self, mock_redis_cls):
        storage = {}
        mock_redis = MagicMock()

        def fake_get(key):
            return storage.get(key)

        def fake_set(key, value):
            storage[key] = value

        def fake_delete(key):
            storage.pop(key, None)

        mock_redis.get.side_effect = fake_get
        mock_redis.set.side_effect = fake_set
        mock_redis.delete.side_effect = fake_delete
        mock_redis_cls.from_url.return_value = mock_redis

        metadata = {'id': 'book1', 'title': 'Test', 'coverDriveId': 'c123'}
        self.client.post('/metadata/user1/book/book1', json=metadata)

        resp = self.client.delete('/metadata/user1/book/book1')
        self.assertEqual(resp.status_code, 200)

        resp = self.client.get('/metadata/user1/books')
        self.assertEqual(resp.get_json(), [])

    @patch('app.routes.metadata.redis.Redis')
    def test_clear_all_entries(self, mock_redis_cls):
        storage = {}
        mock_redis = MagicMock()

        def fake_get(key):
            return storage.get(key)

        def fake_set(key, value):
            storage[key] = value

        def fake_delete(*keys):
            count = 0
            for k in keys:
                if isinstance(k, (list, tuple)):
                    for inner in k:
                        if storage.pop(inner, None) is not None:
                            count += 1
                else:
                    if storage.pop(k, None) is not None:
                        count += 1
            return count

        def fake_keys(pattern):
            prefix = pattern.replace('*', '')
            return [k for k in storage if k.startswith(prefix)]

        mock_redis.get.side_effect = fake_get
        mock_redis.set.side_effect = fake_set
        mock_redis.delete.side_effect = fake_delete
        mock_redis.keys.side_effect = fake_keys
        mock_redis_cls.from_url.return_value = mock_redis

        metadata1 = {'id': 'book1', 'title': 'Test1', 'coverDriveId': 'c1'}
        metadata2 = {'id': 'book2', 'title': 'Test2', 'coverDriveId': 'c2'}
        self.client.post('/metadata/user1/book/book1', json=metadata1)
        self.client.post('/metadata/user1/book/book2', json=metadata2)

        resp = self.client.delete('/metadata/user1/clear_all_entries')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()['deleted_count'], 3)

        resp = self.client.get('/metadata/user1/books')
        self.assertEqual(resp.get_json(), [])


if __name__ == '__main__':
    unittest.main()
