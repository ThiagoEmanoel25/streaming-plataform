// Acesso ao D1. Datas em ISO-8601 UTC.
import { notFound } from './http.js';

export const now = () => new Date().toISOString();
export const period = (d = new Date()) => d.toISOString().slice(0, 7); // YYYY-MM
export const uid = (p) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

const all = async (db, sql, ...a) => (await db.prepare(sql).bind(...a).all()).results || [];
const one = (db, sql, ...a) => db.prepare(sql).bind(...a).first();
const run = (db, sql, ...a) => db.prepare(sql).bind(...a).run();

export async function ensureUser(db, user) {
  const row = await one(db, 'select * from users where id = ?', user.id);
  if (row) {
    if (user.email && row.email !== user.email) await run(db, 'update users set email = ? where id = ?', user.email, user.id);
    return row;
  }
  await run(db, 'insert into users (id, email, plan, created_at) values (?, ?, ?, ?)', user.id, user.email, 'starter', now());
  return one(db, 'select * from users where id = ?', user.id);
}

export async function getUsage(db, userId) {
  const p = period();
  return (await one(db, 'select * from usage where user_id = ? and period = ?', userId, p))
    || { user_id: userId, period: p, exports: 0, publications: 0, storage_mb: 0 };
}
// incremento atômico: upsert soma no próprio SQL, sem read-modify-write
export const bumpUsage = (db, userId, field, by = 1) => run(db,
  `insert into usage (user_id, period, ${field}) values (?, ?, ?)
   on conflict(user_id, period) do update set ${field} = ${field} + excluded.${field}`,
  userId, period(), by);

export const listProjects = (db, userId) => all(db, 'select * from projects where user_id = ? and deleted_at is null order by updated_at desc limit 200', userId);
export const getProject = (db, userId, id) => one(db, 'select * from projects where id = ? and user_id = ? and deleted_at is null', id, userId);
export const saveProject = (db, userId, p) => run(db,
  `insert into projects (id, user_id, name, segment_id, duration, data, updated_at) values (?, ?, ?, ?, ?, ?, ?)
   on conflict(id) do update set name = excluded.name, segment_id = excluded.segment_id, duration = excluded.duration,
     data = excluded.data, updated_at = excluded.updated_at, deleted_at = null
   where projects.user_id = excluded.user_id`,
  p.id, userId, p.name, p.segmentId || null, p.duration ?? null, JSON.stringify(p.data ?? {}), now());
export const softDeleteProject = (db, userId, id) => run(db, 'update projects set deleted_at = ? where id = ? and user_id = ?', now(), id, userId);

export const listExports = (db, userId) => all(db, 'select * from exports where user_id = ? order by created_at desc limit 100', userId);
export const getExport = (db, userId, id) => one(db, 'select * from exports where id = ? and user_id = ?', id, userId);
export const createExport = (db, userId, e) => run(db,
  'insert into exports (id, user_id, project_id, name, ratio, duration, status, progress, phase, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?)',
  e.id, userId, e.projectId || null, e.name, e.ratio || null, e.duration ?? null, 'queued', 0, 'Preparando vídeo', now(), now());
export const patchExport = (db, id, patch) => {
  const keys = Object.keys(patch);
  return run(db, `update exports set ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? where id = ?`, ...keys.map((k) => patch[k]), now(), id);
};
export const exportByJob = (db, jobId) => one(db, 'select * from exports where job_id = ?', jobId);

export const listConnections = (db, userId) => all(db, 'select user_id, network, handle, external_id, expires_at, status, created_at from connections where user_id = ?', userId);
export const getConnection = (db, userId, network) => one(db, 'select * from connections where user_id = ? and network = ?', userId, network);
export const saveConnection = (db, userId, c) => run(db,
  `insert into connections (user_id, network, handle, external_id, token, refresh_token, expires_at, scopes, status, created_at)
   values (?,?,?,?,?,?,?,?, 'active', ?)
   on conflict(user_id, network) do update set handle = excluded.handle, external_id = excluded.external_id, token = excluded.token,
     refresh_token = excluded.refresh_token, expires_at = excluded.expires_at, scopes = excluded.scopes, status = 'active'`,
  userId, c.network, c.handle || null, c.externalId || null, c.token, c.refreshToken || null, c.expiresAt || null, c.scopes || null, now());
export const deleteConnection = (db, userId, network) => run(db, 'delete from connections where user_id = ? and network = ?', userId, network);
export const markReauth = (db, userId, network) => run(db, "update connections set status = 'reauth' where user_id = ? and network = ?", userId, network);

export const listPublications = (db, userId, exportId) => exportId
  ? all(db, 'select * from publications where user_id = ? and export_id = ? order by created_at desc', userId, exportId)
  : all(db, 'select * from publications where user_id = ? order by created_at desc limit 100', userId);
export const getPublication = (db, userId, id) => one(db, 'select * from publications where id = ? and user_id = ?', id, userId);
export const createPublication = (db, userId, p) => run(db,
  'insert into publications (id, user_id, export_id, network, caption, status, scheduled_at, created_at, updated_at) values (?,?,?,?,?,?,?,?,?)',
  p.id, userId, p.exportId, p.network, p.caption || null, p.status, p.scheduledAt || null, now(), now());
export const patchPublication = (db, id, patch) => {
  const keys = Object.keys(patch);
  return run(db, `update publications set ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? where id = ?`, ...keys.map((k) => patch[k]), now(), id);
};

// cortes da partida: sem user_id de propósito (não são dados do usuário, ver schema.sql)
export const listSegments = (db) => all(db, 'select * from segments order by id');

export const saveOAuthState = (db, state, userId, network, redirect) => run(db, 'insert into oauth_states (state, user_id, network, redirect, created_at) values (?,?,?,?,?)', state, userId, network, redirect || null, now());
export async function takeOAuthState(db, state) {
  const row = await one(db, 'select * from oauth_states where state = ?', state);
  if (!row) throw notFound('Pedido de conexão expirado. Tente conectar de novo.');
  await run(db, 'delete from oauth_states where state = ?', state);
  if (Date.now() - new Date(row.created_at).getTime() > 15 * 60e3) throw notFound('Pedido de conexão expirado. Tente conectar de novo.');
  return row;
}
export { all, one, run };
