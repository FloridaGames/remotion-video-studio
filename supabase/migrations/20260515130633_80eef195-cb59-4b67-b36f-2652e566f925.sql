
-- Private bucket for raw uploaded source files awaiting transcode
INSERT INTO storage.buckets (id, name, public)
VALUES ('video-transcode-source', 'video-transcode-source', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — same pattern as video-uploads (path prefix = user id)
CREATE POLICY "transcode_source_select_own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'video-transcode-source'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "transcode_source_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'video-transcode-source'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND NOT public.are_uploads_disabled(auth.uid())
  AND NOT public.is_user_locked(auth.uid())
);

CREATE POLICY "transcode_source_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'video-transcode-source'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Job queue table
CREATE TABLE public.video_transcode_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_path text NOT NULL,
  source_filename text NOT NULL,
  source_size_bytes bigint,
  source_mime_type text,
  status text NOT NULL DEFAULT 'uploading',
  error text,
  output_path text,
  output_upload_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT video_transcode_jobs_status_check
    CHECK (status IN ('uploading', 'pending', 'processing', 'done', 'failed'))
);

CREATE INDEX video_transcode_jobs_user_status_idx
  ON public.video_transcode_jobs (user_id, status, created_at DESC);

ALTER TABLE public.video_transcode_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transcode_jobs_select_own"
ON public.video_transcode_jobs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "transcode_jobs_insert_own"
ON public.video_transcode_jobs FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND NOT public.are_uploads_disabled(auth.uid())
  AND NOT public.is_user_locked(auth.uid())
);

CREATE POLICY "transcode_jobs_update_own"
ON public.video_transcode_jobs FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "transcode_jobs_delete_own"
ON public.video_transcode_jobs FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER trg_video_transcode_jobs_updated_at
BEFORE UPDATE ON public.video_transcode_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
