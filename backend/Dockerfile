# Aegis Wealth AI API (Section 2.10.1). Python 3.12, FastAPI, SQLite in a volume.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATABASE_URL=sqlite:////app/var/aegis.db

WORKDIR /app
COPY requirements.txt requirements-dev.txt ./
# Test tools are included so the documented command works: docker compose run --rm api pytest -q
RUN pip install -r requirements.txt -r requirements-dev.txt

COPY . .
RUN useradd --create-home --uid 10001 aegis && mkdir -p /app/var && chown -R aegis /app/var
USER aegis

EXPOSE 8000
HEALTHCHECK --interval=5s --timeout=3s --retries=20 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
