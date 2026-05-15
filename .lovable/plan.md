## Goal

Let users pick videos from four sources in the editor instead of just Pexels:
1. **My uploads** — personal videos uploaded once, reusable across projects
2. **Paste URL** — any public video URL (own CDN, Vimeo direct .mp4, etc.)
3. **Tilburg University library** — shared org assets visible to all users
4. Existing: Curated library + Pexels search

No hard file-size limit; rely on Lovable Cloud storage quota. MP4/WebM/MOV accepted.

## What gets built

### 1. Storage (one migration)
- New private bucket `video-uploads` — per-user uploads (path `<userId>/<uuid>.<ext>`)
- New public bucket `video-org-library` — admin-curated shared clips
- New table `video_uploads` (id, user_id, storage_path, title, mime_type, size_bytes, duration_seconds nullable, created_at) with RLS: users see/insert/delete only their own rows
- New table `org_videos` (id, storage_path, title, thumb_url nullable, tags text[], created_at) — readable by all authenticated users, no insert/update/delete policies (seeded by you via SQL or admin-only later)
- RLS on `storage.objects` for both buckets following the standard `<userId>/...` pattern for `video-uploads`, public read for `video-org-library`

### 2. Server functions (`src/lib/video-library.functions.ts`)
- `listMyUploads()` — returns user's uploads
- `deleteMyUpload({ id })` — removes row + storage object
- `listOrgVideos()` — returns all org library entries with public URLs
- `validateExternalUrl({ url })` — HEAD-checks the URL, verifies `content-type` is video/*, returns `{ ok, contentType }`

### 3. Stock video picker UI (`src/components/StockVideoPicker.tsx`)
Replace 2-tab bar with 4 tabs: **My uploads · Paste URL · Org library · Curated · Pexels**.
- **My uploads tab**: file input ("Upload video"), grid of user's uploads with thumbnail (first-frame `<video>` poster fallback), delete button per item. On pick, store as `upload://<storage_path>`.
- **Paste URL tab**: input + "Use this URL" button → calls `validateExternalUrl`, on success stores the URL directly.
- **Org library tab**: read-only grid of `org_videos` entries, public URLs.
- **Curated / Pexels**: unchanged.

### 4. Render-time URL resolution (`src/lib/render.functions.ts`)
Before sending the composition to the Hetzner worker, walk all scenes with a `videoUrl`:
- If URL starts with `upload://<path>` → create a 6-hour signed URL from `video-uploads` bucket using `supabaseAdmin` and substitute it.
- Otherwise pass through unchanged.
This keeps stored project data stable (signed URLs expire) while giving the worker a fetchable URL at render time.

### 5. Editor preview (`editor.$projectId.tsx`)
The `<VideoField>` already renders whatever URL is in the scene. For `upload://...` values, resolve to a signed URL via `useSignedUrl` so the preview plays in the browser. Small wrapper hook `useResolvedVideoUrl(value)` handles both cases.

## Out of scope
- Admin UI for managing the org library (seed via SQL for now; you said you'd manage via Lovable Cloud directly)
- Auto-generated thumbnails for uploads (use `<video preload="metadata">` and seek to 0s as poster — good enough)
- Video transcoding / format conversion
- Per-upload usage tracking

## Open question to confirm before building
The editor currently autosaves scene `videoUrl` as a string. Storing `upload://<path>` is a sentinel my render layer rewrites. Confirm OK — the alternative is widening the Scene type to `{ kind: 'url' | 'upload', value: string }`, which is cleaner but touches every video scene type and the Remotion components. Sentinel string is ~10× less code; recommended unless you want the cleaner shape.
