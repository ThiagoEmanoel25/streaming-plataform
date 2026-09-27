import { store, posXY } from '../store.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// delegação de eventos: sobrevive a re-render do conteúdo interno
export const on = (root, type, sel, fn) => root.addEventListener(type, (e) => { const t = e.target.closest(sel); if (t && root.contains(t)) fn(e, t); });

export const fmtDur = (s) => `0:${String(s).padStart(2, '0')}`;
export const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;
export const fillRange = (i) => i.style.setProperty('--p', `${((i.value - i.min) / (i.max - i.min)) * 100}%`);
export const fmtNum = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + ' mil' : String(n));
export function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 2) return 'agora'; if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24); return d === 1 ? 'ontem' : `há ${d} dias`;
}

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 3v18M16 3v18M3 8h5M3 16h5M16 8h5M16 16h5"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12l5 5L20 7"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
  play: '<path d="M7 4l13 8-13 8z"/>', pause: '<path d="M8 4v16M16 4v16"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>', image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>', download: '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.1"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  heart: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z"/>',
  msg: '<path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-5.5A8 8 0 1 1 21 12z"/>',
  chev: '<path d="M9 6l6 6-6 6"/>', back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  dots: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  cloud: '<path d="M7 19a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 9.5a3.5 3.5 0 0 1 .4 7z"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', shield: '<path d="M12 3l8 3v6c0 4.5-3.2 7.9-8 9-4.8-1.1-8-4.5-8-9V6z"/>',
  crown: '<path d="M3 8l4 3 5-6 5 6 4-3-2 11H5z"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.3.3.5.7.5 1.1h6c0-.4.2-.8.5-1.1A6 6 0 0 0 12 3z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  reel: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M10 8.5l6 3.5-6 3.5z"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5l3.5 2.5-1.3 4.2h-4.4L8.5 10z"/><path d="M12 3v4.5M20.5 10l-4.9 3.5M17.5 20.5 14 14.2M6.5 20.5 10 14.2M3.5 10l4.9 3.5"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 20h6M12 14v6"/>',
  clapper: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 8l2.5-4 4 2.5M9.5 6.5 14 4l4 2.5M18 6.5 21 5v3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>', mute: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M16 9l5 6M21 9l-5 6"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', chevup: '<path d="M6 15l6-6 6 6"/>', chevdown: '<path d="M6 9l6 6 6-6"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>', drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  thermo: '<path d="M14 14V5a2 2 0 0 0-4 0v9a4 4 0 1 0 4 0z"/>', prev: '<path d="M15 6l-6 6 6 6"/>', next: '<path d="M9 6l6 6-6 6"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>', plusd: '<path d="M12 3l9 9-9 9-9-9z"/><path d="M12 9v6M9 12h6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>', key: '<path d="M12 3l9 9-9 9-9-9z"/>',
};
export const icon = (n, s = 20) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

// Glifos simplificados (não são as marcas oficiais). Em prod: trocar pelos SVGs oficiais licenciados.
const LOGO = {
  ig: ['linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)', '<rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="#fff" stroke-width="2"/><circle cx="17" cy="7" r="1.2" fill="#fff"/>'],
  yt: ['#ff0033', '<rect x="3" y="6" width="18" height="12" rx="4" fill="#fff"/><path d="M10 9.5v5l4.5-2.5z" fill="#ff0033"/>'],
  tt: ['#111', '<path d="M14 4v10a3.5 3.5 0 1 1-3.5-3.5M14 4c.5 2.6 2 4 4.5 4.2" fill="none" stroke="#25f4ee" stroke-width="2.4" transform="translate(-.8 .6)"/><path d="M14 4v10a3.5 3.5 0 1 1-3.5-3.5M14 4c.5 2.6 2 4 4.5 4.2" fill="none" stroke="#fe2c55" stroke-width="2.4" transform="translate(.8 -.6)"/><path d="M14 4v10a3.5 3.5 0 1 1-3.5-3.5M14 4c.5 2.6 2 4 4.5 4.2" fill="none" stroke="#fff" stroke-width="2.2"/>'],
  x: ['#000', '<path d="M5 5l14 14M19 5L5 19" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>'],
  th: ['#000', '<path d="M16.5 12c0 3-2 5-4.5 5S7 15 7 12s2-5 5-5 4.5 2 4.5 5c0 1.5-.8 2.3-1.8 2.3S13 13.5 13 12.3V9" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.8" fill="#fff"/>'],
  fb: ['#1877f2', '<path d="M14 21v-7h2.5l.5-3h-3V9.5c0-.9.4-1.5 1.6-1.5H17V5.3A16 16 0 0 0 14.8 5C12.6 5 11 6.3 11 8.8V11H8.5v3H11v7z" fill="#fff"/>'],
  li: ['#0a66c2', '<rect x="5" y="9" width="3" height="10" fill="#fff"/><circle cx="6.5" cy="6" r="1.7" fill="#fff"/><path d="M11 9h3v1.5c.6-1 1.6-1.7 3-1.7 2.5 0 3 1.7 3 4V19h-3v-5c0-1.2-.3-2-1.4-2S14 12.8 14 14v5h-3z" fill="#fff"/>'],
};
export const netLogo = (id, size = 40) => `<span class="netlogo" style="width:${size}px;height:${size}px;background:${LOGO[id][0]}"><svg viewBox="0 0 24 24" width="${size * 0.62}" height="${size * 0.62}">${LOGO[id][1]}</svg></span>`;

