# Aegis Wealth AI in one container, for the hosted live demo (render.yaml).
# Next.js serves the pages on $PORT and forwards /api/* to FastAPI on 127.0.0.1:8000, which nothing outside the
# container can reach. For local work, compose.yaml runs the two apart.
#   docker build -t aegis . && docker run --rm -p 10000:10000 aegis   ->  http://localhost:10000

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS web-deps
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS web-build
WORKDIR /web
COPY --from=web-deps /web/node_modules ./node_modules
COPY frontend/ ./
# Both are read at build time: the real API rather than the in-browser mock, reached inside the container.
ENV NEXT_PUBLIC_API_MOCK=0 \
    API_BASE_URL=http://127.0.0.1:8000 \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM ${NODE_IMAGE} AS node

FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATABASE_URL=sqlite:////app/var/aegis.db \
    TRUST_PROXY_HEADERS=1 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=10000
COPY --from=node /usr/local/bin/node /usr/local/bin/node

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt
COPY backend/ backend/
COPY --from=web-build /web/.next/standalone web/
COPY --from=web-build /web/.next/static web/.next/static
COPY --from=web-build /web/public web/public
COPY deploy/start.sh start.sh

# The database lives in /app/var and is created and seeded on each start: the demo resets when the container does.
RUN useradd --create-home --uid 10001 aegis && mkdir -p /app/var && chown -R aegis /app/var
USER aegis

EXPOSE 10000
HEALTHCHECK --interval=10s --timeout=3s --retries=12 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f\"http://127.0.0.1:{os.environ['PORT']}/api/health\")"
CMD ["/app/start.sh"]
