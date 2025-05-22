import unittest
from unittest.mock import patch
import requests

from app.utils import jpdb_due


class SetCookiesTestCase(unittest.TestCase):
    """Tests for the set_cookies helper."""

    def test_set_cookies_success(self):
        """Cookies are parsed and attached to the session."""
        session = requests.Session()
        cookie_string = "a=1; b=2; c=3"
        result = jpdb_due.set_cookies(session, cookie_string)
        self.assertTrue(result)
        self.assertEqual(session.cookies.get("a"), "1")
        self.assertEqual(session.cookies.get("b"), "2")
        self.assertEqual(session.cookies.get("c"), "3")

    def test_set_cookies_exception_returns_false(self):
        """Exceptions during cookie parsing result in False."""
        session = requests.Session()
        with patch.object(session.cookies, "set", side_effect=Exception("boom")):
            result = jpdb_due.set_cookies(session, "a=1")
        self.assertFalse(result)


class AuthenticateSessionTestCase(unittest.TestCase):
    """Tests for the authenticate_session helper."""

    def test_authenticate_calls_set_cookies(self):
        """set_cookies is invoked when cookie_string is provided."""
        session = requests.Session()
        with patch("app.utils.jpdb_due.set_cookies", return_value=True) as mock_set:
            result = jpdb_due.authenticate_session(session, cookie_string="a=1")
            mock_set.assert_called_once_with(session, "a=1")
        self.assertTrue(result)

    def test_authenticate_no_credentials(self):
        """Function returns False when no credentials are supplied."""
        session = requests.Session()
        result = jpdb_due.authenticate_session(session)
        self.assertFalse(result)


class FetchAllDueCardsTestCase(unittest.TestCase):
    """Tests for fetch_all_due_cards."""

    def test_returns_empty_list_on_auth_failure(self):
        """When authentication fails, an empty list is returned."""
        with patch("app.utils.jpdb_due.authenticate_session", return_value=False):
            result = jpdb_due.fetch_all_due_cards(cookie_string="a=1")
        self.assertEqual(result, [])


if __name__ == "__main__":
    unittest.main()
