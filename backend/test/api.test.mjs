import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, makeCtx, signJWT, client } from './harness.mjs';

const SECRET = 'segredo-de-teste-super-secreto';
const setup = async (over) => {
  const env = makeEnv(over), ctx = makeCtx();
  const token = await signJWT({ sub: 'user-a', email: 'a@test.com' }, SECRET);
  return { env, ctx, api: client(env, ctx, token), token };
};
// projeto -> export pronto
async function readyExport(api, ctx, name = 'gol-de-falta') {
  const p = await api.post('/api/projects', { name, duration: 14, segmentId: 's1', data: { ratio: '9:16', zoom: 1.2 } });
  const e = await api.post('/api/exports', { projectId: p.data.project.id });
  await ctx.settle();
  return (await api.get(`/api/exports/${e.data.export.id}`)).data.export;
}
async function connect(api, net) {
  const a = await api.post(`/api/social/${net}/authorize`);
  const url = new URL(a.data.url);
  return api.get(`/api/social/${net}/callback?${url.searchParams}`);
}

test('saúde e autenticação', async () => {
  const { env, ctx } = await setup();
  const anon = client(env, ctx);
  assert.equal((await anon.get('/api/health')).status, 200);
  assert.equal((await anon.get('/api/me')).status, 401, 'sem token -> 401');

  const forged = await signJWT({ sub: 'user-a' }, 'outro-segredo');
  assert.equal((await client(env, ctx, forged).get('/api/me')).status, 401, 'assinatura errada -> 401');

  const expired = await signJWT({ sub: 'user-a', exp: Math.floor(Date.now() / 1000) - 10 }, SECRET);
  assert.equal((await client(env, ctx, expired).get('/api/me')).status, 401, 'expirado -> 401');

  // "alg: none" não pode passar
  const head = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: 'user-a', exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url');
  assert.equal((await client(env, ctx, `${head}.${body}.`).get('/api/me')).status, 401, 'alg none -> 401');
});

test('segmentos: exige sessão e vem do seed do D1, igual pra qualquer usuário', async () => {
  const { env, ctx, api } = await setup();
  const anon = client(env, ctx);
  assert.equal((await anon.get('/api/segments')).status, 401, 'sem token -> 401');

  const r = await api.get('/api/segments');
  assert.equal(r.status, 200);
  assert.equal(r.data.segments.length, 12);
  assert.deepEqual(Object.keys(r.data.segments[0]).sort(), ['dur', 'id', 'range', 'seed', 'tag', 'title']);
  assert.deepEqual(r.data.segments[0], { id: 's1', title: 'Gol de falta', tag: 'Gol', range: '12:41 - 12:55', dur: 14, seed: 130 });

  const apiB = client(env, ctx, await signJWT({ sub: 'user-b', email: 'b@test.com' }, SECRET));
  assert.deepEqual((await apiB.get('/api/segments')).data, r.data, 'não é filtrado por usuário: é dado da partida');
});

test('/api/me cria o usuário no plano starter', async () => {
  const { api } = await setup();
  const me = (await api.get('/api/me')).data;
  assert.equal(me.user.email, 'a@test.com');
  assert.equal(me.plan.id, 'starter');
  assert.deepEqual(me.usage, { exports: 0, publications: 0, storage: 0 });
});

test('projetos: salvar, listar, atualizar e apagar', async () => {
  const { api } = await setup();
  const created = await api.post('/api/projects', { name: 'gol-de-falta', duration: 14, data: { ratio: '9:16', zoom: 1.2, keyframes: [{ t: 0, zoom: 1 }] } });
  assert.equal(created.status, 201);
  const id = created.data.project.id;
  assert.equal(created.data.project.data.zoom, 1.2, 'a receita de render volta inteira');

  await api.post('/api/projects', { id, name: 'gol-de-falta', data: { ratio: '4:5' } });
  assert.equal((await api.get(`/api/projects/${id}`)).data.project.data.ratio, '4:5', 'upsert atualiza');
  assert.equal((await api.get('/api/projects')).data.projects.length, 1, 'não duplica');

  await api.del(`/api/projects/${id}`);
  assert.equal((await api.get('/api/projects')).data.projects.length, 0);
  assert.equal((await api.get(`/api/projects/${id}`)).status, 404);
  assert.equal((await api.post('/api/projects', { name: 'x' })).status, 400, 'sem data -> 400');
});

