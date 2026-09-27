# Conectar contas e escalar

## Para o usuário: como conectar uma rede
1. Abra **Contas sociais** e toque em **Conectar** na rede que quer usar.
2. Entre com a sua conta na página da própria rede. O Home Creators nunca vê a sua senha.
3. Escolha a conta, página ou canal que vai receber os vídeos.
4. Toque em **Permitir**. Autorizamos só o envio de vídeos.
5. Pronto. Para desligar, toque em **Desconectar** quando quiser.

Redes: Instagram, YouTube, TikTok, X, Threads, Facebook e LinkedIn.
Instagram e Facebook pedem conta profissional ligada a uma Página. Sem isso a rede não libera a publicação.

## Fluxo no app
Contas sociais → Reels (editar) → Exportar → Publicações (legenda + redes) → status por rede (fila, processando, publicado, falhou).
"Um clique" no editor exporta e publica em Instagram + YouTube com a legenda-modelo do tipo de lance.

## O que já existe (`backend/`, ligado ao app)
OAuth por rede com state assinado, tokens cifrados (AES-GCM), publicação idempotente por `<export>:<rede>`,
falha isolada com retry, limites de plano no servidor e webhooks verificados (RunPod e Stripe).
Roda sem credenciais: `docker compose up --build` sobe o app e a API juntos em http://localhost:8080.

## O que falta para escalar
| Item | Por quê |
|---|---|
| Aprovação dos apps nas redes (Meta, Google, TikTok, X, LinkedIn) | Sem ela a publicação é limitada ou fica privada. Prazo é da rede, começar cedo |
| `SOCIAL_MODE=live` verificado | Instagram e YouTube estão escritos, mas sem app aprovado não deu para rodar |
| Login real (Supabase) no app | O Worker já valida o JWT; falta o app emitir um de verdade |
| Imagem do RunPod (ffmpeg) que lê a receita e devolve o mp4 | O Worker já enfileira e recebe o webhook |
| Tokens das redes criptografados, com renovação e aviso de "reconectar" | Segurança e continuidade |
| Chaves do Stripe e preços | Checkout e webhook já implementados |
| Agendamento disparar de fato (Cron Trigger) | Hoje grava a data, mas ninguém publica na hora |
| Storage (R2/B2), retenção de exports antigos e custo por export | Custo de GPU e armazenamento |
| Música por link: não usar download de YouTube/Instagram | Copyright e termos das plataformas. Usar upload próprio ou biblioteca licenciada |
| Staging separado de produção | Testar aprovações e pagamentos sem risco |

Estratégia completa, fases e diferenciais priorizados: `estrategia-viabilidade.md`.
