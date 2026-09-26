import { auth } from '../services/auth.js';
import { icon, on, esc, $ } from '../ui/components.js';

export function showLogin(done) {
  const el = $('#view');
  el.innerHTML = `<div class="login card"><div class="brand"><span class="brand-mark">${icon('film', 18)}</span><b>Home Creators</b></div>
    <h1>Entrar</h1><p class="muted">Entre para editar seus highlights e publicar nas suas redes.</p>
    <label class="f"><span>E-mail</span><input type="text" id="lem" placeholder="voce@email.com" autocomplete="username"></label>
    <label class="f"><span>Senha</span><input type="password" id="lpw" placeholder="Sua senha" autocomplete="current-password"></label>
    <p class="err-t" id="lerr" hidden></p>
    <button class="btn block" id="lgo">Entrar</button><div class="or"><span>ou</span></div><button class="btn ghost block" id="lg">Continuar com Google</button>
    <small class="muted">Simulação: qualquer e-mail válido e senha com 6+ caracteres.</small></div>`;
  const run = async (fn, btn) => {
    const err = $('#lerr', el); err.hidden = true; btn.disabled = true; const t = btn.textContent; btn.textContent = 'Entrando…';
    try { await fn(); done(); } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; btn.textContent = t; }
  };
  on(el, 'click', '#lgo', (e, b) => run(() => auth.signIn($('#lem', el).value.trim(), $('#lpw', el).value), b));
  on(el, 'click', '#lg', (e, b) => run(() => auth.signInWithGoogle(), b));
  on(el, 'keydown', '#lpw', (e) => { if (e.key === 'Enter') $('#lgo', el).click(); });
}
