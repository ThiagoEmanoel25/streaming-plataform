# Home Creators

Editar highlights de esporte → exportar Reel → publicar em várias redes.

## Subir tudo (Docker)

```sh
docker compose up --build      # http://localhost:8080
```

Sobe o app e a API juntos, com login por e-mail e sem credencial nenhuma.
Entre com qualquer e-mail válido e senha de 6+ caracteres: o fluxo inteiro funciona
(projeto → export → conectar conta → publicar), com os dados guardados no servidor.

Sem Docker:

```sh
cd backend   && npm run dev                   # API em :8787
cd dashboard && python3 -m http.server 8000   # app em :8000 (usa mocks locais)
```

| Pasta | O que é |
|---|---|
| `dashboard/` | App (Cloudflare Pages). ES modules puros, sem build |
| `backend/` | API (Cloudflare Worker + D1), sem dependências |
| `docs/` | Estratégia, viabilidade, tutorial de contas e o PDF de produção |
| `e2e/` | Playwright: testes de ponta a ponta e o gerador do PDF |
| `prototype/` | Primeiro rascunho de uma página só, superado pelo `dashboard/` |

## Os dois modos

O app procura `/api/health` ao abrir. Achou, usa o backend; não achou, usa os mocks locais e
funciona offline. É o mesmo código nos dois casos — só muda a origem dos dados.

Com backend: login, projetos, exports, contas sociais, publicações, plano e uso.
Sempre simulado (mesmo com backend): os segmentos do jogo, analytics, tradução, capas e ganchos.

## Testes

```sh
cd backend && npm test                 # 12 testes da API (SQL real via node:sqlite)
cd dashboard && sh tests/run.sh        # 90 checks do app em modo mock (Chrome headless)
sh dashboard/tests/run-docker.sh       # 26 checks do fluxo real contra os containers
cd e2e && npm install && npm run doc   # 13 testes Playwright + gera o PDF de produção
```

## Documento

`docs/como-funciona-em-producao.pdf` mostra o caminho completo de um Reel, tela a tela, com a
arquitetura de produção e o que ainda falta. As imagens são capturadas pelo Playwright com o app
rodando: cada passo é um teste, e o PDF só é gerado se todos passarem.

## Atenção

`DEV_LOGIN=1` no compose emite um JWT para qualquer e-mail, **sem senha**. Serve para
demonstração e desenvolvimento. Em produção ele fica desligado e quem autentica é o Supabase.

`SOCIAL_MODE=live` e `RENDER_MODE=live` (APIs reais das redes e RunPod) **não foram verificados**:
dependem de apps aprovados nas plataformas. Em `mock`, tudo roda.
