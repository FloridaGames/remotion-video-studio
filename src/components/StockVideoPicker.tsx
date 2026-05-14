import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CURATED_STOCK_VIDEOS, type StockVideo } from "@/lib/stock-videos";
import { searchPexelsVideos, type PexelsResult } from "@/lib/pexels.functions";
import { Search, Film, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Item = { id: string; url: string; thumb: string; title: string };

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
  const [tab, setTab] = useState<"library" | "search">("library");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Item[]>([]);
  const [pexelsConfigured, setPexelsConfigured] = useState<boolean | null>(null);
  const search = useServerFn(searchPexelsVideos);

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

  useEffect(() => {
    if (!open) return;
    setTab("library");
  }, [open]);

  const items = tab === "library" ? libraryItems : results;

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

        <div className="flex gap-2 border-b border-border">
          {(["library", "search"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"
              }`}
            >
              {t === "library" ? "Curated library" : "Search Pexels"}
            </button>
          ))}
        </div>

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

        <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto pr-1">
          {items.map((it) => (
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
                <img
                  src={it.thumb}
                  alt={it.title}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                  loading="lazy"
                />
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
      </DialogContent>
    </Dialog>
  );
}
