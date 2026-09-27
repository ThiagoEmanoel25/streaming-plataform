// Camada de dados mockada. Em produção cada função vira um fetch para o Worker (Cloudflare),
// e exportReel enfileira um job no RunPod (ffmpeg) com o mesmo JSON do projeto como receita.
import { live, call, poll } from './backend.js';
import { toApi } from '../store.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();

const SEGMENTS = [
  { id: 's1', title: 'Gol de falta', tag: 'Gol', range: '12:41 - 12:55', dur: 14, seed: 130 },
  { id: 's2', title: 'Defesa incrível', tag: 'Defesa', range: '34:02 - 34:11', dur: 9, seed: 200 },
  { id: 's3', title: 'Contra-ataque', tag: 'Highlight', range: '58:20 - 58:38', dur: 18, seed: 95 },
  { id: 's4', title: 'Pênalti decisivo', tag: 'Gol', range: '71:10 - 71:22', dur: 12, seed: 160 },
  { id: 's5', title: 'Drible e assistência', tag: 'Highlight', range: '77:45 - 78:01', dur: 16, seed: 270 },
  { id: 's6', title: 'Comemoração', tag: 'Vitória', range: '90:03 - 90:14', dur: 11, seed: 20 },
  { id: 's7', title: 'Chute de fora da área', tag: 'Gol', range: '22:15 - 22:25', dur: 10, seed: 300 },
  { id: 's8', title: 'Escanteio perigoso', tag: 'Highlight', range: '41:30 - 41:43', dur: 13, seed: 50 },
  { id: 's9', title: 'Bola na trave', tag: 'Highlight', range: '49:08 - 49:16', dur: 8, seed: 240 },
  { id: 's10', title: 'Carrinho salvador', tag: 'Defesa', range: '63:50 - 63:57', dur: 7, seed: 180 },
  { id: 's11', title: 'Gol anulado (VAR)', tag: 'Gol', range: '67:22 - 67:42', dur: 20, seed: 330 },
  { id: 's12', title: 'Pressão final', tag: 'Melhores momentos', range: '88:05 - 88:20', dur: 15, seed: 110 },
];

// Templates por esporte. [0] = principal (aparece em "Todos"), [1] = alternativa.
export const TEMPLATES = {
  Gol: ['QUE GOLAÇO! 🔥\nMais um pra conta! ⚽', 'GOOOOL! 🚀\nQuem viu isso ao vivo?'],
  Defesa: ['DEFESA INCRÍVEL! 🧤\nIsso é parede! 💪', 'Reflexo de gigante! 👏\nSalvou o time inteiro.'],
  Highlight: ['O lance que você precisa ver! ⚡\nQual foi o melhor? 👀', 'Lance de craque! 🎯\nDifícil de repetir.'],
  'Melhores momentos': ['Melhores momentos da partida! 🎬\nQual lance foi o mais insano? 🤔', 'Tudo que rolou em 30 segundos ⏱️\nSalva pra ver depois.'],
  Vitória: ['VITÓRIA! 🏆\nMais três pontos na conta! 💙', '3 pontos garantidos! 💪\nBora pra próxima.'],
};
export const TPL_ICON = { Gol: 'ball', Defesa: 'shield', Highlight: 'bolt', 'Melhores momentos': 'clapper', Vitória: 'trophy' };

// Horários sugeridos por rede (dados de exemplo). São recomendação, não garantia.
export const BEST_TIMES = {
  ig: { times: ['11:00', '15:00', '19:00'], best: '15:00', hint: 'Maior engajamento do seu público' },
  yt: { times: ['12:00', '16:00', '20:00'], best: '16:00', hint: 'Mais visualizações e tempo de exibição' },
  tt: { times: ['10:00', '14:00', '21:00'], best: '14:00', hint: 'Maior alcance e descoberta' },
  x: { times: ['08:00', '12:00', '18:00'], best: '12:00', hint: 'Picos de conversa sobre o jogo' },
  th: { times: ['13:00', '18:00', '21:00'], best: '18:00', hint: 'Público mais ativo no fim do dia' },
  fb: { times: ['12:00', '17:00', '19:00'], best: '19:00', hint: 'Alcance maior entre torcedores' },
  li: { times: ['08:00', '11:00', '17:00'], best: '08:00', hint: 'Início do expediente rende mais' },
};

export const COVERS = [
  { id: 0, text: 'QUE GOLAÇO!', seed: 130 },
  { id: 1, text: 'GOL DO ANO? 🔥', seed: 20 },
  { id: 2, text: 'MELHORES MOMENTOS', seed: 95 },
];
export const HOOKS = [
  { id: 0, text: 'OLHA ESSE LANCE! 😱', seed: 130 },
  { id: 1, text: 'VOCÊ VIU ISSO? 👀', seed: 200 },
  { id: 2, text: 'DEFESA INACREDITÁVEL! 🧤', seed: 95 },
];

