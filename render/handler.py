"""Wrapper do RunPod serverless.

Nao e' usado pelo server.py: o servidor HTTP e este handler sao dois transportes
para a mesma funcao `render.render`. Fica aqui pronto para quando o cliente tiver
a conta do RunPod.

Como usar:
  1. `pip install runpod` na imagem (unica dependencia, so do lado do RunPod).
  2. CMD da imagem: `python3 -u handler.py`.
  3. O RunPod entrega {"input": {...}} igual ao que backend/src/render.js enfileira
     e chama o webhook do job sozinho, com o `output` que devolvemos aqui.

Armazenamento: `store_output` vem do server.py (disco local hoje). Na Tarefa 2
ela vira upload S3/MinIO e este handler passa a devolver a URL do bucket sem
mudar mais nada.
"""
import os, tempfile

import render as renderer
from server import safe_key, store_output


def handler(job):
    body = job.get('input') or {}
    key = safe_key((body.get('output') or {}).get('key')) or '%s.mp4' % job.get('id', 'out')
    fd, tmp = tempfile.mkstemp(suffix='.mp4')
    os.close(fd)
    try:
        size_mb = renderer.render(body, tmp)
        return {'url': store_output(tmp, key), 'size_mb': size_mb}
    except Exception as e:
        if os.path.exists(tmp):
            os.remove(tmp)
        return {'error': str(e)[-500:] or 'Falha ao renderizar.'}


if __name__ == '__main__':
    import runpod  # noqa: E402  (so existe na imagem do RunPod)
    runpod.serverless.start({'handler': handler})
