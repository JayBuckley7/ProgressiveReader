"""Helper module that provides a Firestore client instance."""

from google.cloud import firestore

# Firestore client used across the application

db = firestore.Client()
