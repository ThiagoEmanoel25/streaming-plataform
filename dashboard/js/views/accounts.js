import { providers } from '../services/social.js';
import { on, netLogo, pill, esc, confirmDialog, toast } from '../ui/components.js';
import { connectWizard } from '../ui/wizard.js';

export function render(el) {
  const paint = () => {
    el.innerHTML = `<header class="page-head"><div><h1>Contas sociais</h1><p class="muted">Conecte suas redes para publicar de um só lugar. Você entra na própria rede e escolhe o que autorizar.</p></div></header>
      <div class="grid-3">${providers.list().map((p) => {
        const reauth = p.connected && p.account.needsReauth;
        return `<div class="card acct">${netLogo(p.id, 52)}
        <div class="grow"><b>${p.name}</b><small class="muted block">${p.connected ? esc(p.account.handle) : 'Nenhuma conta conectada'}</small></div>
        ${reauth ? pill('Precisa reconectar', 'err') : p.connected ? pill('Conectado', 'ok') : pill('Não conectado')}
        <button class="btn ${reauth ? '' : p.connected ? 'ghost' : ''} block" data-${reauth ? 'reauth' : p.connected ? 'off' : 'on'}="${p.id}">${reauth ? 'Reconectar' : p.connected ? 'Desconectar' : 'Conectar'}</button></div>`;
      }).join('')}</div>`;
  };
  paint();
  on(el, 'click', '[data-on]', (e, t) => connectWizard(t.dataset.on, paint));
  on(el, 'click', '[data-reauth]', (e, t) => connectWizard(t.dataset.reauth, paint));
  on(el, 'click', '[data-off]', async (e, t) => {
    const p = providers.get(t.dataset.off);
    if (!(await confirmDialog({ title: `Desconectar ${p.name}?`, text: 'Você poderá conectar de novo quando quiser.', ok: 'Desconectar' }))) return;
    t.disabled = true; await p.disconnect(); toast(`${p.name} desconectado`); paint();
  });
}
