import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TranscodeJob = {
  id: string;
  sourceFilename: string;
  sourceSizeBytes: number | null;
  status: "uploading" | "pending" | "processing" | "done" | "failed";
  error: string | null;
  outputUploadId: string | null;
  createdAt: string;
};

// Source formats accepted for transcoding (everything ffmpeg handles + common camera formats).
const TRANSCODE_EXTENSIONS = [
  ".mts",
  ".m2ts",
  ".mov",
  ".avi",
  ".mkv",
  ".wmv",
  ".flv",
  ".webm",
  ".3gp",
  ".mpg",
  ".mpeg",
  ".m4v",
  ".ts",
];

export function isTranscodeSourceExt(filename: string): boolean {
  const lower = filename.toLowerCase();
  return TRANSCODE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

const CreateInput = z.object({
  filename: z.string().min(1).max(255),
  sizeBytes: z.number().int().nonnegative().max(5 * 1024 * 1024 * 1024), // 5 GB hard cap
  mimeType: z.string().max(120).optional(),
});

// Step 1: client asks for a signed upload URL + a pending job row.
export const createTranscodeUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!isTranscodeSourceExt(data.filename)) {
      throw new Error(
        "This file type is not supported for transcoding. Allowed: " +
          TRANSCODE_EXTENSIONS.join(", "),
      );
    }
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectId = crypto.randomUUID();
    const sourcePath = `${userId}/${objectId}-${safeName}`;

    const { data: signed, error: upErr } = await supabase.storage
      .from("video-transcode-source")
      .createSignedUploadUrl(sourcePath);
    if (upErr || !signed) {
      throw new Error(`Could not create upload URL: ${upErr?.message ?? "unknown"}`);
    }

    const { data: row, error: insErr } = await supabase
      .from("video_transcode_jobs")
      .insert({
        user_id: userId,
        source_path: sourcePath,
        source_filename: data.filename,
        source_size_bytes: data.sizeBytes,
        source_mime_type: data.mimeType ?? null,
        status: "uploading",
      })
      .select("id")
      .single();
    if (insErr || !row) {
      throw new Error(`Could not create job: ${insErr?.message ?? "unknown"}`);
    }

    return {
      jobId: row.id,
      uploadUrl: signed.signedUrl,
      sourcePath,
    };
  });

// Step 2: client confirms upload finished -> flip job to 'pending'.
const ConfirmInput = z.object({ jobId: z.string().uuid() });

export const confirmTranscodeUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConfirmInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("video_transcode_jobs")
      .update({ status: "pending" })
      .eq("id", data.jobId)
      .eq("status", "uploading");
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// List all jobs for the current user.
export const listMyTranscodeJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: TranscodeJob[] }> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("video_transcode_jobs")
      .select(
        "id, source_filename, source_size_bytes, status, error, output_upload_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return {
      items: (data ?? []).map((r) => ({
        id: r.id,
        sourceFilename: r.source_filename,
        sourceSizeBytes: r.source_size_bytes,
        status: r.status as TranscodeJob["status"],
        error: r.error,
        outputUploadId: r.output_upload_id,
        createdAt: r.created_at,
      })),
    };
  });

const DeleteInput = z.object({ jobId: z.string().uuid() });

export const deleteTranscodeJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("video_transcode_jobs")
      .select("source_path, status")
      .eq("id", data.jobId)
      .single();
    if (!row) return { ok: true as const };
    if (row.status === "processing") {
      throw new Error("Cannot delete a job that is currently processing.");
    }
    await supabase.storage.from("video-transcode-source").remove([row.source_path]);
    const { error } = await supabase
      .from("video_transcode_jobs")
      .delete()
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// Process the next pending job for the current user.
// Returns immediately whether a job was processed. The client calls this
// repeatedly until { processed: false } to drain the queue.
export const processNextTranscodeJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workerUrl = process.env.RENDER_WORKER_URL;
    const workerToken = process.env.RENDER_WORKER_TOKEN;
    if (!workerUrl || !workerToken) {
      return {
        processed: false as const,
        error:
          "Render worker is not configured. Add RENDER_WORKER_URL and RENDER_WORKER_TOKEN secrets.",
      };
    }

    const { supabase, userId } = context;

    // Pick the oldest pending job for this user.
    const { data: job, error: pickErr } = await supabase
      .from("video_transcode_jobs")
      .select("id, source_path, source_filename")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pickErr) return { processed: false as const, error: pickErr.message };
    if (!job) return { processed: false as const };

    // Flip to processing.
    await supabase
      .from("video_transcode_jobs")
      .update({ status: "processing", started_at: new Date().toISOString(), error: null })
      .eq("id", job.id);

    try {
      // Sign a download URL the worker can fetch.
      const { data: srcSigned, error: srcErr } = await supabase.storage
        .from("video-transcode-source")
        .createSignedUrl(job.source_path, 60 * 60);
      if (srcErr || !srcSigned) throw new Error(srcErr?.message ?? "no signed source url");

      // Pre-create a signed upload URL in video-uploads for the worker to PUT the .mp4 into.
      const outputPath = `${userId}/${crypto.randomUUID()}.mp4`;
      const { data: dstSigned, error: dstErr } = await supabase.storage
        .from("video-uploads")
        .createSignedUploadUrl(outputPath);
      if (dstErr || !dstSigned) throw new Error(dstErr?.message ?? "no signed upload url");

      const resp = await fetch(`${workerUrl.replace(/\/$/, "")}/transcode`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${workerToken}`,
        },
        body: JSON.stringify({
          sourceUrl: srcSigned.signedUrl,
          uploadUrl: dstSigned.signedUrl,
        }),
      });
      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(`Worker error ${resp.status}: ${text.slice(0, 400)}`);
      }
      let json: { ok?: boolean; sizeBytes?: number };
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("Worker returned invalid JSON");
      }
      if (!json.ok) throw new Error("Worker did not confirm upload");

      // Insert into video_uploads so it shows up in the regular library.
      const cleanTitle =
        job.source_filename.replace(/\.[^.]+$/, "") + " (converted).mp4";
      const { data: uploadRow, error: regErr } = await supabase
        .from("video_uploads")
        .insert({
          user_id: userId,
          storage_path: outputPath,
          title: cleanTitle,
          mime_type: "video/mp4",
          size_bytes: json.sizeBytes ?? null,
        })
        .select("id")
        .single();
      if (regErr || !uploadRow) throw new Error(regErr?.message ?? "register failed");

      // Mark done. Remove the source file to save space.
      await supabase.storage
        .from("video-transcode-source")
        .remove([job.source_path]);
      await supabase
        .from("video_transcode_jobs")
        .update({
          status: "done",
          output_path: outputPath,
          output_upload_id: uploadRow.id,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      return { processed: true as const, jobId: job.id, uploadId: uploadRow.id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("video_transcode_jobs")
        .update({
          status: "failed",
          error: msg.slice(0, 500),
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return { processed: true as const, jobId: job.id, error: msg };
    }
  });
