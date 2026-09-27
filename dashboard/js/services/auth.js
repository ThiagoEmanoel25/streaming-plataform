// Contrato de autenticação. Produção: Supabase Auth (signInWithPassword / signInWithOAuth / signOut).
import { store } from '../store.js';
import { live, call, setToken } from './backend.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class AuthProvider {
  get session() { return null; }
  async signIn(_email, _password) { throw new Error('não implementado'); }
  async signInWithGoogle() { throw new Error('não implementado'); }
  async signOut() { throw new Error('não implementado'); }
}
export class MockAuthProvider extends AuthProvider {
  get session() { return store.state.session; }
  async signIn(email, password) {
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Digite um e-mail válido.');
    if ((password || '').length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
    // com backend: pega um token de verdade; sem backend: sessão só no navegador
    if (live()) {
      const r = await call('POST', '/dev/login', { email }).catch((e) => {
        throw new Error(e.status === 404 ? 'Este ambiente exige login pelo Supabase.' : e.message);
      });
      setToken(r.token);
    } else await sleep(700);
    store.set({ session: { email }, user: { ...store.state.user, email } });
  }
  async signInWithGoogle() { return this.signIn(store.state.user.email, 'google-oauth'); }
  async signOut() { setToken(null); store.set({ session: null }); }
}
export const auth = new MockAuthProvider();
