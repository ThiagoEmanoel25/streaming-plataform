// Tokens das redes cifrados em repouso (AES-256-GCM). TOKEN_KEY = 32 bytes em base64.
const enc = new TextEncoder(), dec = new TextDecoder();
export const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64url = (s) => unb64(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));

const keyOf = async (raw) => {
  const bytes = unb64(raw);
  if (bytes.length !== 32) throw new Error('TOKEN_KEY precisa ter 32 bytes em base64.');
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

export async function seal(plain, rawKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(rawKey), enc.encode(plain));
  return `v1.${b64(iv)}.${b64(ct)}`;
}
export async function unseal(blob, rawKey) {
  const [v, iv, ct] = String(blob).split('.');
  if (v !== 'v1' || !iv || !ct) throw new Error('Token cifrado em formato desconhecido.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await keyOf(rawKey), unb64(ct));
  return dec.decode(pt);
}

// HMAC-SHA256 (usado no JWT do Supabase, no state do OAuth e nos webhooks)
export async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
export const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
// comparação em tempo constante: evita vazar a assinatura byte a byte
export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
