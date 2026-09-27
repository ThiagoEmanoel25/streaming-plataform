import { test, expect } from '@playwright/test';
test('a API responde', async ({ request }) => {
  const r = await request.get('/api/health');
  expect(r.ok()).toBeTruthy();
  expect(await r.json()).toEqual({ ok: true });
});
