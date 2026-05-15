
-- 1. Admin email allowlist
CREATE TABLE public.admin_emails (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;
-- No policies: only service role / security definer functions can read.

INSERT INTO public.admin_emails (email) VALUES ('m.notermans@tilburguniversity.edu');

-- Helper: is the given user an admin? (security definer to read auth.users + admin_emails)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.admin_emails a ON lower(a.email) = lower(u.email)
    WHERE u.id = _user_id
  );
$$;

-- 2. User sessions
CREATE TABLE public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX idx_user_sessions_user ON public.user_sessions(user_id);
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_sessions_insert_own ON public.user_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_sessions_update_own ON public.user_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_sessions_select_own_or_admin ON public.user_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 3. Render logs
CREATE TABLE public.render_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid,
  status text NOT NULL DEFAULT 'success',
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_render_logs_user_created ON public.render_logs(user_id, created_at DESC);
ALTER TABLE public.render_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY render_logs_select_own_or_admin ON public.render_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
-- Inserts done via service role from render server fn; no insert policy for users.

-- 4. User restrictions
CREATE TABLE public.user_restrictions (
  user_id uuid PRIMARY KEY,
  locked boolean NOT NULL DEFAULT false,
  read_only boolean NOT NULL DEFAULT false,
  uploads_disabled boolean NOT NULL DEFAULT false,
  monthly_render_limit integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_restrictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_restrictions_select_own_or_admin ON public.user_restrictions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
-- Writes via admin server fn using service role.

CREATE TRIGGER set_user_restrictions_updated_at
  BEFORE UPDATE ON public.user_restrictions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helpers for restriction checks
CREATE OR REPLACE FUNCTION public.is_user_locked(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT locked FROM public.user_restrictions WHERE user_id = _user_id), false);
$$;

CREATE OR REPLACE FUNCTION public.is_user_read_only(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT read_only FROM public.user_restrictions WHERE user_id = _user_id), false);
$$;

CREATE OR REPLACE FUNCTION public.are_uploads_disabled(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT uploads_disabled FROM public.user_restrictions WHERE user_id = _user_id), false);
$$;

-- 5. Enforce read-only + locked on projects via RLS
DROP POLICY IF EXISTS projects_insert_own ON public.projects;
DROP POLICY IF EXISTS projects_update_own ON public.projects;
DROP POLICY IF EXISTS projects_delete_own ON public.projects;

CREATE POLICY projects_insert_own ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT public.is_user_read_only(auth.uid())
    AND NOT public.is_user_locked(auth.uid())
  );
CREATE POLICY projects_update_own ON public.projects
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND NOT public.is_user_read_only(auth.uid())
    AND NOT public.is_user_locked(auth.uid())
  );
CREATE POLICY projects_delete_own ON public.projects
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND NOT public.is_user_locked(auth.uid())
  );

-- Same for video_uploads
DROP POLICY IF EXISTS video_uploads_insert_own ON public.video_uploads;
CREATE POLICY video_uploads_insert_own ON public.video_uploads
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT public.are_uploads_disabled(auth.uid())
    AND NOT public.is_user_locked(auth.uid())
  );

-- 6. Admin write access on org_videos
CREATE POLICY org_videos_admin_insert ON public.org_videos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY org_videos_admin_update ON public.org_videos
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY org_videos_admin_delete ON public.org_videos
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- 7. Storage policies: admin upload/delete in video-org-library
CREATE POLICY "video-org-library admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'video-org-library' AND public.is_admin(auth.uid()));
CREATE POLICY "video-org-library admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'video-org-library' AND public.is_admin(auth.uid()));
CREATE POLICY "video-org-library admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'video-org-library' AND public.is_admin(auth.uid()));
