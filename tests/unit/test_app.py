import unittest
from app import create_app
from app.utils.helpers import allowed_file

class AppFactoryTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True

        @self.app.route('/test-hello')
        def test_hello():
            """Dummy route used only for this unit test."""
            return 'Hello, Test!'

        self.client = self.app.test_client()

    def test_dummy_route(self):
        response = self.client.get('/test-hello')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.decode('utf-8'), 'Hello, Test!')

    def test_index_route(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)

class AllowedFileTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.app.config['ALLOWED_EXTENSIONS'] = {'epub'}
        self.ctx = self.app.app_context()
        self.ctx.push()

    def tearDown(self):
        self.ctx.pop()

    def test_allowed_file_true(self):
        self.assertTrue(allowed_file('book.epub'))

    def test_allowed_file_false(self):
        self.assertFalse(allowed_file('notes.txt'))


class ReaderRouteTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

    def test_read_route_redirects_without_index(self):
        response = self.client.get('/read/testbook')
        self.assertEqual(response.status_code, 302)
        self.assertIn('/read/testbook/0', response.location)

if __name__ == '__main__':
    unittest.main()
