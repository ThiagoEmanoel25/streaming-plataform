import { store } from '../store.js';
import { go } from '../router.js';
import { $, on, esc, phoneHTML, applyPhone, fmtDur, empty } from '../ui/components.js';
import { mountPublisher } from '../ui/publisher.js';

export function render(el, params) {
  const s = store.state, pd = s.pubDraft;
  if (!s.exports.length) {
    el.innerHTML = `<header class="page-head"><h1>Publicações</h1></header><div class="card">${empty('send', 'Nenhum Reel exportado', 'Edite e exporte um Reel para publicar nas suas redes.', '<button class="btn" data-go>Ir para Reels</button>')}</div>`;
    on(el, 'click', '[data-go]', () => go('reels', { new: true }));
    return;
  }
  const next = s.exports.find((e) => e.id === (params.exportId || pd.exportId)) || s.exports[0];
  if (pd.exportId !== next.id) { pd.exportId = next.id; pd.statuses = {}; }
  const exp = () => s.exports.find((e) => e.id === pd.exportId);
  const ctx = { exp, ensure: async () => exp() };

  el.innerHTML = `<header class="page-head"><div><h1>Publicações</h1><p class="muted">Escreva a legenda, escolha as redes e publique.</p></div></header>
    <div class="pub"><section class="card pub-prev"><div class="phone-wrap">${phoneHTML()}</div>
      <div><label class="f"><span>Reel exportado</span><select id="sel">${s.exports.map((e) => `<option value="${e.id}" ${e.id === pd.exportId ? 'selected' : ''}>${esc(e.name)} · ${fmtDur(e.duration)}</option>`).join('')}</select></label>
      <small class="muted" id="meta"></small></div></section>
      <div class="pub-form"><div class="pubc"></div></div></div>`;

  const paintMeta = () => {
    const e = exp();
    applyPhone($('[data-phone]', el), { seed: e.seed + (pd.cover ?? 0) * 40, ratio: e.ratio, t: 0.35 });
    $('#meta', el).textContent = `${e.ratio} · ${fmtDur(e.duration)}${pd.cover !== null ? ` · Capa: variação ${pd.cover + 1}` : ''}`;
  };
  on(el, 'change', '#sel', (e, t) => { pd.exportId = t.value; pd.statuses = {}; paintMeta(); mountPublisher(el, ctx); });
  paintMeta();
  mountPublisher(el, ctx);
}
