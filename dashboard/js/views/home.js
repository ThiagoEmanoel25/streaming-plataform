import { store } from '../store.js';
import { go } from '../router.js';
import { providers } from '../services/social.js';
import { icon, thumb, statusPill, netLogo, ago, esc, on, fmtDur, empty } from '../ui/components.js';

export function render(el) {
  const { user, projects, exports, publications } = store.state;
  const h = new Date().getHours();
  const hi = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const conn = providers.list().filter((p) => p.connected).length;

  const stat = (n, label, ic) => `<div class="card stat">${icon(ic, 20)}<b>${n}</b><span class="muted">${label}</span></div>`;
  const project = (p) => `<div class="card proj">${thumb(p.seed, 'tall')}<div class="proj-b"><b>${esc(p.name)}</b>
      <small class="muted">${fmtDur(p.duration)} · ${p.ratio} · ${ago(p.editedAt)}</small>
      <button class="btn sm" data-continue="${p.id}">Continuar ${icon('arrow', 16)}</button></div></div>`;
  const pubRow = (p) => `<div class="item">${netLogo(p.network, 36)}<div class="grow"><b>${providers.get(p.network).name}</b><small class="muted">${esc(p.reel)} · ${ago(p.at)}</small></div>${statusPill(p.status)}</div>`;
  const expRow = (e) => `<div class="item">${thumb(e.seed, 'mini')}<div class="grow"><b>${esc(e.name)}</b><small class="muted">${fmtDur(e.duration)} · ${e.ratio} · ${ago(e.at)}</small></div><button class="btn ghost sm" data-pub="${e.id}">Publicar</button></div>`;

  el.innerHTML = `
    <header class="page-head"><div><h1>${hi}, ${esc(user.name)}</h1><p class="muted">Transforme seus melhores lances em Reels e publique nas suas redes.</p></div>
      <button class="btn" data-new>${icon('plus', 18)} Criar novo Reel</button></header>
    <div class="grid-4">${stat(projects.length, 'Projetos Reels', 'film')}${stat(exports.length, 'Exportações', 'download')}${stat(publications.length, 'Publicações', 'send')}${stat(`${conn}/${providers.list().length}`, 'Contas conectadas', 'link')}</div>
    <section><div class="sec-h"><h2>Continuar editando</h2></div>
      ${projects.length ? `<div class="grid-3">${projects.slice(0, 3).map(project).join('')}</div>` : `<div class="card">${empty('film', 'Nenhum projeto ainda', 'Crie seu primeiro Reel a partir de um highlight.', '<button class="btn" data-new>Criar novo Reel</button>')}</div>`}</section>
    <div class="grid-2">
      <section><div class="sec-h"><h2>Publicações recentes</h2><button class="link" data-go="publications">Ver publicações</button></div>
        <div class="card list">${publications.length ? publications.slice(0, 4).map(pubRow).join('') : empty('send', 'Nada publicado', 'Suas publicações aparecem aqui.')}</div></section>
      <section><div class="sec-h"><h2>Exportações recentes</h2></div>
        <div class="card list">${exports.length ? exports.slice(0, 4).map(expRow).join('') : empty('download', 'Nenhuma exportação', 'Exporte um Reel para publicar.')}</div></section>
    </div>`;

  on(el, 'click', '[data-new]', () => go('reels', { new: true }));
  on(el, 'click', '[data-continue]', (e, t) => go('reels', { projectId: t.dataset.continue }));
  on(el, 'click', '[data-pub]', (e, t) => go('publications', { exportId: t.dataset.pub }));
  on(el, 'click', '[data-go]', (e, t) => go(t.dataset.go));
}
