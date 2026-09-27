# render — o mp4 de verdade

Worker que pega a receita do projeto (o mesmo JSON que o editor salva) e devolve
um **mp4 H.264 + AAC** com ffmpeg. Imagem `alpine` + `ffmpeg` + `python3` +
`font-dejavu`. **Zero dependências de runtime além disso** — só a stdlib do Python.

```
render.py    receita -> linha de comando do ffmpeg -> mp4
server.py    servidor HTTP (POST /run, GET /files/<key>, GET /health)
handler.py   wrapper do RunPod serverless, para quando o cliente tiver a conta
test.sh      teste de ponta a ponta com ffprobe
```

## Contrato de entrada

`POST /run` — exatamente o corpo que `backend/src/render.js` já enfileira:

```json
{ "input": { "export_id": "exp_x",
             "recipe": { "ratio": "9:16", "zoom": 1.2, "x": 0, "y": -10,
                         "bright": 0, "contrast": 12, "sat": 8, "temp": 0,
                         "trackId": "t1",
                         "overlays": [{ "kind": "text", "text": "QUE GOLAÇO", "x": -14, "y": 38, "size": 26, "opacity": 1 }],
                         "keyframes": [{ "t": 0, "zoom": 1, "x": 0, "y": 0 }, { "t": 0.6, "zoom": 1.3, "x": -4, "y": -8 }] },
             "source_key": "s1", "duration": 14,
             "output": { "bucket": "homecreators-exports", "key": "user/exp_x.mp4" } },
  "webhook": "http://api:8787/api/hooks/render?token=..." }
```

Resposta imediata: `202 {"id": "job_..."}`. O ffmpeg roda numa thread; quando
termina o worker chama o `webhook`:

```json
{ "export_id": "exp_x", "status": "COMPLETED", "output": { "url": "...", "size_mb": 3.4 } }
{ "export_id": "exp_x", "status": "FAILED", "error": "..." }
```
(e um `{"status":"IN_PROGRESS","progress":10,"phase":"Renderizando"}` no começo).
É o mesmo formato que `POST /api/hooks/render` já consome. O token do webhook
nunca vai para o log: o servidor loga só o caminho, sem query string.

## Como a receita vira imagem

O preview é o contrato com o usuário, então os números saem direto do CSS do
dashboard (`applyPhone` / `ovHTML` em `dashboard/js/ui/components.js`):

| receita | preview | render |
|---|---|---|
| `ratio` | `aspect-ratio` do `.phone` | 1080x1920 (9:16) ou 1080x1350 (4:5) |
| `zoom`, `x`, `y` | `transform: translate(x%,y%) scale(zoom)` no `.vid` | `zoompan` |
| `keyframes[]` | — | interpolação linear, expressão ffmpeg linear por partes sobre `on` |
| `bright`, `contrast`, `sat` | `filter: brightness/contrast/saturate` | `eq` |
| `temp` | camada colorida por cima | `colortemperature` |
| `overlays[].kind = "text"` | `<div class="ov txt">` | `drawtext` (caixa preta 50%, negrito) |
| `overlays[].kind = "image"` | `<img>` | `overlay` (o `src` é um data URI) |

Detalhe que importa: no preview o `.vid` é `inset:-20%`, ou seja o elemento do
vídeo mede **140%** do quadro, e o `translate()` do CSS é em % *desse* elemento.
Com `zoom: 1` o quadro mostra 1/1.4 do vídeo. O render reproduz isso
(`BLEED = 1.4` em `render.py`) — sem esse fator o mp4 não bate com o preview.

O `eq` do ffmpeg tem brilho aditivo e o CSS tem multiplicativo, então o mapeamento
é `brightness = bright/200`. A direção e a ordem de grandeza batem; paridade de
pixel com o CSS não é objetivo.

## O que é real e o que é substituto

Real: resolução, duração, codecs, zoom/pan com keyframes, cor, overlay de texto,
overlay de imagem, webhook, servidor.

Substitutos, porque as peças ainda não existem neste repositório:

- **Vídeo de origem.** O pipeline de cortes não vive aqui. Se `source_key` não
  resolver para um arquivo em `SOURCE_DIR` (`<key>` ou `<key>.mp4`), o worker
  gera um clipe **sinteticamente óbvio** (`testsrc2` com a legenda `SINTETICO <key>`).
- **Áudio.** Não há acervo de faixas neste repositório, então `trackId` não
  resolve para arquivo nenhum e o mp4 sai com uma trilha **AAC silenciosa**
  (`anullsrc`) — o arquivo sempre tem áudio, só não tem som.
- **Overlay `kind: "logo"`.** A marca (`brand.logoSrc`) é estado global do
  dashboard, não vai na receita do projeto, então esses overlays são ignorados.
- **Armazenamento.** O mp4 fica em disco (`OUT_DIR`) e é servido em
  `GET /files/<key>`. A troca por S3/MinIO é a Tarefa 2: o único ponto a mudar é
  `store_output()` em `server.py`.
- **Emoji.** A DejaVu não tem glifos de emoji; texto com emoji renderiza sem eles.

## Rodar

```bash
docker build -t homecreators-render render/
docker run --rm -p 9000:9000 -e RENDER_PUBLIC_URL=http://localhost:9000 homecreators-render
curl -X POST localhost:9000/run -H 'content-type: application/json' -d @receita.json
```

Variáveis: `PORT` (9000), `OUT_DIR` (/app/out), `SOURCE_DIR` (/app/sources),
`RENDER_PUBLIC_URL` (base das URLs devolvidas no webhook).

## Teste

```bash
./render/test.sh
```

Sobe a imagem, manda duas receitas com zoom + keyframes + overlay de texto
(9:16 e 4:5), espera o webhook, e confere com `ffprobe` largura, altura, codec de
vídeo (`h264`), codec de áudio (`aac`) e duração (±0,3 s), além de baixar o mp4
por `GET /files/<key>`. Falha alto em qualquer divergência. Precisa de Docker.

## RunPod

`handler.py` é o mesmo render atrás do `runpod.serverless`. Não é usado pelo
servidor HTTP e não é importado por ele. Para usar: `pip install runpod` na
imagem e trocar o `CMD` para `python3 -u handler.py`. O RunPod entrega o
`{"input": ...}` igual e chama o webhook do job sozinho.
