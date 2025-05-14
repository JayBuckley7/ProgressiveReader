# Stage 1: Build frontend assets
FROM node:18 AS frontend_builder
WORKDIR /frontend

# Copy package files and install npm dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy frontend source, TypeScript config, and Webpack config
COPY src/ ./src/
COPY tsconfig.json .
COPY webpack.config.js .

# Run the production build script
RUN npm run build

# Stage 2: Python application
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Copy Python requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the built frontend assets from the builder stage
# This copies the contents of /frontend/app/static/js/dist to /app/app/static/js/dist
COPY --from=frontend_builder /frontend/app/static/js/dist /app/app/static/js/dist

# Copy the application structure
# Note: Adjust these paths if your project structure is different
# We assume your Flask app's Python code is within an 'app' directory at the project root,
# and templates are in a 'templates' directory also at the project root.
COPY app/ /app/app/
COPY templates/ /app/templates/

# Copy other necessary root files (e.g., app.py for Gunicorn, run.py, config.py, CSV data)
COPY app.py . 
COPY run.py . 
COPY config.py . 
COPY JLPT_min.csv . 
# Add any other specific files or directories needed at the root of /app in the container

# Ensure PWA files like manifest.json and service-worker.js are correctly placed.
# If they are already in app/static/ (e.g., app/static/manifest.json, app/static/js/service-worker.js)
# the `COPY app/ /app/app/` command should handle them by copying app/static into /app/app/static.
# Your Flask app serves from 'app/static', so this structure is important.

# Make port 8080 available
EXPOSE 8080

# Define environment variable for the port
ENV PORT 8080

# Run app.py when the container launches using Gunicorn
CMD exec gunicorn --bind :$PORT --workers 1 --timeout 0 "app:create_app()" 