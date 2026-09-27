// Percorre o fluxo principal na interface real e guarda as telas usadas no PDF.
// Cada passo é uma verificação: se a tela não chegar ao estado esperado, o teste falha
// e o documento não é gerado com uma captura errada.
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const SHOTS = new URL('../out/shots/', import.meta.url).pathname;
const EMAIL = `demo+${Date.now().toString(36)}@homecreators.app`;
const legenda = 'QUE GOLAÇO! 🔥\nMais um pra conta! ⚽\n\n#futebol #highlight #homecreators';

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

// espera os avisos temporários sumirem: eles cobrem botões e poluiriam o documento
async function semAvisos(page) {
  await page.waitForFunction(() => !document.querySelector('#toast-root')?.children.length, null, { timeout: 8000 }).catch(() => {});
}
async function shot(page, nome) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${SHOTS}${nome}.png` });
}

test('do login à publicação em duas redes', async ({ page }) => {
  const passos = [];
  const registra = (n, titulo, legendaTxt) => passos.push({ arquivo: `${n}.png`, titulo, legenda: legendaTxt });

  // ---------- 1. entrar ----------
  await page.goto('/');
  await expect(page.locator('.login')).toBeVisible();
  await page.fill('#lem', EMAIL);
  await page.fill('#lpw', 'segredo123');
  await shot(page, '01-login');
  registra('01-login', 'Entrar',
    'Em produção esta tela é o Supabase Auth. O app guarda o token e manda em toda chamada; o Worker confere a assinatura antes de responder.');

  await page.click('#lgo');

  // ---------- 2. home vazia ----------
  await expect(page.locator('.empty').first()).toBeVisible();
  await expect(page.locator('.stat').first()).toContainText('0');
  await shot(page, '02-home-vazia');
  registra('02-home-vazia', 'Conta nova, sem nada ainda',
    'Os números vêm do servidor, não do navegador: projetos, exportações, publicações e contas conectadas saem de /api/me e das listagens.');

  // ---------- 3. editor ----------
  await page.click('[data-route=reels]');
  await expect(page.locator('.sgi')).toHaveCount(12);
  await page.fill('[data-kbox=zoom]', '140%');
  await page.press('[data-kbox=zoom]', 'Enter');
  await page.click('[data-act=kfadd]');
  await expect(page.locator('.kfd')).toHaveCount(1);
  await semAvisos(page);
  await shot(page, '03-editor');
  registra('03-editor', 'Editar o corte',
    'Formato, zoom, posição, cor, overlay, música e keyframes. Tudo isso é um JSON — a receita de render — que o app salva em /api/projects e que o RunPod usa para gerar o vídeo.');

  // ---------- 4. exportando ----------
  await page.click('.rl-top [data-act=export]');
  await expect(page.locator('.phase')).toBeVisible();
  await shot(page, '04-exportando');
  registra('04-exportando', 'Exportar',
    'O Worker não roda ffmpeg: ele enfileira o job no RunPod e devolve 202. O app acompanha o progresso; quem marca o fim é o webhook do RunPod.');

  // ---------- 5. export pronto ----------
  await expect(page.locator('#rb')).toContainText('Reel exportado', { timeout: 60_000 });
  await expect(page.locator('.side')).toContainText('1 de 10 exports');
  await semAvisos(page);
  await shot(page, '05-export-pronto');
  registra('05-export-pronto', 'Vídeo pronto e uso contabilizado',
    'O arquivo fica no R2/B2 e o contador do plano sobe no servidor. Passou do limite, a API recusa com 402 — o navegador não decide isso.');

  // ---------- 6. conectar conta ----------
  await page.click('[data-rtab=pub]');
  await expect(page.locator('[data-conn=ig]')).toBeVisible();
  await page.click('[data-conn=ig]');
  await page.click('[data-a=next]');
  await shot(page, '06-conectar');
  registra('06-conectar', 'Conectar a conta, em linguagem de usuário',
    'Quatro passos, sem jargão. Em produção o botão leva ao login da própria rede; o Home Creators nunca vê a senha e guarda só um token, cifrado.');

  for (let i = 0; i < 3; i++) await page.click('[data-a=next]');
  await expect(page.locator('.modal')).toContainText('conectado com sucesso', { timeout: 30_000 });
  await page.click('[data-a=done]');

  // ---------- 7. contas conectadas ----------
  await page.click('[data-route=accounts]');
  await expect(page.locator('.acct')).toHaveCount(7);
  const igCard = page.locator('.acct').filter({ hasText: 'Instagram' });
  await expect(igCard).toContainText('Conectado');
  await page.locator('.acct').filter({ hasText: 'YouTube' }).getByRole('button', { name: 'Conectar' }).click();
  for (let i = 0; i < 4; i++) await page.click('[data-a=next]');
  await expect(page.locator('.modal')).toContainText('conectado com sucesso', { timeout: 30_000 });
  await page.click('[data-a=done]');
  await expect(page.locator('.acct').filter({ hasText: 'YouTube' })).toContainText('Conectado');
  await semAvisos(page);
  await shot(page, '07-contas');
  registra('07-contas', 'As 7 redes do escopo',
    'Instagram e YouTube são as duas primeiras a entrar em produção. As outras cinco já têm rota, tela e tutorial, e dependem só da aprovação de cada plataforma.');

  // ---------- 8. publicar ----------
  await page.click('[data-route=publications]');
  await page.fill('#cap, .p-cap', legenda);
  await expect(page.locator('.p-cnt')).toContainText('/2200');
  await semAvisos(page);
  await page.click('[data-now]');
  await expect(page.locator('.p-nets')).toContainText(/Na fila|Processando/);
  await shot(page, '08-publicando');
  registra('08-publicando', 'Uma legenda, várias redes',
    'O app manda a legenda e a lista de redes. A API cria uma publicação por rede e responde 202; o envio segue em segundo plano.');

  // ---------- 9. publicado ----------
  await expect(page.locator('.p-nets .pill.ok')).toHaveCount(2, { timeout: 60_000 });
  await semAvisos(page);
  await shot(page, '09-publicado');
  registra('09-publicado', 'Status por rede',
    'Cada rede tem o seu próprio estado. Uma falhar não afeta as outras, o botão de tentar de novo reenvia só aquela, e republicar o mesmo vídeo não duplica: o id é <export>:<rede>.');

  // ---------- 10. home preenchida ----------
  await page.click('[data-route=home]');
  await expect(page.locator('.proj')).toHaveCount(1);
  await expect(page.locator('.item').filter({ hasText: 'Publicado' }).first()).toBeVisible();
  await semAvisos(page);
  await shot(page, '10-home');
  registra('10-home', 'Tudo de volta, vindo do servidor',
    'Projetos, exportações e publicações são lidos da API. Trocar de navegador ou de máquina mostra o mesmo estado.');

  // ---------- 11. estratégias ----------
  await page.click('[data-route=strategies]');
  await expect(page.locator('.scols .card')).toHaveCount(6);
  await shot(page, '11-estrategias');
  registra('11-estrategias', 'Diferenciais',
    'Melhor horário por rede, templates por tipo de lance, capas, primeiros 3 segundos, multi-idioma e marca. Hoje são sugestões de exemplo; em produção saem do histórico de desempenho do próprio criador.');

  // ---------- 12. planos ----------
  await page.click('[data-route=settings]');
  await page.click('[data-tab=plano]');
  await expect(page.locator('.plan')).toHaveCount(3);
  await shot(page, '12-planos');
  registra('12-planos', 'Planos e limites',
    'Exportações, publicações e armazenamento por plano. A troca é feita pelo Checkout do Stripe, e o webhook assinado é quem muda o plano no banco.');

  writeFileSync(new URL('../out/passos.json', import.meta.url), JSON.stringify({ email: EMAIL, geradoEm: new Date().toISOString(), passos }, null, 2));
  expect(passos).toHaveLength(12);
});
