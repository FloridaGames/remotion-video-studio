GRANT EXECUTE ON FUNCTION public.is_user_locked(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_user_read_only(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.are_uploads_disabled(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, anon;