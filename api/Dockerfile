FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_SYSTEM_PYTHON=1

WORKDIR /app

# deps de sistema mínimas
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl build-essential \
    && rm -rf /var/lib/apt/lists/*

# instalar uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
 && echo 'export PATH="/root/.local/bin:$PATH"' >> /etc/profile \
 && ln -s /root/.local/bin/uv /usr/local/bin/uv

COPY requirements.txt .

# instalar con uv en el Python del sistema (equivalente a pip --system)
RUN uv pip install --no-cache-dir --system -r requirements.txt

COPY app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
