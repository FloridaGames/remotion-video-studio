import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CURATED_STOCK_VIDEOS, type StockVideo } from "@/lib/stock-videos";
import { searchPexelsVideos, type PexelsResult } from "@/lib/pexels.functions";
import {
  listMyUploads,
  registerMyUpload,
  deleteMyUpload,
  listOrgVideos,
  validateExternalVideoUrl,
  type MyUpload,
  type OrgVideo,
} from "@/lib/video-library.functions";
import { uploadToBucket } from "@/lib/use-signed-url";
import { useAuth } from "@/lib/use-auth";
import { Search, Film, Loader2, Upload, Link2, Building2, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Item = { id: string; url: string; thumb: string; title: string };
type Tab = "my" | "url" | "org" | "library" | "search";

export function StockVideoPicker({
  currentUrl,
  onPick,
  trigger,
}: {
  currentUrl?: string;
  onPick: (url: string) => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("my");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Item[]>([]);
  const [pexelsConfigured, setPexelsConfigured] = useState<boolean | null>(null);
  const [myUploads, setMyUploads] = useState<MyUpload[]>([]);
  const [loadingMy, setLoadingMy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [orgVideos, setOrgVideos] = useState<OrgVideo[]>([]);
  const [loadingOrg, setLoadingOrg] = useState(false);
  const [externalUrl, setExternalUrl] = useState("");
  const [validatingUrl, setValidatingUrl] = useState(false);

  const { user } = useAuth();
  const search = useServerFn(searchPexelsVideos);
  const fetchMy = useServerFn(listMyUploads);
  const registerUp = useServerFn(registerMyUpload);
  const deleteUp = useServerFn(deleteMyUpload);
  const fetchOrg = useServerFn(listOrgVideos);
  const validateUrl = useServerFn(validateExternalVideoUrl);

  const libraryItems: Item[] = CURATED_STOCK_VIDEOS.map((v: StockVideo) => ({
    id: v.id,
    url: v.url,
    thumb: v.thumb,
    title: v.title,
  }));

  async function runSearch(q: string) {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const { results, configured } = await search({ data: { query: q.trim(), perPage: 18 } });
      setPexelsConfigured(configured);
      if (!configured) {
        toast.error("Pexels search not configured yet.");
        setResults([]);
        return;
      }
      setResults(
        results.map((r: PexelsResult) => ({
          id: `pexels-${r.id}`,
          url: r.url,
          thumb: r.thumb,
          title: r.title,
        })),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function refreshMyUploads() {
    setLoadingMy(true);
    try {
      const { items } = await fetchMy();
      setMyUploads(items);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingMy(false);
    }
  }

  async function refreshOrg() {
    setLoadingOrg(true);
    try {
      const { items } = await fetchOrg();
      setOrgVideos(items);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingOrg(false);
    }
  }

  async function onUploadFile(file: File) {
    if (!user) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Please pick a video file (MP4, WebM, MOV).");
      return;
    }
    setUploading(true);
    try {
      const path = await uploadToBucket("video-uploads", user.id, file);
      await registerUp({
        data: {
          storagePath: path,
          title: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        },
      });
      toast.success("Video uploaded");
      await refreshMyUploads();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function onDeleteUpload(id: string) {
    if (!confirm("Delete this video? This cannot be undone.")) return;
    try {
      await deleteUp({ data: { id } });
      setMyUploads((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onUseUrl() {
    const url = externalUrl.trim();
    if (!url) return;
    setValidatingUrl(true);
    try {
      const res = await validateUrl({ data: { url } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onPick(url);
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setValidatingUrl(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setTab("my");
    void refreshMyUploads();
    void refreshOrg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const gridItems: Item[] =
    tab === "library"
      ? libraryItems
      : tab === "search"
        ? results
        : tab === "org"
          ? orgVideos.map((v) => ({
              id: v.id,
              url: v.url,
              thumb: v.thumb ?? "",
              title: v.title,
            }))
          : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" type="button">
            <Film className="mr-2 h-4 w-4" /> {currentUrl ? "Change video" : "Pick stock video"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Stock video</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 border-b border-border">
          {(
            [
              { id: "my", label: "My uploads", icon: Upload },
              { id: "url", label: "Paste URL", icon: Link2 },
              { id: "org", label: "Tilburg University", icon: Building2 },
              { id: "library", label: "Curated", icon: Film },
              { id: "search", label: "Pexels", icon: Search },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
                tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === "my" && (
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground hover:border-primary">
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Upload a video (MP4, WebM, MOV)
                </>
              )}
              <input
                type="file"
                accept="video/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUploadFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="grid max-h-[50vh] grid-cols-3 gap-3 overflow-y-auto pr-1">
              {loadingMy && (
                <p className="col-span-3 py-8 text-center text-sm text-muted-foreground">Loading…</p>
              )}
              {!loadingMy && myUploads.length === 0 && (
                <p className="col-span-3 py-8 text-center text-sm text-muted-foreground">
                  No uploads yet. Upload your first video above.
                </p>
              )}
              {myUploads.map((u) => (
                <div
                  key={u.id}
                  className="group relative overflow-hidden rounded-lg border border-border bg-muted"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onPick(`upload://${u.storagePath}`);
                      setOpen(false);
                    }}
                    className="block w-full text-left"
                  >
                    <div className="relative aspect-video w-full overflow-hidden bg-black">
                      <video
                        src={u.signedUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">
                      {u.title}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onDeleteUpload(u.id);
                    }}
                    className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 hover:bg-destructive"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "url" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onUseUrl();
            }}
            className="space-y-3"
          >
            <p className="text-sm text-muted-foreground">
              Paste a direct link to a video file (.mp4, .webm, .mov). Page URLs (YouTube, Vimeo
              page) won&apos;t work — use a direct file URL.
            </p>
            <div className="flex gap-2">
              <Input
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://example.com/video.mp4"
                autoFocus
              />
              <Button type="submit" disabled={validatingUrl || !externalUrl.trim()}>
                {validatingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : "Use this URL"}
              </Button>
            </div>
          </form>
        )}

        {tab === "search" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runSearch(query);
            }}
            className="flex gap-2"
          >
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. lecture, students, microscope, abstract"
              autoFocus
            />
            <Button type="submit" disabled={searching || !query.trim()}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </form>
        )}

        {tab === "search" && pexelsConfigured === false && (
          <p className="text-sm text-muted-foreground">
            Pexels API key not configured. The curated library still works.
          </p>
        )}

        {(tab === "library" || tab === "search" || tab === "org") && (
          <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto pr-1">
            {tab === "org" && loadingOrg && (
              <p className="col-span-3 py-8 text-center text-sm text-muted-foreground">Loading…</p>
            )}
            {tab === "org" && !loadingOrg && orgVideos.length === 0 && (
              <p className="col-span-3 py-8 text-center text-sm text-muted-foreground">
                The Tilburg University library is empty.
              </p>
            )}
            {gridItems.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  onPick(it.url);
                  setOpen(false);
                }}
                className="group overflow-hidden rounded-lg border border-border bg-muted text-left transition hover:border-primary"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-black">
                  {it.thumb ? (
                    <img
                      src={it.thumb}
                      alt={it.title}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <video
                      src={it.url}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">{it.title}</div>
              </button>
            ))}
            {tab === "search" && !searching && results.length === 0 && (
              <p className="col-span-3 py-8 text-center text-sm text-muted-foreground">
                Search for any topic to find stock videos.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
