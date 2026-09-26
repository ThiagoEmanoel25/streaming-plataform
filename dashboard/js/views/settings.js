import { store } from '../store.js';
import { api, PLANS } from '../services/api.js';
import { $, on, esc, icon, toggle, progress, pill, confirmDialog, toast } from '../ui/components.js';
import { brandForm } from '../ui/brand.js';

export function render(el) {
  const s = store.state;
  let tab = 'perfil';
  const meter = (label, used, max, unit = '') => `<div class="meter"><div class="row between"><span>${label}</span><small class="muted">${used}${unit} / ${max}${unit}</small></div>${progress(Math.min(100, (used / max) * 100))}</div>`;

  const views = {
    perfil: () => `<div class="card form"><div class="row gap"><span class="avatar lg">${esc(s.user.name[0])}</span><div><b>${esc(s.user.name)}</b><small class="muted block">${esc(s.user.email)}</small></div></div>
      <label class="f"><span>Nome</span><input type="text" id="pn" value="${esc(s.user.name)}"></label><label class="f"><span>E-mail</span><input type="text" id="pe" value="${esc(s.user.email)}"></label>
      <button class="btn" data-save>Salvar perfil</button></div>`,
    plano: () => { const cur = PLANS.find((p) => p.id === s.plan); return `<div class="card form"><h3>Uso do plano ${cur.name}</h3>${meter('Exportações', s.usage.exports, cur.exports)}${meter('Publicações', s.usage.publications, cur.publications)}${meter('Storage', s.usage.storage, cur.storage, ' GB')}</div>
      <div class="grid-3">${PLANS.map((p) => `<div class="card plan ${p.id === s.plan ? 'on' : ''}"><div class="row between"><h3>${p.name}</h3>${p.id === s.plan ? pill('Atual', 'ok') : ''}</div><div class="price">${p.price}<small class="muted">/mês</small></div>
        <ul><li>${p.exports} exportações</li><li>${p.publications} publicações</li><li>${p.storage} GB de storage</li>${p.perks.map((k) => `<li>${k}</li>`).join('')}</ul>
        <button class="btn ${p.id === s.plan ? 'ghost' : ''} block" data-plan="${p.id}" ${p.id === s.plan ? 'disabled' : ''}>${p.id === s.plan ? 'Plano atual' : 'Escolher plano'}</button></div>`).join('')}</div>
      <small class="muted">Upgrade simulado. Em produção o pagamento é feito no Stripe.</small>`; },
    prefs: () => `<div class="card list">
      <div class="item"><div class="grow"><b>Salvar automaticamente ao sair do editor</b><small class="muted">Suas alterações não se perdem.</small></div>${toggle('data-p="autosave"', s.prefs.autosave)}</div>
      <div class="item"><div class="grow"><b>Confirmar antes de publicar</b><small class="muted">Pede uma confirmação antes de enviar às redes.</small></div>${toggle('data-p="confirmPublish"', s.prefs.confirmPublish)}</div>
      <div class="item"><div class="grow"><b>Formato padrão dos novos Reels</b></div><div class="seg">${['9:16', '4:5'].map((r) => `<button class="${s.prefs.defaultRatio === r ? 'on' : ''}" data-ratio="${r}">${r}</button>`).join('')}</div></div></div>`,
    marca: () => `<div class="card"><div id="bfb"></div></div>`,
  };
  const paint = () => {
    el.innerHTML = `<header class="page-head"><h1>Configurações</h1></header>
      <div class="tabs big">${[['perfil', 'Perfil'], ['plano', 'Plano'], ['prefs', 'Preferências'], ['marca', 'Marca']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="set-body">${views[tab]()}</div>`;
    if (tab === 'marca') brandForm($('#bfb', el));
  };
  paint();
  on(el, 'click', '[data-tab]', (e, t) => { tab = t.dataset.tab; paint(); });
  on(el, 'click', '[data-save]', () => { s.user.name = $('#pn', el).value.trim() || s.user.name; s.user.email = $('#pe', el).value.trim(); store.save(); toast('Perfil salvo'); });
  on(el, 'change', '[data-p]', (e, t) => { s.prefs[t.dataset.p] = t.checked; store.save(); });
  on(el, 'click', '[data-ratio]', (e, t) => { s.prefs.defaultRatio = t.dataset.ratio; store.save(); paint(); });
  on(el, 'click', '[data-plan]', async (e, t) => {
    const p = PLANS.find((x) => x.id === t.dataset.plan);
    if (!(await confirmDialog({ title: `Mudar para ${p.name}?`, text: `${p.price}/mês. Simulação: nenhuma cobrança é feita.`, ok: 'Confirmar' }))) return;
    t.disabled = true; t.textContent = 'Processando…';
    await api.upgrade(p.id); s.plan = p.id; store.save(); toast(`Plano ${p.name} ativo`); paint();
  });
}
