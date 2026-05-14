# TU Explainer — Render Worker (Hetzner + Coolify)

A small Node service that renders the same Remotion compositions used by the
Lovable app, then PUTs the MP4 to a one-time signed upload URL provided by
Lovable Cloud.

**No Supabase credentials live on this server.** The worker only needs a
shared bearer token so Lovable can authenticate to it.

## What it does

- `POST /render` accepts `{ projectId, composition, uploadUrl }`
- Renders the composition with `@remotion/renderer`
- `PUT`s the resulting MP4 to `uploadUrl`
- Returns `{ ok: true, sizeBytes }`

Lovable then creates a 24h signed download URL and shows it to the user.

## Deploy with Coolify

1. In Coolify, create a new resource → **Application** → **Public Repository**
   (or your private GitHub repo).
2. **Build Pack:** Dockerfile.
3. **Base Directory:** `/` (repo root). The Dockerfile must be able to copy
   `src/remotion/` from the repo root.
4. **Dockerfile Location:** `render-worker/Dockerfile`.
5. **Port:** `8080`.
6. **Environment Variables** — add ONE secret:
   - `RENDER_WORKER_TOKEN` = a long random string. Generate with
     `openssl rand -hex 32` on your laptop, or let Coolify generate one.
7. **Domain:** assign a subdomain like `render.your-domain.com`. Coolify
   provisions HTTPS via Let's Encrypt automatically.
8. Deploy. Health check:
   ```bash
   curl https://render.your-domain.com/health
   # → {"ok":true}
   ```

## Add the two secrets to Lovable

In Lovable → Cloud → Secrets, add:

- `RENDER_WORKER_URL` = `https://render.your-domain.com`
- `RENDER_WORKER_TOKEN` = the same value you set in Coolify

That's it. No Supabase service-role key, no AWS account.

## Updating compositions

Whenever you change scene templates in `src/remotion/`, push to the
connected branch — Coolify rebuilds and redeploys automatically.

## Sizing notes

- 1080p30 ~30s clips render in ~30–90s on a CPX31 (4 vCPU / 8 GB).
- Worker renders one job at a time (concurrency=1) to keep memory bounded.
