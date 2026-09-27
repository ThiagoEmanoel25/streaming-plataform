// Stripe: Checkout para trocar de plano + webhook que grava o plano no D1.
import { HttpError } from './http.js';
import { hmac, hex, timingSafeEqual } from './crypto.js';
import { PLANS } from './plans.js';

const api = async (env, path, body) => {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, out.error?.message || 'O pagamento não pôde ser iniciado.', 'stripe');
  return out;
};

export async function createCheckout(env, user, planId) {
  const plan = PLANS[planId];
  if (!plan || !plan.priceEnv) throw new HttpError(400, 'Plano inválido.', 'bad_plan');
  const price = env[plan.priceEnv];
  if (!price || !env.STRIPE_SECRET_KEY) throw new HttpError(501, 'Pagamento ainda não configurado neste ambiente.', 'not_enabled');
  const s = await api(env, 'checkout/sessions', {
    mode: 'subscription', 'line_items[0][price]': price, 'line_items[0][quantity]': '1',
    success_url: `${env.APP_URL}/?plan=ok`, cancel_url: `${env.APP_URL}/?plan=cancel`,
    client_reference_id: user.id, 'metadata[user_id]': user.id, 'metadata[plan]': planId,
    ...(user.email ? { customer_email: user.email } : {}),
  });
  return { url: s.url, id: s.id };
}

// assinatura do webhook: t=<ts>,v1=<hmac(ts.payload)>
export async function verifyStripeSignature(env, header, payload) {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new HttpError(501, 'Webhook do Stripe não configurado.', 'not_enabled');
  const parts = Object.fromEntries(String(header || '').split(',').map((kv) => kv.split('=')));
  if (!parts.t || !parts.v1) throw new HttpError(400, 'Assinatura ausente.', 'bad_signature');
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) throw new HttpError(400, 'Assinatura expirada.', 'bad_signature');
  const expected = hex(await hmac(env.STRIPE_WEBHOOK_SECRET, `${parts.t}.${payload}`));
  const enc = new TextEncoder();
  if (!timingSafeEqual(enc.encode(expected), enc.encode(parts.v1))) throw new HttpError(400, 'Assinatura inválida.', 'bad_signature');
  return JSON.parse(payload);
}

export const planFromEvent = (env, event) => {
  const o = event.data?.object || {};
  const userId = o.client_reference_id || o.metadata?.user_id;
  if (!userId) return null;
  if (event.type === 'checkout.session.completed') return { userId, plan: o.metadata?.plan || 'creator', customer: o.customer || null };
  if (event.type === 'customer.subscription.deleted') return { userId, plan: 'starter', customer: o.customer || null };
  return null;
};
