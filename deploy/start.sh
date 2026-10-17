#!/usr/bin/env bash
# Runs the API and the web app side by side in the one-container image (Dockerfile at the repo root).
# If either stops, the other is stopped too, so the host sees the container fail and restarts it.
set -euo pipefail

port="${PORT:-10000}"

# The API refuses unsafe requests whose Origin it does not know (the CSRF check), so it must know the public
# address. Render sets RENDER_EXTERNAL_URL; on another host set PUBLIC_URL. ALLOWED_ORIGINS replaces both.
if [ -z "${ALLOWED_ORIGINS:-}" ]; then
  origins="http://localhost:${port},http://127.0.0.1:${port}"
  for url in "${RENDER_EXTERNAL_URL:-}" "${PUBLIC_URL:-}"; do
    if [ -n "$url" ]; then
      origins="${url%/},${origins}"
    fi
  done
  export ALLOWED_ORIGINS="$origins"
fi

cd /app/backend
uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000 \
  --proxy-headers --forwarded-allow-ips 127.0.0.1 &
api=$!

# Start the web server once the API answers, so the first requests are not refused.
for _ in $(seq 1 60); do
  python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=1)" \
    2>/dev/null && break
  kill -0 "$api" 2>/dev/null || exit 1
  sleep 1
done

cd /app/web
PORT="$port" HOSTNAME=0.0.0.0 node server.js &
web=$!

trap 'kill -TERM "$api" "$web" 2>/dev/null || true' TERM INT
status=0
wait -n "$api" "$web" || status=$?
kill -TERM "$api" "$web" 2>/dev/null || true
wait || true
exit "$status"
