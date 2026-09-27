// Export do vídeo: Worker não roda ffmpeg, então o job vai para o RunPod (GPU).
// O JSON do projeto é a receita de render; o resultado volta pelo webhook /api/hooks/render.
import { HttpError } from './http.js';
import { patchExport } from './db.js';

export async function enqueueRender(env, exp, project) {
  const payload = {
    input: {
      export_id: exp.id,
      recipe: project.data,          // ratio, zoom, x, y, cor, overlays, keyframes, trackId
      source_key: project.segment_id,
      duration: project.duration,
      output: { bucket: env.EXPORT_BUCKET || 'homecreators-exports', key: `${exp.user_id}/${exp.id}.mp4` },
    },
    // RENDER_WEBHOOK_URL: base alcançável pelo worker de render para chamar de volta.
    // No docker-compose o app é http://localhost:8080 (nginx), mas esse endereço não
    // existe dentro do container do render -- lá o caminho é o nome do serviço da api.
    // Em produção não é setado: PUBLIC_URL já é o endereço público da própria api.
    webhook: `${env.RENDER_WEBHOOK_URL || env.PUBLIC_URL}/api/hooks/render?token=${env.RENDER_WEBHOOK_SECRET}`,
  };
  if (env.RENDER_MODE !== 'live') return { jobId: `mock_${exp.id}`, mock: true };

  // RENDER_URL: mesmo caminho de código local (render/server.py) e produção (RunPod).
  // Presente -> é para lá que o job vai; ausente -> monta a URL do RunPod.
  const url = env.RENDER_URL ? `${env.RENDER_URL}/run` : `https://api.runpod.ai/v2/${env.RUNPOD_ENDPOINT}/run`;
  const headers = { 'content-type': 'application/json' };
  if (!env.RENDER_URL) headers.authorization = `Bearer ${env.RUNPOD_API_KEY}`;
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.id) throw new HttpError(502, 'A fila de exportação não aceitou o job. Tente de novo.', 'render');
  return { jobId: out.id };
}

// ponytail: no modo mock o "render" avança em memória via waitUntil.
// Em produção quem avança é o webhook do RunPod — nada disso roda.
export async function simulateRender(env, exportId) {
  const steps = [[20, 'Preparando vídeo'], [65, 'Processando'], [95, 'Exportando']];
  for (const [progress, phase] of steps) {
    await new Promise((r) => setTimeout(r, Number(env.MOCK_RENDER_STEP_MS ?? 300)));
    await patchExport(env.DB, exportId, { status: 'processing', progress, phase });
  }
  await new Promise((r) => setTimeout(r, Number(env.MOCK_RENDER_STEP_MS ?? 300)));
  await patchExport(env.DB, exportId, {
    status: 'ready', progress: 100, phase: 'Concluído',
    url: `${env.PUBLIC_MEDIA_URL || 'https://media.example.invalid'}/${exportId}.mp4`,
  });
}