test('export: enfileira, o webhook conclui e o uso sobe', async () => {
  const { api, ctx } = await setup();
  const p = await api.post('/api/projects', { name: 'gol', duration: 14, data: { ratio: '9:16' } });
  const started = await api.post('/api/exports', { projectId: p.data.project.id });
  assert.equal(started.status, 202);
  assert.equal(started.data.export.status, 'processing');

  await ctx.settle();
  const done = (await api.get(`/api/exports/${started.data.export.id}`)).data.export;
  assert.equal(done.status, 'ready');
  assert.equal(done.progress, 100);
  assert.ok(done.url, 'ficou com URL da mídia');
  assert.equal((await api.get('/api/me')).data.usage.exports, 1);
  assert.equal((await api.post('/api/exports', { projectId: 'nao-existe' })).status, 404);
});

test('export: respeita o limite do plano', async () => {
  const { api, env } = await setup();
  await api.get('/api/me');
  await env.DB.prepare('update usage set exports = 10 where user_id = ?').bind('user-a').run();
  await env.DB.prepare("insert into usage (user_id, period, exports) values ('user-a', ?, 10) on conflict do nothing")
    .bind(new Date().toISOString().slice(0, 7)).run();
  const p = await api.post('/api/projects', { name: 'gol', data: {} });
  const r = await api.post('/api/exports', { projectId: p.data.project.id });
  assert.equal(r.status, 402);
  assert.equal(r.data.code, 'limit_exports');
  assert.match(r.data.error, /10 exportações/);
});

test('webhook de render exige o segredo', async () => {
  const { api, env, ctx } = await setup({ RENDER_MODE: 'live-skip' });
  const exp = await readyExport(api, ctx);
  const anon = client(env, ctx);
  assert.equal((await anon.post('/api/hooks/render?token=errado', { export_id: exp.id, status: 'FAILED' })).status, 401);
  assert.equal((await anon.post('/api/hooks/render?token=render-secret', { export_id: exp.id, status: 'FAILED', error: 'GPU indisponível' })).status, 200);
  assert.equal((await api.get(`/api/exports/${exp.id}`)).data.export.status, 'failed');
});

test('contas sociais: conectar, listar e desconectar; token cifrado', async () => {
  const { api, env } = await setup();
  await api.get('/api/me');
  const before = (await api.get('/api/social/accounts')).data.accounts;
  assert.equal(before.length, 7, 'as 7 redes do escopo');
  assert.equal(before.every((a) => !a.connected), true);

  const cb = await connect(api, 'instagram');
  assert.equal(cb.status, 302);
  assert.match(cb.headers.get('location'), /status=connected/);

  const ig = (await api.get('/api/social/accounts')).data.accounts.find((a) => a.id === 'instagram');
  assert.equal(ig.connected, true);
  assert.equal(ig.handle, '@homecreators');

  const row = await env.DB.prepare('select token from connections where user_id = ? and network = ?').bind('user-a', 'instagram').first();
  assert.match(row.token, /^v1\./, 'guardado cifrado (AES-GCM)');
  assert.equal(row.token.includes('mock-token'), false, 'nunca em claro');

  await api.del('/api/social/instagram');
  assert.equal((await api.get('/api/social/accounts')).data.accounts.find((a) => a.id === 'instagram').connected, false);
});

test('publicação: IG + YT, status por rede e idempotência', async () => {
  const { api, ctx } = await setup();
  await api.get('/api/me');
  const exp = await readyExport(api, ctx);

  const noConn = await api.post('/api/publications', { exportId: exp.id, caption: 'Que golaço!', networks: ['instagram'] });
  assert.equal(noConn.status, 400);
  assert.match(noConn.data.error, /Conecte sua conta do Instagram/);

  await connect(api, 'instagram');
  await connect(api, 'youtube');

  const r = await api.post('/api/publications', { exportId: exp.id, caption: 'Que golaço!', networks: ['instagram', 'youtube'] });
  assert.equal(r.status, 202);
  assert.equal(r.data.publications.every((p) => p.status === 'queued'), true);

  await ctx.settle();
  const done = (await api.get(`/api/publications?exportId=${exp.id}`)).data.publications;
  assert.equal(done.length, 2);
  assert.equal(done.every((p) => p.status === 'success'), true);
  assert.ok(done[0].permalink);
  assert.equal((await api.get('/api/me')).data.usage.publications, 2);

  // republicar no mesmo export não reenvia
  const again = await api.post('/api/publications', { exportId: exp.id, caption: 'Que golaço!', networks: ['instagram', 'youtube'] });
  await ctx.settle();
  assert.deepEqual(again.data.skipped.sort(), ['instagram', 'youtube']);
  assert.equal((await api.get('/api/me')).data.usage.publications, 2, 'não contou de novo');
});

