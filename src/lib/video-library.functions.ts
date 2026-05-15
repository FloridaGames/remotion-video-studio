import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MyUpload = {
  id: string;
  title: string;
  storagePath: string;
  signedUrl: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

export type OrgVideo = {
  id: string;
  title: string;
  url: string;
  thumb: string | null;
  tags: string[];
};

export const listMyUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: MyUpload[] }> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("video_uploads")
      .select("id, title, storage_path, mime_type, size_bytes, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const items: MyUpload[] = [];
    for (const row of data ?? []) {
      const { data: signed } = await supabase.storage
        .from("video-uploads")
        .createSignedUrl(row.storage_path, 60 * 60);
      items.push({
        id: row.id,
        title: row.title,
        storagePath: row.storage_path,
        signedUrl: signed?.signedUrl ?? "",
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at,
      });
    }
    return { items };
  });

const RegisterInput = z.object({
  storagePath: z.string().min(1).max(500),
  title: z.string().min(1).max(200),
  mimeType: z.string().max(120).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});

export const registerMyUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RegisterInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // The storage policy already restricts paths to <userId>/..., but
    // double-check before inserting the row.
    const firstSegment = data.storagePath.split("/")[0];
    if (firstSegment !== userId) {
      throw new Error("Upload path does not belong to the current user");
    }
    const { data: row, error } = await supabase
      .from("video_uploads")
      .insert({
        user_id: userId,
        storage_path: data.storagePath,
        title: data.title,
        mime_type: data.mimeType ?? null,
        size_bytes: data.sizeBytes ?? null,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Insert failed");
    return { id: row.id };
  });

const DeleteInput = z.object({ id: z.string().uuid() });

export const deleteMyUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("video_uploads")
      .select("storage_path")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error("Upload not found");

    await supabase.storage.from("video-uploads").remove([row.storage_path]);
    const { error: delErr } = await supabase.from("video_uploads").delete().eq("id", data.id);
    if (delErr) throw new Error(delErr.message);
    return { ok: true as const };
  });

export const listOrgVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: OrgVideo[] }> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("org_videos")
      .select("id, title, storage_path, thumb_url, tags")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const items: OrgVideo[] = (data ?? []).map((row) => {
      const { data: pub } = supabase.storage
        .from("video-org-library")
        .getPublicUrl(row.storage_path);
      return {
        id: row.id,
        title: row.title,
        url: pub.publicUrl,
        thumb: row.thumb_url,
        tags: row.tags ?? [],
      };
    });
    return { items };
  });

const ValidateInput = z.object({ url: z.string().url().max(2000) });

export const validateExternalVideoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ValidateInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const res = await fetch(data.url, { method: "HEAD", redirect: "follow" });
      if (!res.ok) {
        return { ok: false as const, error: `URL returned ${res.status}` };
      }
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.toLowerCase().startsWith("video/")) {
        return {
          ok: false as const,
          error: `Not a video file (content-type: ${ct || "unknown"})`,
        };
      }
      return { ok: true as const, contentType: ct };
    } catch (e) {
      return {
        ok: false as const,
        error: `Could not reach URL: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  });