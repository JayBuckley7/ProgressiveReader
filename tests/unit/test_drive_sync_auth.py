import unittest, re, os

class DriveSyncAuthCallbackTest(unittest.TestCase):
    def setUp(self):
        base = os.path.join(os.path.dirname(os.path.dirname(__file__)), '..')
        with open(os.path.join(base, 'app', 'static', 'js', 'driveSync.js'), encoding='utf-8') as f:
            self.drive_sync_js = f.read()
        with open(os.path.join(base, 'app', 'static', 'js', 'index.js'), encoding='utf-8') as f:
            self.index_js = f.read()

    def test_notify_called_in_mark_disconnected(self):
        pattern = r"function _markDisconnected\(\)[\s\S]*?_notifyAuthLost\(\)"
        self.assertRegex(self.drive_sync_js, pattern)

    def test_notify_called_on_401(self):
        pattern = r"res\.status === 401[\s\S]*?_notifyAuthLost\(\)"
        self.assertRegex(self.drive_sync_js, pattern)

    def test_index_listens_for_auth_lost(self):
        self.assertIn('driveSync.onAuthLost', self.index_js)

if __name__ == '__main__':
    unittest.main()
