# Home Creators — dashboard

Rodar: `python3 -m http.server 8000` e abrir http://localhost:8000
(ES modules exigem servidor; não abre por `file://`). Sem build e sem dependências: vai para o Cloudflare Pages como pasta estática.

## Telas
`Home` · `Reels` (editor) · `Publicações` · `Contas sociais` · `Analytics` · `Estratégias` · `Configurações`

**Editor Reels** — 12 segmentos; o `+` envia um vídeo local, que vira um segmento real (preview com `<video>`, frames na timeline, seek e play). Formato 9:16 / 4:5, zoom, posição, cor (brilho, contraste, saturação, temperatura — 0 é neutro), overlay de logo/imagem/texto, música, keyframes ◆ interpolados, undo/redo. O painel direito tem **Publicar** (exporta sozinho se precisar) e **Exportação**.

**Estratégias** — melhor horário por rede, templates de legenda por esporte, capas, primeiros 3 segundos, multi-idioma e marca. As escolhas caem no rascunho de publicação e no editor.

## Estrutura
```
js/views/      uma por tela
js/ui/         componentes reutilizáveis (publisher, brand, wizard, components)
js/services/   camada de dados: api.js (mock) e social.js (providers)
js/store.js    estado + localStorage
```

## Mock ou backend
`js/services/backend.js` pergunta por `/api/health` ao abrir. Respondeu, o app usa a API; não respondeu,
segue nos mocks e funciona offline. Não há configuração para mexer.

| Arquivo | Sem backend | Com backend |
|---|---|---|
| `js/services/auth.js` | sessão só no navegador | `POST /api/dev/login` (produção: Supabase) |
| `js/store.js` | localStorage | `hydrate()` em `/me`, `/projects`, `/exports`, `/publications`, `/social/accounts` |
| `js/services/api.js` | export simulado | `POST /api/exports` + polling do progresso |
| `js/services/social.js` | `Mock*Provider` | `/social/:net/authorize`, `/publications` + polling |

Seguem simulados nos dois modos: segmentos do jogo, analytics, tradução, capas, ganchos e o upgrade de plano.
O `data` do projeto que o editor guarda é exatamente o que a API espera e o que vai para o RunPod.

## Testes
- `sh tests/run.sh` — 90 checks em modo mock (precisa do Google Chrome).
- `sh tests/run-docker.sh` — 27 checks do fluxo real contra os containers (precisa de Docker).
