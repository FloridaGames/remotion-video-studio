import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  renderMediaOnLambda,
  getRenderProgress,
} from "@remotion/lambda-client";

const StartInput = z.object({ projectId: z.string().uuid() });
const ProgressInput = z.object({
  renderId: z.string(),
  bucketName: z.string(),
});

function lambdaConfig() {
  const region = process.env.REMOTION_AWS_REGION;
  const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
  const serveUrl = process.env.REMOTION_LAMBDA_SERVE_URL;
  const accessKeyId = process.env.REMOTION_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
  const missing = [
    !region && "REMOTION_AWS_REGION",
    !functionName && "REMOTION_LAMBDA_FUNCTION_NAME",
    !serveUrl && "REMOTION_LAMBDA_SERVE_URL",
    !accessKeyId && "REMOTION_AWS_ACCESS_KEY_ID",
    !secretAccessKey && "REMOTION_AWS_SECRET_ACCESS_KEY",
  ].filter(Boolean) as string[];
  if (missing.length) {
    return {
      ok: false as const,
      error: `Remotion Lambda is not configured. Missing secrets: ${missing.join(
        ", ",
      )}. See plan for AWS setup steps.`,
    };
  }
  // @remotion/lambda-client reads AWS creds from process.env.REMOTION_AWS_*
  return {
    ok: true as const,
    region: region as any,
    functionName: functionName!,
    serveUrl: serveUrl!,
  };
}

export const renderVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => StartInput.parse(input))
  .handler(async ({ data, context }) => {
    const cfg = lambdaConfig();
    if (!cfg.ok) return cfg;

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

    try {
      const { renderId, bucketName } = await renderMediaOnLambda({
        region: cfg.region,
        functionName: cfg.functionName,
        serveUrl: cfg.serveUrl,
        composition: "main",
        inputProps: composition,
        codec: "h264",
        imageFormat: "jpeg",
        maxRetries: 1,
        privacy: "public",
        downloadBehavior: {
          type: "download",
          fileName: `${project.title || "video"}.mp4`,
        },
      });
      return { ok: true as const, renderId, bucketName };
    } catch (e) {
      return {
        ok: false as const,
        error: `Could not start Lambda render: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  });

export const getRenderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ProgressInput.parse(input))
  .handler(async ({ data }) => {
    const cfg = lambdaConfig();
    if (!cfg.ok) return cfg;
    try {
      const progress = await getRenderProgress({
        renderId: data.renderId,
        bucketName: data.bucketName,
        functionName: cfg.functionName,
        region: cfg.region,
      });
      return {
        ok: true as const,
        done: progress.done,
        overallProgress: progress.overallProgress,
        outputFile: progress.outputFile ?? null,
        outputSizeInBytes: progress.outputSizeInBytes ?? null,
        errors: progress.errors?.map((e) => e.message) ?? [],
        fatalErrorEncountered: progress.fatalErrorEncountered ?? false,
      };
    } catch (e) {
      return {
        ok: false as const,
        error: `Could not fetch render progress: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  });