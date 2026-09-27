import { providers } from '../services/social.js';
import { openModal, closeModal, netLogo, icon, esc, toast } from './components.js';

// Assistente de conexão (simulado). Linguagem para usuário final: sem termos técnicos.
export function connectWizard(id, onDone) {
  const p = providers.get(id);
  const n = p.steps.length;
  let i = 0, state = 'step';
  const m = openModal('');

  const dots = () => `<div class="dots">${p.steps.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>`;
  function paint() {
    if (state === 'loading') m.innerHTML = `<div class="center"><div class="spin lg"></div><h3>Conectando ao ${esc(p.name)}…</h3><p class="muted">Só um instante.</p></div>`;
    else if (state === 'done') m.innerHTML = `<div class="center">${netLogo(id, 56)}<div class="okmark">${icon('check', 26)}</div><h3>${esc(p.name)} conectado com sucesso.</h3><p class="muted">${esc(p.mockHandle)} já pode receber suas publicações.</p><button class="btn block" data-a="done">Concluir</button></div>`;
    else if (state === 'error') m.innerHTML = `<div class="center"><h3>Não deu certo</h3><p class="muted">Não conseguimos conectar agora. Tente de novo.</p><button class="btn block" data-a="retry">Tentar novamente</button></div>`;
    else {
      const s = p.steps[i];
      m.innerHTML = `<div class="row between"><div class="row gap">${netLogo(id, 36)}<b>Conectar ${esc(p.name)}</b></div><button class="icon-btn" data-a="cancel" aria-label="Fechar">${icon('x', 18)}</button></div>
        ${dots()}<small class="muted">Passo ${i + 1} de ${n}</small><h2>${esc(s.title)}</h2><p class="muted">${esc(s.text)}</p>
        <div class="row between wiz-foot"><button class="btn ghost" data-a="${i ? 'back' : 'cancel'}">${i ? 'Voltar' : 'Cancelar'}</button><button class="btn" data-a="next">${i === n - 1 ? 'Confirmar' : 'Continuar'}</button></div>`;
    }
  }
  m.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'cancel') return closeModal();
    if (a === 'back') { i--; return paint(); }
    if (a === 'done') { closeModal(); toast(`${p.name} conectado`); return onDone?.(); }
    if (a === 'next' && i < n - 1) { i++; return paint(); }
    state = 'loading'; paint();
    try { await p.connect(); state = 'done'; } catch { state = 'error'; }
    paint();
  });
  paint();
}
