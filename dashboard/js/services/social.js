// Contrato único para as redes. Trocar Mock*Provider por uma implementação real
// (Worker → API da rede ou agregador) não muda nenhuma view.
import { store, toNet, fromNet } from '../store.js';
import { live, call, poll } from './backend.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class SocialProvider {
  id = ''; name = ''; maxChars = 2200; mockHandle = ''; steps = [];
  get account() { return store.state.accounts[this.id] || { connected: false }; }
  get connected() { return !!this.account.connected; }
  async connect() { throw new Error('não implementado'); }
  async disconnect() { throw new Error('não implementado'); }
  // onStatus('queued'|'processing'|'success'|'failed', mensagem?)
  async publish(_payload, _onStatus) { throw new Error('não implementado'); }
  async schedule(_payload, _when) { throw new Error('não implementado'); }
}

class MockProvider extends SocialProvider {
  failNext = false; // simula uma falha na primeira tentativa
  get net() { return toNet(this.id); } // id do backend: ig -> instagram
  setAccount(a) { store.state.accounts[this.id] = a; store.save(); }

  async syncAccounts() {
    const { accounts } = await call('GET', '/social/accounts');
    store.state.accounts = Object.fromEntries(accounts.map((a) => [fromNet(a.id), { connected: a.connected, handle: a.handle, needsReauth: a.needsReauth }]));
    store.save();
  }

  async connect() {
    if (live()) {
      const { url } = await call('POST', `/social/${this.net}/authorize`);
      // mesma origem = fluxo simulado do backend; outra origem = página de login da própria rede
      if (new URL(url, location.href).origin === location.origin) await fetch(url, { redirect: 'follow' });
      else { location.href = url; return new Promise(() => {}); }
      return this.syncAccounts();
    }
    await sleep(1100);
    this.setAccount({ connected: true, handle: this.mockHandle });
  }

  async disconnect() {
    if (live()) { await call('DELETE', `/social/${this.net}`); return this.syncAccounts(); }
    await sleep(400);
    this.setAccount({ connected: false });
  }

  async publish(payload, onStatus) {
    if (live()) return this.publishLive(payload, onStatus);
    if (!this.connected) throw new Error('Conta não conectada.');
    onStatus('queued');
    await sleep(700 + Math.random() * 500);
    onStatus('processing');
    await sleep(1400 + Math.random() * 900);
    if (this.failNext) {
      this.failNext = false;
      onStatus('failed', 'Não foi possível enviar o vídeo agora. Tente novamente.');
      return;
    }
    onStatus('success');
  }
  // o backend responde 202 e entrega em segundo plano; aqui acompanhamos até o estado final
  async publishLive({ exportId, caption }, onStatus) {
    onStatus('queued');
    const id = `${exportId}:${this.net}`;
    const mine = (d) => d.publications.find((p) => p.id === id);
    try {
      await call('POST', '/publications', { exportId, caption, networks: [this.net] });
    } catch (e) { onStatus('failed', e.message); return; }
    let last = 'queued';
    const out = await poll(`/publications?exportId=${exportId}`,
      (d) => ['success', 'failed'].includes(mine(d)?.status),
      (d) => { const p = mine(d); if (p && p.status !== last) { last = p.status; if (p.status === 'processing') onStatus('processing'); } });
    const p = mine(out);
    onStatus(p.status, p.error || undefined);
  }

  async schedule({ exportId, caption }, when) {
    if (live()) { await call('POST', '/publications', { exportId, caption, networks: [this.net], scheduledAt: when.toISOString() }); return; }
    await sleep(500);
  }
}

const steps = (a, b, c, d) => [
  { title: a[0], text: a[1] }, { title: b[0], text: b[1] }, { title: c[0], text: c[1] }, { title: d[0], text: d[1] },
];

