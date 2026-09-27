// Funcionalidades mínimas do escopo, checadas contra a API que está rodando no container.
// Diferente dos testes de backend/ (unitários, em memória): aqui é HTTP de verdade.
import { test, expect } from '@playwright/test';

const NEW_USER = () => `qa+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@homecreators.app`;

async function login(request, email = NEW_USER()) {
  const r = await request.post('/api/dev/login', { data: { email } });
  expect(r.ok(), 'login de desenvolvimento disponível').toBeTruthy();
  const { token } = await r.json();
  return { email, token, h: { authorization: `Bearer ${token}` } };
}
const body = (r) => r.json();

async function exportPronto(request, h, name = 'gol-de-falta') {
  const p = await body(await request.post('/api/projects', { headers: h, data: { name, duration: 14, segmentId: 's1', data: { ratio: '9:16', zoom: 1.2, x: 0, y: -10, overlays: [], keyframes: [] } } }));
  const e = await body(await request.post('/api/exports', { headers: h, data: { projectId: p.project.id } }));
  await expect.poll(async () => (await body(await request.get(`/api/exports/${e.export.id}`, { headers: h }))).export.status,
    { message: 'export terminou', timeout: 60_000 }).toBe('ready');
  return (await body(await request.get(`/api/exports/${e.export.id}`, { headers: h }))).export;
}
async function conectar(request, h, net) {
  const { url } = await body(await request.post(`/api/social/${net}/authorize`, { headers: h }));
  const cb = await request.get(url, { maxRedirects: 0 });
  expect(cb.status(), 'callback redireciona de volta ao app').toBe(302);
}

test.describe('conta e plano', () => {
  test('cria o usuário no primeiro acesso, com plano e limites', async ({ request }) => {
    const { email, h } = await login(request);
    const me = await body(await request.get('/api/me', { headers: h }));
    expect(me.user.email).toBe(email);
    expect(me.plan).toMatchObject({ id: 'starter', exports: 10, publications: 20 });
    expect(me.usage).toEqual({ exports: 0, publications: 0, storage: 0 });
    expect(me.plans.map((p) => p.id)).toEqual(['starter', 'creator', 'pro']);
  });

  test('sem token não passa', async ({ request }) => {
    expect((await request.get('/api/me')).status()).toBe(401);
    expect((await request.get('/api/me', { headers: { authorization: 'Bearer nao.e.token' } })).status()).toBe(401);
  });
});

test.describe('projetos', () => {
  test('salva a receita de render, atualiza e não duplica', async ({ request }) => {
    const { h } = await login(request);
    const criado = await body(await request.post('/api/projects', { headers: h, data: { name: 'gol-de-falta', duration: 14, data: { ratio: '9:16', zoom: 1.2, keyframes: [{ t: 0, zoom: 1 }] } } }));
    const id = criado.project.id;
    expect(criado.project.data.zoom, 'a receita volta inteira').toBe(1.2);
    expect(criado.project.data.keyframes).toHaveLength(1);

    await request.post('/api/projects', { headers: h, data: { id, name: 'gol-de-falta', data: { ratio: '4:5' } } });
    const lista = await body(await request.get('/api/projects', { headers: h }));
    expect(lista.projects).toHaveLength(1);
    expect(lista.projects[0].data.ratio).toBe('4:5');

    await request.delete(`/api/projects/${id}`, { headers: h });
    expect((await body(await request.get('/api/projects', { headers: h }))).projects).toHaveLength(0);
  });
});

test.describe('export', () => {
  test('enfileira, acompanha o progresso e entrega a URL do vídeo', async ({ request }) => {
    const { h } = await login(request);
    const p = await body(await request.post('/api/projects', { headers: h, data: { name: 'gol', duration: 14, data: { ratio: '9:16' } } }));

    const started = await request.post('/api/exports', { headers: h, data: { projectId: p.project.id } });
    expect(started.status(), 'aceito para processar').toBe(202);

    const fases = new Set();
    await expect.poll(async () => {
      const { export: e } = await body(await request.get(`/api/exports/${(await body(started)).export.id}`, { headers: h }));
      if (e.phase) fases.add(e.phase);
      return e.status;
    }, { timeout: 60_000 }).toBe('ready');

    const pronto = (await body(await request.get('/api/exports', { headers: h }))).exports[0];
    expect(pronto.progress).toBe(100);
    expect(pronto.url, 'mídia disponível').toBeTruthy();
    expect([...fases].length, 'passou por fases intermediárias').toBeGreaterThan(0);
    expect((await body(await request.get('/api/me', { headers: h }))).usage.exports).toBe(1);
  });

  test('projeto de outro usuário não exporta', async ({ request }) => {
    const a = await login(request);
    const p = await body(await request.post('/api/projects', { headers: a.h, data: { name: 'meu', data: {} } }));
    const b = await login(request);
    expect((await request.post('/api/exports', { headers: b.h, data: { projectId: p.project.id } })).status()).toBe(404);
    expect((await request.get(`/api/projects/${p.project.id}`, { headers: b.h })).status()).toBe(404);
  });
});

