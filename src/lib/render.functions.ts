import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

    // Restriction checks: locked, read-only, monthly render quota.
    const { data: restriction } = await supabaseAdmin
      .from("user_restrictions")
      .select("locked, read_only, monthly_render_limit")
      .eq("user_id", userId)
      .maybeSingle();
    if (restriction?.locked) {
      return { ok: false as const, error: "Your account is locked. Contact your administrator." };
    }
    if (restriction?.read_only) {
      return { ok: false as const, error: "Your account is read-only. Rendering is disabled." };
    }
    if (typeof restriction?.monthly_render_limit === "number") {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { count } = await supabaseAdmin
        .from("render_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", monthStart.toISOString());
      if ((count ?? 0) >= restriction.monthly_render_limit) {
        return {
          ok: false as const,
          error: `Monthly render limit reached (${restriction.monthly_render_limit}). Try again next month.`,
        };
      }
    }

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

    // Resolve audio path -> signed URL the worker can fetch over the network.
    let audioUrl: string | null = null;
    if (project.audio_url) {
      const { data: signed } = await supabase.storage
        .from("video-audio")
        .createSignedUrl(project.audio_url, 60 * 60);
      audioUrl = signed?.signedUrl ?? null;
    }

    // Pre-create a signed UPLOAD URL the worker can PUT the MP4 to.
    // No Supabase keys ever leave Lovable.
    const jobId = crypto.randomUUID();
    const objectPath = `${userId}/${project.id}/${jobId}.mp4`;
    const { data: upload, error: upErr } = await supabase.storage
      .from("video-exports")
      .createSignedUploadUrl(objectPath);
    if (upErr || !upload) {
      return {
        ok: false as const,
        error: `Could not create upload URL: ${upErr?.message ?? "unknown"}`,
      };
    }

    // Resolve any user-uploaded video sentinels (upload://<storage_path>)
    // into 6h signed URLs the worker can fetch.
    const rawScenes = (project.scenes ?? []) as Array<Record<string, unknown>>;
    const resolvedScenes = await Promise.all(
      rawScenes.map(async (scene) => {
        const v = scene.videoUrl;
        if (typeof v === "string" && v.startsWith("upload://")) {
          const path = v.slice("upload://".length);
          const { data: signed } = await supabase.storage
            .from("video-uploads")
            .createSignedUrl(path, 60 * 60 * 6);
          return { ...scene, videoUrl: signed?.signedUrl ?? "" };
        }
        return scene;
      }),
    );

    const composition = {
      scenes: resolvedScenes,
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
          composition,
          uploadUrl: upload.signedUrl,
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
    let json: { ok?: boolean; sizeBytes?: number };
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false as const, error: "Worker returned invalid JSON" };
    }
    if (!json.ok) {
      return { ok: false as const, error: "Worker did not confirm upload" };
    }

    // Now create a 24h signed DOWNLOAD URL for the freshly uploaded MP4.
    const { data: dl, error: dlErr } = await supabase.storage
      .from("video-exports")
      .createSignedUrl(objectPath, 60 * 60 * 24);
    if (dlErr || !dl) {
      return {
        ok: false as const,
        error: `Render succeeded but could not sign download URL: ${dlErr?.message ?? "unknown"}`,
      };
    }

    // Log the successful render for admin metrics.
    await supabaseAdmin.from("render_logs").insert({
      user_id: userId,
      project_id: project.id,
      status: "success",
      size_bytes: json.sizeBytes ?? null,
    });

    return {
      ok: true as const,
      url: dl.signedUrl,
      path: objectPath,
      sizeBytes: json.sizeBytes,
    };
  });
