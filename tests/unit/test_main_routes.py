"""Tests for the routes defined in app.routes.main."""
import io
import unittest

from app import create_app


class MainRoutesTestCase(unittest.TestCase):
    """Exercise the upload, delete and info routes."""

    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

    def test_upload_no_file(self):
        """Upload endpoint should reject requests without a file part."""
        response = self.client.post('/upload', data={}, content_type='multipart/form-data')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json(), {'success': False, 'message': 'No file part'})

    def test_upload_empty_filename(self):
        """Upload endpoint should reject empty filenames."""
        data = {'file': (io.BytesIO(b'test'), '')}
        response = self.client.post('/upload', data=data, content_type='multipart/form-data')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json(), {'success': False, 'message': 'No selected file'})

    def test_upload_invalid_extension(self):
        """Files with disallowed extensions should fail."""
        data = {'file': (io.BytesIO(b'test'), 'bad.exe')}
        response = self.client.post('/upload', data=data, content_type='multipart/form-data')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Invalid file type', response.get_json()['message'])

    def test_upload_valid_file(self):
        """A valid EPUB upload returns success."""
        data = {'file': (io.BytesIO(b'test'), 'book.epub')}
        response = self.client.post('/upload', data=data, content_type='multipart/form-data')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()['success'])

    def test_delete_always_bad_request(self):
        """The delete endpoint always returns HTTP 400."""
        response = self.client.post('/delete/somebook')
        self.assertEqual(response.status_code, 400)

    def test_demo_and_tos_pages(self):
        """Ensure demo and tos pages are reachable."""
        self.assertEqual(self.client.get('/demo').status_code, 200)
        self.assertEqual(self.client.get('/tos').status_code, 200)


if __name__ == '__main__':
    unittest.main()
