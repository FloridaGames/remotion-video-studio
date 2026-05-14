import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const searchInput = z.object({
  query: z.string().min(1).max(80),
  perPage: z.number().int().min(1).max(24).optional(),
});

export type PexelsResult = {
  id: number;
  url: string;
  thumb: string;
  title: string;
  width: number;
  height: number;
  duration: number;
};

export const searchPexelsVideos = createServerFn({ method: "POST" })
  .inputValidator((input) => searchInput.parse(input))
  .handler(async ({ data }): Promise<{ results: PexelsResult[]; configured: boolean }> => {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) return { results: [], configured: false };

    const params = new URLSearchParams({
      query: data.query,
      per_page: String(data.perPage ?? 12),
      orientation: "landscape",
      size: "medium",
    });
    const res = await fetch(`https://api.pexels.com/videos/search?${params}`, {
      headers: { Authorization: apiKey },
    });
    if (!res.ok) {
      throw new Error(`Pexels API error: ${res.status}`);
    }
    const json = (await res.json()) as {
      videos: Array<{
        id: number;
        width: number;
        height: number;
        duration: number;
        image: string;
        video_files: Array<{
          id: number;
          quality: string;
          file_type: string;
          width: number | null;
          height: number | null;
          link: string;
        }>;
      }>;
    };

    const results: PexelsResult[] = json.videos
      .map((v) => {
        // pick an HD-ish mp4 around 720p, fall back to first mp4
        const mp4s = v.video_files.filter((f) => f.file_type === "video/mp4");
        const ideal =
          mp4s.find((f) => (f.height ?? 0) >= 700 && (f.height ?? 0) <= 800) ??
          mp4s.find((f) => f.quality === "hd") ??
          mp4s[0];
        if (!ideal) return null;
        return {
          id: v.id,
          url: ideal.link,
          thumb: v.image,
          title: `Pexels #${v.id}`,
          width: v.width,
          height: v.height,
          duration: v.duration,
        };
      })
      .filter((x): x is PexelsResult => x !== null);

    return { results, configured: true };
  });
