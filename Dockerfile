# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container at /app
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
# Use --no-cache-dir to reduce image size
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code into the container at /app
# Ensure necessary files like app.py, templates/, JLPT_min.csv are copied
COPY . .

# Make port 8080 available to the world outside this container
# Cloud Run automatically uses this port
EXPOSE 8080

# Define environment variable for the port
ENV PORT 8080

# Run app.py when the container launches using Gunicorn
# Use the number of workers recommended by Gunicorn documentation for Cloud Run
# https://cloud.google.com/run/docs/tips/python#optimize_gunicorn
# Let Cloud Run set the number of threads based on CPU allocation
CMD exec gunicorn --bind :$PORT --workers 1 --timeout 0 app:app 