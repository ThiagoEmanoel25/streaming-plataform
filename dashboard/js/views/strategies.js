import { store } from '../store.js';
import { api, TEMPLATES, NET_STRATEGY } from '../services/api.js';
import { providers } from '../services/social.js';
import { $, on, esc, icon, netLogo, thumb, pill, toast } from '../ui/components.js';
import { brandForm } from '../ui/brand.js';

export function render(el) {
  const pd = store.state.pubDraft;
  let cat = Object.keys(TEMPLATES)[0], lang = 'pt', tr = '', variants = null, covers = null, busy = {};

  const timeCard = () => `<section class="card"><div class="row between"><h3>Melhor horário para publicar</h3>${pill('Recomendação', 'p')}</div>
    <div class="list tight">${providers.list().map((p) => `<div class="item">${netLogo(p.id, 30)}<b class="grow">${p.name}</b><span class="time">${NET_STRATEGY[p.id]}</span></div>`).join('')}</div>
    <small class="muted">Sugestão baseada em dados de exemplo. Não garante alcance.</small></section>`;
  const tplCard = () => `<section class="card"><h3>Templates de legenda</h3><div class="chips">${Object.keys(TEMPLATES).map((c) => `<button class="chip ${c === cat ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('')}</div>
    <div class="list tight">${TEMPLATES[cat].map((t) => `<div class="item"><span class="grow">${esc(t)}</span><button class="btn ${pd.caption === t ? 'ghost' : ''} sm" data-use="${esc(t)}">${pd.caption === t ? 'Em uso' : 'Usar legenda'}</button></div>`).join('')}</div></section>`;
  const coverCard = () => `<section class="card"><h3>Capas</h3>${covers ? `<div class="grid-3 tight">${covers.map((c) => `<div class="cover">${thumb(c.seed, 'tall')}<button class="btn ${pd.cover === c.id ? 'ghost' : ''} sm block" data-cover="${c.id}">${pd.cover === c.id ? 'Selecionada' : 'Usar esta capa'}</button></div>`).join('')}</div>`
    : `<p class="muted">Gere 3 variações de capa para o seu vídeo.</p><button class="btn ghost sm" data-gen="cover" ${busy.cover ? 'disabled' : ''}>${busy.cover ? '<i class="spin"></i> Gerando…' : 'Gerar variações de capa'}</button>`}</section>`;
  const introCard = () => `<section class="card"><h3>Primeiros segundos</h3>${variants ? `<div class="list tight">${variants.map((v) => `<div class="item">${thumb(v.seed, 'mini')}<b class="grow">${v.label}</b><button class="btn ${pd.intro === v.id ? 'ghost' : ''} sm" data-intro="${v.id}">${pd.intro === v.id ? 'Selecionada' : 'Usar'}</button></div>`).join('')}</div>`
    : `<p class="muted">Crie alternativas para prender a atenção nos primeiros 3 segundos.</p><button class="btn ghost sm" data-gen="intro" ${busy.intro ? 'disabled' : ''}>${busy.intro ? '<i class="spin"></i> Criando…' : 'Criar variação dos primeiros 3 segundos'}</button>`}</section>`;
  const langCard = () => `<section class="card"><h3>Multi-idioma</h3><textarea id="src" rows="3" placeholder="Legenda em português">${esc(pd.caption || TEMPLATES.Gol[0])}</textarea>
    <div class="seg">${[['pt', 'Português'], ['en', 'Inglês'], ['es', 'Espanhol']].map(([k, l]) => `<button class="${lang === k ? 'on' : ''}" data-lang="${k}">${l}</button>`).join('')}</div>
    <button class="btn ghost sm" data-tr ${busy.tr ? 'disabled' : ''}>${busy.tr ? '<i class="spin"></i> Traduzindo…' : 'Traduzir legenda'}</button>
    ${tr ? `<div class="result"><p>${esc(tr)}</p><button class="btn sm" data-usetr>Usar legenda</button></div>` : ''}</section>`;

  const paint = () => {
    el.innerHTML = `<header class="page-head"><div><h1>Estratégias</h1><p class="muted">Recursos para publicar melhor. Tudo simulado nesta versão.</p></div></header>
      <div class="grid-2 top">${timeCard()}${tplCard()}${coverCard()}${introCard()}${langCard()}<section class="card" id="bf"><h3>Marca</h3><div id="bfb"></div></section></div>`;
    brandForm($('#bfb', el));
  };
  paint();

  // brandForm registra seus próprios eventos; aqui só o restante (delegado no el, sem recriar a cada paint)
  on(el, 'click', '[data-cat]', (e, t) => { cat = t.dataset.cat; paint(); });
  on(el, 'click', '[data-use]', (e, t) => { pd.caption = t.dataset.use; toast('Legenda pronta em Publicações'); paint(); });
  on(el, 'click', '[data-cover]', (e, t) => { pd.cover = +t.dataset.cover; toast('Capa selecionada'); paint(); });
  on(el, 'click', '[data-intro]', (e, t) => { pd.intro = +t.dataset.intro; toast('Variação selecionada'); paint(); });
  on(el, 'click', '[data-gen]', async (e, t) => { const k = t.dataset.gen; busy[k] = true; paint(); const r = await api.variants(k); busy[k] = false; if (k === 'cover') covers = r; else variants = r; paint(); });
  on(el, 'click', '[data-lang]', (e, t) => { lang = t.dataset.lang; tr = ''; paint(); });
  on(el, 'click', '[data-tr]', async () => { const src = $('#src', el).value.trim(); if (!src) return toast('Escreva uma legenda para traduzir.', 'err'); busy.tr = true; paint(); tr = await api.translate(src, lang); busy.tr = false; paint(); });
  on(el, 'click', '[data-usetr]', () => { pd.caption = tr; toast('Legenda pronta em Publicações'); paint(); });
}
