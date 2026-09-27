// YouTube Shorts via Data API v3 (upload resumable).
// NÃO VERIFICADO contra a API real: precisa de OAuth verificado e cota liberada.
import { HttpError } from '../http.js';

const fail = (msg, status = 502) => { throw new HttpError(status, msg, 'youtube'); };
const TOKEN = 'https://oauth2.googleapis.com/token';

export const authorizeUrl = (env, state) => {
  const p = new URLSearchParams({
    client_id: env.YT_CLIENT_ID, redirect_uri: `${env.PUBLIC_URL}/api/social/youtube/callback`,
    response_type: 'code', scope: 'https://www.googleapis.com/auth/youtube.upload', access_type: 'offline', prompt: 'consent', state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
};

export async function exchange(env, code) {
  const r = await (await fetch(TOKEN, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.YT_CLIENT_ID, client_secret: env.YT_CLIENT_SECRET, redirect_uri: `${env.PUBLIC_URL}/api/social/youtube/callback`, grant_type: 'authorization_code' }),
  })).json();
  if (!r.access_token) fail('O YouTube não autorizou a conexão. Tente de novo.');
  const ch = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { authorization: `Bearer ${r.access_token}` } })).json();
  const c = ch.items?.[0];
  return { token: r.access_token, refreshToken: r.refresh_token || null, externalId: c?.id || null, handle: c?.snippet?.title || 'Meu canal', expiresAt: new Date(Date.now() + (r.expires_in || 3600) * 1000).toISOString() };
}

// o access_token do Google dura 1h: renova pelo refresh_token antes de cada envio
export async function refresh(env, conn) {
  if (!conn.refresh_token) fail('Reconecte sua conta do YouTube.', 401);
  const r = await (await fetch(TOKEN, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: conn.refresh_token, client_id: env.YT_CLIENT_ID, client_secret: env.YT_CLIENT_SECRET, grant_type: 'refresh_token' }),
  })).json();
  if (!r.access_token) fail('Reconecte sua conta do YouTube.', 401);
  return { token: r.access_token, expiresAt: new Date(Date.now() + (r.expires_in || 3600) * 1000).toISOString() };
}

export async function publish(env, conn, { videoUrl, caption }) {
  const title = (caption || 'Highlight').split('\n')[0].slice(0, 95) || 'Highlight';
  const start = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST', headers: { authorization: `Bearer ${conn.token}`, 'content-type': 'application/json', 'x-upload-content-type': 'video/mp4' },
    body: JSON.stringify({ snippet: { title, description: caption || '' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } }),
  });
  const session = start.headers.get('location');
  if (!session) fail(`O YouTube recusou o envio (${start.status}).`);

  const src = await fetch(videoUrl);
  if (!src.ok) fail('Não foi possível ler o vídeo exportado.');
  const up = await fetch(session, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: src.body });
  const out = await up.json().catch(() => ({}));
  if (!out.id) fail(out.error?.message || 'O YouTube não concluiu o envio.');
  return { externalId: out.id, permalink: `https://youtube.com/shorts/${out.id}` };
}
