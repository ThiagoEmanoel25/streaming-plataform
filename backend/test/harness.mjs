// D1 falso sobre node:sqlite (SQL de verdade) + env/ctx do Worker, para testar sem wrangler.
import { makeD1 } from '../dev/d1-sqlite.mjs';
import worker from '../src/index.js';

export const makeDB = (schemaPath) => makeD1(schemaPath);

export function makeEnv(over = {}) {
  return {
    DB: makeD1(new URL('../schema.sql', import.meta.url).pathname),
    SUPABASE_JWT_SECRET: 'segredo-de-teste-super-secreto',
    TOKEN_KEY: Buffer.from('k'.repeat(32)).toString('base64'),
    PUBLIC_URL: 'https://api.test.invalid',
    APP_URL: 'https://app.test.invalid',
    RENDER_WEBHOOK_SECRET: 'render-secret',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    SOCIAL_MODE: 'mock',
    RENDER_MODE: 'mock',
    MOCK_RENDER_STEP_MS: '1',
    ...over,
  };
}

export function makeCtx() {
  const pending = [];
  return { waitUntil: (p) => pending.push(p), settle: async () => { while (pending.length) await Promise.all(pending.splice(0)); } };
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
export async function signJWT(payload, secret, alg = 'HS256') {
  const head = b64url(JSON.stringify({ alg, typ: 'JWT' }));
  const body = b64url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload }));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

export function client(env, ctx, token) {
  const call = async (method, path, body, headers = {}) => {
    const init = { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } };
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
      init.headers['content-type'] = 'application/json';
    }
    const res = await worker.fetch(new Request(`https://api.test.invalid${path}`, init), env, ctx);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
  return {
    get: (p) => call('GET', p), post: (p, b, h) => call('POST', p, b ?? {}, h),
    del: (p) => call('DELETE', p), raw: call,
  };
}
