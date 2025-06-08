# Multi-stage build for Progressive Reader

# --- Frontend build stage ---
FROM node:20 AS frontend
WORKDIR /app/frontend

# Declare ARGs for Vite environment variables
ARG VITE_GDRIVE_CLIENT_ID
ARG VITE_GAPI_KEY
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_CONVEX_URL
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_BACKEND_URL=""

COPY frontend/package*.json ./

# Remove package-lock.json to avoid npm optional dependency bug
RUN rm -f package-lock.json

# Fresh install without cache
RUN npm install

# Explicitly install the rollup package for linux
RUN npm install @rollup/rollup-linux-x64-gnu --save-optional || true

COPY frontend .

# Create .env file from build arguments
RUN echo "VITE_GDRIVE_CLIENT_ID=${VITE_GDRIVE_CLIENT_ID}" >> .env.production
RUN echo "VITE_GAPI_KEY=${VITE_GAPI_KEY}" >> .env.production
RUN echo "VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}" >> .env.production
RUN echo "VITE_CONVEX_URL=${VITE_CONVEX_URL}" >> .env.production
RUN echo "VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}" >> .env.production
RUN echo "VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}" >> .env.production
RUN echo "VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}" >> .env.production
RUN echo "VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET}" >> .env.production
RUN echo "VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID}" >> .env.production
RUN echo "VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}" >> .env.production
RUN echo "VITE_BACKEND_URL=${VITE_BACKEND_URL}" >> .env.production

RUN npm run build

# --- Backend stage ---
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=frontend /app/frontend/dist ./backend/app/static
COPY backend ./backend

# Default command uses gunicorn for production
CMD ["gunicorn", "-b", "0.0.0.0:8080", "run:app", "--chdir", "backend"]
