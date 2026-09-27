# Plano — fechar o escopo mínimo

## Segunda mudança de rumo (decisão do cliente): publicar de verdade no YouTube

O cliente quer publicar no **canal dele de verdade**, ainda para o teste técnico. Isso reverte
parte da decisão anterior.

Correção importante de premissa: um app do Google em modo de teste **não precisa de verificação**
para subir vídeo no canal do próprio dono — o vídeo apenas entra como privado. E o YouTube
**recebe os bytes** (upload resumable), em vez de buscar numa URL pública como o Instagram.
Consequência: **não é preciso túnel, nem bucket público, nem a Task 2 (storage S3)** para este teste.
Basta o backend conseguir ler o mp4 que o render produziu, o que acontece dentro da rede do Docker.

- Task 3 (ligar o export ponta a ponta) **volta**, usando o servidor de arquivos do próprio render
  (`/files/<key>`) como origem do mp4. Task 2 (S3/MinIO) **segue descartada** — vira assunto do
  documento de escala.
- Entram a Task 10 (YouTube real) e a Task 11 (tutorial de conexão à altura do fluxo real).
- Instagram fica para depois: exige conta Business ligada a uma Página e URL pública do vídeo.

Ordem: **3 → 10 → 11 → 7 → 8+9**.

## Mudança de rumo (decisão do cliente)

O alvo é **um MVP para teste técnico + um documento de escala**, não um produto em produção.
Consequências:

- O export **fica simulado**. As Tasks 2 e 3 (storage S3 e ligar o render ponta a ponta) estão
  **descartadas**.
- A Task 1 (worker de render com ffmpeg) **já foi construída e testada**, e continua no repositório
  em `render/`, **sem estar ligada ao app**. Não é custo: é a prova de que a receita do editor vira
  mp4 de verdade, e o `render/test.sh` demonstra isso sozinho. O demo roda no modo simulado do backend.
- Entram três documentos: escala (Task 8), pesquisa de mercado com fontes (Task 7) e
  roteiro de demonstração (Task 9).
- Aprovações das redes, contas Cloudflare/RunPod/Supabase/Stripe **deixam de ser perseguidas**.
  Viram assunto do documento de escala.

Ordem de execução: **5 → 4 → 6 → 7 → 8+9**.

## Contexto

`dashboard/` (app, Cloudflare Pages, ES modules sem build) e `backend/` (API, Cloudflare Worker + D1,
sem dependências) já entregam o fluxo **conectar conta → editar → exportar → publicar**, mas em modo
simulado. A auditoria apontou que o export não produz vídeo nenhum, não há storage, os segmentos são
fixos no front e Stripe/Supabase não são chamados pelo app.

Este plano fecha o que é possível fechar **sem as contas de terceiros do cliente**.

Fora deste plano (depende de conta/aprovação do cliente, não de código):
deploy na Cloudflare, aprovação dos apps nas redes, conta RunPod, chaves Stripe, projeto Supabase.

## Spec (autoridade)

O escopo do cliente, resumido no que este plano ataca:
- "Crop 9:16 / 4:5, zoom, posição, keyframes, cor / Overlay logo/imagem, música / Salvar projeto + **exportar vídeo final**"
- "Segmentos do preview → painel Reels"
- "Planos via Stripe (limites de export/publicação conforme plano)"
- "Login via Supabase"
- Design obrigatório: fundo `#0a0a0c`→`#050506`, card `rgba(255,255,255,.05)`, texto `#f5f5f7`,
  muted `rgba(245,245,247,.72)`, linha `rgba(255,255,255,.12)`, azul `#0a84ff`, verde `#34c759`,
  erro `#ff3b30`, fonte Montserrat, toggles iOS, ícones SVG.

## Global Constraints

1. **Zero dependências novas** em `backend/` e `dashboard/`. O render pode usar Python da stdlib e o binário `ffmpeg`.
2. **O modo mock não pode quebrar.** Sem backend, o app tem de continuar funcionando offline.
   `cd dashboard && sh tests/run.sh` deve seguir com 90 PASS / 0 FAIL.
