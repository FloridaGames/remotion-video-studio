import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Loader2, Server } from "lucide-react";
import { renderVideo } from "@/lib/render.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/export/$projectId")({
  component: ExportPage,
});

type Result =
  | { ok: true; url: string; path?: string; sizeBytes?: number }
  | { ok: false; error: string };

function ExportPage() {
  const { projectId } = Route.useParams();
  const render = useServerFn(renderVideo);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function start() {
    setBusy(true);
    setResult(null);
    try {
      const r = (await render({ data: { projectId } })) as Result;
      setResult(r);
      if (!r.ok) toast.error(r.error);
      else toast.success("Render finished");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ ok: false, error: msg });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Button asChild variant="ghost" size="sm">
        <Link to="/editor/$projectId" params={{ projectId }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to editor
        </Link>
      </Button>
      <h1 className="mt-6 text-3xl font-bold text-primary">Export to MP4</h1>
      <p className="mt-3 text-muted-foreground">
        Rendering runs on your Hetzner render worker (deployed via Coolify).
        The MP4 is uploaded to Lovable Cloud storage and a 24-hour download
        link is returned below.
      </p>

      <div className="mt-8 flex items-center gap-3">
        <Button onClick={start} disabled={busy} size="lg">
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rendering…
            </>
          ) : (
            <>
              <Server className="mr-2 h-4 w-4" /> Render now
            </>
          )}
        </Button>
        {busy && (
          <span className="text-sm text-muted-foreground">
            This can take 30–90s depending on your video length.
          </span>
        )}
      </div>

      {result?.ok && (
        <div className="mt-8 rounded-xl border border-accent/40 bg-accent/10 p-6">
          <h2 className="text-lg font-semibold text-primary">Your MP4 is ready</h2>
          {typeof result.sizeBytes === "number" && (
            <p className="mt-1 text-sm text-muted-foreground">
              {(result.sizeBytes / (1024 * 1024)).toFixed(1)} MB
            </p>
          )}
          <Button asChild className="mt-4">
            <a href={result.url} target="_blank" rel="noreferrer">
              <Download className="mr-2 h-4 w-4" /> Download MP4
            </a>
          </Button>
          <p className="mt-3 text-xs text-muted-foreground break-all">
            Link expires in 24 hours.
          </p>
        </div>
      )}

      {result && !result.ok && (
        <div className="mt-8 rounded-xl border border-destructive/40 bg-destructive/10 p-6">
          <h2 className="text-lg font-semibold text-destructive">Render failed</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{result.error}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            See <code>render-worker/README.md</code> for setup instructions.
          </p>
        </div>
      )}
    </main>
  );
}
