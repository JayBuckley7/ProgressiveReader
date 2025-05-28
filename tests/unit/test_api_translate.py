import unittest
from unittest.mock import patch, MagicMock
from app import create_app


class ApiTranslateTestCase(unittest.TestCase):
    """Tests for the /api/translate endpoint."""

    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

    @patch('app.routes.api.OpenAI')
    def test_missing_json_body(self, mock_openai):
        """Return 400 if the request body has no JSON."""
        resp = self.client.post('/api/translate', data='', content_type='application/json')
        self.assertEqual(resp.status_code, 400)

    @patch('app.routes.api.OpenAI')
    def test_missing_required_fields(self, mock_openai):
        """Return 400 when content, target_language or model is absent."""
        resp = self.client.post('/api/translate', json={'content': '<p>hi</p>'})
        self.assertEqual(resp.status_code, 400)

    @patch('app.routes.api.OpenAI')
    def test_translate_success_with_user_key(self, mock_openai):
        """Successful translation when API key is provided in payload."""
        self.app.config['OPENAI_API_KEY'] = None
        mock_openai.return_value.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content='```html<p>hola</p>```'))]
        )
        payload = {
            'content': '<p>hello</p>',
            'target_language': 'Spanish',
            'model': 'gpt-test',
            'api_key': 'dummy-key',
            'stream': False
        }
        resp = self.client.post('/api/translate', json=payload)
        self.assertEqual(resp.status_code, 200)
        self.assertIn('translated_text', resp.get_json())

    @patch('app.routes.api.OpenAI')
    def test_no_api_key_configured(self, mock_openai):
        """Return 400 when neither server nor user API key is available."""
        self.app.config['OPENAI_API_KEY'] = None
        payload = {
            'content': '<p>hello</p>',
            'target_language': 'Spanish',
            'model': 'gpt-test'
        }
        resp = self.client.post('/api/translate', json=payload)
        self.assertEqual(resp.status_code, 400)

    def test_toggle_jlpt_toggles_session(self):
        """Session variable should change based on POST payload."""
        with self.client as c:
            resp = c.post('/api/toggle_jlpt', json={'enabled': True})
            self.assertEqual(resp.status_code, 200)
            with c.session_transaction() as sess:
                self.assertTrue(sess.get('jlpt_highlighting_enabled'))

            resp = c.post('/api/toggle_jlpt', json={'enabled': False})
            self.assertEqual(resp.status_code, 200)
            with c.session_transaction() as sess:
                self.assertFalse(sess.get('jlpt_highlighting_enabled'))


if __name__ == '__main__':
    unittest.main()
