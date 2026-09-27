// Home Creators — API (Cloudflare Worker).
// Escopo mínimo: projetos, export (RunPod), contas sociais, publicação por rede, plano/limites.
import { HttpError, json, bad, notFound, readJson, requireFields, corsHeaders } from './http.js';
import { authenticate } from './auth.js';
import { seal, unseal, b64url } from './crypto.js';
import { planOf, PLANS } from './plans.js';
import { NETWORKS, isNetwork, providerFor } from './social/index.js';
import { enqueueRender, simulateRender } from './render.js';
import { createCheckout, verifyStripeSignature, planFromEvent } from './stripe.js';
import * as db from './db.js';

const ROUTES = [];
const route = (method, pattern, handler, opts = {}) => ROUTES.push({ method, parts: pattern.split('/').filter(Boolean), handler, ...opts });

function match(method, path) {
  const parts = path.split('/').filter(Boolean);
  for (const r of ROUTES) {
    if (r.method !== method || r.parts.length !== parts.length) continue;
    const params = {};
    if (r.parts.every((p, i) => (p.startsWith(':') ? (params[p.slice(1)] = parts[i], true) : p === parts[i]))) return { r, params };
  }
  return null;
}

// ---------- conta ----------
route('GET', '/api/health', () => json({ ok: true }));

route('GET', '/api/me', async ({ env, user }) => {
  const row = await db.ensureUser(env.DB, user);
  const usage = await db.getUsage(env.DB, user.id);
  const plan = planOf(row.plan);
  return json({
    user: { id: row.id, email: row.email },
    plan: { id: row.plan, ...plan },
    usage: { exports: usage.exports, publications: usage.publications, storage: usage.storage_mb },
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p })),
  });
});

// ---------- projetos ----------
const projectOut = (p) => ({ id: p.id, name: p.name, segmentId: p.segment_id, duration: p.duration, data: JSON.parse(p.data), updatedAt: p.updated_at });

route('GET', '/api/projects', async ({ env, user }) => json({ projects: (await db.listProjects(env.DB, user.id)).map(projectOut) }));

route('POST', '/api/projects', async ({ env, user, req }) => {
  const body = requireFields(await readJson(req), ['name']);
  const id = body.id || db.uid('prj');
  if (typeof body.data !== 'object' || body.data === null) throw bad('data precisa ser um objeto (a receita de render).');
  await db.saveProject(env.DB, user.id, { ...body, id });
  const saved = await db.getProject(env.DB, user.id, id);
  if (!saved) throw notFound('Projeto não encontrado.'); // id de outro usuário
  return json({ project: projectOut(saved) }, body.id ? 200 : 201);
});

route('GET', '/api/projects/:id', async ({ env, user, params }) => {
  const p = await db.getProject(env.DB, user.id, params.id);
  if (!p) throw notFound('Projeto não encontrado.');
  return json({ project: projectOut(p) });
});

route('DELETE', '/api/projects/:id', async ({ env, user, params }) => {
  await db.softDeleteProject(env.DB, user.id, params.id);
  return json({ ok: true });
});

// ---------- export ----------
const exportOut = (e) => ({ id: e.id, name: e.name, ratio: e.ratio, duration: e.duration, status: e.status, progress: e.progress, phase: e.phase, url: e.url, error: e.error, createdAt: e.created_at });

route('GET', '/api/exports', async ({ env, user }) => json({ exports: (await db.listExports(env.DB, user.id)).map(exportOut) }));

