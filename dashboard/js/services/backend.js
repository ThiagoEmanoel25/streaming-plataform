// Ponte com o backend (backend/). Se /api/health responder, o app usa a API de verdade;
// se não, segue nos mocks locais. É o mesmo código nos dois casos — só muda a origem dos dados.
let API = null, token = null;

export const live = () => API !== null;
export const getToken = () => token;
export function setToken(t) {
  token = t || null;
  try { t ? localStorage.setItem('hc.token', t) : localStorage.removeItem('hc.token'); } catch {}
}

export async function detect() {
  try { token = localStorage.getItem('hc.token'); } catch {}
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (r.ok && (await r.json())?.ok) API = '/api';
  } catch { /* sem backend: modo mock */ }
  return live();
}

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

export async function call(method, path, body) {
  if (!live()) throw new ApiError('Backend não disponível.', 0, 'offline');
  let r;
  try {
    r = await fetch(API + path, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch { throw new ApiError('Sem conexão com o servidor.', 0, 'network'); }
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(data?.error || `Falha no servidor (${r.status}).`, r.status, data?.code);
  return data;
}

// espera um recurso chegar a um estado final, avisando o progresso no caminho
export async function poll(path, done, onTick, { every = 400, timeout = 120e3 } = {}) {
  const until = Date.now() + timeout;
  for (;;) {
    const data = await call('GET', path);
    onTick?.(data);
    if (done(data)) return data;
    if (Date.now() > until) throw new ApiError('O servidor demorou demais para responder.', 504, 'timeout');
    await new Promise((r) => setTimeout(r, every));
  }
}
