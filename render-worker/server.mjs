import express from "express";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 8080;
const TOKEN = process.env.RENDER_WORKER_TOKEN;

if (!TOKEN) {
  console.error("Missing required env: RENDER_WORKER_TOKEN");
  process.exit(1);
}

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

  const { projectId, composition, uploadUrl } = req.body || {};
  if (!projectId || !composition?.scenes?.length || !uploadUrl) {
    return res
      .status(400)
      .json({ error: "Missing projectId, composition.scenes, or uploadUrl" });
  }

  const jobId = crypto.randomUUID();
  const tmp = path.join(os.tmpdir(), `${jobId}.mp4`);
  console.log(
    `[${jobId}] render start project=${projectId} scenes=${composition.scenes.length}`,
  );

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

    // PUT the MP4 directly to the pre-signed Lovable Cloud upload URL.
    // The worker holds NO Supabase credentials.
    const putResp = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4" },
      body: buf,
    });
    if (!putResp.ok) {
      const txt = await putResp.text();
      throw new Error(`Upload failed ${putResp.status}: ${txt.slice(0, 300)}`);
    }

    console.log(`[${jobId}] done sizeBytes=${buf.length}`);
    res.json({ ok: true, sizeBytes: buf.length });
  } catch (err) {
    console.error(`[${jobId}] error`, err);
    res.status(500).json({ error: err?.message || "Render failed" });
  } finally {
    fs.unlink(tmp).catch(() => {});
  }
});

app.listen(PORT, () => console.log(`render-worker listening on :${PORT}`));
