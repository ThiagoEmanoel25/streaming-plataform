"""Receita do editor -> mp4 de verdade, via ffmpeg.

A receita e' o mesmo JSON que o editor salva (ver dashboard/js/store.js). A
referencia de como cada campo aparece na tela e' `applyPhone`/`ovHTML` em
dashboard/js/ui/components.js -- o preview e' o contrato com o usuario, entao
os numeros abaixo saem direto do CSS.
"""
import base64, os, re, shutil, subprocess, tempfile

RATIOS = {'9:16': (1080, 1920), '4:5': (1080, 1350)}
FPS = 30
MAX_DURATION = 300  # teto de duracao do export, segundos
FFMPEG_TIMEOUT = 600  # segundos; generoso p/ MAX_DURATION a `veryfast`
# .vid e' `position:absolute;inset:-20%` -> o elemento do video mede 140% do
# quadro. O translate() do CSS e' em % desse elemento, e com zoom=1 o quadro
# mostra 1/1.4 do video. Sem esse fator o render nao bate com o preview.
BLEED = 1.4
FONT = '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf'
SOURCE_DIR = os.environ.get('SOURCE_DIR', '/app/sources')


def _num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _piecewise(points, prog):
    """Expressao ffmpeg linear por partes sobre o progresso 0..1.

    points: [(t, valor)] ordenado. Fora do intervalo, segura a ponta.
    """
    pts = sorted(points, key=lambda p: p[0])
    if not pts:
        return '0'
    if len(pts) > 1 and pts[0][0] > 0:
        pts.insert(0, (0.0, pts[0][1]))
    if len(pts) > 1 and pts[-1][0] < 1:
        pts.append((1.0, pts[-1][1]))
    if len(pts) == 1:
        return '%.6f' % pts[0][1]
    expr = '%.6f' % pts[-1][1]
    for (t0, v0), (t1, v1) in reversed(list(zip(pts[:-1], pts[1:]))):
        if t1 <= t0:
            continue
        seg = '(%.6f+(%.6f)*((%s)-%.6f))' % (v0, (v1 - v0) / (t1 - t0), prog, t0)
        expr = 'if(lt(%s,%.6f),%s,%s)' % (prog, t1, seg, expr)
    return expr


def _motion(recipe, total_frames):
    """(z, x, y) como expressoes ffmpeg para o zoompan."""
    kfs = [k for k in (recipe.get('keyframes') or []) if isinstance(k, dict)]
    if kfs:
        pts = [(min(1.0, max(0.0, _num(k.get('t')))),
                max(1.0, _num(k.get('zoom'), 1.0)),
                _num(k.get('x')) / 100.0,
                _num(k.get('y')) / 100.0) for k in kfs]
    else:
        pts = [(0.0, max(1.0, _num(recipe.get('zoom'), 1.0)),
                _num(recipe.get('x')) / 100.0, _num(recipe.get('y')) / 100.0)]
    prog = 'on/%d' % max(1, total_frames - 1)
    z = _piecewise([(t, v) for t, v, _, _ in pts], prog)
    fx = _piecewise([(t, v) for t, _, v, _ in pts], prog)
    fy = _piecewise([(t, v) for t, _, _, v in pts], prog)
    # zoompan recorta iw/zoom; o quadro pede W/z de um elemento de W*BLEED
    return ('%.4f*(%s)' % (BLEED, z),
            'iw*(0.5-(0.5+%.4f*(%s))/zoom)' % (BLEED, fx),
            'ih*(0.5-(0.5+%.4f*(%s))/zoom)' % (BLEED, fy))


