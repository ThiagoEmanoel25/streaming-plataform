// Publicador reutilizável: legenda + redes + publicar/agendar + status por rede.
// Usado no painel "Publicar" do editor Reels e na tela Publicações.
// ctx = { exp(): export atual ou null, ensure(): Promise<export|null> (exporta se ainda não houver) }
import { store, refreshUsage } from '../store.js';
import { go } from '../router.js';
import { providers } from '../services/social.js';
import { NET_STRATEGY, PLANS } from '../services/api.js';
import { $, on, esc, icon, netLogo, statusPill, pill, toggle, openModal, closeModal, confirmDialog, toast } from './components.js';
import { connectWizard } from './wizard.js';

const BUSY = ['queued', 'processing'];
const pd = () => store.state.pubDraft;

export function mountPublisher(root, ctx) {
  root._pctx = ctx; // listeners são registrados uma vez por container; o contexto pode mudar
  if (!root._pbound) { root._pbound = true; bind(root); }
  paint(root);
}

const selected = () => providers.list().filter((p) => p.connected && pd().selected[p.id]);
const limit = () => Math.min(...selected().map((p) => p.maxChars), 2200);
const busy = () => Object.values(pd().statuses).some((x) => BUSY.includes(x.status));

function paint(root) {
  const c = $('.pubc', root);
  if (!c) return;
  c.innerHTML = `<section class="card pbs"><h3>Legenda</h3><div class="capbox"><textarea class="p-cap" rows="5" placeholder="Escreva a legenda da publicação…"></textarea><span class="p-cnt"></span></div></section>
    <section class="card pbs"><h3>Publicar em</h3><div class="p-nets"></div><button class="btn ghost sm block" data-go="accounts">${icon('gear', 16)} Gerenciar contas</button></section>
    <div class="pb-acts p-acts"></div>`;
  $('.p-cap', c).value = pd().caption;
  paintCount(root); paintNets(root); paintActs(root);
}
function paintCount(root) {
  const c = $('.p-cnt', root); if (!c) return;
  const n = pd().caption.length, l = limit();
  c.textContent = `${n}/${l}`; c.className = 'p-cnt' + (n > l ? ' over' : '');
}
function paintNets(root) {
  const box = $('.p-nets', root); if (!box) return;
  box.innerHTML = providers.list().map((p) => {
    const st = pd().statuses[p.id], a = p.account;
    const right = st
      ? `<div class="st">${statusPill(st.status)}${st.msg ? `<small class="${st.status === 'failed' ? 'err-t' : 'muted'}">${esc(st.msg)}</small>` : ''}${st.status === 'failed' ? `<button class="btn ghost sm" data-retry="${p.id}">${icon('refresh', 14)} Tentar novamente</button>` : ''}</div>`
      : p.connected ? `${toggle(`data-net="${p.id}"`, !!pd().selected[p.id])}${pill('Conectado', 'ok')}` : `<button class="btn ghost sm" data-conn="${p.id}">Conectar</button>`;
    return `<div class="net-row">${netLogo(p.id, 36)}<div class="grow"><b>${p.name}</b><small class="${p.connected ? 'muted' : 'muted'}">${p.connected ? esc(a.handle) : 'Não conectado'}</small></div>${right}</div>`;
  }).join('');
}
function paintActs(root) {
  const box = $('.p-acts', root); if (!box) return;
  const done = Object.keys(pd().statuses).length && !busy();
  box.innerHTML = done
    ? `<button class="btn ghost block" data-reset>Nova publicação</button>`
    : `<button class="btn block" data-now ${busy() ? 'disabled' : ''}>${icon('send', 16)} Publicar agora</button><button class="btn ghost block" data-sched ${busy() ? 'disabled' : ''}>${icon('calendar', 16)} Agendar publicação</button>`;
}
const repaint = (root) => { paintNets(root); paintActs(root); };

// histórico compartilhado com a Home
function upsert(e, net, status, msg) {
  const id = `${e.id}-${net}`, l = store.state.publications, i = l.findIndex((x) => x.id === id);
  if (i >= 0) l.splice(i, 1);
  l.unshift({ id, reel: e.name, network: net, status, at: new Date().toISOString(), msg }); store.save();
}
function setStatus(root, e, net, status, msg) {
  pd().statuses[net] = { status, msg };
  upsert(e, net, status, msg);
  if (status === 'success') { store.state.usage.publications++; store.save(); refreshUsage(); }
  repaint(root);
}
async function run(root, e, ids) {
  await Promise.all(ids.map(async (id) => {
    setStatus(root, e, id, 'queued');
    try { await providers.get(id).publish({ exportId: e.id, caption: pd().caption, cover: pd().cover }, (st, msg) => setStatus(root, e, id, st, msg)); }
    catch (err) { setStatus(root, e, id, 'failed', err.message); }
  }));
}