test('publicação: falha isolada e retry', async () => {
  const { api, ctx, env } = await setup({ MOCK_FAIL_NETWORK: 'tiktok' });
  await api.get('/api/me');
  const exp = await readyExport(api, ctx);
  for (const n of ['instagram', 'youtube', 'tiktok']) await connect(api, n);

  await api.post('/api/publications', { exportId: exp.id, caption: 'Que golaço!', networks: ['instagram', 'youtube', 'tiktok'] });
  await ctx.settle();
  const byNet = Object.fromEntries((await api.get(`/api/publications?exportId=${exp.id}`)).data.publications.map((p) => [p.network, p]));
  assert.equal(byNet.instagram.status, 'success');
  assert.equal(byNet.youtube.status, 'success');
  assert.equal(byNet.tiktok.status, 'failed', 'uma rede falha sem derrubar as outras');
  assert.match(byNet.tiktok.error, /Tente novamente/);
  assert.equal((await api.get('/api/me')).data.usage.publications, 2, 'falha não conta no limite');

  // retry enquanto a causa continua: falha de novo, sem afetar as outras
  await api.post(`/api/publications/${exp.id}:tiktok/retry`);
  await ctx.settle();
  const still = (await api.get(`/api/publications?exportId=${exp.id}`)).data.publications.find((p) => p.network === 'tiktok');
  assert.equal(still.status, 'failed');

  // causa resolvida: o retry publica e conta 1 só vez
  env.MOCK_FAIL_NETWORK = null;
  const retry = await api.post(`/api/publications/${exp.id}:tiktok/retry`);
  assert.equal(retry.status, 202);
  await ctx.settle();
  const after = (await api.get(`/api/publications?exportId=${exp.id}`)).data.publications;
  assert.equal(after.find((p) => p.network === 'tiktok').status, 'success');
  assert.equal(after.filter((p) => p.status === 'success').length, 3);
  assert.equal((await api.get('/api/me')).data.usage.publications, 3);
});

test('publicação: valida legenda, rede e limite do plano', async () => {
  const { api, env, ctx } = await setup();
  await api.get('/api/me');
  const exp = await readyExport(api, ctx);
  await connect(api, 'x');
  await connect(api, 'instagram');

  assert.equal((await api.post('/api/publications', { exportId: exp.id, caption: '', networks: ['instagram'] })).status, 400);
  const long = await api.post('/api/publications', { exportId: exp.id, caption: 'a'.repeat(300), networks: ['x'] });
  assert.equal(long.status, 400);
  assert.match(long.data.error, /limite do X \(280/);
  assert.equal((await api.post('/api/publications', { exportId: exp.id, caption: 'oi', networks: ['orkut'] })).status, 400);
  assert.equal((await api.post('/api/publications', { exportId: 'nao-existe', caption: 'oi', networks: ['instagram'] })).status, 404);

  await env.DB.prepare('update usage set publications = 20 where user_id = ?').bind('user-a').run();
  const over = await api.post('/api/publications', { exportId: exp.id, caption: 'oi', networks: ['instagram'] });
  assert.equal(over.status, 402);
  assert.equal(over.data.code, 'limit_publications');
});

test('um usuário não enxerga os dados do outro', async () => {
  const { env, ctx, api } = await setup();
  const exp = await readyExport(api, ctx);
  const projectId = (await api.get('/api/projects')).data.projects[0].id;

  const apiB = client(env, ctx, await signJWT({ sub: 'user-b', email: 'b@test.com' }, SECRET));
  assert.equal((await apiB.get('/api/projects')).data.projects.length, 0);
  assert.equal((await apiB.get(`/api/projects/${projectId}`)).status, 404);
  assert.equal((await apiB.get(`/api/exports/${exp.id}`)).status, 404);
  assert.equal((await apiB.post('/api/exports', { projectId })).status, 404, 'não exporta projeto alheio');
  // upsert com id alheio não sequestra o projeto
  const hijack = await apiB.post('/api/projects', { id: projectId, name: 'roubado', data: {} });
  assert.equal(hijack.status, 404);
  assert.equal((await api.get(`/api/projects/${projectId}`)).data.project.name, 'gol-de-falta');
});

test('Stripe: webhook assinado troca o plano', async () => {
  const { env, ctx, api } = await setup();
  await api.get('/api/me');
  const anon = client(env, ctx);
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { client_reference_id: 'user-a', customer: 'cus_1', metadata: { user_id: 'user-a', plan: 'pro' } } } });

  assert.equal((await anon.raw('POST', '/api/hooks/stripe', payload, { 'stripe-signature': 't=1,v1=deadbeef' })).status, 400);

  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec_test'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`))).toString('hex');
  assert.equal((await anon.raw('POST', '/api/hooks/stripe', payload, { 'stripe-signature': `t=${t},v1=${sig}` })).status, 200);

  const me = (await api.get('/api/me')).data;
  assert.equal(me.plan.id, 'pro');
  assert.equal(me.plan.exports, 300);
});
