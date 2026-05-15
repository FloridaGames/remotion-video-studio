import express from "express";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

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

// Transcode arbitrary video formats (MTS, MOV, AVI, MKV, ...) to a
// browser/Remotion-friendly H.264 .mp4. The worker downloads the source,
// runs ffmpeg, then PUTs the result to the supplied signed upload URL.
app.post("/transcode", async (req, res) => {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { sourceUrl, uploadUrl } = req.body || {};
  if (!sourceUrl || !uploadUrl) {
    return res.status(400).json({ error: "Missing sourceUrl or uploadUrl" });
  }

  const jobId = crypto.randomUUID();
  const srcTmp = path.join(os.tmpdir(), `${jobId}.src`);
  const dstTmp = path.join(os.tmpdir(), `${jobId}.mp4`);
  console.log(`[transcode ${jobId}] start`);

  try {
    // Download the source file
    const srcResp = await fetch(sourceUrl);
    if (!srcResp.ok) {
      throw new Error(`Source download failed ${srcResp.status}`);
    }
    const srcBuf = Buffer.from(await srcResp.arrayBuffer());
    await fs.writeFile(srcTmp, srcBuf);
    console.log(`[transcode ${jobId}] downloaded ${srcBuf.length} bytes`);

    // Run ffmpeg. -movflags +faststart so the file streams from byte 0.
    await new Promise((resolve, reject) => {
      const ff = spawn(
        "ffmpeg",
        [
          "-y",
          "-i", srcTmp,
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-crf", "22",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac",
          "-b:a", "160k",
          "-movflags", "+faststart",
          dstTmp,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let stderr = "";
      ff.stderr.on("data", (d) => {
        stderr += d.toString();
        if (stderr.length > 8000) stderr = stderr.slice(-8000);
      });
      ff.on("error", reject);
      ff.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-600)}`));
      });
    });

    const outBuf = await fs.readFile(dstTmp);
    const putResp = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4" },
      body: outBuf,
    });
    if (!putResp.ok) {
      const txt = await putResp.text();
      throw new Error(`Upload failed ${putResp.status}: ${txt.slice(0, 300)}`);
    }

    console.log(`[transcode ${jobId}] done sizeBytes=${outBuf.length}`);
    res.json({ ok: true, sizeBytes: outBuf.length });
  } catch (err) {
    console.error(`[transcode ${jobId}] error`, err);
    res.status(500).json({ error: err?.message || "Transcode failed" });
  } finally {
    fs.unlink(srcTmp).catch(() => {});
    fs.unlink(dstTmp).catch(() => {});
  }
});

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