async function publishNow(root) {
  const s = store.state, c = root._pctx;
  if (s.usage.publications >= PLANS.find((p) => p.id === s.plan).publications) return toast('Limite de publicações do plano atingido.', 'err');
  if (!selected().length) return toast('Escolha ao menos uma rede conectada.', 'err');
  if (!pd().caption.trim()) return toast('Escreva uma legenda antes de publicar.', 'err');
  if (pd().caption.length > limit()) return toast('A legenda passou do limite de uma das redes.', 'err');
  const e = await c.ensure(); // exporta antes, se ainda não houver export
  if (!e) return;
  if (pd().exportId !== e.id) { pd().exportId = e.id; pd().statuses = {}; }
  // nunca republica onde já houve sucesso; ignora o que está em andamento
  const ids = selected().map((p) => p.id).filter((id) => !['success', ...BUSY].includes(pd().statuses[id]?.status));
  if (!ids.length) return toast('Já publicado nas redes selecionadas.');
  if (s.prefs.confirmPublish && !(await confirmDialog({ title: 'Publicar agora?', text: `O Reel será enviado para ${ids.length} rede(s).`, ok: 'Publicar' }))) return;
  run(root, e, ids);
}

function openSchedule(root) {
  const c = root._pctx;
  if (!selected().length) return toast('Escolha ao menos uma rede conectada.', 'err');
  if (!pd().caption.trim()) return toast('Escreva uma legenda antes de agendar.', 'err');
  const first = selected()[0], best = NET_STRATEGY[first.id], today = new Date().toISOString().slice(0, 10);
  const m = openModal(`<h3>Agendar publicação</h3><p class="muted">Sugestão para ${first.name}: <b>${best}</b> (recomendação, não garantia).</p>
    <div class="row gap"><label class="f grow"><span>Data</span><input type="date" id="sd" min="${today}" value="${today}"></label><label class="f grow"><span>Hora</span><input type="time" id="st" value="${best}"></label></div>
    <div class="row end gap"><button class="btn ghost" data-x>Cancelar</button><button class="btn" data-ok>Agendar</button></div>`);
  on(m, 'click', '[data-x]', closeModal);
  on(m, 'click', '[data-ok]', async (ev, b) => {
    const d = $('#sd', m).value, t = $('#st', m).value;
    if (!d || !t) return;
    b.disabled = true;
    const e = await c.ensure();
    if (!e) { closeModal(); return; }
    if (pd().exportId !== e.id) { pd().exportId = e.id; pd().statuses = {}; }
    const label = `Agendado para ${new Date(`${d}T${t}`).toLocaleDateString('pt-BR')} às ${t}`, ids = selected().map((p) => p.id);
    await Promise.all(ids.map((id) => providers.get(id).schedule({ exportId: e.id, caption: pd().caption }, new Date(`${d}T${t}`))));
    ids.forEach((id) => { pd().statuses[id] = { status: 'queued', msg: label }; upsert(e, id, 'queued', label); });
    closeModal(); repaint(root); toast('Publicação agendada');
  });
}

function bind(root) {
  on(root, 'input', '.p-cap', (e, t) => { pd().caption = t.value; paintCount(root); });
  on(root, 'change', '[data-net]', (e, t) => { pd().selected[t.dataset.net] = t.checked; paintCount(root); });
  on(root, 'click', '[data-conn]', (e, t) => connectWizard(t.dataset.conn, () => { pd().selected[t.dataset.conn] = true; paintCount(root); repaint(root); }));
  on(root, 'click', '[data-retry]', (e, t) => {
    const id = t.dataset.retry, ex = root._pctx.exp(); if (!ex) return;
    setStatus(root, ex, id, 'queued');
    providers.get(id).publish({ exportId: ex.id, caption: pd().caption }, (st, m) => setStatus(root, ex, id, st, m)).catch((err) => setStatus(root, ex, id, 'failed', err.message));
  });
  on(root, 'click', '[data-now]', () => publishNow(root));
  on(root, 'click', '[data-sched]', () => openSchedule(root));
  on(root, 'click', '[data-reset]', () => { pd().statuses = {}; repaint(root); });
  on(root, 'click', '[data-go]', (e, t) => go(t.dataset.go));
}