route('POST', '/api/exports', async ({ env, user, req, ctx }) => {
  const body = requireFields(await readJson(req), ['projectId']);
  const project = await db.getProject(env.DB, user.id, body.projectId);
  if (!project) throw notFound('Projeto não encontrado.');

  const row = await db.ensureUser(env.DB, user);
  const plan = planOf(row.plan);
  const usage = await db.getUsage(env.DB, user.id);
  if (usage.exports >= plan.exports) throw new HttpError(402, `Você usou as ${plan.exports} exportações do plano ${plan.name} neste mês.`, 'limit_exports');

  const data = JSON.parse(project.data);
  const exp = { id: db.uid('exp'), projectId: project.id, name: project.name, ratio: data.ratio || '9:16', duration: project.duration, user_id: user.id };
  await db.createExport(env.DB, user.id, exp);
  // conta na hora de enfileirar: dois pedidos simultâneos não passam do limite
  await db.bumpUsage(env.DB, user.id, 'exports');

  try {
    const { jobId, mock } = await enqueueRender(env, exp, project);
    await db.patchExport(env.DB, exp.id, { job_id: jobId, status: 'processing', phase: 'Processando', progress: 10 });
    if (mock) ctx.waitUntil(simulateRender(env, exp.id));
  } catch (e) {
    await db.patchExport(env.DB, exp.id, { status: 'failed', error: e.message });
    throw e;
  }
  return json({ export: exportOut(await db.getExport(env.DB, user.id, exp.id)) }, 202);
});

route('GET', '/api/exports/:id', async ({ env, user, params }) => {
  const e = await db.getExport(env.DB, user.id, params.id);
  if (!e) throw notFound('Exportação não encontrada.');
  return json({ export: exportOut(e) });
});

// RunPod avisa aqui quando o render termina (segredo compartilhado na query).
route('POST', '/api/hooks/render', async ({ env, req, url }) => {
  if (!env.RENDER_WEBHOOK_SECRET || url.searchParams.get('token') !== env.RENDER_WEBHOOK_SECRET) throw new HttpError(401, 'Webhook não autorizado.', 'unauthorized');
  const body = await readJson(req);
  const exp = body.export_id ? await db.one(env.DB, 'select * from exports where id = ?', body.export_id) : await db.exportByJob(env.DB, body.id);
  if (!exp) throw notFound('Exportação não encontrada.');
  const out = body.output || {};
  if (body.status === 'COMPLETED' || out.url) {
    await db.patchExport(env.DB, exp.id, { status: 'ready', progress: 100, phase: 'Concluído', url: out.url || null, thumb_url: out.thumb_url || null });
    if (out.size_mb) await db.bumpUsage(env.DB, exp.user_id, 'storage_mb', Math.round(out.size_mb));
  } else if (body.status === 'FAILED') {
    await db.patchExport(env.DB, exp.id, { status: 'failed', error: body.error || 'Falha ao renderizar.' });
  } else {
    await db.patchExport(env.DB, exp.id, { status: 'processing', progress: body.progress ?? exp.progress, phase: body.phase || exp.phase });
  }
  return json({ ok: true });
});

// ---------- contas sociais ----------
route('GET', '/api/social/accounts', async ({ env, user }) => {
  const rows = await db.listConnections(env.DB, user.id);
  const byId = Object.fromEntries(rows.map((r) => [r.network, r]));
  return json({
    accounts: Object.entries(NETWORKS).map(([id, meta]) => {
      const c = byId[id];
      return { id, name: meta.name, maxChars: meta.maxChars, connected: !!c, handle: c?.handle || null, status: c?.status || null, needsReauth: c?.status === 'reauth' };
    }),
  });
});

route('POST', '/api/social/:net/authorize', async ({ env, user, params, req }) => {
  if (!isNetwork(params.net)) throw bad('Rede não suportada.');
  const body = await readJson(req).catch(() => ({}));
  const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
  await db.saveOAuthState(env.DB, state, user.id, params.net, body.redirect);
  return json({ url: providerFor(env, params.net).authorizeUrl(env, state) });
});

