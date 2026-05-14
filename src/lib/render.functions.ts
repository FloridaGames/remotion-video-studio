import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ projectId: z.string().uuid() });

export const renderVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const workerUrl = process.env.RENDER_WORKER_URL;
    const workerToken = process.env.RENDER_WORKER_TOKEN;
    if (!workerUrl || !workerToken) {
      return {
        ok: false as const,
        error:
          "Render worker is not configured. Add RENDER_WORKER_URL and RENDER_WORKER_TOKEN secrets, then deploy the render-worker container on Hetzner via Coolify (see render-worker/README.md).",
      };
    }

    const { supabase, userId } = context;

    const { data: project, error } = await supabase
      .from("projects")
      .select("id, user_id, title, scenes, audio_url, fps, width, height")
      .eq("id", data.projectId)
      .single();
    if (error || !project) {
      return { ok: false as const, error: "Project not found" };
    }
    if (project.user_id !== userId) {
      return { ok: false as const, error: "Not your project" };
    }

    // Resolve audio path → signed URL the worker can fetch over the network.
    let audioUrl: string | null = null;
    if (project.audio_url) {
      const { data: signed } = await supabase.storage
        .from("video-audio")
        .createSignedUrl(project.audio_url, 60 * 60);
      audioUrl = signed?.signedUrl ?? null;
    }

    const composition = {
      scenes: project.scenes ?? [],
      audioUrl,
      fps: project.fps ?? 30,
      width: project.width ?? 1920,
      height: project.height ?? 1080,
    };

    let resp: Response;
    try {
      resp = await fetch(`${workerUrl.replace(/\/$/, "")}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${workerToken}`,
        },
        body: JSON.stringify({
          projectId: project.id,
          userId,
          composition,
        }),
      });
    } catch (e) {
      return {
        ok: false as const,
        error: `Could not reach render worker: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const text = await resp.text();
    if (!resp.ok) {
      return { ok: false as const, error: `Worker error ${resp.status}: ${text.slice(0, 500)}` };
    }
    let json: { url?: string; path?: string; sizeBytes?: number };
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false as const, error: "Worker returned invalid JSON" };
    }
    if (!json.url) {
      return { ok: false as const, error: "Worker did not return a download URL" };
    }
    return { ok: true as const, url: json.url, path: json.path, sizeBytes: json.sizeBytes };
  });