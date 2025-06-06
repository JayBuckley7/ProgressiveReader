# Multi-stage build for Progressive Reader

# --- Frontend build stage ---
FROM node:20 AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./

# Remove package-lock.json to avoid npm optional dependency bug
RUN rm -f package-lock.json

# Fresh install without cache
RUN npm install

# Explicitly install the rollup package for linux
RUN npm install @rollup/rollup-linux-x64-gnu --save-optional || true

COPY frontend .
RUN npm run build

# --- Backend stage ---
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
# Copy built frontend assets into the Flask static folder
COPY --from=frontend /app/frontend/dist ./backend/app/static

# Default command uses gunicorn for production
CMD ["gunicorn", "-b", "0.0.0.0:8080", "run:app", "--chdir", "backend"]
