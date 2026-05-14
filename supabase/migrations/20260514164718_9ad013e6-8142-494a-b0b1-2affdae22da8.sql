
-- Owner-scoped access to video-exports (folder = auth.uid())
CREATE POLICY "video-exports owner can insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'video-exports'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "video-exports owner can read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'video-exports'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "video-exports owner can update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'video-exports'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
