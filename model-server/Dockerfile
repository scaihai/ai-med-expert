FROM python:3.11-slim

WORKDIR /app

# Install dependencies first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app.py .

EXPOSE 8000

# The model files are mounted as a volume from docker-compose
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
