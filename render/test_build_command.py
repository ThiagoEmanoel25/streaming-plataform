"""Teste unitario de build_command(), sem Docker e sem chamar ffmpeg.

Existe porque test.sh (ponta a ponta) so confere resolucao/duracao/codec do
mp4 final -- um build_command() que ignorasse a receita inteira passaria
igual. Este teste falha rapido se zoom/posicao/cor/keyframes/ratio pararem de
chegar no -filter_complex.

Roda com: python3 render/test_build_command.py
"""
import sys
import tempfile
import unittest

import render as renderer


class BuildCommandTest(unittest.TestCase):
    def _graph(self, recipe, **extra):
        job = {'recipe': recipe, 'duration': 5, 'source_key': 'nao-existe'}
        job.update(extra)
        with tempfile.TemporaryDirectory() as workdir:
            cmd = renderer.build_command(job, '/tmp/out.mp4', workdir)
        return ';'.join(cmd)  # -filter_complex e' um dos args; basta procurar no comando todo

    def test_ratio_escolhe_resolucao(self):
        self.assertIn('1080x1920', self._graph({'ratio': '9:16'}))
        self.assertIn('1080x1350', self._graph({'ratio': '4:5'}))

    def test_zoom_entra_no_zoompan(self):
        graph = self._graph({'ratio': '9:16', 'zoom': 2.0})
        # _motion() monta a expressao "BLEED*(zoom)" pro zoompan -- ver render.py
        self.assertIn('1.4000*(2.000000)', graph)

    def test_posicao_entra_no_zoompan(self):
        graph_pos = self._graph({'ratio': '9:16', 'x': 10, 'y': 0})
        graph_zero = self._graph({'ratio': '9:16', 'x': 0, 'y': 0})
        self.assertNotEqual(graph_pos, graph_zero)
        self.assertIn('0.100000', graph_pos)  # x:10 -> fx=0.10 em _motion()

    def test_cor_entra_no_eq_e_no_colortemperature(self):
        graph = self._graph({'ratio': '9:16', 'bright': 20, 'contrast': 10, 'sat': 30, 'temp': -10})
        self.assertIn('eq=brightness=0.1000:contrast=1.1000:saturation=1.3000', graph)
        self.assertIn('colortemperature=temperature=7100', graph)  # 6500-(-10)*60

    def test_sem_cor_nao_gera_filtro_eq(self):
        graph = self._graph({'ratio': '9:16'})
        self.assertNotIn('eq=brightness', graph)
        self.assertNotIn('colortemperature', graph)

    def test_keyframes_geram_if_lt_piecewise(self):
        graph = self._graph({'ratio': '9:16',
                             'keyframes': [{'t': 0, 'zoom': 1, 'x': 0, 'y': 0},
                                           {'t': 0.6, 'zoom': 1.4, 'x': -4, 'y': -8}]})
        self.assertIn('if(lt(', graph)

    def test_sem_keyframes_nao_gera_if_lt(self):
        graph = self._graph({'ratio': '9:16', 'zoom': 1.2})
        self.assertNotIn('if(lt(', graph)

    def test_overlay_de_texto_entra_no_drawtext(self):
        graph = self._graph({'ratio': '9:16',
                             'overlays': [{'kind': 'text', 'text': 'ola', 'size': 26, 'opacity': 1}]})
        self.assertIn('drawtext=', graph)

    def test_sem_overlays_nao_gera_drawtext_de_overlay(self):
        # sem fonte real o clipe sintetico sempre tem seu proprio drawtext (legenda
        # "SINTETICO"); o que importa aqui e' o drawtext do overlay de texto, que
        # tem caixa preta (box=1:boxcolor=black), ausente na legenda sintetica.
        graph = self._graph({'ratio': '9:16'})
        self.assertNotIn('boxcolor=black', graph)

    def test_logo_sem_marca_nao_desenha_nada(self):
        # sem `recipe.brand`, kind=logo é ignorado (compat com receitas antigas).
        # boxcolor=black só existe no drawtext de overlay (texto/marca), nunca na
        # legenda "SINTETICO" do clipe sem fonte -- ver test_sem_overlays_... acima.
        graph = self._graph({'ratio': '9:16', 'overlays': [{'kind': 'logo', 'size': 20, 'opacity': 1}]})
        self.assertNotIn('boxcolor=black', graph)
        self.assertNotIn('overlay=', graph)

    def test_logo_com_nome_desenha_iniciais(self):
        graph = self._graph({'ratio': '9:16', 'brand': {'name': 'Home Creators'},
                             'overlays': [{'kind': 'logo', 'size': 20, 'opacity': 1}]})
        self.assertIn('boxcolor=black', graph)

    def test_marca_muda_o_comando_de_render(self):
        # requisito da Tarefa 3: uma receita com marca tem de gerar um mp4 diferente
        # da mesma receita sem marca -- aqui a prova é que o comando do ffmpeg muda.
        sem_marca = self._graph({'ratio': '9:16', 'overlays': [{'kind': 'logo', 'size': 20, 'opacity': 1}]})
        com_marca = self._graph({'ratio': '9:16', 'brand': {'name': 'Home Creators'},
                                 'overlays': [{'kind': 'logo', 'size': 20, 'opacity': 1}]})
        self.assertNotEqual(sem_marca, com_marca)

    def test_logo_com_imagem_usa_overlay_em_vez_de_texto(self):
        px = ('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBA'
              'ScY42YAAAAASUVORK5CYII=')
        graph = self._graph({'ratio': '9:16', 'brand': {'name': 'Home Creators', 'logoSrc': px},
                             'overlays': [{'kind': 'logo', 'size': 20, 'opacity': 1}]})
        self.assertIn('overlay=', graph)
        self.assertNotIn('boxcolor=black', graph)

    def test_duracao_tem_teto(self):
        cmd = self._graph({'ratio': '9:16'}, duration=999999)
        self.assertIn('-t', cmd)
        self.assertNotIn('999999', cmd)  # deve ter sido cortado por MAX_DURATION


if __name__ == '__main__':
    sys.exit(unittest.main())
