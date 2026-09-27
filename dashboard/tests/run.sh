#!/bin/sh
# Uso: cd dashboard && sh tests/run.sh   (precisa de Google Chrome; sobe um servidor local na 8765)
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
python3 -m http.server 8765 >/dev/null 2>&1 & SRV=$!; sleep 1
echo "== editor (tempo virtual) =="
"$CHROME" --headless=new --disable-gpu --virtual-time-budget=120000 --dump-dom http://localhost:8765/tests/e2e-editor.html 2>/dev/null | sed -n '/<pre id="result">/,/<\/pre>/p' | grep -E "PASS|FAIL|EXC|ERRS"
echo "== estratégias (tempo virtual) =="
"$CHROME" --headless=new --disable-gpu --virtual-time-budget=60000 --dump-dom http://localhost:8765/tests/e2e-strategies.html 2>/dev/null | sed -n '/<pre id="result">/,/<\/pre>/p' | grep -E "PASS|FAIL|EXC|ERRS"
echo "== publicação (tempo real via CDP) =="
node tests/cdp.mjs /tests/e2e-publish.html
echo "== vídeo real (tempo real via CDP) =="
node tests/cdp.mjs /tests/e2e-video.html
kill $SRV
