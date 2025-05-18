import unittest
from unittest.mock import patch, MagicMock
from app import create_app

class RedisCheckTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.app.config['OPENAI_API_KEY'] = 'dummy'
        self.client = self.app.test_client()

    @patch('app.routes.api.redis.Redis')
    def test_duplicate_request_denied(self, mock_redis_cls):
        mock_redis = MagicMock()
        mock_redis.exists.return_value = True
        mock_redis_cls.from_url.return_value = mock_redis
        payload = {
            'content': '<p>hello</p>',
            'target_language': 'Spanish',
            'model': 'gpt-test'
        }
        resp = self.client.post('/api/translate', json=payload)
        self.assertEqual(resp.status_code, 429)

    @patch('app.routes.api.OpenAI')
    @patch('app.routes.api.redis.Redis')
    def test_redis_failure_does_not_block(self, mock_redis_cls, mock_openai):
        mock_redis_cls.from_url.side_effect = Exception('redis down')
        mock_openai.return_value.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content='ok'))]
        )
        payload = {
            'content': '<p>hello</p>',
            'target_language': 'Spanish',
            'model': 'gpt-test'
        }
        resp = self.client.post('/api/translate', json=payload)
        self.assertEqual(resp.status_code, 200)
        self.assertIn('translated_text', resp.get_json())

if __name__ == '__main__':
    unittest.main()
