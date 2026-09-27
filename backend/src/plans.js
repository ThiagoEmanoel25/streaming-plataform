// Limites por plano. Checados no servidor — o cliente não decide isso.
export const PLANS = {
  starter: { name: 'Starter', exports: 10, publications: 20, storage: 5, price: 'R$ 0', priceEnv: null },
  creator: { name: 'Creator', exports: 50, publications: 100, storage: 25, price: 'R$ 49', priceEnv: 'STRIPE_PRICE_CREATOR' },
  pro: { name: 'Pro', exports: 300, publications: 600, storage: 100, price: 'R$ 149', priceEnv: 'STRIPE_PRICE_PRO' },
};
export const planOf = (id) => PLANS[id] || PLANS.starter;
