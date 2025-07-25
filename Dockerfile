# Stage 1: Build frontend with Vite
FROM node:20 AS frontend-builder
WORKDIR /frontend

# Accept build arguments for environment variables
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_GDRIVE_CLIENT_ID
ARG VITE_GAPI_KEY

# Set environment variables from build args
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_GDRIVE_CLIENT_ID=$VITE_GDRIVE_CLIENT_ID
ENV VITE_GAPI_KEY=$VITE_GAPI_KEY

# Copy package files and install dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy entire frontend directory and build
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Python backend and assemble final image
FROM python:3.11-slim

# Accept build argument for backend Clerk secret
ARG CLERK_SECRET_KEY

# Set environment variable from build arg
ENV CLERK_SECRET_KEY=$CLERK_SECRET_KEY

# Prevent Python from buffering stdout/stderr
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY backend/app ./app
COPY backend/run.py ./
COPY backend/config.py ./
# The backend/instance directory isn't committed or needed; ensure it's present
RUN mkdir -p instance

# Copy built frontend assets into Flask static folder
# Flask static_folder is set to './app/static'
RUN mkdir -p /app/app/static
COPY --from=frontend-builder /frontend/dist/ /app/app/static/

# Expose port and set environment variable
EXPOSE 8080
ENV PORT=8080

# Run the Flask app with Gunicorn with proper timeout configuration
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--timeout", "300", "--worker-class", "sync", "--workers", "1", "--max-requests", "500", "--max-requests-jitter", "50", "--preload", "run:app"] 