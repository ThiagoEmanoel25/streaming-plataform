import { store } from './store.js';
import { icon, $, on, progress } from './ui/components.js';
import { auth } from './services/auth.js';
import { PLANS } from './services/api.js';

const NAV = [
  ['home', 'Home', 'home'], ['reels', 'Reels', 'reel'], ['publications', 'Publicações', 'calendar'],
  ['accounts', 'Contas sociais', 'share'], ['analytics', 'Analytics', 'chart'],
  ['strategies', 'Estratégias', 'bulb'], ['settings', 'Configurações', 'gear'],
];
const views = {};
let cleanup = null;
let current = 'home';
let nav = 0;

export const refreshNav = () => paintNav();
export const register = (v) => Object.assign(views, v);

function paintNav() {
  const { user, plan, usage } = store.state, P = PLANS.find((x) => x.id === plan);
  $('#side').innerHTML = `
    <div class="brand"><span class="brand-mark">${icon('film', 18)}</span><b>Home Creators</b></div>
    <nav>${NAV.map(([id, label, ic]) => `<button class="nav-item ${id === current ? 'on' : ''}" data-route="${id}">${icon(ic, 19)}<span>${label}</span></button>`).join('')}</nav>
    <div class="side-b"><div class="plan-card"><div class="row between"><b>${icon('crown', 15)} Plano ${P.name}</b><span class="pro ${plan === 'pro' ? 'on' : ''}">${plan === 'pro' ? 'ATIVO' : 'PRO'}</span></div>
      <small class="muted">${usage.exports} de ${P.exports} exports usados neste mês.</small>${progress(Math.min(100, (usage.exports / P.exports) * 100))}
      <button class="btn ghost sm block" data-route="settings">Ver plano</button></div>
    <div class="me"><span class="avatar">${user.name[0]}</span><div class="grow"><b>${user.name}</b><small>${user.email}</small></div><button class="icon-btn" data-out title="Sair" aria-label="Sair">${icon('logout', 17)}</button></div></div>`;
}

export async function go(route, params = {}) {
  cleanup?.();
  cleanup = null;
  const n = ++nav;
  current = route;
  paintNav();
  // container novo por navegação: views assíncronas que terminam tarde escrevem num nó descartado
  const el = document.createElement('div');
  el.className = 'view';
  $('#view').replaceChildren(el);
  $('#view').scrollTo?.(0, 0);
  const c = await views[route].render(el, params);
  if (n !== nav) c?.(); // usuário já navegou: descarta
  else cleanup = c || null;
}

export function start() {
  on($('#side'), 'click', '[data-route]', (e, t) => go(t.dataset.route));
  on($('#side'), 'click', '[data-out]', async () => { await auth.signOut(); location.reload(); });
  go('home');
}