test.describe('contas sociais', () => {
  test('lista as 7 redes, conecta e desconecta', async ({ request }) => {
    const { h } = await login(request);
    const antes = await body(await request.get('/api/social/accounts', { headers: h }));
    expect(antes.accounts.map((a) => a.id)).toEqual(['instagram', 'youtube', 'tiktok', 'x', 'threads', 'facebook', 'linkedin']);
    expect(antes.accounts.every((a) => !a.connected)).toBeTruthy();

    await conectar(request, h, 'instagram');
    const ig = (await body(await request.get('/api/social/accounts', { headers: h }))).accounts.find((a) => a.id === 'instagram');
    expect(ig).toMatchObject({ connected: true, handle: '@homecreators' });

    await request.delete('/api/social/instagram', { headers: h });
    expect((await body(await request.get('/api/social/accounts', { headers: h }))).accounts.find((a) => a.id === 'instagram').connected).toBe(false);
  });
});

test.describe('publicação', () => {
  test('publica em Instagram e YouTube de uma vez, com status por rede', async ({ request }) => {
    const { h } = await login(request);
    const exp = await exportPronto(request, h);
    await conectar(request, h, 'instagram');
    await conectar(request, h, 'youtube');

    const r = await request.post('/api/publications', { headers: h, data: { exportId: exp.id, caption: 'QUE GOLAÇO! 🔥', networks: ['instagram', 'youtube'] } });
    expect(r.status()).toBe(202);
    expect((await body(r)).publications.every((p) => p.status === 'queued'), 'entra na fila').toBeTruthy();

    await expect.poll(async () => (await body(await request.get(`/api/publications?exportId=${exp.id}`, { headers: h }))).publications.filter((p) => p.status === 'success').length,
      { timeout: 60_000 }).toBe(2);

    const pubs = (await body(await request.get('/api/publications', { headers: h }))).publications;
    expect(pubs.map((p) => p.id).sort()).toEqual([`${exp.id}:instagram`, `${exp.id}:youtube`]);
    expect(pubs.every((p) => p.permalink)).toBeTruthy();
    expect((await body(await request.get('/api/me', { headers: h }))).usage.publications).toBe(2);
  });

  test('republicar o mesmo export não reenvia nem conta de novo', async ({ request }) => {
    const { h } = await login(request);
    const exp = await exportPronto(request, h);
    await conectar(request, h, 'instagram');
    await request.post('/api/publications', { headers: h, data: { exportId: exp.id, caption: 'oi', networks: ['instagram'] } });
    await expect.poll(async () => (await body(await request.get(`/api/publications?exportId=${exp.id}`, { headers: h }))).publications[0].status, { timeout: 60_000 }).toBe('success');

    const again = await body(await request.post('/api/publications', { headers: h, data: { exportId: exp.id, caption: 'oi', networks: ['instagram'] } }));
    expect(again.skipped, 'idempotente por <export>:<rede>').toContain('instagram');
    expect((await body(await request.get('/api/me', { headers: h }))).usage.publications).toBe(1);
  });

  test('recusa legenda vazia, legenda longa demais e conta desconectada', async ({ request }) => {
    const { h } = await login(request);
    const exp = await exportPronto(request, h);

    const semConta = await request.post('/api/publications', { headers: h, data: { exportId: exp.id, caption: 'oi', networks: ['instagram'] } });
    expect(semConta.status()).toBe(400);
    expect((await body(semConta)).error).toMatch(/Conecte sua conta do Instagram/);

    await conectar(request, h, 'instagram');
    await conectar(request, h, 'x');
    expect((await request.post('/api/publications', { headers: h, data: { exportId: exp.id, caption: '  ', networks: ['instagram'] } })).status()).toBe(400);

    const longa = await request.post('/api/publications', { headers: h, data: { exportId: exp.id, caption: 'a'.repeat(300), networks: ['x'] } });
    expect(longa.status()).toBe(400);
    expect((await body(longa)).error).toMatch(/limite do X \(280/);
  });
});

test.describe('limites do plano', () => {
  test('bloqueia a exportação quando o plano acaba', async ({ request }) => {
    const { h } = await login(request);
    const p = await body(await request.post('/api/projects', { headers: h, data: { name: 'gol', duration: 5, data: { ratio: '9:16' } } }));
    for (let i = 0; i < 10; i++) {
      const r = await request.post('/api/exports', { headers: h, data: { projectId: p.project.id } });
      expect(r.status(), `export ${i + 1} do plano Starter`).toBe(202);
    }
    const passou = await request.post('/api/exports', { headers: h, data: { projectId: p.project.id } });
    expect(passou.status()).toBe(402);
    expect(await body(passou)).toMatchObject({ code: 'limit_exports' });
    expect((await body(passou)).error).toMatch(/10 exportações do plano Starter/);
  });
});

test.describe('webhooks', () => {
  test('o webhook de render exige o segredo', async ({ request }) => {
    const { h } = await login(request);
    const exp = await exportPronto(request, h);
    const semSegredo = await request.post('/api/hooks/render?token=errado', { data: { export_id: exp.id, status: 'FAILED' } });
    expect(semSegredo.status()).toBe(401);
    expect((await body(await request.get(`/api/exports/${exp.id}`, { headers: h }))).export.status).toBe('ready');
  });

  test('o webhook do Stripe exige assinatura válida', async ({ request }) => {
    const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { client_reference_id: 'x' } } });
    const r = await request.post('/api/hooks/stripe', { headers: { 'stripe-signature': 't=1,v1=falsa', 'content-type': 'application/json' }, data: payload });
    expect(r.status()).toBe(400);
  });
});
