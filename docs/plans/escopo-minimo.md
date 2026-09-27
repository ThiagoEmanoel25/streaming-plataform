# Plano — fechar o escopo mínimo

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

## Task 2 — Storage S3 (R2 / B2)

O render precisa publicar o mp4 em um bucket e devolver uma URL que o app consiga tocar e o
Instagram consiga baixar.

- Subir **MinIO** no `docker-compose.yml` como dublê local do R2/B2 (os dois falam S3).
- No worker do render, implementar upload S3 com **AWS Signature V4 na mão** (hmac/sha256 da stdlib;
  nada de boto3). Env: `S3_ENDPOINT`, `S3_BUCKET`, `S3_KEY`, `S3_SECRET`, `S3_REGION`, `S3_PUBLIC_URL`.
- O webhook devolve `output.url` (URL pública do objeto) e `output.size_mb`.
- Documentar em `render/README.md` que trocar para R2 ou B2 é só trocar essas envs.

**Teste obrigatório:** subir MinIO, renderizar, e baixar o objeto pela URL devolvida conferindo que
é um mp4 válido (ffprobe) e que o tamanho bate.

## Task 3 — Ligar o export real ponta a ponta

- `backend/src/render.js`: aceitar `RENDER_URL` (se presente, é para lá que o job vai; senão monta a
  URL do RunPod a partir de `RUNPOD_ENDPOINT`). Mesmo caminho de código para local e produção.
- `docker-compose.yml`: serviços `render` e `minio`, `RENDER_MODE=live` e `RENDER_URL` apontando para o render.
- `dashboard`: quando o export tiver `url`, o preview do painel Publicar e a tela Publicações devem
  **tocar o mp4 de verdade** (o `<video>` já existe em `applyPhone`), e oferecer baixar o arquivo.
- Ajustar `dashboard/tests/e2e-live.html`: além do status `ready`, conferir que a URL responde e que o
  `<video>` carrega (duração > 0).

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

## Verificação final

```sh
cd backend && npm test
cd dashboard && sh tests/run.sh          # 90 PASS / 0 FAIL, modo mock
sh dashboard/tests/run-docker.sh          # fluxo real, agora com mp4 de verdade
sh render/test.sh                         # render + storage
```
