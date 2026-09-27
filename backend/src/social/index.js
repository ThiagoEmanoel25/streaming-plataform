// Registro das redes. Uma implementação por rede, mesma interface:
//   authorizeUrl(env, state) -> string
//   exchange(env, code)      -> { token, refreshToken, externalId, handle, expiresAt }
//   publish(env, conn, { videoUrl, caption }) -> { externalId, permalink }
// SOCIAL_MODE=mock (padrão) usa o provider simulado; 'live' usa a API real.
import { HttpError } from '../http.js';
import * as instagram from './instagram.js';
import * as youtube from './youtube.js';

export const NETWORKS = {
  instagram: { name: 'Instagram', maxChars: 2200, live: instagram },
  youtube: { name: 'YouTube', maxChars: 5000, live: youtube },
  tiktok: { name: 'TikTok', maxChars: 2200, live: null },
  x: { name: 'X', maxChars: 280, live: null },
  threads: { name: 'Threads', maxChars: 500, live: null },
  facebook: { name: 'Facebook', maxChars: 5000, live: null },
  linkedin: { name: 'LinkedIn', maxChars: 3000, live: null },
};
export const isNetwork = (id) => Object.hasOwn(NETWORKS, id);

// Simulado: mesmo contrato, sem chamar ninguém. Serve para rodar o fluxo inteiro sem credenciais.
const mock = (id) => ({
  authorizeUrl: (env, state) => `${env.PUBLIC_URL}/api/social/${id}/callback?code=mock-code&state=${state}`,
  exchange: async () => ({ token: `mock-token-${id}`, refreshToken: null, externalId: `mock-${id}`, handle: id === 'youtube' ? 'Home Creators' : '@homecreators', expiresAt: null }),
  publish: async (env, conn, { caption }) => {
    // MOCK_PUBLISH_MS dá tempo de ver os estados fila -> processando na interface
    const wait = Number(env.MOCK_PUBLISH_MS || 0);
    if (wait) await new Promise((r) => setTimeout(r, wait));
    if (env.MOCK_FAIL_NETWORK === id) throw new HttpError(502, 'Não foi possível enviar o vídeo agora. Tente novamente.', id);
    const ext = `mock_${crypto.randomUUID().slice(0, 8)}`;
    return { externalId: ext, permalink: `https://example.invalid/${id}/${ext}`, caption };
  },
});

export function providerFor(env, id) {
  const meta = NETWORKS[id];
  if (!meta) throw new HttpError(400, 'Rede não suportada.', 'bad_network');
  if (env.SOCIAL_MODE !== 'live') return mock(id);
  if (!meta.live) throw new HttpError(501, `A publicação no ${meta.name} ainda não está liberada.`, 'not_enabled');
  return meta.live;
}