// Traduções de exemplo. Em produção: serviço de tradução no Worker.
const TR = {
  'QUE GOLAÇO! 🔥\nMais um pra conta! ⚽': ['WHAT A GOAL! 🔥\nAnother one for the count! ⚽', '¡QUÉ GOLAZO! 🔥\n¡Uno más para la cuenta! ⚽'],
  'GOOOOL! 🚀\nQuem viu isso ao vivo?': ['GOOOAL! 🚀\nWho saw this live?', '¡GOOOL! 🚀\n¿Quién lo vio en vivo?'],
  'DEFESA INCRÍVEL! 🧤\nIsso é parede! 💪': ['INCREDIBLE SAVE! 🧤\nThat is a wall! 💪', '¡ATAJADA INCREÍBLE! 🧤\n¡Eso es una muralla! 💪'],
  'Reflexo de gigante! 👏\nSalvou o time inteiro.': ['Giant reflexes! 👏\nSaved the whole team.', '¡Reflejos de gigante! 👏\nSalvó a todo el equipo.'],
  'O lance que você precisa ver! ⚡\nQual foi o melhor? 👀': ['The play you need to see! ⚡\nWhich one was the best? 👀', '¡La jugada que tienes que ver! ⚡\n¿Cuál fue la mejor? 👀'],
  'Melhores momentos da partida! 🎬\nQual lance foi o mais insano? 🤔': ['Match highlights! 🎬\nWhich play was the craziest? 🤔', '¡Lo mejor del partido! 🎬\n¿Qué jugada fue la más increíble? 🤔'],
  'VITÓRIA! 🏆\nMais três pontos na conta! 💙': ['VICTORY! 🏆\nThree more points on the board! 💙', '¡VICTORIA! 🏆\n¡Tres puntos más en la cuenta! 💙'],
};

export const PLANS = [
  { id: 'starter', name: 'Starter', price: 'R$ 0', exports: 10, publications: 20, storage: 5, perks: ['Marca d’água Home Creators', '2 redes sociais'] },
  { id: 'creator', name: 'Creator', price: 'R$ 49', exports: 50, publications: 100, storage: 25, perks: ['Sem marca d’água', 'Todas as redes disponíveis'] },
  { id: 'pro', name: 'Pro', price: 'R$ 149', exports: 300, publications: 600, storage: 100, perks: ['Exportação prioritária', 'Todas as redes disponíveis'] },
];

export const NET_STRATEGY = Object.fromEntries(Object.entries(BEST_TIMES).map(([k, v]) => [k, v.best]));

const POSTS = [
  { id: 'a1', net: 'ig', title: 'Golaço de falta', views: 18400, likes: 2310, comments: 142, at: day(1), seed: 130 },
  { id: 'a2', net: 'yt', title: 'Golaço de falta', views: 9200, likes: 780, comments: 64, at: day(1), seed: 130 },
  { id: 'a3', net: 'ig', title: 'Vitória na final', views: 24100, likes: 3320, comments: 210, at: day(3), seed: 20 },
  { id: 'a4', net: 'yt', title: 'Vitória na final', views: 11800, likes: 940, comments: 88, at: day(3), seed: 20 },
  { id: 'a5', net: 'tt', title: 'Defesa impossível', views: 6100, likes: 720, comments: 39, at: day(5), seed: 200 },
  { id: 'a6', net: 'ig', title: 'Contra-ataque', views: 7300, likes: 610, comments: 31, at: day(6), seed: 95 },
];
const SERIES = [3100, 5200, 4100, 8900, 7600, 12400, 9800];

export const api = {
  async segments() {
    if (live()) return (await call('GET', '/segments')).segments;
    await sleep(500);
    return SEGMENTS;
  },

  async analytics() {
    await sleep(600);
    const total = POSTS.reduce((a, p) => a + p.views, 0);
    const likes = POSTS.reduce((a, p) => a + p.likes + p.comments, 0);
    const byNet = {};
    POSTS.forEach((p) => (byNet[p.net] = (byNet[p.net] || 0) + p.views));
    const top = Object.entries(byNet).sort((a, b) => b[1] - a[1])[0][0];
    return { posts: POSTS, series: SERIES, totals: { posts: POSTS.length, views: total, engagement: +((likes / total) * 100).toFixed(1), top } };
  },

  // Estados: Preparando vídeo → Processando → Exportando → Concluído
  async exportReel(project, onProgress) {
    if (live()) {
      onProgress(5, 'Preparando vídeo');
      await call('POST', '/projects', toApi(project));           // garante o projeto no servidor
      const started = await call('POST', '/exports', { projectId: project.id });
      const out = await poll(`/exports/${started.export.id}`,
        (d) => ['ready', 'failed'].includes(d.export.status),
        (d) => onProgress(d.export.progress ?? 10, d.export.phase || 'Processando'));
      if (out.export.status === 'failed') throw new Error(out.export.error || 'Falha ao renderizar o vídeo.');
      onProgress(100, 'Concluído');
      const e = out.export;
      return { id: e.id, name: e.name, duration: e.duration ?? project.duration, ratio: e.ratio, seed: project.seed, at: e.createdAt, url: e.url };
    }
    const phases = [['Preparando vídeo', 0, 20], ['Processando', 20, 65], ['Exportando', 65, 100]];
    for (const [label, from, to] of phases) {
      for (let p = from; p < to; p += 4) { onProgress(p, label); await sleep(90); }
    }
    onProgress(100, 'Concluído');
    return { id: 'e' + Date.now(), name: project.name, duration: project.duration, ratio: project.ratio, seed: project.seed, at: new Date().toISOString() };
  },

  async translate(text, lang) {
    await sleep(800);
    if (lang === 'pt') return text;
    const hit = TR[text];
    return hit ? hit[lang === 'en' ? 0 : 1] : `[${lang.toUpperCase()}] ${text}`; // mock: em prod, serviço de tradução
  },

  async variants(kind) {
    await sleep(900);
    return kind === 'intro'
      ? [{ id: 0, label: 'Zoom rápido no lance', seed: 130 }, { id: 1, label: 'Placar na tela', seed: 200 }, { id: 2, label: 'Câmera lenta', seed: 270 }]
      : [{ id: 0, label: 'Variação 1', seed: 130 }, { id: 1, label: 'Variação 2', seed: 200 }, { id: 2, label: 'Variação 3', seed: 300 }];
  },

  async upgrade(planId) { await sleep(1000); return planId; },
};