3. **`cd backend && npm test` deve seguir verde** (12+ testes) e todo comportamento novo entra com teste.
4. **Texto para o usuário em pt-BR, sem jargão.** Nunca "token", "OAuth", "API key" na interface.
5. **Não reinventar o visual.** Usar os tokens e componentes que já existem em `dashboard/css/styles.css`
   e `dashboard/js/ui/components.js`. Nenhuma cor fora da paleta acima.
6. **Segredos nunca em claro**: nem em log, nem no banco, nem em resposta de API.
7. **Commits pequenos**, um por tarefa, mensagem em português.

## Task 1 — Render de verdade (ffmpeg)

Criar `render/`: um worker que recebe a receita do projeto e devolve um **mp4 real**.

**Contrato de entrada** (o mesmo que `backend/src/render.js` já enfileira):
```json
{ "input": { "export_id": "exp_x", "recipe": { ... }, "source_key": "s1", "duration": 14,
             "output": { "bucket": "homecreators-exports", "key": "user/exp_x.mp4" } },
  "webhook": "http://api:8787/api/hooks/render?token=..." }
```
`recipe` é exatamente o `data` do projeto que o editor salva. Campos que importam:
`ratio` ("9:16" | "4:5"), `zoom` (1..2.5), `x`, `y` (-15..15, % do centro),
`bright`/`contrast`/`sat`/`temp` (offsets, 0 = neutro), `overlays[]`, `keyframes[]`, `trackId`.
Overlay: `{ kind: "logo"|"image"|"text", x, y, size, opacity, text?, src? }`.
Keyframe: `{ t: 0..1, zoom, x, y }` — interpolar linearmente entre eles ao longo do vídeo.

**Saída:** mp4 H.264 + AAC, 1080x1920 (9:16) ou 1080x1350 (4:5), com a duração pedida.

**Como servir:** um servidor HTTP da stdlib do Python dentro da imagem, `POST /run` recebendo o corpo
acima, respondendo `202 {"id": "<job>"}` na hora e chamando o webhook ao terminar
(`{"export_id", "status": "COMPLETED"|"FAILED", "output": {"url", "size_mb"}, "error"}`).
Isso é o que dá para testar aqui; adicionar também `handler.py` com o wrapper do RunPod serverless,
documentado, para quando o cliente tiver a conta.

**Fonte do vídeo:** o pipeline de cortes não está neste repositório. Se `source_key` não resolver
para um arquivo, gerar um clipe sintético com ffmpeg (`testsrc`/`color` + texto do segmento) com a
duração pedida, para o fluxo ficar testável de ponta a ponta. Deixar claro no README que é substituto.

**Teste obrigatório:** `render/test.sh` sobe a imagem, manda uma receita com zoom + keyframes + overlay
de texto, e confere com `ffprobe` que o mp4 saiu com a resolução, a duração e o codec certos.
Testar as duas proporções.

## Task 2 — Storage S3 (R2 / B2) — **DESCARTADA**

> Descartada com a mudança de rumo: o export fica simulado. Mantida aqui só como registro.


O render precisa publicar o mp4 em um bucket e devolver uma URL que o app consiga tocar e o
Instagram consiga baixar.

- Subir **MinIO** no `docker-compose.yml` como dublê local do R2/B2 (os dois falam S3).
- No worker do render, implementar upload S3 com **AWS Signature V4 na mão** (hmac/sha256 da stdlib;
  nada de boto3). Env: `S3_ENDPOINT`, `S3_BUCKET`, `S3_KEY`, `S3_SECRET`, `S3_REGION`, `S3_PUBLIC_URL`.
- O webhook devolve `output.url` (URL pública do objeto) e `output.size_mb`.
- Documentar em `render/README.md` que trocar para R2 ou B2 é só trocar essas envs.

**Teste obrigatório:** subir MinIO, renderizar, e baixar o objeto pela URL devolvida conferindo que
é um mp4 válido (ffprobe) e que o tamanho bate.

## Task 3 — Ligar o export real ponta a ponta — **REATIVADA**

