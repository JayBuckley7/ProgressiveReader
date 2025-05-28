from google.cloud import firestore

# Shared Firestore client for the application
# In production, ADC credentials are used automatically.
db = firestore.Client()

