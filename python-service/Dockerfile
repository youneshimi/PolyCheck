FROM python:3.12-slim

WORKDIR /app

# Installer curl et les outils de compilation nécessaires pour numpy et sentence-transformers
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Installer setuptools et wheel avant les autres dépendances
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Installer les dépendances
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copier l'application
COPY app.py .
COPY ragService.py .

# Exposer le port
EXPOSE 8000

# Démarrer le service
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
