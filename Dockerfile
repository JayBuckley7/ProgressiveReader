FROM node:18 AS build
WORKDIR /app
COPY package*.json ./
COPY frontend/package*.json frontend/
RUN npm ci --omit=dev && npm --prefix frontend ci --omit=dev
COPY . .
RUN npm --prefix frontend run build

FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --from=build /app/app/static/dist app/static/dist
COPY app/ app/
RUN rm -rf app/static/js
COPY templates/ templates/

EXPOSE 8080
CMD ["gunicorn", "-c", "gunicorn_conf.py", "app:app"]