const STATUS = { queued: ['Na fila', 'q'], processing: ['Processando', 'p'], success: ['Publicado', 'ok'], failed: ['Falhou', 'err'] };
export const statusPill = (s) => `<span class="pill ${STATUS[s][1]}">${s === 'processing' ? '<i class="spin"></i>' : ''}${STATUS[s][0]}</span>`;
export const pill = (text, cls = 'mut') => `<span class="pill ${cls}">${text}</span>`;

export const cardHead = (ic, title, sub) =>
  `<div class="ch"><span class="ch-i">${icon(ic, 18)}</span><div class="grow"><b>${esc(title)}</b>${sub ? `<small class="muted">${esc(sub)}</small>` : ''}</div></div>`;

// cabeçalho comum das telas: voltar, título, subtítulo, "salvo há X" e ações
export const pageHead = ({ crumb, title, sub, savedAt, actions = '' }) => `<header class="ph">
  <button class="crumb-b" data-back>${icon('back', 17)}<span>${esc(crumb || title)}</span></button>
  <div class="ph-row"><div class="grow"><h1>${esc(title)}</h1>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div>
    <div class="ph-act"><button class="icon-btn" data-pmenu aria-label="Mais opções">${icon('dots', 18)}</button>
    ${savedAt ? `<span class="saved">${icon('cloud', 16)} Salvo ${ago(savedAt)}</span>` : ''}${actions}</div></div></header>`;

export const toggle = (attrs = '', checked = false, disabled = false) => `<label class="tg"><input type="checkbox" ${attrs} ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><i></i></label>`;
export const progress = (pct) => `<div class="bar"><div style="width:${pct}%"></div></div>`;
export const empty = (ic, title, text, btn = '') => `<div class="empty">${icon(ic, 30)}<b>${esc(title)}</b><p class="muted">${esc(text)}</p>${btn}</div>`;
export const skeleton = (n = 3, cls = 'skel-card') => Array.from({ length: n }, () => `<div class="skel ${cls}"></div>`).join('');

// thumbnail procedural (cor pela "seed"); em prod: frame extraído do vídeo (R2/B2)
export const thumb = (seed, cls = '') => `<div class="thumb ${cls}" style="--h:${seed}"><svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><rect x="8" y="10" width="84" height="80" rx="2" fill="none" stroke="rgba(255,255,255,.3)"/><path d="M8 50h84" stroke="rgba(255,255,255,.3)"/><circle cx="50" cy="50" r="9" fill="none" stroke="rgba(255,255,255,.3)"/><circle cx="${22 + (seed % 55)}" cy="${30 + (seed % 38)}" r="3.4" fill="#fff"/></svg></div>`;

