import { register, start } from './router.js';
import * as home from './views/home.js';
import * as reels from './views/reels.js';
import * as publications from './views/publications.js';
import * as accounts from './views/accounts.js';
import * as analytics from './views/analytics.js';
import * as strategies from './views/strategies.js';
import * as settings from './views/settings.js';
import { auth } from './services/auth.js';
import { detect } from './services/backend.js';
import { store, hydrate } from './store.js';
import { showLogin } from './views/login.js';

import { $$, fillRange } from './ui/components.js';

register({ home, reels, publications, accounts, analytics, strategies, settings });
async function boot() {
  document.body.classList.toggle('out', !auth.session);
  if (!auth.session) return showLogin(boot);
  try { await hydrate(); } catch (e) { console.warn('hidratação falhou:', e.message); }
  start();
}
await detect();
boot();

// sliders com trilha azul preenchida: cobre render inicial e mudanças de conteúdo
const fill = () => $$('input[type=range]').forEach(fillRange);
new MutationObserver(fill).observe(document.getElementById('view'), { childList: true, subtree: true });
document.addEventListener('input', (e) => { if (e.target.type === 'range') fillRange(e.target); });