> Reativada pela segunda mudança de rumo. Ajustes sobre o texto original abaixo: a origem do mp4 é
> o servidor de arquivos do próprio render (`RENDER_PUBLIC_URL` → `/files/<key>`), **não** o S3/MinIO
> (Task 2 segue descartada). O requisito da marca na receita **continua valendo**, agora que o render
> volta a ser ligado.


- `backend/src/render.js`: aceitar `RENDER_URL` (se presente, é para lá que o job vai; senão monta a
  URL do RunPod a partir de `RUNPOD_ENDPOINT`). Mesmo caminho de código para local e produção.
- `docker-compose.yml`: serviços `render` e `minio`, `RENDER_MODE=live` e `RENDER_URL` apontando para o render.
- `dashboard`: quando o export tiver `url`, o preview do painel Publicar e a tela Publicações devem
  **tocar o mp4 de verdade** (o `<video>` já existe em `applyPhone`), e oferecer baixar o arquivo.
- Ajustar `dashboard/tests/e2e-live.html`: além do status `ready`, conferir que a URL responde e que o
  `<video>` carrega (duração > 0).

- **Marca dentro da receita** (veio do ruling de A-5 na Task 1): hoje o overlay `kind:"logo"` chega ao
  render sem nenhum dado da marca, então o logo do time não sai no mp4. O app precisa passar a marca
  na receita — `brand: { name, logoSrc }`, com `logoSrc` como `data:` URI quando houver logo enviado —
  e o render passa a desenhar `kind:"logo"` usando esses dados (imagem quando houver, iniciais do nome
  quando não houver, que é exatamente o fallback `logo-mark` do app). Cobrir com teste: um mp4 renderizado
  a partir de uma receita com marca tem de diferir do mesmo mp4 sem marca.

**Cuidado:** o modo mock do backend (`RENDER_MODE=mock`) continua existindo e continua passando nos testes.

## Task 4 — Segmentos vindos do backend

Hoje os 12 segmentos são literais em `dashboard/js/services/api.js`. O escopo pede
"segmentos do preview → painel Reels".

- `GET /api/segments` no Worker, devolvendo `[{ id, title, tag, range, dur, seed }]`.
  A origem é o gerador de cortes, que não está aqui: servir de uma tabela `segments` do D1,
  populada por um seed em `schema.sql`, e documentar que o pipeline vai escrever nela.
- `dashboard/js/services/api.js`: `segments()` usa a API quando `live()`, e a lista local quando não.
- Teste no backend (isolamento por usuário não se aplica: são cortes da partida, mas a rota exige sessão).
- Teste no app (modo mock segue igual; e2e-live confere que veio da API).

## Task 5 — Três correções pequenas (lote único)

Um subagente só, um commit só.

1. **Mensagem do servidor chega ao usuário.** `dashboard/js/views/reels.js` (`catch { toast('Falha ao
   exportar. Tente novamente.') }`) engole o erro. Quando o servidor devolve 402 com
   "Você usou as 10 exportações do plano Starter neste mês", é isso que a pessoa tem de ler.
   Mesma checagem no caminho de publicação em `dashboard/js/ui/publisher.js`.
2. **`needsReauth` visível.** O campo já é carregado em `store.hydrate()` e nunca aparece. Quando for
   verdadeiro, a rede deve mostrar "Precisa reconectar" (vermelho `#ff3b30`) com botão "Reconectar",
   em Contas sociais e no painel Publicar, e não deve ser selecionável para publicar.
3. **Tirar o download de música por link.** Decisão de produto já registrada em
   `docs/estrategia-viabilidade.md` seção 4: baixar áudio de YouTube/Instagram viola os termos e gera
   strike na conta do usuário. Remover a aba "Usar link" de `dashboard/js/ui/trackModal.js` e o
   `importTrack` de `api.js`, deixando upload do próprio arquivo + biblioteca licenciada.
   Ajustar os testes que exercitavam o link.

## Task 6 — Stripe e Supabase chamados pelo app

- **Stripe:** `dashboard/js/views/settings.js` usa `api.upgrade()`, que é simulação local e nunca toca
  no servidor. Passar a chamar `POST /api/billing/checkout` quando `live()`, e redirecionar para a URL
  devolvida. Sem chaves configuradas o backend devolve 501 — a interface tem de dizer, em português,
  que o pagamento ainda não está configurado neste ambiente, sem parecer erro do usuário.
  Sem backend, segue a simulação atual.
