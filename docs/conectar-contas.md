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

## O que falta para escalar (hoje tudo é simulado)
| Item | Por quê |
|---|---|
| Aprovação dos apps nas redes (Meta, Google, TikTok, X, LinkedIn) | Sem ela a publicação é limitada ou fica privada. Prazo é da rede, começar cedo |
| Providers reais (ou agregador) atrás de `SocialProvider` | Hoje `Mock*Provider`. A interface já é a mesma |
| Login real (Supabase) e sessão validada no Worker | Hoje `MockAuthProvider` |
| Export real no RunPod (ffmpeg) com fila e retentativa | Workers não rodam ffmpeg |
| Tokens das redes criptografados, com renovação e aviso de "reconectar" | Segurança e continuidade |
| Stripe (checkout + webhook) e limites aplicados no servidor | Hoje o limite é só na interface |
| Idempotência na publicação | Evitar post duplicado em retentativa |
| Storage (R2/B2), retenção de exports antigos e custo por export | Custo de GPU e armazenamento |
| Música por link: não usar download de YouTube/Instagram | Copyright e termos das plataformas. Usar upload próprio ou biblioteca licenciada |
| Staging separado de produção | Testar aprovações e pagamentos sem risco |

Estratégia completa, fases e diferenciais priorizados: `estrategia-viabilidade.md`.
