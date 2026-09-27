// Instagram Reels via Graph API (conta Business/Creator ligada a uma Página).
// Fluxo: cria o container -> espera terminar -> publica.
// NÃO VERIFICADO contra a API real: precisa de App Review aprovado da Meta.
import { HttpError } from '../http.js';

const G = 'https://graph.facebook.com/v21.0';
const fail = (msg, status = 502) => { throw new HttpError(status, msg, 'instagram'); };

export const authorizeUrl = (env, state) => {
  const p = new URLSearchParams({
    client_id: env.IG_CLIENT_ID, redirect_uri: `${env.PUBLIC_URL}/api/social/instagram/callback`,
    scope: 'instagram_basic,instagram_content_publish,pages_show_list,business_management', response_type: 'code', state,
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${p}`;
};

export async function exchange(env, code) {
  const p = new URLSearchParams({
    client_id: env.IG_CLIENT_ID, client_secret: env.IG_CLIENT_SECRET,
    redirect_uri: `${env.PUBLIC_URL}/api/social/instagram/callback`, code,
  });
  const short = await (await fetch(`${G}/oauth/access_token?${p}`)).json();
  if (!short.access_token) fail('O Instagram não autorizou a conexão. Tente de novo.');
  // token longo (~60 dias); precisa ser renovado antes de expirar
  const lp = new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: env.IG_CLIENT_ID, client_secret: env.IG_CLIENT_SECRET, fb_exchange_token: short.access_token });
  const long = await (await fetch(`${G}/oauth/access_token?${lp}`)).json();
  const token = long.access_token || short.access_token;

  const pages = await (await fetch(`${G}/me/accounts?fields=instagram_business_account{id,username}&access_token=${token}`)).json();
  const page = (pages.data || []).find((x) => x.instagram_business_account);
  if (!page) fail('Nenhuma conta profissional do Instagram ligada a uma Página do Facebook foi encontrada.', 400);
  const ig = page.instagram_business_account;
  return { token, refreshToken: null, externalId: ig.id, handle: `@${ig.username}`, expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null };
}

export async function publish(env, conn, { videoUrl, caption }) {
  const create = await (await fetch(`${G}/${conn.external_id}/media`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ media_type: 'REELS', video_url: videoUrl, caption, access_token: conn.token }),
  })).json();
  if (!create.id) fail(create.error?.message || 'O Instagram recusou o envio do vídeo.');

  // o container leva de segundos a minutos; a API só aceita publicar depois de FINISHED
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await (await fetch(`${G}/${create.id}?fields=status_code,status&access_token=${conn.token}`)).json();
    if (st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR') fail(st.status || 'O Instagram não conseguiu processar o vídeo.');
    if (i === 29) fail('O Instagram demorou demais para processar o vídeo.', 504);
  }
  const pub = await (await fetch(`${G}/${conn.external_id}/media_publish`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ creation_id: create.id, access_token: conn.token }),
  })).json();
  if (!pub.id) fail(pub.error?.message || 'O Instagram recusou a publicação.');
  return { externalId: pub.id, permalink: `https://www.instagram.com/reel/${pub.id}/` };
}