- **Supabase:** `dashboard/js/services/auth.js` só sabe o `dev-login`. Implementar o caminho real:
  quando o app tiver `SUPABASE_URL` e `SUPABASE_ANON_KEY` (expostos pelo backend em `/api/config`,
  rota pública nova), autenticar em `POST {SUPABASE_URL}/auth/v1/token?grant_type=password` e usar o
  `access_token` como sessão. Sem essas envs, cai no `dev-login` como hoje.
  Não dá para testar contra um projeto real aqui: cobrir com teste o roteamento (com Supabase
  configurado tenta o Supabase; sem, usa dev-login) e **deixar explícito no README que o caminho
  Supabase não foi verificado contra um projeto real**.

## Task 7 — Pesquisa de mercado de verdade

O escopo pede, com todas as letras: "Quero que você estude o mercado (CapCut, Opus, Repurpose, Buffer,
Late, tools de sports clipping) e traga 5–8 ideias com: esforço estimado + valor pro usuário."
A lista que existe hoje em `docs/estrategia-viabilidade.md` saiu de conhecimento geral, sem consultar
nenhuma fonte — isso não cumpre o requisito.

- Pesquisar na web o que essas ferramentas **de fato vendem hoje**: o que está no plano pago, o que é
  gratuito, preço, e qual recurso cada uma usa como argumento principal. Cobrir pelo menos
  CapCut, Opus Clip, Repurpose.io, Buffer, Late, e duas ferramentas de clipping esportivo.
- Atualizar a seção de diferenciais de `docs/estrategia-viabilidade.md`: manter de 5 a 8 ideias,
  cada uma com esforço (P/M/G) e valor, **agora com a fonte que sustenta a ideia** (link e data).
- Corrigir o que a pesquisa contradisser. Se uma ideia da lista atual se mostrar comum no mercado
  (não é diferencial) ou inviável, dizer isso em vez de manter.
- Marcar claramente o que é preço/recurso observado na fonte e o que é estimativa minha.
- Nada de inventar número: sem fonte, a afirmação não entra.

Sem código. O entregável é a seção reescrita, com as fontes.

## Task 8 — Documento de escala

O cliente pediu, com estas palavras: "um documento explicando como a gente ia escalar".
Criar `docs/escala.md`, escrito para quem vai avaliar o teste técnico e decidir o próximo passo —
um leitor técnico que não conhece este repositório.

Tem de responder, sem enrolação:

1. **O que é real e o que é simulado hoje**, item por item. Honestidade primeiro: o documento perde
   todo o valor se exagerar. Puxar de `docs/requisitos.md`, sem repetir a tabela inteira.
2. **Publicar de verdade nas 7 redes**: agregador (Ayrshare, Late, Upload-Post) contra integração
   direta — custo, prazo e dependência de cada um, e por que a recomendação é agregador primeiro e
   migração das redes de maior volume depois. O que cada rede exige concretamente
   (Meta App Review e conta Business; cota e verificação do YouTube; auditoria do TikTok; API paga do X;
   parceiros do LinkedIn). Por que a interface `SocialProvider` faz a troca sair barata.
3. **Por que "publicar nas 7 de uma vez" é fan-out e não uma chamada**: job por rede, status
   independente, idempotência por `<export>:<rede>`, retry isolado. Isso já está implementado —
   mostrar onde, com caminho de arquivo.
4. **Render e storage em escala**: por que Worker não roda ffmpeg, o desenho fila → GPU → storage →
   webhook, custo por export, e o que `render/` já resolve.
5. **O que quebra primeiro quando o uso crescer** e a ordem de resolver: fila de verdade
   (Cloudflare Queues), limite por rede e por usuário, renovação de token em segundo plano,
   backoff em 429/5xx, dead-letter, retenção de exports.
6. **Roteiro por fases**, com o que depende de conta do cliente e o que depende só de código.

Sem inventar número. Se um custo ou prazo for estimativa, dizer que é.

## Task 9 — Roteiro de demonstração

