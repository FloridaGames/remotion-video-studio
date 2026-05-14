import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Loader2, Cloud } from "lucide-react";
import { renderVideo, getRenderStatus } from "@/lib/render.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/export/$projectId")({
  component: ExportPage,
});

type StartResult =
  | { ok: true; renderId: string; bucketName: string }
  | { ok: false; error: string };

type StatusResult =
  | {
      ok: true;
      done: boolean;
      overallProgress: number;
      outputFile: string | null;
      outputSizeInBytes: number | null;
      errors: string[];
      fatalErrorEncountered: boolean;
    }
  | { ok: false; error: string };

function ExportPage() {
  const { projectId } = Route.useParams();
  const render = useServerFn(renderVideo);
  const status = useServerFn(getRenderStatus);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [sizeBytes, setSizeBytes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
  }, []);

  async function start() {
    setBusy(true);
    setProgress(0);
    setDownloadUrl(null);
    setSizeBytes(null);
    setError(null);
    try {
      const r = (await render({ data: { projectId } })) as StartResult;
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        setBusy(false);
        return;
      }
      const { renderId, bucketName } = r;
      pollRef.current = window.setInterval(async () => {
        const s = (await status({
          data: { renderId, bucketName },
        })) as StatusResult;
        if (!s.ok) {
          setError(s.error);
          toast.error(s.error);
          if (pollRef.current) window.clearInterval(pollRef.current);
          setBusy(false);
          return;
        }
        setProgress(s.overallProgress);
        if (s.fatalErrorEncountered || s.errors.length) {
          const msg = s.errors.join("\n") || "Render failed";
          setError(msg);
          toast.error(msg);
          if (pollRef.current) window.clearInterval(pollRef.current);
          setBusy(false);
          return;
        }
        if (s.done && s.outputFile) {
          setDownloadUrl(s.outputFile);
          setSizeBytes(s.outputSizeInBytes);
          if (pollRef.current) window.clearInterval(pollRef.current);
          setBusy(false);
          toast.success("Render finished");
        }
      }, 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
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
        Rendering runs on Remotion Lambda (AWS). The MP4 is written to your
        Remotion S3 bucket and a public download link is returned below.
      </p>

      <div className="mt-8 flex items-center gap-3">
        <Button onClick={start} disabled={busy} size="lg">
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Rendering… {Math.round(progress * 100)}%
            </>
          ) : (
            <>
              <Cloud className="mr-2 h-4 w-4" /> Render now
            </>
          )}
        </Button>
      </div>

      {busy && (
        <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}

      {downloadUrl && (
        <div className="mt-8 rounded-xl border border-accent/40 bg-accent/10 p-6">
          <h2 className="text-lg font-semibold text-primary">Your MP4 is ready</h2>
          {typeof sizeBytes === "number" && (
            <p className="mt-1 text-sm text-muted-foreground">
              {(sizeBytes / (1024 * 1024)).toFixed(1)} MB
            </p>
          )}
          <Button asChild className="mt-4">
            <a href={downloadUrl} target="_blank" rel="noreferrer">
              <Download className="mr-2 h-4 w-4" /> Download MP4
            </a>
          </Button>
        </div>
      )}

      {error && (
        <div className="mt-8 rounded-xl border border-destructive/40 bg-destructive/10 p-6">
          <h2 className="text-lg font-semibold text-destructive">Render failed</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{error}</p>
        </div>
      )}
    </main>
  );
}