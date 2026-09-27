// Servidor de desenvolvimento: roda o Worker fora da Cloudflare (Node puro, sem dependências).
// Serve para o container de dev e para demonstração. Produção continua sendo `wrangler deploy`.
import { createServer } from 'node:http';
import { makeD1 } from './d1-sqlite.mjs';
import worker from '../src/index.js';

const PORT = Number(process.env.PORT || 8787);
const schema = new URL('../schema.sql', import.meta.url).pathname;
const env = {
  ...process.env,
  DB: makeD1(schema, process.env.DB_FILE || ':memory:'),
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET || 'dev-secret-trocar-em-producao',
  TOKEN_KEY: process.env.TOKEN_KEY || Buffer.from('d'.repeat(32)).toString('base64'),
  PUBLIC_URL: process.env.PUBLIC_URL || `http://localhost:${PORT}`,
  APP_URL: process.env.APP_URL || 'http://localhost:8080',
  SOCIAL_MODE: process.env.SOCIAL_MODE || 'mock',
  RENDER_MODE: process.env.RENDER_MODE || 'mock',
  RENDER_WEBHOOK_SECRET: process.env.RENDER_WEBHOOK_SECRET || 'dev-render-secret',
};

// Login de desenvolvimento: emite um JWT no mesmo formato do Supabase.
// Só existe aqui, nunca no Worker, e só liga com DEV_LOGIN=1.
const b64url = (b) => Buffer.from(b).toString('base64url');
async function devToken(email) {
  // id a partir do hash do e-mail inteiro: truncar o e-mail faria contas diferentes colidirem
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.toLowerCase()));
  const sub = `dev-${Buffer.from(digest).toString('hex').slice(0, 32)}`;
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ sub, email, exp: Math.floor(Date.now() / 1000) + 86400 }));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SUPABASE_JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

const cors = (origin) => ({
  'access-control-allow-origin': origin || '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
});

createServer(async (req, res) => {
  const url = `http://${req.headers.host || 'localhost'}${req.url}`;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  try {
    if (process.env.DEV_LOGIN === '1' && req.method === 'POST' && new URL(url).pathname === '/api/dev/login') {
      const { email } = JSON.parse(body?.toString() || '{}');
      if (!/^\S+@\S+\.\S+$/.test(email || '')) {
        res.writeHead(400, { 'content-type': 'application/json', ...cors(env.APP_URL) });
        return res.end(JSON.stringify({ error: 'Digite um e-mail válido.' }));
      }
      res.writeHead(200, { 'content-type': 'application/json', ...cors(env.APP_URL) });
      return res.end(JSON.stringify({ token: await devToken(email), email }));
    }

    const out = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body, duplex: 'half' }), env, { waitUntil: (p) => p.catch((e) => console.error('waitUntil', e)) });
    const headers = Object.fromEntries(out.headers);
    res.writeHead(out.status, headers);
    res.end(out.body ? Buffer.from(await out.arrayBuffer()) : null);
  } catch (e) {
    console.error(e);
    res.writeHead(500, { 'content-type': 'application/json', ...cors(env.APP_URL) });
    res.end(JSON.stringify({ error: 'Erro interno.' }));
  }
}).listen(PORT, () => console.log(`API de desenvolvimento em http://localhost:${PORT} (social=${env.SOCIAL_MODE}, render=${env.RENDER_MODE}, dev-login=${process.env.DEV_LOGIN === '1' ? 'on' : 'off'})`));
