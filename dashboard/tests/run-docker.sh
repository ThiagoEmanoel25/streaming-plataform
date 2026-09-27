#!/bin/sh
# Fluxo completo contra os containers: navegador -> nginx -> Worker -> SQLite.
# Uso (a partir da raiz do repositório): sh dashboard/tests/run-docker.sh
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
docker compose up -d --build >/dev/null
printf 'esperando a API'
i=0
while ! curl -sf http://localhost:8080/api/health >/dev/null 2>&1; do
  i=$((i+1)); [ "$i" -gt 60 ] && { echo " falhou"; docker compose logs --tail=30; exit 1; }
  printf '.'; sleep 1
done
echo " ok"
WEB=$(docker compose ps -q web)
docker cp dashboard/tests/e2e-live.html "$WEB":/usr/share/nginx/html/e2e-live.html
docker cp dashboard/tests/e2e-live-video.html "$WEB":/usr/share/nginx/html/e2e-live-video.html
echo "== fluxo completo (login -> export -> publicar) =="
node dashboard/tests/cdp.mjs http://localhost:8080/e2e-live.html
echo "== vídeo real enviado pelo usuário =="
node dashboard/tests/cdp.mjs http://localhost:8080/e2e-live-video.html
docker exec "$WEB" rm -f /usr/share/nginx/html/e2e-live.html /usr/share/nginx/html/e2e-live-video.html
