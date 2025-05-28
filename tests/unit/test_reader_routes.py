"""Unit tests for the reader routes."""

import unittest
from app import create_app


class ReaderRoutesTestCase(unittest.TestCase):
    """Verify behaviour of reader and demo reader endpoints."""

    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        self.client.post('/auth/login', json={'id': 'user1'})

    def test_read_route_with_index(self):
        """/read/<book_id>/<int:index> returns HTTP 200."""
        resp = self.client.get('/read/foo/2')
        self.assertEqual(resp.status_code, 200)

    def test_read_route_redirects_without_index(self):
        """/read/<book_id> redirects to index 0."""
        resp = self.client.get('/read/foo')
        self.assertEqual(resp.status_code, 302)
        self.assertIn('/read/foo/0', resp.location)

    def test_demo_read_route_with_index(self):
        """/demo/read/<book_id>/<int:index> returns HTTP 200."""
        resp = self.client.get('/demo/read/foo/1')
        self.assertEqual(resp.status_code, 200)


if __name__ == '__main__':
    unittest.main()
