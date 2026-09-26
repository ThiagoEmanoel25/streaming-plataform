import { api } from '../services/api.js';
import { providers } from '../services/social.js';
import { go } from '../router.js';
import { icon, thumb, netLogo, fmtNum, esc, skeleton, empty, on } from '../ui/components.js';

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function chart(series) {
  const W = 640, H = 180, max = Math.max(...series) * 1.1, x = (i) => 20 + (i * (W - 40)) / (series.length - 1), y = (v) => H - 24 - (v / max) * (H - 44);
  const pts = series.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Visualizações nos últimos 7 dias"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a84ff" stop-opacity=".35"/><stop offset="1" stop-color="#0a84ff" stop-opacity="0"/></linearGradient></defs>
    <polygon points="${x(0)},${H - 24} ${pts} ${x(series.length - 1)},${H - 24}" fill="url(#g)"/><polyline points="${pts}" fill="none" stroke="#0a84ff" stroke-width="2.5" stroke-linejoin="round"/>
    ${series.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="#0a84ff"/><text x="${x(i)}" y="${H - 6}" text-anchor="middle">${DAYS[i]}</text>`).join('')}</svg>`;
}

export async function render(el) {
  el.innerHTML = `<header class="page-head"><h1>Analytics</h1></header><div class="grid-4">${skeleton(4, 'skel-stat')}</div>`;
  let a;
  try { a = await api.analytics(); } catch {
    el.innerHTML = `<div class="card">${empty('alert', 'Não foi possível carregar os números', 'Tente novamente em instantes.', '<button class="btn" data-r>Tentar novamente</button>')}</div>`;
    on(el, 'click', '[data-r]', () => go('analytics'));
    return;
  }
  const stat = (n, l, ic) => `<div class="card stat">${icon(ic, 20)}<b>${n}</b><span class="muted">${l}</span></div>`;
  el.innerHTML = `<header class="page-head"><div><h1>Analytics</h1><p class="muted">Dados de exemplo.</p></div></header>
    <div class="grid-4">${stat(a.totals.posts, 'Publicações', 'send')}${stat(fmtNum(a.totals.views), 'Visualizações', 'eye')}${stat(a.totals.engagement + '%', 'Engajamento', 'heart')}${stat(providers.get(a.totals.top).name, 'Mais visualizações', 'chart')}</div>
    <section class="card"><div class="sec-h"><h2>Últimos 7 dias</h2><small class="muted">Visualizações</small></div>${chart(a.series)}</section>
    <section><div class="sec-h"><h2>Posts</h2></div><div class="list">${a.posts.map((p) => `<div class="card post">${thumb(p.seed, 'mini')}<div class="grow"><b>${esc(p.title)}</b><small class="muted row gap-s">${netLogo(p.net, 16)} ${providers.get(p.net).name} · ${new Date(p.at).toLocaleDateString('pt-BR')}</small></div>
      <span class="m">${icon('eye', 16)}${fmtNum(p.views)}</span><span class="m">${icon('heart', 16)}${fmtNum(p.likes)}</span><span class="m">${icon('msg', 16)}${p.comments}</span></div>`).join('')}</div></section>`;
}
