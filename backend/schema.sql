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
