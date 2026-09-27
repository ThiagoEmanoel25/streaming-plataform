import { store, normProject, refreshUsage, pushProject } from '../store.js';
import { api, TEMPLATES, PLANS } from '../services/api.js';
import { refreshNav } from '../router.js';
import { $, $$, on, esc, icon, thumb, phoneHTML, applyPhone, fmtClock as clock, fillRange, logoMark, progress, skeleton, empty, toast, confirmDialog } from '../ui/components.js';
import { openTrackModal } from '../ui/trackModal.js';
import { mountPublisher } from '../ui/publisher.js';

const lin = (k, min, max) => ({ min, max, get: (d) => d[k], set: (d, v) => { d[k] = v; }, fmt: (v) => String(Math.round(v)) });
const CFG = {
  zoom: { min: 100, max: 250, get: (d) => Math.round(d.zoom * 100), set: (d, v) => { d.zoom = v / 100; }, fmt: (v) => `${v}%` },
  x: lin('x', -15, 15), y: lin('y', -15, 15),
  bright: lin('bright', -50, 50), contrast: lin('contrast', -50, 50), sat: lin('sat', -100, 100), temp: lin('temp', -50, 50),
};
const OVCFG = {
  size: { min: 6, max: 60, fmt: (v) => `${v}%` }, x: { min: -50, max: 50, fmt: String }, y: { min: -50, max: 50, fmt: String },
};
const PHASES = ['Preparando vídeo', 'Processando', 'Exportando', 'Concluído'];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = (p) => p + Math.random().toString(36).slice(2, 8);
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const once = (el, ev) => new Promise((r) => { el.addEventListener(ev, r, { once: true }); setTimeout(r, 2500); });

function wave(key) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
  return `<svg class="wave" viewBox="0 0 600 38" preserveAspectRatio="none" fill="#fff">${Array.from({ length: 120 }, (_, i) => { const v = 4 + rnd() * 26; return `<rect x="${i * 5 + 1}" y="${19 - v / 2}" width="3" height="${v}" rx="1.5"/>`; }).join('')}</svg>`;
}

