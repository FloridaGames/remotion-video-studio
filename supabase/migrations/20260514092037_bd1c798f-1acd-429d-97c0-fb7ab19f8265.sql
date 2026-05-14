-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id);

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled video',
  scenes jsonb not null default '[]'::jsonb,
  audio_url text,
  fps integer not null default 30,
  width integer not null default 1920,
  height integer not null default 1080,
  duration_frames integer not null default 150,
  last_render_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_user_id_idx on public.projects(user_id);
alter table public.projects enable row level security;

create policy "projects_select_own" on public.projects for select to authenticated using (auth.uid() = user_id);
create policy "projects_insert_own" on public.projects for insert to authenticated with check (auth.uid() = user_id);
create policy "projects_update_own" on public.projects for update to authenticated using (auth.uid() = user_id);
create policy "projects_delete_own" on public.projects for delete to authenticated using (auth.uid() = user_id);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- storage buckets (public read so player can load assets)
insert into storage.buckets (id, name, public) values ('video-images', 'video-images', true);
insert into storage.buckets (id, name, public) values ('video-audio', 'video-audio', true);

-- storage RLS: owner-only writes, public reads
create policy "video_images_public_read" on storage.objects for select using (bucket_id = 'video-images');
create policy "video_images_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'video-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "video_images_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'video-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "video_images_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'video-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "video_audio_public_read" on storage.objects for select using (bucket_id = 'video-audio');
create policy "video_audio_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'video-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "video_audio_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'video-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "video_audio_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'video-audio' and (storage.foldername(name))[1] = auth.uid()::text);