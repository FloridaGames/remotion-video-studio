# TU Explainer — Render Worker (Hetzner)

A small Node service that renders the same Remotion compositions used by the
app and uploads the resulting MP4 to Lovable Cloud storage. Deploy this to a
Hetzner Cloud server (CPX31 or larger recommended).

## What it does

- `POST /render` — accepts a project composition, renders it with
  `@remotion/renderer`, uploads the MP4 to the `video-exports` bucket, and
  returns a 24h signed URL.
- Bundles the Remotion code once at boot, so subsequent renders are fast.
- Authenticated with a shared bearer token (`RENDER_WORKER_TOKEN`).

## Deploy on Hetzner (Docker)

1. Create a Hetzner Cloud server. Recommended: **CPX31** (4 vCPU, 8 GB) for
   1080p30 renders. Use Ubuntu 24.04.
2. Install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
3. Clone this repo on the server (or upload it via scp / rsync):
   ```bash
   git clone <your-repo> tu-explainer && cd tu-explainer
   ```
4. Build the image. **Build context must be the repo root** so the worker
   can include `src/remotion/`:
   ```bash
   docker build -f render-worker/Dockerfile -t tu-render-worker .
   ```
5. Generate a strong shared token (paste this same value into Lovable secrets
   as `RENDER_WORKER_TOKEN`):
   ```bash
   openssl rand -hex 32
   ```
6. Run the container:
   ```bash
   docker run -d --restart=always --name render-worker \
     -p 8080:8080 \
     -e RENDER_WORKER_TOKEN='paste-token-here' \
     -e SUPABASE_URL='https://upbxnclkelhljiddnots.supabase.co' \
     -e SUPABASE_SERVICE_ROLE_KEY='paste-service-role-key-here' \
     tu-render-worker
   ```
   Get the service-role key from Lovable Cloud → Backend → API.
7. Put it behind HTTPS. Easiest: install Caddy and point a subdomain
   (e.g. `render.your-domain.com`) at port 8080:
   ```bash
   apt install -y caddy
   echo 'render.your-domain.com {
     reverse_proxy localhost:8080
   }' > /etc/caddy/Caddyfile
   systemctl reload caddy
   ```
   Caddy auto-provisions Let's Encrypt certificates.
8. Health check:
   ```bash
   curl https://render.your-domain.com/health
   # → {"ok":true}
   ```

## Add the two secrets to Lovable

- `RENDER_WORKER_URL` — `https://render.your-domain.com`
- `RENDER_WORKER_TOKEN` — the same value as on the server

## Updating compositions

Whenever you change scene templates in `src/remotion/`, rebuild and restart
the worker on the Hetzner box:

```bash
cd tu-explainer && git pull
docker build -f render-worker/Dockerfile -t tu-render-worker .
docker stop render-worker && docker rm render-worker
# then re-run the `docker run` command from step 6
```

## Sizing notes

- 1080p30 ~30s clips render in ~30–90s on CPX31.
- Worker renders one job at a time (concurrency=1) to keep memory bounded.
  For parallel renders, run multiple containers behind a load balancer or
  scale up to CCX-class CPU servers.