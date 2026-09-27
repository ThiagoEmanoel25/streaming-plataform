#!/usr/bin/env bash
# Sobe a imagem do render, manda duas receitas (9:16 e 4:5) com zoom + keyframes
# + overlay de texto, e confere com ffprobe que saiu um mp4 de verdade.
#   ./render/test.sh
set -euo pipefail
cd "$(dirname "$0")"

PORT=${PORT:-9099}
IMG=homecreators-render:test
CID=""
cleanup() { [ -n "$CID" ] && docker rm -f "$CID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { echo "FALHOU: $*" >&2; exit 1; }
eq() { [ "$2" = "$3" ] || fail "$1: esperado '$3', veio '$2'"; }

echo "==> unit (build_command, sem docker)"
python3 test_build_command.py -v || fail "unit build_command"

echo "==> build"
docker build -q -t "$IMG" . >/dev/null

echo "==> up"
CID=$(docker run -d -p "$PORT:9000" -e "RENDER_PUBLIC_URL=http://localhost:$PORT" "$IMG")
for _ in $(seq 1 30); do curl -sf "http://localhost:$PORT/health" >/dev/null && break; sleep 1; done
curl -sf "http://localhost:$PORT/health" >/dev/null || fail "servidor não subiu"

# sink de webhook dentro do container: grava cada corpo recebido em /app/hooks.log
docker exec -i "$CID" sh -c 'cat > /app/sink.py' <<'PY'
from http.server import BaseHTTPRequestHandler, HTTPServer
class H(BaseHTTPRequestHandler):
    def do_POST(self):
        b = self.rfile.read(int(self.headers.get('content-length') or 0))
        open('/app/hooks.log', 'ab').write(b + b'\n')
        self.send_response(200); self.send_header('content-length', '0'); self.end_headers()
    def log_message(self, *a): pass
HTTPServer(('127.0.0.1', 9999), H).serve_forever()
PY
docker exec -d "$CID" python3 /app/sink.py
sleep 1

probe() { docker exec "$CID" ffprobe -v error "$@" -of csv=p=0 "/app/out/$KEY"; }

run_case() { # $1 export_id  $2 key  $3 ratio  $4 duracao  $5 largura  $6 altura
  local exp=$1 ratio=$3 dur=$4
  KEY=$2
  echo "==> $ratio ($dur s)"
  local body
  body=$(cat <<JSON
{"input":{"export_id":"$exp","source_key":"s1","duration":$dur,
  "output":{"bucket":"homecreators-exports","key":"$KEY"},
  "recipe":{"ratio":"$ratio","zoom":1.2,"x":3,"y":-6,
    "bright":10,"contrast":12,"sat":8,"temp":-20,
    "trackId":"t1",
    "overlays":[{"kind":"text","text":"QUE GOLAÇO 100% 🔥","x":-14,"y":38,"size":26,"opacity":1}],
    "keyframes":[{"t":0,"zoom":1,"x":0,"y":0},{"t":0.6,"zoom":1.4,"x":-4,"y":-8}]}},
 "webhook":"http://127.0.0.1:9999/hook"}
JSON
)
  local id
  id=$(curl -sf -X POST "http://localhost:$PORT/run" -H 'content-type: application/json' -d "$body") \
    || fail "POST /run falhou"
  echo "$id" | grep -q '"id"' || fail "POST /run não devolveu id: $id"

  local hook=""
  for _ in $(seq 1 120); do
    hook=$(docker exec "$CID" sh -c "grep -h '\"$exp\"' /app/hooks.log 2>/dev/null | grep -m1 -e COMPLETED -e FAILED" || true)
    [ -n "$hook" ] && break
    sleep 1
  done
  [ -n "$hook" ] || fail "$ratio: webhook final nunca chegou"
  echo "$hook" | grep -q COMPLETED || fail "$ratio: render falhou -> $hook"
  echo "$hook" | grep -q "http://localhost:$PORT/files/$KEY" || fail "$ratio: url errada -> $hook"

  docker exec "$CID" test -s "/app/out/$KEY" || fail "$ratio: mp4 ausente ou vazio"
  eq "$ratio largura"  "$(probe -select_streams v:0 -show_entries stream=width)"      "$5"
  eq "$ratio altura"   "$(probe -select_streams v:0 -show_entries stream=height)"     "$6"
  eq "$ratio codec v"  "$(probe -select_streams v:0 -show_entries stream=codec_name)" h264
  eq "$ratio codec a"  "$(probe -select_streams a:0 -show_entries stream=codec_name)" aac
  local d
  d=$(probe -show_entries format=duration)
  awk -v d="$d" -v w="$dur" 'BEGIN{ if (d<w-0.3 || d>w+0.3) exit 1 }' \
    || fail "$ratio: duração $d s, esperado ~$dur s"

  curl -sf "http://localhost:$PORT/files/$KEY" -o /dev/null || fail "$ratio: GET /files não serviu o mp4"
  # texto com "%" ja sumiu em silencio uma vez (drawtext sem expansion=none)
  ! docker logs "$CID" 2>&1 | grep -q 'Stray %' || fail "$ratio: drawtext descartou o texto"
  echo "    ok: ${5}x${6} h264+aac, ${d}s, servido em /files/$KEY"
}

run_case exp_916 user/exp_916.mp4 "9:16" 4 1080 1920
run_case exp_45  user/exp_45.mp4  "4:5"  3 1080 1350

echo "PASSOU"