export async function render(el, params) {
  el.classList.add('wide');
  el.innerHTML = `<div class="rl"><div class="skel" style="height:44px"></div><div class="rl-cols">${skeleton(4, 'skel-stage')}</div></div>`;
  let segs;
  try { segs = [...(await api.segments())]; } catch {
    el.innerHTML = `<div class="card">${empty('alert', 'Não foi possível carregar os highlights', 'Verifique sua conexão e tente de novo.', '<button class="btn" data-retry>Tentar novamente</button>')}</div>`;
    on(el, 'click', '[data-retry]', () => location.reload());
    return;
  }
  if (!segs.length) { el.innerHTML = `<div class="card">${empty('film', 'Sem highlights', 'Valide cortes no gerador para editar aqui.')}</div>`; return; }

  const st = store.state, pd = st.pubDraft;
  const proj = params.projectId && st.projects.find((p) => p.id === params.projectId);
  const brandOv = () => { const b = st.brand; return { id: uid('o'), kind: 'logo', x: b.x, y: b.y, size: b.size, opacity: b.opacity / 100 }; };
  let d = proj
    ? normProject(structuredClone(proj))
    : { v: 2, id: uid('p'), name: slug(segs[0].title), segId: segs[0].id, ratio: st.prefs.defaultRatio, zoom: 1, x: 0, y: 0, bright: 0, contrast: 0, sat: 0, temp: 0, trackId: null, overlays: [brandOv()], keyframes: [] };
  const seg = () => segs.find((s) => s.id === d.segId) || segs[0];
  d.segId = seg().id;
  if (!pd.caption) pd.caption = `${TEMPLATES[seg().tag]?.[0] || ''}\n\n#futebol #highlight #homecreators`.trim();

  let t = 0, timer = null, muted = false, rtab = 'pub', exporting = false, expState = null, expRec = null, dirty = false;
  let selOv = d.overlays[0]?.id || null, hist = [], hi = -1;
  const open = { video: true, cor: true, overlay: true, music: true };
  const ov = () => d.overlays.find((o) => o.id === selOv);

  el.innerHTML = `<div class="rl">
    <header class="rl-top" id="top"></header>
    <div class="rl-cols">
      <section class="col card segs" id="segs"></section>
      <section class="col stage"><div class="rpill" id="rpill"></div><div class="phone-wrap">${phoneHTML()}</div>
        <div class="pbar"><input type="range" data-scrub min="0" max="1000" value="0" aria-label="Linha do tempo"></div><div class="ptrans" id="ptr"></div></section>
      <section class="col ctl-col" id="ctl"></section>
      <aside class="col card rcol"><div class="rtabs" id="rtabs"></div><div class="rbody" id="rb"></div></aside>
    </div>
    <section class="tl card" id="tl"></section>
    <input type="file" id="vf" accept="video/*" hidden><input type="file" id="imf" accept="image/*" hidden></div>`;
  const ph = $('[data-phone]', el);

  // ---------- histórico (undo/redo) ----------
  const snap = () => JSON.stringify(d);
  const paintHist = () => { $$('[data-act=undo]', el).forEach((b) => { b.disabled = hi <= 0; }); $$('[data-act=redo]', el).forEach((b) => { b.disabled = hi >= hist.length - 1; }); };
  const commit = () => { const s = snap(); if (s === hist[hi]) return; hist.splice(hi + 1); hist.push(s); if (hist.length > 60) hist.shift(); hi = hist.length - 1; paintHist(); };
  const restore = (i) => { hi = i; d = JSON.parse(hist[i]); selOv = ov()?.id || d.overlays[0]?.id || null; stop(); touch(); paintAll(); };
  const touch = () => { dirty = true; if (expRec) { expRec = null; if (rtab === 'exp' && !exporting) paintRight(); } };

  // ---------- keyframes ----------
  const sortedKf = () => [...d.keyframes].sort((a, b) => a.t - b.t);
  function kfAt(tt) {
    const k = sortedKf();
    if (!k.length) return null;
    if (tt <= k[0].t) return k[0];
    if (tt >= k.at(-1).t) return k.at(-1);
    const i = k.findIndex((q) => q.t >= tt), a = k[i - 1], b = k[i], f = (tt - a.t) / (b.t - a.t), l = (p, q) => p + (q - p) * f;
    return { zoom: l(a.zoom, b.zoom), x: l(a.x, b.x), y: l(a.y, b.y) };
  }

  // ---------- pintura ----------
  function paintTop() {
    $('#top', el).innerHTML = `<div class="crumb">Reels ${icon('chev', 14)} <b>Editando</b></div>
      <div class="name-wrap"><input class="name-in" data-name value="${esc(d.name)}" aria-label="Nome do projeto">${icon('pencil', 15)}</div><span class="sp"></span>
      <div class="hbtns"><button class="icon-btn" data-act="undo" title="Desfazer">${icon('undo', 18)}</button><button class="icon-btn" data-act="redo" title="Refazer">${icon('redo', 18)}</button></div>
      <button class="btn ghost" data-act="save">${icon('save', 17)} Salvar projeto</button><button class="btn" data-act="export" ${exporting ? 'disabled' : ''}>${icon('download', 17)} Exportar</button>`;
    paintHist();
  }
  function paintSegs() {
    $('#segs', el).innerHTML = `<div class="row between"><h3>Segmentos do jogo (${segs.length})</h3><button class="icon-btn add" data-act="addvid" title="Enviar vídeo" aria-label="Enviar vídeo">${icon('plus', 18)}</button></div>
      <div class="seg-list">${segs.map((s) => `<div class="sgi ${s.id === d.segId ? 'on' : ''}" data-seg="${s.id}"><div class="sg-th">${s.thumb ? `<img src="${s.thumb}" alt="">` : thumb(s.seed)}<span class="dur">${clock(s.dur)}</span></div>
        <div class="sg-t">${s.id === d.segId ? `<small class="blue">${clock(s.dur)}</small>` : ''}<b>${esc(s.title)}</b><small>${esc(s.range)}</small></div><button class="icon-btn" data-menu="${s.id}" title="Remover da lista" aria-label="Remover da lista">${icon('more', 18)}</button></div>`).join('')}</div>`;
  }
  const paintClock = () => { const c = $('#clk', el); if (c) c.textContent = `${clock(t * seg().dur)} / ${clock(seg().dur)}`; };
  function paintStage() {
    $('#rpill', el).innerHTML = ['9:16', '4:5'].map((r) => `<button data-ratio="${r}" class="${d.ratio === r ? 'on' : ''}">${r}</button>`).join('');
    $('#ptr', el).innerHTML = `<button class="round" data-act="play" aria-label="Reproduzir">${icon(timer ? 'pause' : 'play', 18)}</button><span class="clock" id="clk"></span><span class="sp"></span>
      <button class="icon-btn" data-act="vol" title="Som">${icon(muted ? 'mute' : 'volume', 19)}</button><button class="icon-btn" data-act="fs" title="Tela cheia">${icon('expand', 19)}</button>`;
    paintClock();
  }
  const paintPhone = () => applyPhone(ph, { seed: seg().seed, ratio: d.ratio, zoom: d.zoom, x: d.x, y: d.y, bright: d.bright, contrast: d.contrast, sat: d.sat, temp: d.temp, t, overlays: d.overlays, video: seg().video, muted });

  const ctl = (k, label, ic) => { const c = CFG[k], v = c.get(d); return `<div class="ctl"><label>${ic ? icon(ic, 14) : ''}${label}</label><input type="range" data-k="${k}" min="${c.min}" max="${c.max}" step="1" value="${v}"><input type="text" class="vbox" data-kbox="${k}" value="${c.fmt(v)}" aria-label="${label}"></div>`; };
  const octl = (k, label, o) => `<div class="ctl"><label>${label}</label><input type="range" data-ok="${k}" min="${OVCFG[k].min}" max="${OVCFG[k].max}" step="1" value="${o[k]}"><input type="text" class="vbox" data-okbox="${k}" value="${OVCFG[k].fmt(o[k])}" aria-label="${label}"></div>`;
  const sec = (id, title, body) => `<section class="sec ${open[id] ? '' : 'closed'}"><button class="sec-t" data-sec="${id}">${title}${icon(open[id] ? 'chevup' : 'chevdown', 16)}</button><div class="sec-b">${body}</div></section>`;
  const ovLabel = (o) => (o.kind === 'logo' ? 'Logo do time' : o.kind === 'image' ? 'Imagem' : `“${esc(o.text.slice(0, 12))}”`);

  function paintCtl() {
    const box = $('#ctl', el), keep = box.scrollTop, o = ov(), ts = st.tracks, cur = ts.find((x) => x.id === d.trackId);
    box.innerHTML =
      sec('video', 'Vídeo', `${ctl('zoom', 'Zoom')}${ctl('x', 'Posição X')}${ctl('y', 'Posição Y')}<button class="btn ghost sm block" data-act="kfadd" title="Guarda zoom e posição neste ponto da linha do tempo">${icon('plusd', 16)} Adicionar keyframe (${d.keyframes.length})</button>`) +
      sec('cor', 'Cor', `${ctl('bright', 'Brilho', 'sun')}${ctl('contrast', 'Contraste', 'contrast')}${ctl('sat', 'Saturação', 'drop')}${ctl('temp', 'Temperatura', 'thermo')}`) +
      sec('overlay', 'Overlay', `<div class="ovrow"><button class="ovth" data-act="ov-logo" title="Usar logo do time">${logoMark()}</button><div class="grow stack"><button class="btn ghost sm block" data-act="ov-img">Adicionar imagem/Logo</button><button class="btn ghost sm block" data-act="ov-text">Adicionar texto</button></div></div>
        ${d.overlays.length ? `<div class="chips">${d.overlays.map((x) => `<span class="chip ${x.id === selOv ? 'on' : ''}"><button data-ovsel="${x.id}">${ovLabel(x)}</button><button data-ovdel="${x.id}" aria-label="Remover">${icon('x', 12)}</button></span>`).join('')}</div>` : '<p class="muted small">Nenhum overlay. Adicione o logo, uma imagem ou um texto.</p>'}
        ${o ? `${o.kind === 'text' ? `<label class="f"><span>Texto</span><input type="text" data-oktext value="${esc(o.text)}"></label>` : ''}${octl('size', 'Tamanho', o)}${octl('x', 'Posição X', o)}${octl('y', 'Posição Y', o)}` : ''}`) +
      sec('music', 'Música', `${cur ? `<div class="trk on"><span class="trk-cover">${icon('music', 16)}</span><div class="grow"><b>${esc(cur.name)}</b><small class="muted">${esc(cur.src)} · ${cur.dur}</small></div><button class="icon-btn" data-track="" title="Remover música">${icon('trash', 16)}</button></div>` : '<p class="muted small">Nenhuma música selecionada.</p>'}
        <div class="trk-list">${ts.filter((x) => x.id !== d.trackId).map((x) => `<button class="trk" data-track="${x.id}"><span class="trk-cover sm">${icon('music', 14)}</span><div class="grow"><b>${esc(x.name)}</b><small class="muted">${esc(x.src)} · ${x.dur}</small></div></button>`).join('')}</div>
        <button class="btn ghost sm block" data-act="track-add">${icon('music', 15)} Adicionar música</button>`);
    $$('input[type=range]', box).forEach(fillRange);
    box.scrollTop = keep;
  }
  const syncCtl = () => $$('#ctl [data-k]', el).forEach((i) => { const c = CFG[i.dataset.k], v = c.get(d); i.value = v; fillRange(i); const b = $(`#ctl [data-kbox="${i.dataset.k}"]`, el); if (b) b.value = c.fmt(v); });
  const syncOv = () => { const o = ov(); if (!o) return; $$('#ctl [data-ok]', el).forEach((i) => { i.value = o[i.dataset.ok]; fillRange(i); const b = $(`#ctl [data-okbox="${i.dataset.ok}"]`, el); if (b) b.value = OVCFG[i.dataset.ok].fmt(o[i.dataset.ok]); }); };

  function paintTL() {
    const sg = seg(), dur = sg.dur, step = dur <= 12 ? 2 : 5, cur = st.tracks.find((x) => x.id === d.trackId);
    let ruler = '', last = 0;
    for (let s = 0; s <= dur; s += step) { ruler += `<i style="left:${(s / dur) * 100}%"></i><span style="left:${(s / dur) * 100}%">${s}s</span>`; last = s; }
    if (dur - last > step * 0.4) ruler += `<i style="left:100%"></i><span style="left:100%">${dur}s</span>`;
    const cells = sg.frames ? sg.frames.map((f) => `<img src="${f}" alt="">`).join('') : Array.from({ length: 14 }, (_, i) => `<i class="fc" style="--h:${(sg.seed + i * 7) % 360}"></i>`).join('');
    $('#tl', el).classList.toggle('closed', !st.prefs.timeline);
    $('#tl', el).innerHTML = `<div class="tl-bar"><button class="icon-btn" data-act="undo" title="Desfazer">${icon('undo', 18)}</button><button class="icon-btn" data-act="redo" title="Refazer">${icon('redo', 18)}</button><span class="sep"></span>
      <button class="icon-btn" data-act="kfadd" title="Adicionar keyframe aqui">${icon('plusd', 18)}</button><button class="icon-btn" data-act="kfprev" title="Keyframe anterior">${icon('prev', 18)}</button><button class="icon-btn" data-act="kfnext" title="Próximo keyframe">${icon('next', 18)}</button><button class="icon-btn" data-act="kfdel" title="Remover keyframe mais próximo">${icon('trash', 17)}</button>
      <span class="sp"></span><small class="muted tl-hint">Arraste na linha do tempo. ◆ marca um keyframe (zoom e posição).</small>
      <button class="icon-btn" data-act="tl-toggle" title="${st.prefs.timeline ? 'Ocultar linha do tempo' : 'Mostrar linha do tempo'}" aria-expanded="${!!st.prefs.timeline}">${icon(st.prefs.timeline ? 'chevdown' : 'chevup', 18)}</button></div>
      <div class="tl-grid"><div class="tl-gut"><span>${icon('film', 17)}</span><span class="m">${icon('music', 17)}</span></div>
      <div class="tl-main"><div class="ruler">${ruler}</div><div class="strip"><button class="playbtn" data-act="play" aria-label="Reproduzir">${icon('play', 13)}</button>${cells}</div>
        ${cur ? `<div class="mtrack">${wave(cur.id)}<span>${icon('music', 15)}</span><b>${esc(cur.name)}</b></div>` : `<div class="mtrack empty">Sem música. Escolha uma no painel Música.</div>`}
        <div class="kfl">${d.keyframes.map((k, i) => `<button class="kfd" style="left:${k.t * 100}%" data-kfgo="${i}" title="Keyframe em ${clock(k.t * dur)}"></button>`).join('')}</div>
        <div class="tl-ph" style="left:${t * 100}%"></div></div></div>`;
    paintHist();
  }

  const previewCard = () => {
    const sg = seg(), tx = d.overlays.find((o) => o.kind === 'text');
    return `<div class="pv">${sg.thumb ? `<img src="${sg.thumb}" alt="">` : thumb(sg.seed)}<span class="pv-dur">${icon('clock', 12)} ${clock(sg.dur)}</span>${tx ? `<span class="pv-chip">${esc(tx.text)}</span>` : ''}</div>
      ${expRec ? '' : '<small class="muted">O Reel é exportado automaticamente ao publicar.</small>'}`;
  };
  const expBody = () => {
    if (exporting && expState) {
      const idx = PHASES.indexOf(expState.label);
      return `<div class="ex"><h3>Exportando</h3>${progress(expState.pct)}<ol class="phase">${PHASES.map((p, i) => `<li class="${i < idx ? 'done' : i === idx ? 'on' : ''}"><span>${i < idx || p === 'Concluído' && i === idx ? icon('check', 14) : i === idx ? '<i class="spin"></i>' : ''}</span>${p}</li>`).join('')}</ol></div>`;
    }
    if (expRec) return `<div class="ex center"><div class="okmark">${icon('check', 26)}</div><b>Reel exportado</b><small class="muted">${esc(expRec.name)} · ${clock(expRec.duration)} · ${expRec.ratio}</small><button class="btn block" data-rtab="pub">Ir para Publicar</button><button class="btn ghost block" data-act="export">Exportar novamente</button></div>`;
    const cur = st.tracks.find((x) => x.id === d.trackId);
    return `<div class="ex"><h3>Resumo</h3><ul class="kv"><li>Formato<b>${d.ratio}</b></li><li>Duração<b>${clock(seg().dur)}</b></li><li>Keyframes<b>${d.keyframes.length}</b></li><li>Overlays<b>${d.overlays.length}</b></li><li>Música<b>${cur ? esc(cur.name) : 'Sem música'}</b></li></ul><button class="btn block" data-act="export">${icon('download', 17)} Exportar Reel</button></div>`;
  };
  const ctx = { exp: () => expRec, ensure: async () => { if (expRec) return expRec; const r = await startExport(); if (r) { rtab = 'pub'; paintRight(); } return r; } };
  function paintRight() {
    $('#rtabs', el).innerHTML = [['pub', 'Publicar'], ['exp', 'Exportação']].map(([k, l]) => `<button data-rtab="${k}" class="${rtab === k ? 'on' : ''}">${l}</button>`).join('');
    const rb = $('#rb', el);
    if (rtab === 'pub') { rb.innerHTML = `${previewCard()}<div class="pubc"></div>`; mountPublisher(rb, ctx); } else rb.innerHTML = expBody();
  }
  const paintAll = () => { paintTop(); paintSegs(); paintStage(); paintPhone(); paintCtl(); paintTL(); paintRight(); setT(t); };

  // ---------- projeto ----------
  function save(quiet) {
    const rec = { ...structuredClone(d), v: 2, seed: seg().seed, duration: seg().dur, editedAt: new Date().toISOString() };
    const l = st.projects, i = l.findIndex((p) => p.id === d.id);
    if (i >= 0) l.splice(i, 1);
    l.unshift(rec); store.save(); dirty = false;
    const sent = pushProject(rec);
    if (quiet) sent.catch((e) => console.warn('projeto não foi para o servidor:', e.message));
    else sent.then(() => toast('Projeto salvo')).catch((e) => toast(e.message || 'Não foi possível salvar no servidor.', 'err'));
  }
  async function startExport() {
    if (exporting) return null;
    if (st.usage.exports >= PLANS.find((p) => p.id === st.plan).exports) { toast('Limite de exportações do plano atingido. Veja Configurações › Plano.', 'err'); return null; }
    exporting = true; expRec = null; expState = { pct: 0, label: PHASES[0] }; rtab = 'exp'; save(true);
    const btn = $('[data-act=export]', $('#top', el)); if (btn) btn.disabled = true;
    paintRight();
    try {
      const rec = await api.exportReel({ ...d, seed: seg().seed, duration: seg().dur }, (pct, label) => { expState = { pct, label }; if (rtab === 'exp') $('#rb', el).innerHTML = expBody(); });
      rec.thumb = seg().thumb || null;
      st.exports.unshift(rec); st.usage.exports++; store.save(); await refreshUsage(); refreshNav();
      expRec = rec; toast('Reel exportado');
      return rec;
    } catch (err) { toast(err?.message || 'Falha ao exportar. Tente novamente.', 'err'); return null; }
    finally { exporting = false; expState = null; const b = $('[data-act=export]', $('#top', el)); if (b) b.disabled = false; if (rtab === 'exp') paintRight(); }
  }

  // ---------- player ----------
  const vEl = () => (seg().video ? $('video', ph) : null);
  function setT(v, fromVideo) {
    t = clamp(v, 0, 1);
    const k = kfAt(t);
    if (k) { d.zoom = k.zoom; d.x = k.x; d.y = k.y; syncCtl(); }
    const vd = vEl();
    if (vd && !fromVideo && vd.duration) vd.currentTime = t * vd.duration;
    paintPhone(); paintClock();
    const sc = $('[data-scrub]', el); sc.value = Math.round(t * 1000); fillRange(sc);
    const p = $('.tl-ph', el); if (p) p.style.left = `${t * 100}%`;
  }
  function stop() { clearInterval(timer); timer = null; vEl()?.pause(); }
  function play() {
    if (timer) { stop(); paintStage(); return; }
    if (t >= 0.999) setT(0);
    const vd = vEl(); vd?.play().catch(() => {});
    timer = setInterval(() => {
      const n = vd && vd.duration ? vd.currentTime / vd.duration : t + 0.05 / seg().dur;
      if (n >= 0.999) { stop(); setT(1); paintStage(); } else setT(n, !!vd);
    }, 50);
    paintStage();
  }

  // ---------- upload de vídeo (arquivo local; frames para a timeline) ----------
  async function addVideo(f) {
    const url = URL.createObjectURL(f), v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.src = url;
    try {
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('Formato de vídeo não suportado.')); });
      if (!Number.isFinite(v.duration)) { v.currentTime = 1e7; await once(v, 'timeupdate'); v.currentTime = 0; } // WebM sem duração no cabeçalho
      if (!Number.isFinite(v.duration) || v.duration <= 0) throw new Error('Não foi possível ler a duração do vídeo.');
      const dur = Math.max(1, Math.round(v.duration)), n = clamp(dur, 6, 14), cw = 120, ch = Math.round((cw * v.videoHeight) / v.videoWidth) || 213;
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const g = c.getContext('2d'), frames = [];
      for (let i = 0; i < n; i++) { v.currentTime = Math.min(v.duration - 0.05, ((i + 0.5) * v.duration) / n); await once(v, 'seeked'); g.drawImage(v, 0, 0, cw, ch); frames.push(c.toDataURL('image/jpeg', 0.6)); }
      const s = { id: uid('s'), title: f.name.replace(/\.[^.]+$/, ''), tag: 'Highlight', range: `00:00 - ${clock(dur)}`, dur, seed: 200, video: url, thumb: frames[0], frames };
      segs.unshift(s); stop(); d.segId = s.id; Object.assign(d, { zoom: 1, x: 0, y: 0, keyframes: [] }); d.name = slug(s.title); t = 0; touch(); commit(); paintAll();
      toast('Vídeo adicionado aos segmentos');
    } catch (e) { toast(e.message || 'Não foi possível abrir o vídeo.', 'err'); URL.revokeObjectURL(url); }
  }

  // ---------- eventos ----------
  const setRatio = (r) => { d.ratio = r; touch(); commit(); paintStage(); paintPhone(); };
  on(el, 'click', '[data-ratio]', (e, b) => setRatio(b.dataset.ratio));
  on(el, 'click', '[data-seg]', (e, b) => {
    if (e.target.closest('[data-menu]')) return;
    const s = segs.find((x) => x.id === b.dataset.seg);
    if (s.id === d.segId) return;
    const auto = d.name === slug(seg().title);
    stop(); d.segId = s.id; Object.assign(d, { zoom: 1, x: 0, y: 0, keyframes: [] }); if (auto) d.name = slug(s.title);
    t = 0; touch(); commit(); paintAll();
  });
  on(el, 'click', '[data-menu]', async (e, b) => {
    if (segs.length < 2) return toast('Mantenha ao menos um segmento.', 'err');
    const s = segs.find((x) => x.id === b.dataset.menu);
    if (!(await confirmDialog({ title: 'Remover da lista?', text: `“${s.title}” sai da lista de segmentos desta sessão.`, ok: 'Remover' }))) return;
    segs.splice(segs.indexOf(s), 1);
    if (d.segId === s.id) { stop(); d.segId = segs[0].id; Object.assign(d, { zoom: 1, x: 0, y: 0, keyframes: [] }); t = 0; touch(); commit(); }
    paintAll();
  });
  on(el, 'click', '[data-sec]', (e, b) => { open[b.dataset.sec] = !open[b.dataset.sec]; paintCtl(); });
  on(el, 'click', '[data-rtab]', (e, b) => { rtab = b.dataset.rtab; paintRight(); });
  on(el, 'click', '[data-kfgo]', (e, b) => { stop(); paintStage(); setT(d.keyframes[+b.dataset.kfgo].t); });
  on(el, 'click', '[data-ovsel]', (e, b) => { selOv = b.dataset.ovsel; paintCtl(); });
  on(el, 'click', '[data-ovdel]', (e, b) => { d.overlays = d.overlays.filter((o) => o.id !== b.dataset.ovdel); if (selOv === b.dataset.ovdel) selOv = d.overlays[0]?.id || null; touch(); commit(); paintCtl(); paintPhone(); });
  on(el, 'click', '[data-track]', (e, b) => { d.trackId = b.dataset.track || null; touch(); commit(); paintCtl(); paintTL(); });
  on(el, 'click', '[data-act]', (e, b) => {
    const a = b.dataset.act, addOv = (o) => { d.overlays.push(o); selOv = o.id; touch(); commit(); paintCtl(); paintPhone(); };
    if (a === 'undo' && hi > 0) restore(hi - 1);
    else if (a === 'redo' && hi < hist.length - 1) restore(hi + 1);
    else if (a === 'save') save();
    else if (a === 'export') startExport();
    else if (a === 'play') play();
    else if (a === 'tl-toggle') { st.prefs.timeline = !st.prefs.timeline; store.save(); paintTL(); }
    else if (a === 'vol') { muted = !muted; paintStage(); paintPhone(); }
    else if (a === 'fs') ph.requestFullscreen?.();
    else if (a === 'addvid') $('#vf', el).click();
    else if (a === 'ov-img') $('#imf', el).click();
    else if (a === 'ov-logo') { const ex = d.overlays.find((o) => o.kind === 'logo'); if (ex) { selOv = ex.id; paintCtl(); } else addOv(brandOv()); }
    else if (a === 'ov-text') addOv({ id: uid('o'), kind: 'text', text: 'QUE GOLAÇO! 🔥', x: -14, y: 38, size: 26, opacity: 1 });
    else if (a === 'track-add') openTrackModal((tr) => { st.tracks.push(tr); store.save(); d.trackId = tr.id; touch(); commit(); paintCtl(); paintTL(); toast('Música salva na sua biblioteca'); });
    else if (a === 'kfadd') {
      const kf = { t, zoom: d.zoom, x: d.x, y: d.y }, i = d.keyframes.findIndex((k) => Math.abs(k.t - t) < 0.02);
      if (i >= 0) d.keyframes[i] = kf; else d.keyframes.push(kf);
      touch(); commit(); paintCtl(); paintTL(); toast('Keyframe salvo');
    } else if (a === 'kfdel') {
      const k = sortedKf().map((q) => ({ q, dist: Math.abs(q.t - t) })).sort((x, y) => x.dist - y.dist)[0];
      if (!k || k.dist > 0.05) return toast('Nenhum keyframe perto do cursor.', 'err');
      d.keyframes = d.keyframes.filter((q) => q !== k.q); touch(); commit(); paintCtl(); paintTL();
    } else if (a === 'kfprev' || a === 'kfnext') {
      const k = sortedKf(), tgt = a === 'kfprev' ? [...k].reverse().find((q) => q.t < t - 0.005) : k.find((q) => q.t > t + 0.005);
      if (tgt) { stop(); paintStage(); setT(tgt.t); }
    }
  });

  on(el, 'input', '[data-k]', (e, i) => { const c = CFG[i.dataset.k]; c.set(d, +i.value); $(`[data-kbox="${i.dataset.k}"]`, el).value = c.fmt(+i.value); fillRange(i); touch(); paintPhone(); });
  on(el, 'change', '[data-k]', commit);
  on(el, 'change', '[data-kbox]', (e, b) => {
    const c = CFG[b.dataset.kbox], raw = parseFloat(String(b.value).replace(',', '.'));
    if (Number.isNaN(raw)) return syncCtl();
    c.set(d, clamp(Math.round(raw), c.min, c.max)); syncCtl(); touch(); paintPhone(); commit();
  });
  on(el, 'input', '[data-ok]', (e, i) => { ov()[i.dataset.ok] = +i.value; $(`[data-okbox="${i.dataset.ok}"]`, el).value = OVCFG[i.dataset.ok].fmt(+i.value); fillRange(i); touch(); paintPhone(); });
  on(el, 'change', '[data-ok]', commit);
  on(el, 'change', '[data-okbox]', (e, b) => {
    const k = b.dataset.okbox, c = OVCFG[k], raw = parseFloat(String(b.value).replace(',', '.'));
    if (Number.isNaN(raw)) return syncOv();
    ov()[k] = clamp(Math.round(raw), c.min, c.max); syncOv(); touch(); paintPhone(); commit();
  });
  on(el, 'input', '[data-oktext]', (e, i) => { ov().text = i.value; touch(); paintPhone(); });
  on(el, 'change', '[data-oktext]', () => { paintCtl(); commit(); });
  on(el, 'input', '[data-name]', (e, i) => { d.name = i.value; touch(); });
  on(el, 'change', '[data-name]', commit);
  on(el, 'input', '[data-scrub]', (e, i) => { stop(); paintStage(); setT(+i.value / 1000); });
  on(el, 'change', '#vf', (e, i) => { const f = i.files[0]; i.value = ''; if (f) addVideo(f); });
  on(el, 'change', '#imf', (e, i) => {
    const f = i.files[0]; i.value = ''; if (!f) return;
    const r = new FileReader();
    r.onload = () => { const o = { id: uid('o'), kind: 'image', src: r.result, x: 32, y: 36, size: 20, opacity: 1 }; d.overlays.push(o); selOv = o.id; touch(); commit(); paintCtl(); paintPhone(); };
    r.readAsDataURL(f);
  });
  // timeline: clicar ou arrastar move o cursor
  on(el, 'pointerdown', '.tl-main', (e, m) => {
    if (e.target.closest('[data-kfgo],[data-act]')) return;
    stop(); paintStage();
    const mv = (ev) => { const r = m.getBoundingClientRect(); setT((ev.clientX - r.left) / r.width); };
    mv(e); m.setPointerCapture(e.pointerId);
    const up = () => { m.removeEventListener('pointermove', mv); m.removeEventListener('pointerup', up); };
    m.addEventListener('pointermove', mv); m.addEventListener('pointerup', up);
  });

  commit(); paintAll();
  return () => { stop(); if (dirty && st.prefs.autosave) save(true); };
}
