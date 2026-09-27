import { openModal, closeModal, icon, on, $ } from './components.js';

// Adicionar música: upload do próprio arquivo. Baixar de link (YouTube/Instagram) foi removido —
// viola os termos dessas plataformas e pode gerar bloqueio na conta do usuário (docs/estrategia-viabilidade.md, seção 4).
export function openTrackModal(onAdd) {
  const m = openModal(`<div class="row between"><h3>Adicionar música</h3><button class="icon-btn" data-c aria-label="Fechar">${icon('x', 18)}</button></div>
    <label class="drop">${icon('upload', 26)}<b>Escolha um arquivo de áudio</b><small class="muted">MP3, WAV ou M4A</small><input type="file" accept="audio/*" hidden></label>
    <p class="note">Use apenas áudios que você tem direito de usar.</p>`);
  on(m, 'click', '[data-c]', closeModal);
  on(m, 'change', 'input[type=file]', (e, t) => {
    const f = t.files[0]; if (!f) return;
    onAdd({ id: 't' + Date.now(), name: f.name.replace(/\.[^.]+$/, ''), src: 'Upload', dur: '—' });
    closeModal();
  });
}