Criar `docs/demo.md`: um passo a passo curto (cabe em uma página) de como apresentar o MVP.
O que subir (`docker compose up --build`), o que abrir, em que ordem clicar para o fluxo
conectar → editar → exportar → publicar aparecer inteiro, e onde estão os detalhes que valem
apontar (falha isolada por rede com retry, limites do plano vindos do servidor, tutorial sem jargão).
Incluir uma seção "o que dizer sobre o que é simulado" — a frase honesta e curta para cada parte,
para que ninguém seja pego de surpresa numa pergunta. Incluir também
`sh render/test.sh` como prova opcional de que o render real existe.

## Task 10 — Publicar de verdade no YouTube

Fazer o `SOCIAL_MODE=live` funcionar para o YouTube, contra o canal do próprio cliente.

- **OAuth real no app.** Hoje `connect()` em `dashboard/js/services/social.js` detecta que a URL de
  autorização é da mesma origem e a busca com `fetch` — isso só serve para o provedor simulado.
  No fluxo real o navegador precisa **sair** para o Google (`location.href`), o usuário autoriza lá,
  e o Google devolve para `/api/social/youtube/callback`, que por sua vez redireciona de volta ao app
  com `?social=youtube&status=connected|cancelled|error`. O app tem de ler esse retorno ao carregar,
  avisar o resultado e atualizar a lista de contas. Hoje ninguém lê esses parâmetros.
- **Credenciais**: `YT_CLIENT_ID` e `YT_CLIENT_SECRET` por variável de ambiente, nunca no código nem
  em log. O redirect é `http://localhost:8080/api/social/youtube/callback` no ambiente local.
- **Envio**: `backend/src/social/youtube.js` já tem o fluxo resumable escrito e **nunca executado**.
  Fazer funcionar de verdade: ler o mp4 da URL do export (dentro da rede do Docker), enviar, e
  tratar os erros reais que aparecerem (formato, cota, escopo, token expirado) com mensagem em
  português na interface.
- **Modo misto**: `SOCIAL_MODE=live` não pode quebrar as outras 6 redes, que seguem simuladas.
  Decidir e documentar como as duas coisas convivem (por rede, não global).
- Sem credenciais configuradas, o app tem de continuar rodando inteiro no modo simulado.

Não é possível testar automaticamente contra o Google. O teste é manual, com o cliente, e o
relatório deve dizer exatamente o que foi observado — inclusive os erros do caminho.

## Task 11 — Tutorial de conexão à altura do fluxo real

O escopo pede "tutorial simples no app: como o usuário conecta a conta dele com segurança (passo a
passo na UI, sem jargão técnico)". O assistente de 4 passos existe, mas foi escrito para o fluxo
simulado, em que nada sai do app. Com OAuth real a experiência muda e o tutorial tem de preparar a
pessoa para o que vai acontecer:

- **Antes**: dizer o que a pessoa vai ver — "você vai sair daqui e entrar na página do YouTube",
  "a senha é digitada lá, não aqui", "você escolhe o canal", "pode voltar quando quiser".
- **Pré-requisitos por rede**, antes de começar, para ninguém descobrir no meio: YouTube precisa de um
  canal; Instagram precisa de conta Business ou Criador ligada a uma Página do Facebook. Se a pessoa
  não tiver, o tutorial diz como resolver, em português simples.
- **O que a permissão dá e o que não dá**: "só enviar vídeos"; não lê mensagens, não muda senha,
  não apaga nada.
- **Como desfazer**: onde desconectar no app e que também dá para revogar na própria rede.
- **Na volta**: tratar os três desfechos — conectou, cancelou, deu erro — cada um com um texto claro
  e o que fazer a seguir. Cancelar não é erro e não pode parecer erro.
- Continuar sem jargão: nada de "token", "OAuth", "escopo", "API".

Cobrir com teste o que dá: os três desfechos do retorno e o texto de pré-requisito por rede.

## Verificação final

```sh
cd backend && npm test
cd dashboard && sh tests/run.sh          # 90 PASS / 0 FAIL, modo mock
sh dashboard/tests/run-docker.sh          # fluxo real, agora com mp4 de verdade
sh render/test.sh                         # render + storage
```
