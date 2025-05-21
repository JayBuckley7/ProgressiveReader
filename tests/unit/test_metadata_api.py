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


if __name__ == '__main__':
    unittest.main()
