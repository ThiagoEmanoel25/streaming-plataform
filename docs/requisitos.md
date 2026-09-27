# Requisitos do escopo — rastreador

Legenda de estado:
**OK** entregue e testado · **Sim, mas simulado** funciona, sem tocar o serviço real ·
**Em execução** tarefa do plano rodando · **Bloqueado** depende de conta/aprovação do cliente

Plano de execução: [plans/escopo-minimo.md](plans/escopo-minimo.md)

## 1. Editor Reels

| Requisito | Estado | Onde / o que falta |
|---|---|---|
| Segmentos do preview → painel Reels | Em execução | Task 4: `GET /api/segments`. Hoje a lista é fixa no front |
| Crop 9:16 / 4:5 | OK | Interface e render (mp4 1080x1920 e 1080x1350 conferidos) |
| Zoom e posição | OK | Interface e render |
| Keyframes | OK | Interpolação linear na interface e no render |
| Cor | OK | Brilho, contraste, saturação e temperatura |
| Overlay imagem | OK | Envio do arquivo, tamanho, posição, opacidade |
| Overlay logo do time | Em execução | Task 3: a receita precisa carregar a marca para o logo sair no mp4 |
| Música | Parcial | Upload próprio e biblioteca: OK. Download por link: **removido de propósito** (Task 5, copyright) |
| Salvar projeto | OK | `POST /api/projects`, com a receita de render |
| **Exportar vídeo final** | Em execução | Task 1 entrega o mp4 real; Task 2 o storage; Task 3 a ligação ponta a ponta |

## 2. Publicar nas redes

| Requisito | Estado | Onde / o que falta |
|---|---|---|
| Conectar as 7 plataformas | Sim, mas simulado | As 7 conectam e desconectam. Instagram e YouTube têm o código real, nunca executado |
| Campo de legenda | OK | Com contador e limite por rede |
| Publicar em várias redes de uma vez | OK | Um clique, N redes |
| Status fila / sucesso / falha por rede | OK | Falha isolada, retry, e nunca republica onde já deu certo |
| Tutorial de conexão sem jargão | OK | Assistente de 4 passos por rede |

## 3. Conta e pagamento

| Requisito | Estado | Onde / o que falta |
|---|---|---|
| Login via Supabase | Em execução | Task 6 escreve o caminho real. **Não dá para verificar sem um projeto Supabase** |
| Planos via Stripe | Em execução | Task 6 liga o checkout. Backend já tem checkout e webhook |
| Limites de export/publicação por plano | OK | Aplicados no servidor, com 402 e mensagem própria |

## 4. Diferenciais (pesquisa faz parte do job)

| Requisito | Estado | Onde / o que falta |
|---|---|---|
| Estudo de mercado (CapCut, Opus, Repurpose, Buffer, Late, sports clipping) | Em execução | Task 7. A lista atual saiu do meu conhecimento geral, sem consultar as fontes |
| 5–8 ideias com esforço e valor | Parcial | 9 ideias priorizadas em [estrategia-viabilidade.md](estrategia-viabilidade.md); falta lastro da pesquisa |
| Agendar publicação (melhor horário) | Sim, mas simulado | Interface e horário sugerido por rede. Nada dispara na hora marcada (falta Cron Trigger) |
| Variações de capa / primeiros 3s | Sim, mas simulado | Interface pronta em Estratégias |
| Templates de legenda por esporte | OK | 5 categorias, com filtro |
| Marca d'água / logo | Parcial | Configuração e preview OK; sair no mp4 depende da Task 3 |
| Biblioteca de projetos por usuário | Parcial | Projetos no servidor por usuário; falta uma tela que liste todos (a Home mostra 3) |
| Multi-idioma de legenda | Sim, mas simulado | Tradução de exemplo, sem serviço real |
| "Um clique" corte → Reels → 2 redes | OK | "Publicar agora" exporta sozinho se preciso |
| Aprovação em equipe | Não feito | Fora do escopo mínimo; só faz sentido no plano Team |
| Analytics pós-post | Sim, mas simulado | Tela pronta, sem backend. Depende das APIs de cada rede |

## 5. Entregáveis

| Entregável | Estado | O que falta |
|---|---|---|
| Reels funcionando no ambiente cloud | **Bloqueado** | Roda em Docker no localhost. O deploy precisa da conta Cloudflare |
| Conectar → editar → exportar → publicar (IG + YT) | Sim, mas simulado | O fluxo fecha ponta a ponta; publicar de verdade depende de aprovação |
| UI alinhada ao design | OK | Paleta, Montserrat, toggles iOS, ícones SVG |
| Doc curta: conectar contas + escalar | OK | [conectar-contas.md](conectar-contas.md) |
| Lista priorizada de diferenciais | Parcial | Ver Task 7 acima |

## 6. Como trabalhar

| Requisito | Estado | O que falta |
|---|---|---|
| Staging separado de produção | Parcial | `[env.staging]` e `[env.production]` no `wrangler.toml`; falta o deploy |
| PRs pequenos | Em execução | Branch `feat/escopo-minimo`, um commit por tarefa. Falta abrir os PRs |
| Seguir cores e componentes existentes | OK | Nenhuma cor fora da paleta |

---

## O que só você pode destravar

Em ordem de prazo — os dois primeiros demoram semanas e não dependem de código:

1. **Aprovação dos apps nas redes.** Meta App Review (Instagram/Facebook/Threads), verificação do OAuth do Google (YouTube), auditoria do TikTok, API paga do X, programa de parceiros do LinkedIn. **Comece hoje**: é o caminho crítico do projeto inteiro. Sem isso, publicar de verdade não acontece, mesmo com o código pronto.
2. **Conta Cloudflare** (Workers, Pages, D1, R2). Sem ela não há "ambiente cloud", que é o primeiro entregável do escopo. Preciso de: conta criada e `wrangler login`; eu cuido do resto.
3. **Conta RunPod** (endpoint serverless com GPU). O worker de render está pronto e testado; falta onde rodar.
4. **Projeto Supabase** (URL + anon key + JWT secret). O backend já valida o formato do token.
5. **Chaves Stripe** (secret, webhook secret, e os dois price IDs). Checkout e webhook já implementados.
6. **Catálogo de música licenciada.** Decidir o fornecedor, já que o download por link saiu por risco de copyright.

Enquanto nada disso chega, tudo roda em modo simulado com `docker compose up --build`.
