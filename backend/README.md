# Home Creators — API (Cloudflare Worker)

Backend com as funções mínimas do escopo: **projeto → export → publicar em várias redes**, mais conta, plano e limites.
Sem dependências: só Workers + D1. `npm test` roda tudo sem `wrangler` e sem credenciais.

```
src/index.js     rotas
src/auth.js      sessão = JWT do Supabase (HS256)
src/crypto.js    AES-GCM (tokens das redes) + HMAC
src/db.js        D1
src/render.js    export -> RunPod (+ webhook)
src/social/      Instagram, YouTube e os mocks das demais
src/stripe.js    checkout + webhook
schema.sql       tabelas do D1
dev/             roda o mesmo Worker em Node puro (container e desenvolvimento);
                 não vai para a Cloudflare
```

## Rodar

```sh
npm test         # 12 testes, D1 real via node:sqlite
npm run dev      # API em :8787 com DEV_LOGIN ligado, sem credenciais
docker compose up --build   # (na raiz) app + API juntos em :8080
```

Para a Cloudflare de verdade: `cp .dev.vars.example .dev.vars`, preencher,
`npm run db:local && npm run dev:wrangler`.

`DEV_LOGIN=1` cria a rota `POST /api/dev/login` que emite um JWT para qualquer e-mail, sem senha.
Ela existe só em `dev/server.mjs`, nunca no Worker de `src/`, e não pode ser ligada em produção.

Em `SOCIAL_MODE=mock` e `RENDER_MODE=mock` (padrão) o fluxo inteiro funciona sem nenhuma credencial: o export "renderiza" sozinho e as redes aceitam a publicação. É o modo do ambiente de staging enquanto as aprovações não saem.

## Rotas

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/health` | pública |
| GET | `/api/me` | usuário, plano, uso do mês e limites |
| GET/POST | `/api/projects` | lista / salva (upsert). `data` = receita de render |
| GET/DELETE | `/api/projects/:id` | abre / apaga (soft delete) |
| GET/POST | `/api/exports` | lista / enfileira no RunPod (202) |
| GET | `/api/exports/:id` | status, progresso e URL final |
| POST | `/api/hooks/render` | RunPod avisa que terminou (segredo na query) |
| GET | `/api/social/accounts` | as 7 redes, conectadas ou não |
| POST | `/api/social/:net/authorize` | devolve a URL do OAuth |
| GET | `/api/social/:net/callback` | troca o code pelo token e redireciona ao app |
| DELETE | `/api/social/:net` | desconecta |
| GET/POST | `/api/publications` | status por rede / publica em N redes (202) |
| POST | `/api/publications/:id/retry` | tenta de novo só a rede que falhou |
| POST | `/api/billing/checkout` | sessão do Stripe |
| POST | `/api/hooks/stripe` | assinatura confirmada → troca o plano |
| POST | `/api/dev/login` | **só com `DEV_LOGIN=1`**: emite um JWT de desenvolvimento |

Redes: `instagram`, `youtube`, `tiktok`, `x`, `threads`, `facebook`, `linkedin`.

## Decisões que valem saber

- **Limites no servidor.** `exports` conta ao enfileirar; `publications` conta só quando a rede aceita. Estourou → `402` com `code: limit_exports` / `limit_publications`.
- **Publicação idempotente.** O id é `<export_id>:<rede>`. Republicar o mesmo export não reenvia onde já deu certo (volta em `skipped`), e uma rede falhar não afeta as outras.
- **Tokens cifrados** com AES-GCM (`TOKEN_KEY`). Nunca em claro no D1. Erro 401 da rede marca a conexão como `reauth` para o app pedir reconexão.
- **Isolamento por usuário** em toda consulta, inclusive no upsert de projeto (id de outro usuário devolve 404).
- **Webhooks verificados**: RunPod por segredo compartilhado, Stripe por assinatura HMAC com comparação em tempo constante.
- **Export não roda no Worker.** Worker não tem ffmpeg: ele só enfileira no RunPod e recebe o resultado pelo webhook.

## O que falta para produção

1. **Deploy na Cloudflare.** `dev/server.mjs` é para desenvolvimento e container, não para carga real.
2. **Aprovação dos apps** (Meta, Google, TikTok, X, LinkedIn). É o caminho crítico, não o código. Enquanto isso, `SOCIAL_MODE=mock` ou um agregador.
3. **`SOCIAL_MODE=live` não foi verificado** contra as APIs reais. Instagram e YouTube estão escritos com as chamadas corretas, mas sem app aprovado não deu para rodar. As outras 5 redes respondem `501` em live.
4. **Imagem do RunPod** (ffmpeg que lê a receita e devolve o mp4) não faz parte deste repositório.
5. **Agendamento** grava `scheduled_at`, mas ninguém dispara na hora. Falta um Cron Trigger.
6. **Fila real.** Hoje a entrega é inline com `waitUntil`. Com volume, Cloudflare Queues.
7. **Renovação de token em segundo plano** (hoje só renova na hora de publicar) e limpeza de `oauth_states` vencidos.
8. **Rate limiting** por usuário e retenção/limpeza de exports antigos.
