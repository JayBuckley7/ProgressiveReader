from unittest.mock import MagicMock
from google.cloud import firestore
import sys
import types

# Dummy Firestore client for unit tests
firestore.Client = MagicMock(return_value=MagicMock())
sys.modules.setdefault('redis', MagicMock())

import app.routes.metadata as metadata
if not hasattr(metadata, 'redis'):
    metadata.redis = types.SimpleNamespace(Redis=MagicMock())
