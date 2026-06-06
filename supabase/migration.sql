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
-- Storage buckets — create via Supabase Dashboard or these notes
-- ---------------------------------------------------------------
-- Bucket: sermon-audio  (private)
-- Bucket: sermon-media  (private)
-- Bucket: sermon-exports (private, signed URLs)
-- Run in Supabase SQL editor after creating buckets via Dashboard:
--
-- insert into storage.buckets (id, name, public) values
--   ('sermon-audio', 'sermon-audio', false),
--   ('sermon-media', 'sermon-media', false),
--   ('sermon-exports', 'sermon-exports', false)
-- on conflict do nothing;
--
-- Storage RLS policies (add via Dashboard or SQL):
-- Allow authenticated users to upload to their folder (user_id prefix):
-- create policy "Users can upload own audio" on storage.objects
--   for insert to authenticated
--   with check (bucket_id = 'sermon-audio' and auth.uid()::text = (storage.foldername(name))[1]);
--
-- (Repeat pattern for sermon-media and sermon-exports)

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

-- Expand sermon_media.kind
alter table sermon_media
  drop constraint if exists sermon_media_kind_check;
alter table sermon_media
  add constraint sermon_media_kind_check
  check (kind in ('image','map','timeline','scripture_slide','graphic'));
