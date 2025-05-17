import unittest
from app import create_app
from app.utils.helpers import allowed_file

class AppFactoryTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

    def test_hello_route(self):
        response = self.client.get('/hello')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.decode('utf-8'), 'Hello, World from create_app!')

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

if __name__ == '__main__':
    unittest.main()
