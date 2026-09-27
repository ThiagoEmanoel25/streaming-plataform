import { store } from '../store.js';
import { logoMark, esc, on, toast, icon, fillRange, $, $$ } from './components.js';

// Marca do time/criador: logo, posição (x/y a partir do centro), tamanho e opacidade.
// Compartilhado entre Estratégias e Configurações › Marca.
const F = { opacity: { min: 20, max: 100, label: 'Opacidade', unit: '%' }, size: { min: 8, max: 60, label: 'Tamanho', unit: '%' }, x: { min: -50, max: 50, label: 'Posição X', unit: '' }, y: { min: -50, max: 50, label: 'Posição Y', unit: '' } };

export function brandForm(el) {
  paint(el);
  if (el._bound) return; // listeners delegados: uma vez por container
  el._bound = true;
  bind(el);
}

const val = (k) => store.state.brand[k];

function paint(el) {
  const b = store.state.brand;
  el.innerHTML = `<div class="bf">
    <div class="bf-stage"><div class="bf-mark" style="left:${50 + b.x}%;top:${50 + b.y}%;width:${b.size}%;opacity:${b.opacity / 100}">
      ${logoMark()}<i class="h tl"></i><i class="h tr"></i><i class="h bl"></i><i class="h br"></i></div></div>
    <div class="row gap bf-file"><label class="btn ghost sm">${icon('upload', 15)} Enviar logo<input type="file" accept="image/*" hidden data-logo></label>
      <input type="text" class="bf-name" data-bname value="${esc(b.name)}" aria-label="Nome do time ou criador" placeholder="Nome do time"></div>
    ${Object.entries(F).map(([k, f]) => `<div class="ctl"><label>${f.label}</label><input type="range" data-bk="${k}" min="${f.min}" max="${f.max}" value="${val(k)}"><input type="text" class="vbox" data-bbox="${k}" value="${val(k)}${f.unit}" aria-label="${f.label}"></div>`).join('')}</div>`;
  $$('input[type=range]', el).forEach(fillRange);
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function live(el) {
  const b = store.state.brand, m = $('.bf-mark', el);
  m.style.left = `${50 + b.x}%`; m.style.top = `${50 + b.y}%`;
  m.style.width = `${b.size}%`; m.style.opacity = b.opacity / 100;
}

function bind(el) {
  on(el, 'input', '[data-bk]', (e, t) => {
    const k = t.dataset.bk;
    store.state.brand[k] = +t.value;
    $(`[data-bbox="${k}"]`, el).value = t.value + F[k].unit;
    fillRange(t); live(el);
  });
  on(el, 'change', '[data-bk]', () => store.save());
  on(el, 'change', '[data-bbox]', (e, t) => {
    const k = t.dataset.bbox, raw = parseFloat(String(t.value).replace(',', '.'));
    if (!Number.isNaN(raw)) store.state.brand[k] = clamp(Math.round(raw), F[k].min, F[k].max);
    t.value = val(k) + F[k].unit;
    const r = $(`[data-bk="${k}"]`, el); r.value = val(k); fillRange(r);
    live(el); store.save();
  });
  on(el, 'input', '[data-bname]', (e, t) => { store.state.brand.name = t.value; $('.bf-mark .logo-mark', el)?.replaceWith(...new DOMParser().parseFromString(logoMark(), 'text/html').body.childNodes); });
  on(el, 'change', '[data-bname]', () => { store.save(); paint(el); });
  on(el, 'change', '[data-logo]', (e, t) => {
    const f = t.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { store.state.brand.logoSrc = r.result; store.save(); toast('Logo atualizado'); paint(el); };
    r.readAsDataURL(f);
  });
}