export class MockInstagramProvider extends MockProvider {
  id = 'ig'; name = 'Instagram'; maxChars = 2200; mockHandle = '@homecreators';
  steps = steps(['Entre com sua conta Meta', 'Use o mesmo login que você usa no Facebook ou Instagram.'], ['Escolha a conta profissional', 'Selecione a conta do Instagram que você quer conectar.'], ['Autorize o Home Creators', 'Permita que a gente publique vídeos por você.'], ['Confirme a conexão', 'Revise e confirme. Você pode desconectar quando quiser.']);
}
export class MockYouTubeProvider extends MockProvider {
  id = 'yt'; name = 'YouTube'; maxChars = 5000; mockHandle = 'Home Creators';
  steps = steps(['Entre com sua conta Google', 'Use a conta que é dona do seu canal.'], ['Selecione o canal', 'Escolha em qual canal os vídeos serão publicados.'], ['Autorize o envio de vídeos', 'Permita que a gente envie vídeos para o seu canal.'], ['Confirme', 'Revise e confirme. Você pode desconectar quando quiser.']);
}
export class MockTikTokProvider extends MockProvider {
  id = 'tt'; name = 'TikTok'; maxChars = 2200; mockHandle = '@homecreators'; failNext = true;
  steps = steps(['Entre com sua conta TikTok', 'Use o login que você já usa no aplicativo.'], ['Escolha a conta', 'Selecione o perfil que vai receber os vídeos.'], ['Autorize o envio de vídeos', 'Permita que a gente publique vídeos por você.'], ['Confirme', 'Revise e confirme. Você pode desconectar quando quiser.']);
}
export class MockXProvider extends MockProvider {
  id = 'x'; name = 'X'; maxChars = 280; mockHandle = '@homecreators';
  steps = steps(['Entre com sua conta do X', 'Use o mesmo login que você usa no X.'], ['Escolha o perfil', 'Selecione o perfil que vai publicar os posts.'], ['Autorize a publicação', 'Permita que a gente publique posts com vídeo por você.'], ['Confirme', 'Revise e confirme. Você pode desconectar quando quiser.']);
}
export class MockThreadsProvider extends MockProvider {
  id = 'th'; name = 'Threads'; maxChars = 500; mockHandle = '@homecreators';
  steps = steps(['Entre com sua conta do Instagram', 'O Threads usa o mesmo login do Instagram.'], ['Escolha o perfil', 'Selecione o perfil do Threads que você quer conectar.'], ['Autorize a publicação', 'Permita que a gente publique por você.'], ['Confirme', 'Revise e confirme. Você pode desconectar quando quiser.']);
}

export class MockFacebookProvider extends MockProvider {
  id = 'fb'; name = 'Facebook'; maxChars = 5000; mockHandle = 'Home Creators';
  steps = steps(['Entre com sua conta do Facebook', 'Use o mesmo login que você usa no Facebook.'], ['Escolha a página', 'Selecione a página que vai receber os vídeos.'], ['Autorize a publicação', 'Permita que a gente publique vídeos por você.'], ['Confirme', 'Revise e confirme. Você pode desconectar quando quiser.']);
}
export class MockLinkedInProvider extends MockProvider {
  id = 'li'; name = 'LinkedIn'; maxChars = 3000; mockHandle = 'Home Creators';
  steps = steps(['Entre com sua conta do LinkedIn', 'Use o mesmo login que você usa no LinkedIn.'], ['Escolha o perfil ou a página', 'Selecione onde os vídeos serão publicados.'], ['Autorize a publicação', 'Permita que a gente publique vídeos por você.'], ['Confirme', 'Revise e confirme. Você pode desconectar quando quiser.']);
}

const all = [new MockInstagramProvider(), new MockYouTubeProvider(), new MockTikTokProvider(), new MockXProvider(), new MockThreadsProvider(), new MockFacebookProvider(), new MockLinkedInProvider()];
export const providers = {
  list: () => all,
  get: (id) => all.find((p) => p.id === id),
};