def _color(recipe):
    """bright/contrast/sat/temp sao offsets centrados em 0, como em applyPhone."""
    b, c, s = _num(recipe.get('bright')), _num(recipe.get('contrast')), _num(recipe.get('sat'))
    t = _num(recipe.get('temp'))
    out = []
    if b or c or s:
        # CSS brightness e' multiplicativo, eq e' aditivo: b=+50 -> +0.25
        out.append('eq=brightness=%.4f:contrast=%.4f:saturation=%.4f'
                   % (max(-1.0, min(1.0, b / 200.0)), max(0.0, 1 + c / 100.0), max(0.0, 1 + s / 100.0)))
    if t:
        # temp > 0 e' quente (laranja) = menos Kelvin
        out.append('colortemperature=temperature=%d' % max(1000, min(40000, int(6500 - t * 60))))
    return out


def _esc_path(p):
    return p.replace('\\', '\\\\').replace(':', r'\:').replace("'", r"\'")


def _overlays(recipe, w, h, workdir):
    """Devolve (inputs_extra, filtros_de_overlay, filtros_drawtext)."""
    inputs, chains, texts = [], [], []
    for i, o in enumerate(recipe.get('overlays') or []):
        if not isinstance(o, dict):
            continue
        op = max(0.0, min(1.0, _num(o.get('opacity'), 1.0)))
        cx, cy = 0.5 + _num(o.get('x')) / 100.0, 0.5 + _num(o.get('y')) / 100.0
        if o.get('kind') == 'text':
            txt = str(o.get('text') or '')
            if not txt:
                continue
            fp = os.path.join(workdir, 'txt%d.txt' % i)
            with open(fp, 'w', encoding='utf-8') as f:
                f.write(txt)
            # font-size: calc(var(--w) * size * 0.002), --w = largura do quadro
            size = max(8.0, _num(o.get('size'), 24) * 0.002 * w)
            texts.append(
                # expansion=none: sem isso um "%" no texto vira "Stray %" e o drawtext 
                # descarta a linha inteira, em silencio.
                "drawtext=fontfile=%s:textfile=%s:expansion=none:fontsize=%.2f:fontcolor=white@%.3f"
                ":box=1:boxcolor=black@%.3f:boxborderw=%d"
                ":x=%.1f-text_w/2:y=%.1f-text_h/2"
                % (_esc_path(FONT), _esc_path(fp), size, op, 0.5 * op, int(size * 0.5),
                   cx * w, cy * h))
            continue
        src = o.get('src') or ''
        path = _decode_src(src, workdir, i)
        if not path:
            continue  # kind=logo (a marca nao vem na receita) ou src nao resolvido
        side = max(2.0, _num(o.get('size'), 20) / 100.0 * w)
        idx = len(chains) + 2  # entradas 0 = video, 1 = audio silencioso
        inputs += ['-i', path]
        chains.append(('[%d:v]scale=%d:%d:force_original_aspect_ratio=decrease,'
                       'format=rgba,colorchannelmixer=aa=%.3f[ov%d]'
                       % (idx, int(side), int(side), op, i),
                       'overlay=x=%.1f-overlay_w/2:y=%.1f-overlay_h/2'
                       % (cx * w, cy * h), i))
    return inputs, chains, texts


def _decode_src(src, workdir, i):
    """Aceita só `data:` URI -- é tudo que o editor produz (FileReader.readAsDataURL
    em dashboard/js/views/reels.js). Um caminho de arquivo local NUNCA é aceito aqui:
    a receita é controlada pelo usuário e um caminho local deixaria compor o export
    de outro usuário (ex.: /app/out/<outro-user>/<export>.mp4) no seu próprio vídeo."""
    m = re.match(r'^data:image/(\w+);base64,(.+)$', src or '', re.S)
    if not m:
        return None
    p = os.path.join(workdir, 'ov%d.%s' % (i, m.group(1)))
    with open(p, 'wb') as f:
        f.write(base64.b64decode(m.group(2)))
    return p


def find_source(source_key):
    """mp4 do corte, se existir. O pipeline de cortes nao vive neste repo."""
    if not source_key:
        return None
    safe = os.path.basename(str(source_key))
    for cand in (os.path.join(SOURCE_DIR, safe), os.path.join(SOURCE_DIR, safe + '.mp4')):
        if os.path.isfile(cand):
            return cand
    return None


