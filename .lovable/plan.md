## What you'll get

A web app where TU staff/students sign in, build short explainer videos by editing scene-based templates, preview them live in the browser, and export real MP4 files.

## Pages

- `/` — landing: explain the tool, "Sign in to start" CTA, TU brand
- `/login` — email/password + Google sign-in (Lovable Cloud auth)
- `/projects` — dashboard of saved videos (list, new, duplicate, delete)
- `/editor/$projectId` — the composer (the heart of the app)
- `/export/$projectId` — kicks off Lambda render, polls progress, downloads MP4

## Editor layout

Three columns:
1. **Scene list** (left) — reorder, add/remove scenes; pick from 4 templates: Title card, Talking point, Image + caption, Outro
2. **Live preview** (center) — `@remotion/player`, scrub timeline, play/pause
3. **Inspector** (right) — for selected scene: text fields, image upload, duration slider, accent color toggle (Marine / Brons / Mos / Ocean)

Top bar: project title (editable), audio track upload (one track for the whole video, auto-fits duration), Save (autosaves), Export.

## Templates (Remotion compositions)

Each template is a small Remotion component with typed props, animated with `interpolate` / `spring`:
- **Title** — big Marine title + subtitle, Brons underline reveal
- **Talking point** — bullet list with staggered entrance
- **Image + caption** — uploaded image with Ken Burns pan, caption block
- **Outro** — TU wordmark area + closing message

All scenes share TU brand tokens (Marine #003366, Brons #cc9933, Arial), driven by oklch tokens in `src/styles.css`.

## Data

Lovable Cloud (Supabase) provides:
- **auth** — email/password + Google
- **`profiles`** table — id (= auth user), display_name, created_at
- **`projects`** table — id, user_id, title, scenes (JSONB array), audio_url, fps, width, height, updated_at; RLS: owner-only
- **storage buckets** — `video-images` (public read), `video-audio` (public read), each with owner-write RLS

## Export pipeline (the part that needs your setup)

Cloudflare Workers can't render video, so we use **Remotion Lambda**. The TanStack server function calls `@remotion/lambda-client.renderMediaOnLambda()`, which triggers your AWS Lambda to render and writes the MP4 to S3. The UI polls progress and shows the download URL when done.

**You'll need to do this once in your AWS account** (I'll guide you with exact commands when we get there):
1. Create AWS account, IAM user with Remotion's required policies
2. From your local machine: `npx remotion lambda functions deploy`
3. From your local machine: `npx remotion lambda sites create src/remotion/index.ts` (using the same Remotion code we ship in this app)
4. Give me 5 secrets via the secrets tool: `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY`, `REMOTION_AWS_REGION`, `REMOTION_LAMBDA_FUNCTION_NAME`, `REMOTION_LAMBDA_SERVE_URL`

Until those secrets exist, the Export button shows a setup-instructions screen instead of failing silently.

## Build order

1. Enable Lovable Cloud, set up auth (email + Google), profiles trigger, projects table, storage buckets, RLS
2. Set TU design tokens in `src/styles.css` (oklch Marine/Brons/Mos/Ocean + Arial)
3. Build Remotion compositions under `src/remotion/` (templates + Root + composition registration)
4. Build `/login`, `/projects`, `/editor/$projectId` with `@remotion/player` preview
5. Wire image upload → Storage; audio upload → Storage; autosave to `projects` table
6. Build server function for Lambda render + status polling; build `/export/$projectId` UI
7. Landing page + sitemap/robots

## Out of scope for v1 (call out so we agree)

- No collaborative editing (one user per project)
- No animated transitions between scenes (just hard cuts; can add later)
- No per-scene audio clips (one global audio track)
- No subtitle/caption auto-generation
- No template designer (the 4 templates are hardcoded; you can ask me to add more)

## Technical notes

- TanStack Start (existing template), Tailwind, Lovable Cloud (Supabase under the hood)
- `remotion`, `@remotion/player`, `@remotion/lambda-client` as new deps
- Server function uses `@remotion/lambda-client` over HTTP — should run in the Cloudflare Worker runtime; if it hits a Node-only API at build I'll fall back to a thin AWS SDK v3 Lambda invoke
- Editor state: single Zustand-ish reducer over the project's `scenes` JSONB; persisted to the `projects` row with debounced autosave

Approve and I'll start at step 1.