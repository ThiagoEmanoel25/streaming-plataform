// Sessão = JWT do Supabase (HS256, assinado com o JWT secret do projeto).
import { unauthorized } from './http.js';
import { hmac, unb64url, timingSafeEqual } from './crypto.js';

export async function verifySupabaseJWT(token, secret) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw unauthorized('Sessão inválida.');
  const [h, p, sig] = parts;
  let head;
  try { head = JSON.parse(new TextDecoder().decode(unb64url(h))); } catch { throw unauthorized('Sessão inválida.'); }
  // trava o algoritmo: sem isso, um token "alg:none" passaria
  if (head.alg !== 'HS256') throw unauthorized('Sessão inválida.');
  const expected = await hmac(secret, `${h}.${p}`);
  if (!timingSafeEqual(expected, unb64url(sig))) throw unauthorized('Sessão inválida.');
  const claims = JSON.parse(new TextDecoder().decode(unb64url(p)));
  if (!claims.sub) throw unauthorized('Sessão inválida.');
  if (claims.exp && claims.exp * 1000 <= Date.now()) throw unauthorized('Sua sessão expirou. Entre de novo.');
  return { id: claims.sub, email: claims.email || null };
}

export async function authenticate(req, env) {
  const raw = req.headers.get('authorization') || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : null;
  if (!token) throw unauthorized();
  if (!env.SUPABASE_JWT_SECRET) throw unauthorized('Backend sem SUPABASE_JWT_SECRET configurado.');
  return verifySupabaseJWT(token, env.SUPABASE_JWT_SECRET);
}