def _has_audio(path):
    try:
        p = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index',
             '-of', 'csv=p=0', path], capture_output=True, text=True, timeout=10)
        return bool(p.stdout.strip())
    except Exception:
        return False


def build_command(job_input, out_path, workdir):
    recipe = job_input.get('recipe') or {}
    dur = min(MAX_DURATION, max(0.5, _num(job_input.get('duration'), 10) or 10))
    w, h = RATIOS.get(recipe.get('ratio'), RATIOS['9:16'])
    src = find_source(job_input.get('source_key'))
    total = int(round(dur * FPS))

    cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error']
    pre = []
    if src:
        cmd += ['-i', src]
    else:
        # substituto: sem pipeline de cortes aqui, o clipe e' sinteticamente obvio
        cmd += ['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=%d:duration=%.3f' % (FPS, dur)]
        label = os.path.join(workdir, 'label.txt')
        with open(label, 'w', encoding='utf-8') as f:
            f.write('SINTETICO %s' % (job_input.get('source_key') or 'sem-fonte'))
        pre.append('drawtext=fontfile=%s:textfile=%s:expansion=none:fontsize=40:fontcolor=white:x=(w-text_w)/2:y=h-90'
                   % (_esc_path(FONT), _esc_path(label)))
    cmd += ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']

    z, x, y = _motion(recipe, total)
    ew, eh = int(w * BLEED), int(h * BLEED)
    chain = list(pre) + [
        'scale=%d:%d:force_original_aspect_ratio=increase' % (ew, eh),
        'crop=%d:%d' % (ew, eh),
        "zoompan=z='%s':x='%s':y='%s':d=1:s=%dx%d:fps=%d" % (z, x, y, w, h, FPS),
        'setsar=1',
    ] + _color(recipe)

    inputs, ov_chains, texts = _overlays(recipe, w, h, workdir)
    cmd += inputs

    graph = [pre_chain for pre_chain, _, _ in ov_chains]
    graph.append('[0:v]%s[base]' % ','.join(chain))
    cur = 'base'
    for _, ov_filter, i in ov_chains:
        graph.append('[%s][ov%d]%s[b%d]' % (cur, i, ov_filter, i))
        cur = 'b%d' % i
    if texts:
        graph.append('[%s]%s[vout]' % (cur, ','.join(texts)))
    else:
        graph.append('[%s]null[vout]' % cur)

    # audio real quando a fonte tem trilha; senao cai no anullsrc (entrada 1)
    audio_map = '0:a' if (src and _has_audio(src)) else '1:a'
    cmd += ['-filter_complex', ';'.join(graph), '-map', '[vout]', '-map', audio_map,
            '-t', '%.3f' % dur, '-r', str(FPS),
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out_path]
    return cmd


def render(job_input, out_path):
    """Renderiza e devolve o tamanho em MB. Levanta RuntimeError se o ffmpeg falhar."""
    workdir = tempfile.mkdtemp(prefix='render-')
    try:
        cmd = build_command(job_input, out_path, workdir)
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=FFMPEG_TIMEOUT)
        except subprocess.TimeoutExpired:
            raise RuntimeError('ffmpeg excedeu o tempo limite (%ds).' % FFMPEG_TIMEOUT)
        if p.returncode != 0 or not os.path.isfile(out_path) or os.path.getsize(out_path) == 0:
            raise RuntimeError((p.stderr or 'ffmpeg falhou').strip()[-2000:])
        if p.stderr.strip():  # avisos do ffmpeg sao mudos demais para ficarem escondidos
            print('[render] ffmpeg: %s' % p.stderr.strip()[-1000:], flush=True)
        return round(os.path.getsize(out_path) / (1024 * 1024), 2)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