// o usuário volta da rede para cá (sem Authorization): quem identifica é o state
route('GET', '/api/social/:net/callback', async ({ env, params, url }) => {
  const err = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const st = await db.takeOAuthState(env.DB, url.searchParams.get('state') || '');
  const back = st.redirect || `${env.APP_URL || ''}/`;
  const go = (q) => new Response(null, { status: 302, headers: { location: `${back}${back.includes('?') ? '&' : '?'}${q}` } });
  if (err || !code) return go(`social=${params.net}&status=cancelled`);
  try {
    const acc = await providerFor(env, params.net).exchange(env, code);
    await db.saveConnection(env.DB, st.user_id, {
      network: params.net, handle: acc.handle, externalId: acc.externalId, scopes: acc.scopes || null, expiresAt: acc.expiresAt,
      token: await seal(acc.token, env.TOKEN_KEY),
      refreshToken: acc.refreshToken ? await seal(acc.refreshToken, env.TOKEN_KEY) : null,
    });
    return go(`social=${params.net}&status=connected`);
  } catch {
    return go(`social=${params.net}&status=error`);
  }
});

route('DELETE', '/api/social/:net', async ({ env, user, params }) => {
  await db.deleteConnection(env.DB, user.id, params.net);
  return json({ ok: true });
});

// ---------- publicação ----------
const pubOut = (p) => ({ id: p.id, exportId: p.export_id, network: p.network, status: p.status, error: p.error, permalink: p.permalink, scheduledAt: p.scheduled_at, updatedAt: p.updated_at });
const BUSY = ['queued', 'processing'];

// envia de fato; roda em waitUntil, então nunca deixa a request pendurada
async function deliver(env, userId, pubId) {
  const pub = await db.one(env.DB, 'select * from publications where id = ?', pubId);
  if (!pub || pub.status !== 'queued') return;
  await db.patchPublication(env.DB, pubId, { status: 'processing', attempts: pub.attempts + 1 });
  try {
    const conn = await db.getConnection(env.DB, userId, pub.network);
    if (!conn) throw new HttpError(400, 'Conta não conectada.', 'not_connected');
    const exp = await db.one(env.DB, 'select * from exports where id = ?', pub.export_id);
    if (!exp || exp.status !== 'ready') throw new HttpError(409, 'O vídeo ainda não terminou de exportar.', 'not_ready');

    const provider = providerFor(env, pub.network);
    const open = { ...conn, token: await unseal(conn.token, env.TOKEN_KEY), refresh_token: conn.refresh_token ? await unseal(conn.refresh_token, env.TOKEN_KEY) : null };
    // token curto (YouTube): renova antes de enviar
    if (provider.refresh && open.expires_at && new Date(open.expires_at).getTime() - Date.now() < 120e3) {
      const r = await provider.refresh(env, open);
      open.token = r.token;
      await db.saveConnection(env.DB, userId, { network: pub.network, handle: conn.handle, externalId: conn.external_id, scopes: conn.scopes, expiresAt: r.expiresAt, token: await seal(r.token, env.TOKEN_KEY), refreshToken: conn.refresh_token });
    }
    const out = await provider.publish(env, open, { videoUrl: exp.url, caption: pub.caption });
    await db.patchPublication(env.DB, pubId, { status: 'success', external_id: out.externalId || null, permalink: out.permalink || null, error: null });
    await db.bumpUsage(env.DB, userId, 'publications');
  } catch (e) {
    if (e.status === 401) await db.markReauth(env.DB, userId, pub.network);
    await db.patchPublication(env.DB, pubId, { status: 'failed', error: e.message || 'Falha ao publicar.' });
  }
}

route('GET', '/api/publications', async ({ env, user, url }) =>
  json({ publications: (await db.listPublications(env.DB, user.id, url.searchParams.get('exportId'))).map(pubOut) }));

