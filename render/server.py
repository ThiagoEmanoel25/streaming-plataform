"""Servidor HTTP do worker de render (so stdlib).

  POST /run          corpo = { input: {...}, webhook: "http://..." }  -> 202 {"id"}
  GET  /files/<key>  o mp4 pronto (substitui o S3 ate a Tarefa 2)
  GET  /health       ok

O render roda numa thread; a resposta do /run nao espera o ffmpeg. Quando
termina, o worker chama o webhook com o mesmo formato que o RunPod manda e que
backend/src/index.js ja consome.
"""
import json, os, posixpath, threading, traceback, urllib.request, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import render as renderer

OUT_DIR = os.environ.get('OUT_DIR', '/app/out')
PUBLIC_URL = os.environ.get('RENDER_PUBLIC_URL', 'http://localhost:9000').rstrip('/')
PORT = int(os.environ.get('PORT', '9000'))
MIME = {'.mp4': 'video/mp4'}
MAX_CONCURRENT_JOBS = int(os.environ.get('MAX_CONCURRENT_JOBS', '3'))
_jobs_lock = threading.Lock()
_running_jobs = [0]  # lista p/ mutar de dentro da thread sem `global`


def safe_key(key):
    """Chave de saida sem travessia de diretorio."""
    k = posixpath.normpath('/' + str(key or '').replace('\\', '/')).lstrip('/')
    return k if k and not k.startswith('..') else None


def store_output(local_path, key):
    """Seam de armazenamento. Hoje: disco local servido em /files/<key>.
    Tarefa 2 troca o corpo desta funcao por um PUT no S3/MinIO e devolve a URL de la."""
    dest = os.path.join(OUT_DIR, key)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    os.replace(local_path, dest)
    return '%s/files/%s' % (PUBLIC_URL, key)


def post_webhook(url, body):
    if not url:
        return
    try:
        req = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST',
                                     headers={'content-type': 'application/json'})
        urllib.request.urlopen(req, timeout=15).read()
    except Exception as e:  # o job nao morre porque o webhook caiu
        # nunca logar str(e): URLError/InvalidURL podem trazer a url (com token) dentro
        print('[render] webhook falhou: %s' % type(e).__name__, flush=True)


def run_job(job_id, payload):
    # tudo dentro do try: qualquer falha (inclusive setup) termina em webhook
    # FAILED -- senao o export fica travado pra sempre (o backend nao tem timeout).
    webhook = (payload or {}).get('webhook')  # contem token: nunca logar
    export_id = None
    tmp = None
    try:
        body = payload.get('input') or {}
        webhook = payload.get('webhook')
        export_id = body.get('export_id')
        key = safe_key((body.get('output') or {}).get('key')) or '%s.mp4' % job_id
        tmp = os.path.join(OUT_DIR, '.tmp-%s.mp4' % job_id)
        os.makedirs(OUT_DIR, exist_ok=True)
        post_webhook(webhook, {'export_id': export_id, 'status': 'IN_PROGRESS',
                               'progress': 10, 'phase': 'Renderizando'})
        size_mb = renderer.render(body, tmp)
        url = store_output(tmp, key)
        print('[render] %s ok -> %s (%s MB)' % (job_id, key, size_mb), flush=True)
        post_webhook(webhook, {'export_id': export_id, 'status': 'COMPLETED',
                               'output': {'url': url, 'size_mb': size_mb}})
    except Exception as e:
        traceback.print_exc()
        if tmp and os.path.exists(tmp):
            os.remove(tmp)
        post_webhook(webhook, {'export_id': export_id, 'status': 'FAILED',
                               'error': str(e)[-500:] or 'Falha ao renderizar.'})
    finally:
        with _jobs_lock:
            _running_jobs[0] -= 1


class Handler(BaseHTTPRequestHandler):
    server_version = 'homecreators-render'

    def log_message(self, fmt, *args):  # sem query string: o webhook leva token
        print('[render] %s %s' % (self.command, self.path.split('?')[0]), flush=True)

    def _json(self, status, obj):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header('content-type', 'application/json')
        self.send_header('content-length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/health':
            return self._json(200, {'ok': True})
        if not path.startswith('/files/'):
            return self._json(404, {'error': 'Rota não encontrada.'})
        key = safe_key(path[len('/files/'):])
        full = os.path.join(OUT_DIR, key) if key else None
        if not full or not os.path.isfile(full):
            return self._json(404, {'error': 'Arquivo não encontrado.'})
        self.send_response(200)
        self.send_header('content-type', MIME.get(os.path.splitext(full)[1], 'application/octet-stream'))
        self.send_header('content-length', str(os.path.getsize(full)))
        self.end_headers()
        with open(full, 'rb') as f:
            while True:
                chunk = f.read(1 << 16)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def do_POST(self):
        if self.path.split('?')[0] != '/run':
            return self._json(404, {'error': 'Rota não encontrada.'})
        try:
            payload = json.loads(self.rfile.read(int(self.headers.get('content-length') or 0)) or b'{}')
        except ValueError:
            return self._json(400, {'error': 'JSON inválido.'})
        if not isinstance(payload, dict) or not isinstance(payload.get('input'), dict):
            return self._json(400, {'error': 'Esperado { "input": {...} }.'})
        with _jobs_lock:
            if _running_jobs[0] >= MAX_CONCURRENT_JOBS:
                return self._json(429, {'error': 'Worker ocupado, tente novamente em breve.'})
            _running_jobs[0] += 1
        job_id = 'job_' + uuid.uuid4().hex[:12]
        threading.Thread(target=run_job, args=(job_id, payload), daemon=True).start()
        self._json(202, {'id': job_id})


if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    print('[render] ouvindo em :%d (out=%s)' % (PORT, OUT_DIR), flush=True)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
