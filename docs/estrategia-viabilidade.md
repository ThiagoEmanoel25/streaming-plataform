# Home Creators — Reels + Publicação: estratégia de viabilidade

> Baseado no protótipo mockado em `prototype/index.html`. Pontos sobre APIs e mercado vêm de conhecimento geral, não foram verificados ao vivo. Confirmar nas docs oficiais antes de comprometer prazo.

## 1. O que o protótipo já valida (UX)
Editor (segmentos, crop 9:16/4:5, zoom, posição, cor, logo, música) → exportar → legenda + templates por esporte → publicar em várias redes com status por rede (fila / publicando / sucesso / falha + retry) → contas com tutorial → planos com limites de uso.
Tudo usa dados mockados. Cada `S.*` e `send()` no código é um ponto de troca por API real.

## 2. Arquitetura para plugar no projeto em prod

| Etapa | Onde roda | Observação |
|---|---|---|
| Front (o protótipo, portado) | Cloudflare Pages | Mesmo design tokens já existentes |
| API / orquestração | Workers | Valida plano/limite, enfileira jobs |
| Export de vídeo | **RunPod (ffmpeg)** | Workers não rodam ffmpeg. Worker enfileira, RunPod renderiza, grava no storage, avisa por webhook |
| Arquivos grandes (fonte, export) | B2 **ou** R2 (escolher um) | Sugestão: B2 pro bruto, R2 pra export servido/publicado (egress) |
| Metadados (projetos, jobs, status) | D1 ou Supabase Postgres | Escolher um dono dos dados. Sugestão: Supabase, já que o login está lá |
| Login | Supabase Auth | JWT validado no Worker |
| Pagamento | Stripe + webhook no Worker | Plano vira coluna/claim; limites checados no Worker |
| Publicação | Worker enfileira → executor por rede | Ver seção 3 |

Modelo de dados mínimo: `projects(id,user,params_json)`, `exports(id,project,url,status)`, `connections(id,user,network,token_enc,expires)`, `publications(id,export,network,status,error,external_id)`, `usage(user,month,exports,publications)`.

Ponto-chave para "mesmo fluxo do local": o estado do editor já é um JSON (`zoom,x,y,bright,sat,ratio,logo,track`). Esse mesmo JSON vai pro RunPod como receita de render. Local e cloud renderizam pela mesma receita.

## 3. Publicação nas redes: o caminho crítico é aprovação, não código

| Rede | Barreira típica | Estratégia |
|---|---|---|
| YouTube | OAuth verificado + quota diária baixa por padrão | Pedir aumento de quota cedo |
| Instagram | Meta App Review, conta Business/Creator ligada a Página | Iniciar review no dia 1 |
| TikTok | Auditoria do app (sem ela, posts saem privados) | Iniciar cedo, prazo incerto |
| Facebook / Threads | Mesmo ecossistema Meta | Reaproveita o app Meta |
| X | API paga por volume | Decidir se compensa pelo plano |
| LinkedIn | Programa de parceiros pra vídeo | Fase 3 |

**Recomendação:** MVP com um agregador (Late, Ayrshare, Upload-Post ou similar) para lançar IG + YT (+ TikTok) sem esperar aprovações. Guardar a interface `publish(network, exportUrl, caption)` isolada, para trocar por integração direta depois nas redes de maior volume. Custo é por uso, e a troca não afeta o front.

**Segurança de tokens:** OAuth apenas (nunca senha), tokens criptografados em repouso, escopo mínimo (só upload), botão "Desconectar" que revoga, refresh com tratamento de falha (status "reconectar conta" na UI).

## 4. Música: decisão de produto
Baixar áudio de YouTube/Instagram por link **não é viável**: viola termos das plataformas, é copyright, e o vídeo publicado com música protegida gera strike/mute na conta do usuário, risco também pra sua infra.

Alternativa que entrega o mesmo valor:
- **Upload do próprio arquivo** (mp3/wav), salvo na biblioteca do usuário (já no protótipo).
- **Biblioteca royalty-free licenciada** (contratar catálogo ou API de música licenciada).
- Opcional depois: usar o áudio original do próprio vídeo do jogo.

## 5. Plano por fases

| Fase | Entrega | Depende de |
|---|---|---|
| 0 (semana 1) | Pedir aprovações (Meta, Google, TikTok). Definir storage/DB. Staging separado | Contas dev |
| 1 | Login + Stripe + editor na cloud + export via RunPod + publicação IG + YT | Job de render estável |
| 2 | TikTok, Threads, X, agendamento, biblioteca de projetos | Aprovações |
| 3 | Facebook, LinkedIn, equipe/aprovação, analytics | Tração de uso |

PRs pequenos sugeridos: (1) tokens/tema, (2) auth Supabase, (3) modelo de projeto + salvar, (4) job de export, (5) conexão OAuth YT, (6) publicar YT, (7) IG, (8) Stripe/limites.

## 6. Diferenciais priorizados (esforço × valor)
Esforço: P = dias, M = 1–2 semanas, G = 3+ semanas.

| # | Ideia | Esforço | Valor | Nota |
|---|---|---|---|---|
| 1 | **Um clique**: corte validado → Reels → 2 redes | M | Muito alto | Diferencial central; usa o que já existe |
| 2 | Templates de legenda por esporte (gol, defesa, highlight) | P | Alto | Já no protótipo; texto fixo primeiro, IA depois |
| 3 | Marca d'água / logo do time | P | Alto | Já no protótipo; também é gancho do plano Free |
| 4 | Biblioteca de projetos por usuário | M | Alto | Retenção; Supabase + storage |
| 5 | Agendar publicação (melhor horário) | M | Alto | Começar com horários fixos por rede, sugestão por dados depois |
| 6 | Variações de capa / primeiros 3s | M | Médio-alto | Gera 3 frames candidatos; usuário escolhe |
| 7 | Analytics simples pós-post | G | Médio | Depende das APIs de cada rede; fase 3 |
| 8 | Aprovação em equipe (rascunho → publicar) | M | Médio | Só faz sentido no plano Team |
| 9 | Legenda multi-idioma | P | Médio | Tradução simples por LLM |
| — | Baixar música por link | — | — | **Não fazer** (seção 4) |

Comparativo de mercado (a validar): CapCut e Opus Clip vendem velocidade de edição e legenda automática; Buffer/Later/Ayrshare vendem publicação multi-rede e agenda. O espaço aberto é o **fluxo específico de esporte**: do corte validado ao post, com templates e marca do time. Nenhum deles é especializado nisso.

## 7. O que falta para escalar
- Fila de render com prioridade por plano e custo de GPU por export (definir teto por plano).
- Observabilidade de jobs (status, retentativas, dead-letter) e alertas de token expirado.
- Idempotência na publicação (evitar post duplicado em retry).
- Limpeza de storage (exports antigos) e política de retenção.
- Termos de uso: usuário responsável pelo conteúdo/música que sobe.
- Custo unitário: GPU + storage + agregador por export/publicação, para fechar preço dos planos.

## 8. Decisões pendentes
1. Agregador no MVP ou integração direta desde o início?
2. Supabase ou D1 como banco principal?
3. B2 vs R2 por tipo de arquivo.
4. Limites reais por plano (o protótipo usa números ilustrativos).
5. Catálogo de música licenciada: qual fornecedor?
