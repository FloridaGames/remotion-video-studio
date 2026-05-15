import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Returns a short-lived signed URL for an object stored as `bucket/path`. */
export function useSignedUrl(bucket: string, path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, path]);
  return url;
}

/**
 * Resolves a set of `upload://<storage_path>` sentinels to short-lived signed
 * URLs from the given bucket. Returns a map keyed by the original sentinel.
 */
export function useResolvedUploadUrls(bucket: string, sentinels: string[]) {
  const [map, setMap] = useState<Record<string, string>>({});
  // Stable string key so the effect only fires on actual change.
  const key = sentinels.slice().sort().join("|");
  useEffect(() => {
    let cancelled = false;
    const paths = sentinels
      .filter((s) => s.startsWith("upload://"))
      .map((s) => s.slice("upload://".length));
    if (paths.length === 0) {
      setMap({});
      return;
    }
    (async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60);
      if (cancelled || error || !data) return;
      const next: Record<string, string> = {};
      data.forEach((row, i) => {
        if (row.signedUrl) next[`upload://${paths[i]}`] = row.signedUrl;
      });
      setMap(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, key]);
  return map;
}

export async function uploadToBucket(
  bucket: string,
  userId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  return path;
}