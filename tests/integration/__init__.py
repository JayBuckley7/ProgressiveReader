from unittest.mock import MagicMock
import sys
sys.modules.setdefault('redis', MagicMock())
