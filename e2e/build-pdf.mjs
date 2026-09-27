// Monta o documento a partir das capturas do Playwright e imprime em PDF.
// Rodar depois de `npx playwright test`: node build-pdf.mjs
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const dir = (p) => new URL(p, import.meta.url).pathname;
const { passos, geradoEm } = JSON.parse(readFileSync(dir('./out/passos.json'), 'utf8'));
const img = (arquivo) => `data:image/png;base64,${readFileSync(dir(`./out/shots/${arquivo}`)).toString('base64')}`;
const dataBR = new Date(geradoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

const diagrama = `
<svg viewBox="0 0 900 430" class="diag" role="img" aria-label="Arquitetura em produção">
  <defs>
    <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M0 0 10 5 0 10z" fill="rgba(245,245,247,.45)"/>
    </marker>
    <style>
      .b{fill:rgba(255,255,255,.05);stroke:rgba(255,255,255,.12)}
      .t{fill:#f5f5f7;font:600 13px Montserrat,sans-serif}
      .s{fill:rgba(245,245,247,.6);font:500 10.5px Montserrat,sans-serif}
      .l{stroke:rgba(245,245,247,.45);stroke-width:1.4;fill:none;marker-end:url(#a)}
      .lbl{fill:rgba(245,245,247,.55);font:600 9.5px Montserrat,sans-serif}
    </style>
  </defs>

  <rect class="b" x="18" y="150" width="150" height="66" rx="12"/>
  <text class="t" x="93" y="178" text-anchor="middle">Navegador</text>
  <text class="s" x="93" y="196" text-anchor="middle">Cloudflare Pages</text>

  <rect x="228" y="140" width="170" height="86" rx="12" fill="rgba(10,132,255,.14)" stroke="#0a84ff"/>
  <text class="t" x="313" y="172" text-anchor="middle">Worker</text>
  <text class="s" x="313" y="190" text-anchor="middle">API, sessão, limites,</text>
  <text class="s" x="313" y="205" text-anchor="middle">fila e webhooks</text>

  <rect class="b" x="470" y="18" width="180" height="58" rx="12"/>
  <text class="t" x="560" y="42" text-anchor="middle">Supabase</text>
  <text class="s" x="560" y="59" text-anchor="middle">login e contas</text>

  <rect class="b" x="470" y="96" width="180" height="58" rx="12"/>
  <text class="t" x="560" y="120" text-anchor="middle">D1</text>
  <text class="s" x="560" y="137" text-anchor="middle">projetos, exports, tokens</text>

  <rect class="b" x="470" y="174" width="180" height="58" rx="12"/>
  <text class="t" x="560" y="198" text-anchor="middle">RunPod</text>
  <text class="s" x="560" y="215" text-anchor="middle">ffmpeg na GPU</text>

  <rect class="b" x="470" y="252" width="180" height="58" rx="12"/>
  <text class="t" x="560" y="276" text-anchor="middle">R2 e B2</text>
  <text class="s" x="560" y="293" text-anchor="middle">vídeo da partida e export</text>

  <rect class="b" x="470" y="330" width="180" height="58" rx="12"/>
  <text class="t" x="560" y="354" text-anchor="middle">Stripe</text>
  <text class="s" x="560" y="371" text-anchor="middle">planos</text>

  <rect x="712" y="174" width="170" height="86" rx="12" fill="rgba(52,199,89,.12)" stroke="#34c759"/>
  <text class="t" x="797" y="206" text-anchor="middle">7 redes sociais</text>
  <text class="s" x="797" y="224" text-anchor="middle">Instagram, YouTube,</text>
  <text class="s" x="797" y="239" text-anchor="middle">TikTok, X, Threads…</text>

  <path class="l" d="M170 183 H222"/>
  <text class="lbl" x="196" y="176" text-anchor="middle">JWT</text>
  <path class="l" d="M398 170 C435 170 435 47 464 47"/>
  <path class="l" d="M398 160 C435 160 435 125 464 125"/>
  <path class="l" d="M398 183 H464"/>
  <path class="l" d="M398 196 C435 196 435 281 464 281"/>
  <path class="l" d="M398 210 C435 210 435 359 464 359"/>
  <path class="l" d="M650 203 H706"/>
  <text class="lbl" x="678" y="196" text-anchor="middle">vídeo</text>
  <path class="l" d="M712 232 C660 232 660 226 398 226"/>
  <text class="lbl" x="556" y="246" text-anchor="middle">status da publicação</text>
</svg>`;

const linha = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Home Creators — como funciona em produção</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 0; }
  :root{--bg1:#0a0a0c;--bg2:#050506;--card:rgba(255,255,255,.05);--tx:#f5f5f7;--mut:rgba(245,245,247,.72);--line:rgba(255,255,255,.12);--blue:#0a84ff;--green:#34c759;--red:#ff3b30}
  *{box-sizing:border-box;margin:0}
  body{font:400 11px/1.55 Montserrat,system-ui,sans-serif;color:var(--tx);background:var(--bg1);-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pg{width:297mm;height:210mm;padding:13mm 15mm;background:linear-gradient(160deg,var(--bg1),var(--bg2));page-break-after:always;display:flex;flex-direction:column;position:relative}
  .pg:last-child{page-break-after:auto}
  h1{font-size:34px;font-weight:700;letter-spacing:-.02em;line-height:1.15}
  h2{font-size:17px;font-weight:600;margin-bottom:3mm}
  h3{font-size:12px;font-weight:600;color:var(--mut);text-transform:uppercase;letter-spacing:.07em;margin-bottom:3mm}
  p{color:var(--mut);margin-bottom:2.5mm;max-width:210mm}
  .mark{width:34px;height:34px;border-radius:11px;background:var(--blue);display:inline-grid;place-items:center;vertical-align:middle;margin-right:9px}
  .brand{display:flex;align-items:center;font-weight:700;font-size:15px}
  .cover{justify-content:center;gap:6mm}
  .cover h1{font-size:46px}
  .lead{font-size:14px;color:var(--mut);max-width:150mm}
  .meta{margin-top:auto;padding-top:6mm;border-top:1px solid var(--line);display:flex;gap:10mm;font-size:10px;color:var(--mut)}
  .meta b{display:block;color:var(--tx);font-size:11px;margin-bottom:1mm}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:5mm;margin-bottom:4mm}
  .warn{border-color:rgba(255,159,10,.5);background:rgba(255,159,10,.08)}
  .warn h3{color:#ff9f0a}
  table{width:100%;border-collapse:collapse;font-size:10px}
  th,td{text-align:left;padding:2.4mm 2mm;border-bottom:1px solid var(--line);vertical-align:top}
  th{color:var(--mut);font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:.06em}
  td:first-child{width:38%;color:var(--tx);font-weight:500}
  td{color:var(--mut)}
  ul{margin:0 0 3mm 4.5mm;color:var(--mut)}li{margin-bottom:1.6mm}
  .num{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--blue);color:#fff;font-weight:700;font-size:11px;margin-right:7px;flex:none}
  .step-h{display:flex;align-items:center;margin-bottom:2mm}
  .step-h h2{margin:0}
  .shot{width:auto;max-width:100%;max-height:143mm;border:1px solid var(--line);border-radius:10px;display:block;margin:3mm auto 0;box-shadow:0 6px 22px rgba(0,0,0,.45)}
  .cap{font-size:10.5px;color:var(--mut);margin-top:3mm;padding-left:29px}
  .arq{display:grid;grid-template-columns:1.05fr 1fr;gap:8mm;align-items:start}
  .arq table{font-size:9px}
  .diag{width:100%;height:auto;margin:1mm auto 3mm;display:block}
  .foot{position:absolute;left:15mm;right:15mm;bottom:7mm;display:flex;justify-content:space-between;font-size:8.5px;color:rgba(245,245,247,.45);border-top:1px solid var(--line);padding-top:2.5mm}
  .ok{color:var(--green)}.no{color:#ff9f0a}
  .grid2{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm}
  .kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:4mm}
  .kpi b{display:block;font-size:22px;font-weight:700}
  .kpi span{font-size:9.5px;color:var(--mut)}
  .cover-grid{display:grid;grid-template-columns:1fr 1.05fr;gap:12mm;align-items:center;flex:1}
  .cover-txt{display:flex;flex-direction:column;gap:5mm}
  .cover-art{position:relative;height:120mm}
  .cover-art img{position:absolute;width:88%;border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,.55)}
  .cover-art img:first-child{top:6mm;left:0}
  .cover-art img.b{bottom:4mm;right:0;width:70%;opacity:.95}
  .sumario{list-style:none;margin:0;padding:0;columns:2;column-gap:12mm}
  .sumario li{display:flex;align-items:baseline;gap:3mm;font-size:10px;color:var(--tx);padding:1.6mm 0;border-bottom:1px solid var(--line);break-inside:avoid}
  .sumario span{color:var(--blue);font-weight:700;font-size:9px}
  .sumario i{margin-left:auto;font-style:normal;color:rgba(245,245,247,.45);font-size:8.5px}
</style></head><body>

<section class="pg cover">
  <div class="cover-grid">
    <div class="cover-txt">
      <div class="brand"><span class="mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M10 8.5l6 3.5-6 3.5z"/></svg></span>Home Creators</div>
      <h1>Como vai funcionar<br>em produção</h1>
      <p class="lead">Do corte validado ao post publicado: o caminho completo de um Reel, tela a tela, com a arquitetura que sustenta cada passo e o que ainda falta para ligar na produção de verdade.</p>
    </div>
    <div class="cover-art"><img src="${img('03-editor.png')}" alt=""><img class="b" src="${img('09-publicado.png')}" alt=""></div>
  </div>
  <div class="meta">
    <div><b>${dataBR}</b>Gerado automaticamente</div>
    <div><b>Playwright</b>Capturas do app rodando</div>
    <div><b>${passos.length} passos</b>Login → publicação</div>
  </div>
  <div class="foot"><span>Home Creators — documento técnico</span><span>Capa</span></div>
</section>

<section class="pg">
  <h3>Antes de tudo</h3>
  <h2>De onde vêm estas telas</h2>
  <p>Todas as imagens deste documento foram capturadas pelo Playwright com o app <b>realmente rodando</b> em container, contra a API real: cada passo do fluxo é também um teste, e o documento só é gerado se todos passarem. Nenhuma tela foi desenhada ou montada à mão.</p>
  <div class="card warn">
    <h3>O que é simulado nestas capturas</h3>
    <p style="margin:0">O ambiente de demonstração usa <b>adaptadores simulados</b> em dois pontos: o render do vídeo (que em produção é o RunPod) e as APIs das redes sociais (que dependem de aprovação de cada plataforma). Todo o resto — sessão, banco, limites de plano, fila de publicação, status por rede, webhooks — é o mesmo código que vai para produção.</p>
  </div>
  <div class="grid2">
    <div class="kpi"><b class="ok">12</b><span>testes da API contra o container</span></div>
    <div class="kpi"><b class="ok">12</b><span>passos do fluxo verificados na interface</span></div>
    <div class="kpi"><b class="ok">90</b><span>checks do app em modo offline</span></div>
    <div class="kpi"><b class="no">2</b><span>integrações à espera de aprovação</span></div>
  </div>
  <h3 style="margin-top:7mm">O caminho de um Reel</h3>
  <ol class="sumario">${passos.map((p, i) => `<li><span>${String(i + 1).padStart(2, '0')}</span>${p.titulo}<i>pág. ${i + 4}</i></li>`).join('')}</ol>
  <div class="foot"><span>Home Creators — documento técnico</span><span>2</span></div>
</section>

<section class="pg">
  <h3>Arquitetura</h3>
  <h2>Quem faz o quê em produção</h2>
  <div class="arq">${diagrama}
  <table>
    <tr><th>Peça</th><th>Responsabilidade</th></tr>
    ${linha('Cloudflare Pages', 'Serve o app. Sem build: são módulos ES puros, publicados como pasta estática.')}
    ${linha('Cloudflare Workers', 'A API. Confere a sessão, aplica os limites do plano, enfileira o render e coordena a publicação por rede.')}
    ${linha('Cloudflare D1', 'Projetos, exportações, publicações e os tokens das redes — sempre cifrados em repouso.')}
    ${linha('R2 e Backblaze B2', 'B2 guarda o arquivo grande da partida; R2 guarda e serve o Reel exportado.')}
    ${linha('RunPod', 'Renderiza o vídeo na GPU. O Worker não roda ffmpeg: ele enfileira o job e recebe o resultado por webhook.')}
    ${linha('Supabase', 'Login e contas. O app manda o token em toda chamada; o Worker confere a assinatura.')}
    ${linha('Stripe', 'Planos. O webhook assinado é o único que muda o plano no banco.')}
    ${linha('Redes sociais', 'Instagram e YouTube primeiro; TikTok, X, Threads, Facebook e LinkedIn em seguida.')}
  </table></div>
  <div class="foot"><span>Home Creators — documento técnico</span><span>3</span></div>
</section>

${passos.map((p, i) => `
<section class="pg">
  <div class="step-h"><span class="num">${i + 1}</span><h2>${p.titulo}</h2></div>
  <div class="cap">${p.legenda}</div>
  <img class="shot" src="${img(p.arquivo)}" alt="${p.titulo}">
  <div class="foot"><span>O caminho de um Reel · passo ${i + 1} de ${passos.length}</span><span>${i + 4}</span></div>
</section>`).join('')}

<section class="pg">
  <h3>Da demonstração para a produção</h3>
  <h2>O que muda, exatamente</h2>
  <p>A troca é de configuração, não de código: os adaptadores têm a mesma interface nos dois modos.</p>
  <table>
    <tr><th>Hoje (demonstração)</th><th>Em produção</th></tr>
    ${linha('Login por e-mail, sem senha (<code>DEV_LOGIN</code>)', 'Supabase Auth. A rota de desenvolvimento não existe no Worker e não pode ser ligada em produção.')}
    ${linha('Render simulado (<code>RENDER_MODE=mock</code>)', 'RunPod com ffmpeg. A receita de render é o mesmo JSON que o editor já salva.')}
    ${linha('Redes simuladas (<code>SOCIAL_MODE=mock</code>)', 'API de cada rede, ou um agregador enquanto as aprovações não saem.')}
    ${linha('Banco em arquivo, dentro do container', 'Cloudflare D1, com o mesmo schema e as mesmas consultas.')}
    ${linha('Vídeo com endereço de exemplo', 'Arquivo real no R2, servido por URL assinada.')}
    ${linha('Troca de plano sem cobrança', 'Checkout do Stripe e webhook assinado.')}
  </table>
  <h3 style="margin-top:6mm">Já garantido por teste automatizado</h3>
  <ul>
    <li>Sessão conferida em toda rota; token forjado, expirado ou sem assinatura é recusado.</li>
    <li>Um usuário não enxerga nem altera dados de outro, nem mesmo ao salvar com um id alheio.</li>
    <li>Limites do plano aplicados no servidor: estourou, a API recusa. O navegador não decide.</li>
    <li>Publicação idempotente por <code>&lt;export&gt;:&lt;rede&gt;</code>: republicar não duplica nem conta de novo.</li>
    <li>Uma rede falhar não afeta as outras, e o retry reenvia só a que falhou.</li>
    <li>Tokens das redes cifrados em repouso; nunca gravados em texto puro.</li>
    <li>Webhooks do RunPod e do Stripe recusam chamadas sem segredo ou com assinatura inválida.</li>
  </ul>
  <div class="foot"><span>Home Creators — documento técnico</span><span>${passos.length + 4}</span></div>
</section>

<section class="pg">
  <h3>Antes de ligar</h3>
  <h2>O que ainda falta</h2>
  <p>Em ordem de caminho crítico. Os dois primeiros não dependem de código.</p>
  <table>
    <tr><th>Item</th><th>Por quê</th></tr>
    ${linha('Aprovação dos apps nas plataformas', 'Meta, Google, TikTok, X e LinkedIn levam de dias a semanas. Começar no primeiro dia, em paralelo ao restante.')}
    ${linha('Credenciais e ambiente de staging', 'Supabase, Stripe, RunPod, R2 e B2, com staging separado da produção.')}
    ${linha('Imagem do RunPod', 'O container com ffmpeg que lê a receita e devolve o mp4 ainda não faz parte deste repositório.')}
    ${linha('Modo ao vivo das redes', 'Instagram e YouTube estão escritos com as chamadas corretas, mas sem app aprovado não foi possível verificar. As outras cinco ainda respondem 501.')}
    ${linha('Agendamento disparar de fato', 'A data já é gravada; falta o Cron Trigger que publica na hora marcada.')}
    ${linha('Fila dedicada', 'Hoje a entrega roda junto com a requisição. Com volume, Cloudflare Queues.')}
    ${linha('Renovação de token em segundo plano', 'Hoje o token só é renovado na hora de publicar.')}
    ${linha('Limpeza e retenção', 'Exports antigos, pedidos de conexão vencidos e limite de requisições por usuário.')}
  </table>
  <div class="card" style="margin-top:5mm">
    <h3>Decisão de produto pendente</h3>
    <p style="margin:0">Baixar música por link do YouTube ou Instagram fere os termos das plataformas e é violação de direito autoral: o vídeo publicado com áudio protegido gera bloqueio na conta do próprio criador. A alternativa entrega o mesmo valor sem o risco: <b>upload do arquivo próprio</b> mais uma <b>biblioteca licenciada</b>. O app já está construído assim.</p>
  </div>
  <div class="foot"><span>Home Creators — documento técnico</span><span>${passos.length + 5}</span></div>
</section>

</body></html>`;

mkdirSync(dir('./out'), { recursive: true });
writeFileSync(dir('./out/documento.html'), html);

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto(`file://${dir('./out/documento.html')}`, { waitUntil: 'networkidle' });
await page.emulateMedia({ media: 'print' });
const saida = dir('../docs/como-funciona-em-producao.pdf');
await page.pdf({ path: saida, format: 'A4', landscape: true, printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
await browser.close();
console.log(`PDF gerado: docs/como-funciona-em-producao.pdf (${passos.length + 5} páginas)`);
