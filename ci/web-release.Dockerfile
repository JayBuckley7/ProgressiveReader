# Generated context pins the verified serving image, retaining its repositories.
FROM node:20 AS frontend-builder
WORKDIR /frontend
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_GDRIVE_CLIENT_ID
ARG VITE_GAPI_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_GDRIVE_CLIENT_ID=$VITE_GDRIVE_CLIENT_ID
ENV VITE_GAPI_KEY=$VITE_GAPI_KEY
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Checked-in generated contracts are verified locally before this scoped build.
RUN npx vite build

FROM VERIFIED_SERVING_IMAGE
WORKDIR /app
COPY overlay/app/ ./app/
RUN python -m compileall -q app/infrastructure/drive_ocr.py app/domains/drive/routes.py \
    && rm -rf /app/app/static
COPY --from=frontend-builder /frontend/dist/ /app/app/static/
COPY release.json /app/web-release.json
