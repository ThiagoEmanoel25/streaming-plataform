import { store } from '../store.js';
import { api, TEMPLATES, TPL_ICON, BEST_TIMES, COVERS, HOOKS } from '../services/api.js';
import { providers } from '../services/social.js';
import { go } from '../router.js';
import { $, on, esc, icon, netLogo, thumb, cardHead, pageHead, copyText, toast } from '../ui/components.js';
import { brandForm } from '../ui/brand.js';

const LANGS = [['pt', 'Português', '🇧🇷'], ['en', 'Inglês', '🇺🇸'], ['es', 'Espanhol', '🇪🇸']];
const first = (c) => TEMPLATES[c][0];

export function render(el) {
  el.classList.add('wide');
  const pd = store.state.pubDraft;
  let cat = 'Todos', tr = { en: null, es: null }, busy = {}, allNets = false, ptBase = null;

  // o multi-idioma traduz sempre a partir do português: usar a versão em inglês
  // como legenda não pode virar a base da tradução seguinte
  const base = () => ptBase || (pd.caption || '').trim() || first('Gol');
  const rows = () => (cat === 'Todos' ? Object.keys(TEMPLATES).map((c) => [c, first(c)]) : TEMPLATES[cat].map((t) => [cat, t]));

  const timeCard = () => `<section class="card">${cardHead('clock', 'Melhor horário para publicar', 'Com base no desempenho do seu conteúdo')}
    <div class="nets">${(allNets ? providers.list() : providers.list().slice(0, 3)).map((p) => { const b = BEST_TIMES[p.id], sel = pd.times?.[p.id] || b.best;
      return `<div class="netblk"><div class="row gap">${netLogo(p.id, 34)}<b class="grow">${p.name}</b>
        <div class="times">${b.times.map((t) => `<button class="tchip ${t === sel ? 'on' : ''}" data-time="${p.id}|${t}">${t}</button>`).join('')}</div></div>
        <small class="muted">${esc(b.hint)}</small></div>`; }).join('')}</div>
    <button class="link more" data-more>${allNets ? 'Ver menos' : `Ver as outras ${providers.list().length - 3} redes`}</button>
    <small class="muted foot">Recomendação a partir de dados de exemplo. Não garante alcance.</small></section>`;

  const tplCard = () => `<section class="card">${cardHead('doc', 'Templates de legenda', 'Legendas prontas para aumentar o engajamento')}
    <div class="chips">${['Todos', ...Object.keys(TEMPLATES)].map((c) => `<button class="chip ${c === cat ? 'on' : ''}" data-cat="${esc(c)}">${c}</button>`).join('')}</div>
    <div class="tpls">${rows().map(([c, t]) => `<div class="tpl"><span class="ch-i sm">${icon(TPL_ICON[c], 16)}</span>
      <div class="grow"><b>${c}</b><p>${esc(t).replace(/\n/g, '<br>')}</p></div>
      <button class="icon-btn" data-copy="${esc(t)}" aria-label="Copiar legenda">${icon('copy', 16)}</button>
      <button class="btn ${pd.caption === t ? 'ghost' : ''} sm" data-use="${esc(t)}">${pd.caption === t ? 'Em uso' : 'Usar legenda'}</button></div>`).join('')}</div></section>`;

  const coverCard = () => `<section class="card">${cardHead('image', 'Capas', 'Modelos de capa para atrair mais cliques')}
    <div class="vgrid">${COVERS.map((c) => `<div><div class="vcard">${thumb(c.seed, 'fill')}<span class="vtext">${esc(c.text)}</span><span class="vlogo">${esc(store.state.brand.name)}</span></div>
      <button class="btn ${pd.cover === c.id ? '' : 'ghost'} sm block" data-cover="${c.id}">${pd.cover === c.id ? 'Capa atual' : 'Usar esta capa'}</button></div>`).join('')}</div></section>`;

  const hookCard = () => `<section class="card">${cardHead('bolt', 'Primeiros 3 segundos', 'Ganchos prontos para prender a atenção')}
    <div class="vgrid">${HOOKS.map((h) => `<div><div class="vcard">${thumb(h.seed, 'fill')}<span class="vtext sm">${esc(h.text)}</span><span class="vdur">${icon('play', 10)} 00:03</span></div>
      <button class="btn ${pd.intro === h.id ? '' : 'ghost'} sm block" data-intro="${h.id}">${pd.intro === h.id ? 'Gancho atual' : 'Usar este gancho'}</button></div>`).join('')}</div></section>`;

  const langCard = () => `<section class="card">${cardHead('globe', 'Multi-idioma', 'Traduza suas legendas e alcance mais pessoas')}
    <div class="langs">${LANGS.map(([k, name, flag]) => {
      const text = k === 'pt' ? base() : tr[k];
      return `<div class="lang"><div class="row gap"><span class="flag">${flag}</span><b>${name}</b>
        ${k === 'pt' ? '<span class="tag">Original</span>' : `<button class="tag blue" data-tr="${k}" ${busy[k] ? 'disabled' : ''}>${busy[k] ? '<i class="spin"></i> Traduzindo' : 'Traduzir'}</button>`}
        <span class="sp"></span>${text ? `<button class="icon-btn" data-copy="${esc(text)}" aria-label="Copiar">${icon('copy', 15)}</button>` : ''}</div>
        <p>${text ? esc(text).replace(/\n/g, '<br>') : '<span class="muted">Toque em Traduzir para gerar esta versão.</span>'}</p>
        ${text && k !== 'pt' ? `<button class="btn ${pd.caption === text ? 'ghost' : ''} sm" data-use="${esc(text)}">${pd.caption === text ? 'Em uso' : 'Usar legenda'}</button>` : ''}</div>`;
    }).join('')}</div></section>`;

  const brandCard = () => `<section class="card">${cardHead('shield', 'Sua marca', 'Adicione seu logo nos vídeos automaticamente')}<div id="bfb"></div></section>`;

  function paint() {
    el.innerHTML = `${pageHead({
      crumb: 'Estratégias', title: 'Estratégias', savedAt: store.state.savedAt,
      sub: 'Recursos recomendados e ações práticas para fazer seu conteúdo crescer.',
      actions: `<button class="btn ghost" data-save>${icon('save', 17)} Salvar projeto</button><button class="btn" data-export>${icon('download', 17)} Exportar</button>`,
    })}
      <div class="scols"><div class="scol">${timeCard()}${hookCard()}</div><div class="scol">${tplCard()}${langCard()}</div><div class="scol">${coverCard()}${brandCard()}</div></div>`;
    brandForm($('#bfb', el));
  }
  paint();

  on(el, 'click', '[data-more]', () => { allNets = !allNets; paint(); });
  on(el, 'click', '[data-cat]', (e, t) => { cat = t.dataset.cat; paint(); });
  on(el, 'click', '[data-copy]', (e, t) => copyText(t.dataset.copy));
  on(el, 'click', '[data-use]', (e, t) => {
    pd.caption = t.dataset.use;
    if (t.closest('.tpls')) { ptBase = t.dataset.use; tr = { en: null, es: null }; } // novo original -> traduções velhas não valem mais
    toast('Legenda pronta em Publicações'); paint();
  });
  on(el, 'click', '[data-cover]', (e, t) => { pd.cover = +t.dataset.cover; toast('Capa selecionada'); paint(); });
  on(el, 'click', '[data-intro]', (e, t) => { pd.intro = +t.dataset.intro; toast('Gancho selecionado'); paint(); });
  on(el, 'click', '[data-time]', (e, t) => {
    const [net, time] = t.dataset.time.split('|');
    (pd.times ||= {})[net] = time;
    paint();
  });
  on(el, 'click', '[data-tr]', async (e, t) => {
    const k = t.dataset.tr;
    busy[k] = true; paint();
    try { tr[k] = await api.translate(base(), k); } catch { toast('Não foi possível traduzir agora.', 'err'); }
    busy[k] = false; paint();
  });
  on(el, 'click', '[data-save]', () => { store.save(); toast('Escolhas salvas'); paint(); });
  on(el, 'click', '[data-export]', () => go('reels'));
  on(el, 'click', '[data-back]', () => go('home'));
}
