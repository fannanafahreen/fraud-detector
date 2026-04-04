# ── Backend Dockerfile ────────────────────────────────────────────────────────
# Builds the FastAPI + XGBoost fraud detection API into a container.
#
# Build:  docker build -t fraud-backend .
# Run:    docker run -p 8000:8000 --env-file .env fraud-backend

FROM python:3.13-slim

# System dependencies needed to compile some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory inside the container
WORKDIR /app

# Copy and install Python dependencies first (Docker layer cache)
# If requirements.txt hasn't changed, this layer is reused on rebuild
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend source code
COPY . .

# The trained model must exist before building.
# Either run train.py locally first, or mount model.pkl as a volume.
# COPY model.pkl .   ← uncomment if model.pkl is in the same directory

# Expose the API port
EXPOSE 8000

# Start the FastAPI server
# host=0.0.0.0 makes it accessible from outside the container
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