// ---- preview do vídeo (usado em Reels, Publicações e Marca) ----
const initials = (n) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
export const logoMark = () => {
  const b = store.state.brand;
  return b.logoSrc ? `<img src="${b.logoSrc}" alt="">` : `<div class="logo-mark">${esc(initials(b.name))}</div>`;
};
// overlay: {kind:'logo'|'image'|'text', x,y (deslocamento do centro, %), size, opacity} (aceita também {pos:'tl'..'br'})
const ovHTML = (o) => {
  const p = o.pos ? posXY(o.pos) : o, at = `left:${50 + (p.x || 0)}%;top:${50 + (p.y || 0)}%;opacity:${o.opacity ?? 1}`;
  if (o.kind === 'text') return `<div class="ov txt" style="${at};font-size:calc(var(--w) * ${o.size * 0.002})">${esc(o.text)}</div>`;
  return `<div class="ov" style="${at};width:${o.size}%">${o.kind === 'image' ? `<img src="${o.src}" alt="">` : logoMark()}</div>`;
};

export const phoneHTML = () => `<div class="phone" data-phone><div class="phone-in">
  <div class="vid"><svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><rect x="6" y="8" width="88" height="84" fill="none" stroke="rgba(255,255,255,.28)" stroke-width=".6"/><path d="M6 50h88" stroke="rgba(255,255,255,.28)" stroke-width=".6"/><circle cx="50" cy="50" r="10" fill="none" stroke="rgba(255,255,255,.28)" stroke-width=".6"/><circle class="ball" r="3" fill="#fff"/></svg><video muted playsinline hidden></video></div>
  <div class="tint"></div><div class="ovl"></div></div></div>`;

// s: {seed, ratio, zoom, x, y, bright, contrast, sat, temp (offsets, 0 = neutro), t, overlays, video, muted}
export function applyPhone(el, s) {
  el.classList.toggle('r45', s.ratio === '4:5');
  const v = $('.vid', el), vd = $('video', v), svg = $('svg', v);
  v.style.setProperty('--h', s.seed);
  v.style.transform = `translate(${s.x || 0}%,${s.y || 0}%) scale(${s.zoom || 1})`;
  v.style.filter = `brightness(${100 + (s.bright || 0)}%) contrast(${100 + (s.contrast || 0)}%) saturate(${100 + (s.sat || 0)}%)`;
  const tint = $('.tint', el), tp = s.temp || 0;
  tint.style.background = tp > 0 ? 'rgb(255,150,40)' : 'rgb(60,140,255)';
  tint.style.opacity = Math.min(0.8, (Math.abs(tp) / 50) * 0.6);
  if (s.video) {
    if (vd.dataset.src !== s.video) { vd.src = s.video; vd.dataset.src = s.video; }
    vd.hidden = false; svg.style.display = 'none'; vd.muted = !!s.muted;
  } else {
    vd.hidden = true; svg.style.display = ''; if (vd.dataset.src) { vd.removeAttribute('src'); vd.dataset.src = ''; }
    const t = s.t || 0, b = $('.ball', v);
    b.setAttribute('cx', 18 + 64 * t); b.setAttribute('cy', 70 - 36 * Math.sin(Math.PI * t));
  }
  $('.ovl', el).innerHTML = (s.overlays || []).map(ovHTML).join('');
}


// ---- modal / toast ----
let dismiss = null;
export function openModal(html, wide = false) {
  closeModal();
  const r = $('#modal-root');
  r.innerHTML = `<div class="scrim"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  const s = $('.scrim', r);
  s.addEventListener('mousedown', (e) => { if (e.target === s) closeModal(); });
  return $('.modal', r);
}
export function closeModal() { dismiss?.(); dismiss = null; $('#modal-root').innerHTML = ''; }
export function confirmDialog({ title, text, ok = 'Confirmar' }) {
  return new Promise((res) => {
    const m = openModal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p><div class="row end gap"><button class="btn ghost" data-r="0">Cancelar</button><button class="btn" data-r="1">${esc(ok)}</button></div>`);
    dismiss = () => res(false);
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) { dismiss = null; closeModal(); res(b.dataset.r === '1'); } });
  });
}
export function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `${icon(type === 'err' ? 'alert' : 'check', 18)}<span>${esc(msg)}</span>`;
  $('#toast-root').append(t);
  setTimeout(() => t.classList.add('out'), 2800);
  setTimeout(() => t.remove(), 3200);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copiado'); return true; }
  catch { toast('Seu navegador bloqueou a cópia. Selecione o texto e copie.', 'err'); return false; }
}
