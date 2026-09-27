# e2e — testes de ponta a ponta e o documento em PDF

Playwright usando o **Google Chrome já instalado** (`channel: 'chrome'`), sem baixar navegador.
Tudo roda contra os containers, então suba antes: `docker compose up -d --build` (na raiz).

```sh
npm install
npx playwright test                 # backend.spec (12) + fluxo.spec (1)
node build-pdf.mjs                  # gera docs/como-funciona-em-producao.pdf
npm run doc                         # os dois acima em sequência
```

| Arquivo | O que faz |
|---|---|
| `tests/backend.spec.js` | As funções mínimas do escopo, por HTTP, contra a API do container |
| `tests/fluxo.spec.js` | Percorre a interface do login à publicação e **captura as telas do PDF** |
| `build-pdf.mjs` | Monta o documento com as capturas e imprime em A4 paisagem |

Cada passo do fluxo é uma verificação: se a tela não chegar ao estado esperado, o teste falha e o
documento não é gerado com uma imagem errada. Um usuário novo é criado a cada execução, então rodar
várias vezes não suja o resultado.

`out/` guarda as capturas, o HTML do documento e o relatório do Playwright (`npx playwright show-report out/report`).
