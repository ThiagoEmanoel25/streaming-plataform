// Respostas, erros e CORS.
export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code || 'error'; }
}
export const bad = (msg, code) => new HttpError(400, msg, code);
export const unauthorized = (msg = 'Faça login para continuar.') => new HttpError(401, msg, 'unauthorized');
export const notFound = (msg = 'Não encontrado.') => new HttpError(404, msg, 'not_found');

const cors = (origin) => ({
  'access-control-allow-origin': origin || '*',
  'access-control-allow-headers': 'authorization,content-type,idempotency-key',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-max-age': '86400',
});
export const corsHeaders = cors;

export const json = (data, status = 200, origin) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(origin) } });

export async function readJson(req) {
  try { return await req.json(); } catch { throw bad('Corpo da requisição inválido.'); }
}
export function requireFields(body, fields) {
  for (const f of fields) if (body[f] === undefined || body[f] === null || body[f] === '') throw bad(`Campo obrigatório: ${f}.`);
  return body;
}
