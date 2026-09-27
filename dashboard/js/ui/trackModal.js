import { api } from '../services/api.js';
import { openModal, closeModal, icon, esc, progress, on, $ } from './components.js';

// Adicionar música: upload de arquivo ou link (simulado; nenhum download real nesta versão).
export function openTrackModal(onAdd) {
  const m = openModal(`<div class="row between"><h3>Adicionar música</h3><button class="icon-btn" data-c aria-label="Fechar">${icon('x', 18)}</button></div>
    <div class="seg"><button class="on" data-tab="up">Enviar arquivo</button><button data-tab="link">Usar link</button></div><div id="tm"></div>
    <p class="note">Simulação nesta versão. Use apenas áudios que você tem direito de usar.</p>`);
  const body = $('#tm', m);
  const tab = (k) => {
    m.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === k));
    body.innerHTML = k === 'up'
      ? `<label class="drop">${icon('upload', 26)}<b>Escolha um arquivo de áudio</b><small class="muted">MP3, WAV ou M4A</small><input type="file" accept="audio/*" hidden></label>`
      : `<label class="f"><span>Link do YouTube ou Instagram</span><input type="text" id="tm-url" placeholder="Cole o link aqui"></label>
         <div class="chips"><button class="chip" data-ex="https://www.youtube.com/watch?v=exemplo">${icon('link', 14)} Exemplo YouTube</button><button class="chip" data-ex="https://www.instagram.com/reel/exemplo/">${icon('link', 14)} Exemplo Instagram</button></div>
         <div id="tm-info"></div><button class="btn block" id="tm-go">Importar áudio</button>`;
  };
  tab('up');
  on(m, 'click', '[data-c]', closeModal);
  on(m, 'click', '[data-tab]', (e, t) => tab(t.dataset.tab));
  on(m, 'click', '[data-ex]', (e, t) => { $('#tm-url', m).value = t.dataset.ex; });
  on(m, 'change', 'input[type=file]', (e, t) => {
    const f = t.files[0]; if (!f) return;
    onAdd({ id: 't' + Date.now(), name: f.name.replace(/\.[^.]+$/, ''), src: 'Upload', dur: '—' });
    closeModal();
  });
  on(m, 'click', '#tm-go', async (e, btn) => {
    const url = $('#tm-url', m).value.trim(), info = $('#tm-info', m);
    if (!url) { info.innerHTML = '<p class="err-t">Cole um link para continuar.</p>'; return; }
    btn.disabled = true;
    try {
      const t = await api.importTrack(url, (p, label) => { info.innerHTML = `${progress(p)}<small class="muted">${esc(label)}</small>`; });
      onAdd(t); closeModal();
    } catch (err) { info.innerHTML = `<p class="err-t">${esc(err.message)}</p>`; btn.disabled = false; }
  });
}
