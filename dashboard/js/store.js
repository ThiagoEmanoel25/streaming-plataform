// Estado global + persistência local. Em produção: D1/Supabase substituem o localStorage.
import { live, call } from './services/backend.js';

const KEY = 'homecreators.v1';
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();

const PXY = { l: -38, c: 0, r: 38 }, PYY = { t: -42, m: 0, b: 42 };
export const posXY = (c) => ({ x: PXY[c[1]], y: PYY[c[0]] }); // tl..br -> deslocamento do centro (%)

// projetos antigos (cor 60–140, overlays com "pos") -> modelo v2 (cor centrada em 0, overlays x/y)
export function normProject(p) {
  if (p.v >= 2) return p;
  const o = { ...p, v: 2, bright: (p.bright ?? 100) - 100, contrast: (p.contrast ?? 100) - 100, sat: (p.sat ?? 100) - 100, temp: 0 };
  o.overlays = (p.overlays || []).map((x) => (x.pos ? { ...x, ...posXY(x.pos), pos: undefined } : x));
  delete o.fit;
  return o;
}

const seed = () => ({
  user: { name: 'Thiago', email: 'voce@homecreators.app' },
  session: null,
  plan: 'creator',
  usage: { exports: 12, publications: 18, storage: 6.4 },
  prefs: { autosave: true, confirmPublish: false, defaultRatio: '9:16' },
  brand: { name: 'Home Creators', logoSrc: null, x: 16, y: 24, size: 24, opacity: 80 },
  accounts: {
    ig: { connected: true, handle: '@homecreators' },
    yt: { connected: true, handle: 'Home Creators' },
    tt: { connected: false }, x: { connected: false }, th: { connected: false }, fb: { connected: false }, li: { connected: false },
  },
  tracks: [
    { id: 't1', name: 'Estádio Lotado', src: 'Biblioteca', dur: '0:30' },
    { id: 't2', name: 'Beat de Vitória', src: 'Biblioteca', dur: '0:45' },
    { id: 't3', name: 'Torcida Épica', src: 'Upload', dur: '0:38' },
  ],
  projects: [
    { v: 2, id: 'p1', name: 'gol-de-falta', segId: 's1', seed: 130, duration: 14, ratio: '9:16', zoom: 1.2, x: 0, y: -10, bright: 0, sat: 8, contrast: 12, temp: 0, trackId: 't1', editedAt: ago(2),
      overlays: [{ id: 'o1', kind: 'logo', x: -38, y: -42, size: 18, opacity: 1 }, { id: 'o2', kind: 'text', text: 'QUE GOLAÇO! 🔥', x: -14, y: 38, size: 26, opacity: 1 }],
      keyframes: [{ t: 0, zoom: 1, x: 0, y: 0 }, { t: 0.6, zoom: 1.3, x: -4, y: -8 }] },
    { v: 2, id: 'p2', name: 'defesa-incrivel', segId: 's2', seed: 200, duration: 9, ratio: '4:5', zoom: 1, x: 0, y: 0, bright: 0, sat: 0, contrast: 0, temp: 0, trackId: null, overlays: [], keyframes: [], editedAt: ago(26) },
    { v: 2, id: 'p3', name: 'contra-ataque', segId: 's3', seed: 95, duration: 18, ratio: '9:16', zoom: 1.1, x: 5, y: 0, bright: 0, sat: 0, contrast: 0, temp: 0, trackId: 't2', overlays: [], keyframes: [], editedAt: ago(72) },
  ],

  exports: [
    { id: 'e1', name: 'Golaço de falta', duration: 14, ratio: '9:16', seed: 130, at: ago(3) },
    { id: 'e2', name: 'Vitória na final', duration: 22, ratio: '9:16', seed: 20, at: ago(30) },
  ],
  publications: [
    { id: 'e2-ig', reel: 'Vitória na final', network: 'ig', status: 'success', at: ago(28) },
    { id: 'e2-yt', reel: 'Vitória na final', network: 'yt', status: 'processing', at: ago(28) },
    { id: 'e2-tt', reel: 'Vitória na final', network: 'tt', status: 'failed', at: ago(28), msg: 'Conta não conectada no momento do envio.' },
  ],
});

let saved = null;
try { saved = JSON.parse(localStorage.getItem(KEY)); } catch {}
export const state = Object.assign(seed(), saved || {});
// estado de sessão (não persistido)
// marca antiga (pos 'tl'..'br') -> x/y
if (state.brand.pos) { Object.assign(state.brand, posXY(state.brand.pos)); delete state.brand.pos; }
state.savedAt = Date.now();
state.projects = state.projects.map(normProject);
state.pubDraft = { exportId: null, caption: '', selected: { ig: true, yt: true }, statuses: {}, cover: null, intro: null };

const PERSIST = ['session', 'user', 'plan', 'usage', 'prefs', 'brand', 'accounts', 'tracks', 'projects', 'exports', 'publications'];
export const save = () => {
  state.savedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(PERSIST.map((k) => [k, state[k]])))); } catch {}
};
export const set = (patch) => { Object.assign(state, patch); save(); };
export const store = { state, set, save };

// ---------- ponte com o backend ----------
// o app guarda o projeto achatado; a API guarda { name, segmentId, duration, data }
export const toApi = (p) => ({ id: p.id, name: p.name, segmentId: p.segId, duration: p.duration, data: p });
export const fromApi = (r) => ({ ...r.data, id: r.id, name: r.name, segId: r.segmentId, duration: r.duration, editedAt: r.updatedAt });
// a API não guarda a cor da miniatura (ela vem do corte): deriva do id só para o visual
export const seedOf = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
const NET = { instagram: 'ig', youtube: 'yt', tiktok: 'tt', x: 'x', threads: 'th', facebook: 'fb', linkedin: 'li' };
export const toNet = (id) => Object.keys(NET).find((k) => NET[k] === id);
export const fromNet = (id) => NET[id];

export async function hydrate() {
  if (!live()) return;
  const [me, prj, exp, pub, acc] = await Promise.all([
    call('GET', '/me'), call('GET', '/projects'), call('GET', '/exports'), call('GET', '/publications'), call('GET', '/social/accounts'),
  ]);
  state.user = { ...state.user, email: me.user.email || state.user.email };
  state.plan = me.plan.id;
  state.usage = { exports: me.usage.exports, publications: me.usage.publications, storage: me.usage.storage };
  state.projects = prj.projects.map(fromApi).map(normProject);
  state.exports = exp.exports.filter((e) => e.status === 'ready')
    .map((e) => ({ id: e.id, name: e.name, duration: e.duration || 0, ratio: e.ratio || '9:16', seed: seedOf(e.id), at: e.createdAt, url: e.url }));
  const names = Object.fromEntries(exp.exports.map((e) => [e.id, e.name]));
  state.publications = pub.publications.map((p) => ({ id: p.id, reel: names[p.exportId] || 'Reel', network: fromNet(p.network), status: p.status, at: p.updatedAt, msg: p.error || null }));
  state.accounts = Object.fromEntries(acc.accounts.map((a) => [fromNet(a.id), { connected: a.connected, handle: a.handle, needsReauth: a.needsReauth }]));
  save();
}

// o servidor é quem conta: depois de exportar/publicar, o número de lá vale
export async function refreshUsage() {
  if (!live()) return;
  try {
    const me = await call('GET', '/me');
    state.plan = me.plan.id;
    state.usage = { exports: me.usage.exports, publications: me.usage.publications, storage: me.usage.storage };
    save();
  } catch { /* o valor local segue valendo até a próxima sincronia */ }
}
