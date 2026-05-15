
-- Buckets
insert into storage.buckets (id, name, public) values ('video-uploads', 'video-uploads', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values ('video-org-library', 'video-org-library', true)
on conflict (id) do nothing;

-- Per-user uploads table
create table public.video_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  storage_path text not null,
  title text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

alter table public.video_uploads enable row level security;

create policy "video_uploads_select_own" on public.video_uploads
for select to authenticated using (auth.uid() = user_id);

create policy "video_uploads_insert_own" on public.video_uploads
for insert to authenticated with check (auth.uid() = user_id);

create policy "video_uploads_delete_own" on public.video_uploads
for delete to authenticated using (auth.uid() = user_id);

create index idx_video_uploads_user_created on public.video_uploads(user_id, created_at desc);

-- Shared org video library (read-only from app)
create table public.org_videos (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  title text not null,
  thumb_url text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.org_videos enable row level security;

create policy "org_videos_select_all_authenticated" on public.org_videos
for select to authenticated using (true);

-- Storage policies for video-uploads (folder = user id)
create policy "video_uploads_objects_select_own" on storage.objects
for select to authenticated
using (bucket_id = 'video-uploads' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "video_uploads_objects_insert_own" on storage.objects
for insert to authenticated
with check (bucket_id = 'video-uploads' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "video_uploads_objects_delete_own" on storage.objects
for delete to authenticated
using (bucket_id = 'video-uploads' and auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for org library (public read, no client writes)
create policy "video_org_library_objects_public_read" on storage.objects
for select to public
using (bucket_id = 'video-org-library');
