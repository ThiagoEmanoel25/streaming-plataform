-- Cloudflare D1. Aplicar: wrangler d1 execute homecreators --file=schema.sql
-- Mídia (fonte, export) fica em R2/B2; aqui só metadados.

create table if not exists users (
  id            text primary key,          -- Supabase auth.users.id (sub do JWT)
  email         text,
  plan          text not null default 'starter',
  stripe_customer text,
  created_at    text not null
);

-- contador por mês (YYYY-MM): limites do plano são checados aqui, no servidor
create table if not exists usage (
  user_id      text not null,
  period       text not null,
  exports      integer not null default 0,
  publications integer not null default 0,
  storage_mb   integer not null default 0,
  primary key (user_id, period)
);

-- data = receita de render (ratio, zoom, x, y, cor, overlays, keyframes, trackId).
-- É o MESMO JSON que o editor usa, e o que vai para o RunPod.
create table if not exists projects (
  id         text primary key,
  user_id    text not null,
  name       text not null,
  segment_id text,
  duration   real,
  data       text not null,
  updated_at text not null,
  deleted_at text
);
create index if not exists idx_projects_user on projects(user_id, updated_at desc);

create table if not exists exports (
  id         text primary key,
  user_id    text not null,
  project_id text,
  name       text not null,
  ratio      text,
  duration   real,
  status     text not null,               -- queued | processing | ready | failed
  progress   integer not null default 0,
  phase      text,
  job_id     text,                        -- id do job no RunPod
  url        text,                        -- R2/B2
  thumb_url  text,
  error      text,
  created_at text not null,
  updated_at text not null
);
create index if not exists idx_exports_user on exports(user_id, created_at desc);

-- token/refresh_token SEMPRE cifrados (AES-GCM, ver src/crypto.js). Nunca em claro.
create table if not exists connections (
  user_id       text not null,
  network       text not null,
  handle        text,
  external_id   text,
  token         text not null,
  refresh_token text,
  expires_at    text,
  scopes        text,
  status        text not null default 'active',  -- active | reauth
  created_at    text not null,
  primary key (user_id, network)
);

-- id = "<export_id>:<network>" => publicar de novo é idempotente por natureza
create table if not exists publications (
  id           text primary key,
  user_id      text not null,
  export_id    text not null,
  network      text not null,
  caption      text,
  status       text not null,             -- queued | processing | success | failed
  scheduled_at text,
  external_id  text,
  permalink    text,
  error        text,
  attempts     integer not null default 0,
  created_at   text not null,
  updated_at   text not null
);
create index if not exists idx_pub_user on publications(user_id, created_at desc);
create index if not exists idx_pub_export on publications(export_id);

-- state do OAuth (expira em minutos; limpo no próprio callback)
create table if not exists oauth_states (
  state      text primary key,
  user_id    text not null,
  network    text not null,
  redirect   text,
  created_at text not null
);

-- Cortes da partida. Não são dados do usuário (por isso sem user_id) — hoje populados pelo
-- seed abaixo; em produção o pipeline de detecção de lances (fora deste repo) escreve aqui.
create table if not exists segments (
  id    text primary key,
  title text not null,
  tag   text not null,
  range text not null,
  dur   real not null,
  seed  integer not null
);
insert or ignore into segments (id, title, tag, range, dur, seed) values
  ('s1', 'Gol de falta', 'Gol', '12:41 - 12:55', 14, 130),
  ('s2', 'Defesa incrível', 'Defesa', '34:02 - 34:11', 9, 200),
  ('s3', 'Contra-ataque', 'Highlight', '58:20 - 58:38', 18, 95),
  ('s4', 'Pênalti decisivo', 'Gol', '71:10 - 71:22', 12, 160),
  ('s5', 'Drible e assistência', 'Highlight', '77:45 - 78:01', 16, 270),
  ('s6', 'Comemoração', 'Vitória', '90:03 - 90:14', 11, 20),
  ('s7', 'Chute de fora da área', 'Gol', '22:15 - 22:25', 10, 300),
  ('s8', 'Escanteio perigoso', 'Highlight', '41:30 - 41:43', 13, 50),
  ('s9', 'Bola na trave', 'Highlight', '49:08 - 49:16', 8, 240),
  ('s10', 'Carrinho salvador', 'Defesa', '63:50 - 63:57', 7, 180),
  ('s11', 'Gol anulado (VAR)', 'Gol', '67:22 - 67:42', 20, 330),
  ('s12', 'Pressão final', 'Melhores momentos', '88:05 - 88:20', 15, 110);
