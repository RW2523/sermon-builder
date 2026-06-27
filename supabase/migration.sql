-- ============================================================
-- Sermon Builder — Supabase Migration
-- Run this in the Supabase SQL editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text,
  church      text,
  role        text default 'pastor',
  avatar_url  text,
  created_at  timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users manage own profile"
  on profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------------------------------------------------------------
-- sermons
-- ---------------------------------------------------------------
create table if not exists sermons (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users on delete cascade,
  title         text not null default 'Untitled Sermon',
  status        text not null default 'draft'
                  check (status in ('draft','polished','multimedia','exported','published')),
  current_stage integer not null default 1
                  check (current_stage between 1 and 4),
  scripture_ref text,
  theme         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table sermons enable row level security;

create policy "Users manage own sermons"
  on sermons for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- sermon_inputs
-- ---------------------------------------------------------------
create table if not exists sermon_inputs (
  id            uuid primary key default uuid_generate_v4(),
  sermon_id     uuid not null references sermons on delete cascade,
  kind          text not null check (kind in ('text','dictation','audio','file')),
  raw_text      text,
  storage_path  text,
  transcription text,
  created_at    timestamptz default now()
);

alter table sermon_inputs enable row level security;

create policy "Users manage own sermon_inputs"
  on sermon_inputs for all
  using (exists (
    select 1 from sermons s where s.id = sermon_id and s.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from sermons s where s.id = sermon_id and s.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------
-- sermon_drafts
-- ---------------------------------------------------------------
create table if not exists sermon_drafts (
  id             uuid primary key default uuid_generate_v4(),
  sermon_id      uuid not null references sermons on delete cascade,
  polished_html  text,
  template_type  text default 'message'
                   check (template_type in ('prayer','message','story','devotional','teaching','custom')),
  version        integer default 1,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

alter table sermon_drafts enable row level security;

create policy "Users manage own sermon_drafts"
  on sermon_drafts for all
  using (exists (
    select 1 from sermons s where s.id = sermon_id and s.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from sermons s where s.id = sermon_id and s.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------
-- sermon_media
-- ---------------------------------------------------------------
create table if not exists sermon_media (
  id           uuid primary key default uuid_generate_v4(),
  sermon_id    uuid not null references sermons on delete cascade,
  kind         text not null check (kind in ('image','map')),
  prompt       text,
  storage_path text,
  public_url   text,
  caption      text,
  order_index  integer default 0,
  created_at   timestamptz default now()
);

alter table sermon_media enable row level security;

create policy "Users manage own sermon_media"
  on sermon_media for all
  using (exists (
    select 1 from sermons s where s.id = sermon_id and s.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from sermons s where s.id = sermon_id and s.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------
-- sermon_exports
-- ---------------------------------------------------------------
create table if not exists sermon_exports (
  id           uuid primary key default uuid_generate_v4(),
  sermon_id    uuid not null references sermons on delete cascade,
  format       text not null check (format in ('pdf','ppt','video')),
  storage_path text,
  public_url   text,
  created_at   timestamptz default now()
);

alter table sermon_exports enable row level security;

create policy "Users manage own sermon_exports"
  on sermon_exports for all
  using (exists (
    select 1 from sermons s where s.id = sermon_id and s.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from sermons s where s.id = sermon_id and s.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------
-- outreach_posts
-- ---------------------------------------------------------------
create table if not exists outreach_posts (
  id              uuid primary key default uuid_generate_v4(),
  sermon_id       uuid not null references sermons on delete cascade,
  share_slug      text not null unique,
  is_public       boolean default false,
  social_caption  text,
  hashtags        text[],
  summary         text,
  created_at      timestamptz default now()
);

alter table outreach_posts enable row level security;

create policy "Users manage own outreach_posts"
  on outreach_posts for all
  using (exists (
    select 1 from sermons s where s.id = sermon_id and s.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from sermons s where s.id = sermon_id and s.user_id = auth.uid()
  ));

-- Public read for published posts (the share page)
create policy "Public can read public outreach posts"
  on outreach_posts for select
  using (is_public = true);

-- Trigger to update updated_at
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sermons_updated_at
  before update on sermons
  for each row execute procedure update_updated_at_column();

create trigger sermon_drafts_updated_at
  before update on sermon_drafts
  for each row execute procedure update_updated_at_column();

-- ---------------------------------------------------------------
-- Storage buckets + policies (run as-is in the Supabase SQL editor)
-- ---------------------------------------------------------------
-- sermon-audio:   private — clients upload their own recordings; the
--                 transcribe API reads them server-side
-- sermon-media:   PUBLIC — the app serves generated images via
--                 getPublicUrl(), which only works on public buckets
-- sermon-exports: private (reserved for signed-URL exports)

insert into storage.buckets (id, name, public) values
  ('sermon-audio', 'sermon-audio', false),
  ('sermon-media', 'sermon-media', true),
  ('sermon-exports', 'sermon-exports', false)
on conflict (id) do update set public = excluded.public;

-- Users may only touch files inside their own {user_id}/... folder
drop policy if exists "Users can upload own audio" on storage.objects;
create policy "Users can upload own audio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sermon-audio' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can read own audio" on storage.objects;
create policy "Users can read own audio" on storage.objects
  for select to authenticated
  using (bucket_id = 'sermon-audio' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can delete own audio" on storage.objects;
create policy "Users can delete own audio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'sermon-audio' and auth.uid()::text = (storage.foldername(name))[1]);

-- ---------------------------------------------------------------
-- Migration v2 — run these ALTER statements in Supabase SQL editor
-- if you already ran migration.sql
-- ---------------------------------------------------------------

-- Expand sermon_inputs.kind
alter table sermon_inputs
  drop constraint if exists sermon_inputs_kind_check;
alter table sermon_inputs
  add constraint sermon_inputs_kind_check
  check (kind in ('text','dictation','audio','file','bible_ref','document'));

-- Expand sermon_drafts.template_type + add speaker_notes
alter table sermon_drafts
  drop constraint if exists sermon_drafts_template_type_check;
alter table sermon_drafts
  add constraint sermon_drafts_template_type_check
  check (template_type in (
    'prayer','message','story','devotional','teaching',
    'testimony','youth','small_group','storytelling','custom'
  ));
alter table sermon_drafts
  add column if not exists speaker_notes text;

-- v3: content-aware deck plan (layouts + per-slide visual decisions)
alter table sermon_drafts
  add column if not exists slide_plan jsonb;

-- Expand sermon_media.kind
alter table sermon_media
  drop constraint if exists sermon_media_kind_check;
alter table sermon_media
  add constraint sermon_media_kind_check
  check (kind in ('image','map','timeline','scripture_slide','graphic'));

-- ---------------------------------------------------------------
-- v4: columns the app writes that were previously applied via CLI
-- only and never committed to this file (schema-vs-code drift).
-- These ALTERs are idempotent and safe to re-run.
-- ---------------------------------------------------------------

-- The structured sermon model (JSON) the generator persists per draft.
alter table sermon_drafts
  add column if not exists structured jsonb;

-- Generation settings propagated to the sermon for re-runs / display.
alter table sermons
  add column if not exists tone     text;
alter table sermons
  add column if not exists language text default 'English';

-- Prevent the read-then-write version bump in /api/polish from creating
-- duplicate versions under concurrent requests (the route retries on 23505).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sermon_drafts_sermon_version_unique'
  ) then
    alter table sermon_drafts
      add constraint sermon_drafts_sermon_version_unique unique (sermon_id, version);
  end if;
end $$;

-- ---------------------------------------------------------------
-- v5: indexes on every foreign-key / filter / order column.
-- Without these, RLS EXISTS subqueries and dashboard ordering do
-- sequential scans on every query.
-- ---------------------------------------------------------------
create index if not exists sermons_user_updated_idx   on sermons      (user_id, updated_at desc);
create index if not exists sermon_inputs_sermon_idx    on sermon_inputs (sermon_id);
create index if not exists sermon_drafts_sermon_idx     on sermon_drafts (sermon_id, version desc);
create index if not exists sermon_media_sermon_idx      on sermon_media  (sermon_id, order_index);
create index if not exists sermon_exports_sermon_idx    on sermon_exports (sermon_id);
create index if not exists outreach_posts_sermon_idx    on outreach_posts (sermon_id);
create index if not exists outreach_posts_slug_idx      on outreach_posts (share_slug);

-- Idempotency for audio transcription: a retried upload of the same audio file
-- updates rather than inserts a duplicate input. NULLs are distinct in a unique
-- index, so text/dictation inputs (null storage_path) are unaffected.
create unique index if not exists sermon_inputs_sermon_storage_unique
  on sermon_inputs (sermon_id, storage_path);

-- ---------------------------------------------------------------
-- v6: cross-instance rate limiting. The in-memory limiter in
-- lib/api/guards.ts is per-serverless-instance and cannot bound
-- spend under horizontal scaling; this table + atomic RPC give a
-- shared counter. Service-role only (no RLS, never client-exposed).
-- ---------------------------------------------------------------
create table if not exists rate_limits (
  key       text primary key,
  count     integer not null default 0,
  reset_at  timestamptz not null
);

create or replace function check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer as $$
declare
  v_count int;
begin
  insert into rate_limits (key, count, reset_at)
    values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    count    = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
    reset_at = case when rate_limits.reset_at < now()
                    then now() + make_interval(secs => p_window_seconds)
                    else rate_limits.reset_at end
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

-- Opportunistically purge expired buckets so the table stays small.
create or replace function purge_expired_rate_limits()
returns void language sql as $$
  delete from rate_limits where reset_at < now() - interval '1 hour';
$$;