route('POST', '/api/publications', async ({ env, user, req, ctx }) => {
  const body = requireFields(await readJson(req), ['exportId', 'networks']);
  const nets = [...new Set(body.networks)];
  if (!Array.isArray(body.networks) || !nets.length) throw bad('Escolha ao menos uma rede.');
  for (const n of nets) if (!isNetwork(n)) throw bad(`Rede não suportada: ${n}.`);

  const exp = await db.getExport(env.DB, user.id, body.exportId);
  if (!exp) throw notFound('Exportação não encontrada.');
  if (exp.status === 'failed') throw bad('Esse Reel falhou ao exportar. Exporte de novo.');

  const caption = (body.caption || '').trim();
  if (!caption) throw bad('Escreva uma legenda antes de publicar.');
  for (const n of nets) {
    const max = NETWORKS[n].maxChars;
    if (caption.length > max) throw bad(`A legenda passou do limite do ${NETWORKS[n].name} (${max} caracteres).`);
  }
  for (const n of nets) if (!(await db.getConnection(env.DB, user.id, n))) throw bad(`Conecte sua conta do ${NETWORKS[n].name} antes de publicar.`);

  // idempotente: o id é <export>:<rede>. Já publicado ou em andamento não reenvia.
  const existing = Object.fromEntries((await db.listPublications(env.DB, user.id, exp.id)).map((p) => [p.network, p]));
  const fresh = nets.filter((n) => !(existing[n] && (existing[n].status === 'success' || BUSY.includes(existing[n].status))));

  const row = await db.ensureUser(env.DB, user);
  const plan = planOf(row.plan);
  const usage = await db.getUsage(env.DB, user.id);
  if (usage.publications + fresh.length > plan.publications) throw new HttpError(402, `Você usou as ${plan.publications} publicações do plano ${plan.name} neste mês.`, 'limit_publications');

  for (const n of fresh) {
    const id = `${exp.id}:${n}`;
    if (existing[n]) await db.patchPublication(env.DB, id, { status: 'queued', caption, error: null, scheduled_at: body.scheduledAt || null });
    else await db.createPublication(env.DB, user.id, { id, exportId: exp.id, network: n, caption, status: 'queued', scheduledAt: body.scheduledAt || null });
  }
  // ponytail: entrega inline via waitUntil. Volume maior pede Cloudflare Queues (+ agendamento real).
  if (!body.scheduledAt) for (const n of fresh) ctx.waitUntil(deliver(env, user.id, `${exp.id}:${n}`));

  return json({ publications: (await db.listPublications(env.DB, user.id, exp.id)).map(pubOut), skipped: nets.filter((n) => !fresh.includes(n)) }, 202);
});

route('POST', '/api/publications/:id/retry', async ({ env, user, params, ctx }) => {
  const pub = await db.getPublication(env.DB, user.id, params.id);
  if (!pub) throw notFound('Publicação não encontrada.');
  if (pub.status === 'success') return json({ publication: pubOut(pub) });
  if (BUSY.includes(pub.status)) throw bad('Essa publicação já está em andamento.');
  await db.patchPublication(env.DB, pub.id, { status: 'queued', error: null });
  ctx.waitUntil(deliver(env, user.id, pub.id));
  return json({ publication: pubOut(await db.getPublication(env.DB, user.id, pub.id)) }, 202);
});

// ---------- pagamento ----------
route('POST', '/api/billing/checkout', async ({ env, user, req }) => {
  const body = requireFields(await readJson(req), ['plan']);
  await db.ensureUser(env.DB, user);
  return json(await createCheckout(env, user, body.plan));
});

route('POST', '/api/hooks/stripe', async ({ env, req }) => {
  const payload = await req.text();
  const event = await verifyStripeSignature(env, req.headers.get('stripe-signature'), payload);
  const change = planFromEvent(env, event);
  if (change) await db.run(env.DB, 'update users set plan = ?, stripe_customer = coalesce(?, stripe_customer) where id = ?', change.plan, change.customer, change.userId);
  return json({ ok: true });
});

const PUBLIC = new Set(['/api/health', '/api/hooks/render', '/api/hooks/stripe']);

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const origin = env.APP_URL || '*';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    try {
      const hit = match(req.method, url.pathname);
      if (!hit) throw notFound('Rota não encontrada.');
      const isCallback = url.pathname.startsWith('/api/social/') && url.pathname.endsWith('/callback');
      const user = PUBLIC.has(url.pathname) || isCallback ? null : await authenticate(req, env);
      return await hit.r.handler({ env, ctx, req, url, params: hit.params, user });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) console.error(e);
      return json({ error: status >= 500 && !(e instanceof HttpError) ? 'Erro interno.' : e.message, code: e.code || 'error' }, status, origin);
    }
  },
};
