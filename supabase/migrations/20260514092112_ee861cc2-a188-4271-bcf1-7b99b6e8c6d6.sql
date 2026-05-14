-- 1. Set search_path on helper functions (handle_new_user already set; fix set_updated_at)
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. Revoke execute on SECURITY DEFINER / helper functions from API roles
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.set_updated_at() from anon, authenticated, public;

-- 3. Restrict storage SELECT to authenticated users only (prevents anonymous listing)
drop policy if exists "video_images_public_read" on storage.objects;
drop policy if exists "video_audio_public_read" on storage.objects;

create policy "video_images_authed_read" on storage.objects for select to authenticated
  using (bucket_id = 'video-images');
create policy "video_audio_authed_read" on storage.objects for select to authenticated
  using (bucket_id = 'video-audio');

-- Also flip buckets to non-public (signed URLs / authenticated reads only)
update storage.buckets set public = false where id in ('video-images', 'video-audio');