from unittest.mock import MagicMock
from google.cloud import firestore
import sys
import types

# Use a dummy Firestore client during unit tests to avoid credential lookups
firestore.Client = MagicMock(return_value=MagicMock())
sys.modules.setdefault('redis', MagicMock())

import app.routes.metadata as metadata
if not hasattr(metadata, 'redis'):
    metadata.redis = types.SimpleNamespace(Redis=MagicMock())
