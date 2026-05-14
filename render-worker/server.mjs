import express from "express";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 8080;
const TOKEN = process.env.RENDER_WORKER_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.EXPORT_BUCKET || "video-exports";

if (!TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required env: RENDER_WORKER_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Bundle once at boot so renders are fast
console.log("Bundling Remotion composition...");
const serveUrl = await bundle({
  entryPoint: path.resolve(__dirname, "src/index.ts"),
  webpackOverride: (c) => c,
});
console.log("Bundle ready:", serveUrl);

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/render", async (req, res) => {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { projectId, userId, composition } = req.body || {};
  if (!projectId || !userId || !composition?.scenes?.length) {
    return res.status(400).json({ error: "Missing projectId, userId, or composition.scenes" });
  }

  const jobId = crypto.randomUUID();
  const tmp = path.join(os.tmpdir(), `${jobId}.mp4`);
  console.log(`[${jobId}] render start project=${projectId} scenes=${composition.scenes.length}`);

  try {
    const comp = await selectComposition({
      serveUrl,
      id: "main",
      inputProps: composition,
    });

    await renderMedia({
      composition: comp,
      serveUrl,
      codec: "h264",
      outputLocation: tmp,
      inputProps: composition,
      concurrency: 1,
      chromiumOptions: { gl: "swiftshader" },
    });

    const buf = await fs.readFile(tmp);
    const objectPath = `${userId}/${projectId}/${jobId}.mp4`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, buf, { contentType: "video/mp4", upsert: true });
    if (upErr) throw upErr;

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, 60 * 60 * 24);
    if (signErr) throw signErr;

    console.log(`[${jobId}] done -> ${objectPath}`);
    res.json({ ok: true, path: objectPath, url: signed.signedUrl, sizeBytes: buf.length });
  } catch (err) {
    console.error(`[${jobId}] error`, err);
    res.status(500).json({ error: err?.message || "Render failed" });
  } finally {
    fs.unlink(tmp).catch(() => {});
  }
});

app.listen(PORT, () => console.log(`render-worker listening on :${PORT}`));