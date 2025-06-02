"""Provides the shared Firestore client used by the application."""

from google.cloud import firestore

# In production, ADC credentials are used automatically.
db = firestore.Client()

