import os
import unittest
import redis
from config import Config

class RedisConnectivityTestCase(unittest.TestCase):
    """Integration test to verify Redis connectivity."""

    def setUp(self):
        redis_url = os.environ.get("REDIS_URL", Config.REDIS_URL)
        self.redis = redis.Redis.from_url(redis_url)
        self.test_key = "test:connectivity"

    def tearDown(self):
        try:
            self.redis.delete(self.test_key)
        except Exception:
            pass

    def test_set_and_delete(self):
        """Verify setting and deleting a key in Redis works."""
        try:
            self.redis.ping()
        except Exception as exc:
            self.fail(f"Could not connect to Redis: {exc}")

        self.redis.set(self.test_key, "1")
        value = self.redis.get(self.test_key)
        self.assertEqual(value.decode("utf-8"), "1")
        self.redis.delete(self.test_key)
        self.assertIsNone(self.redis.get(self.test_key))

if __name__ == "__main__":
    unittest.main()
