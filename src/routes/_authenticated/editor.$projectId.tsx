import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { uploadToBucket, useSignedUrl } from "@/lib/use-signed-url";
import { MainComposition } from "@/remotion/MainComposition";
import {
  ACCENT_HEX,
  type AccentKey,
  type Scene,
  SCENE_TEMPLATE_LABEL,
  type SceneType,
  makeScene,
  totalDurationFrames,
} from "@/remotion/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, Download } from "lucide-react";
import { StockVideoPicker } from "@/components/StockVideoPicker";

export const Route = createFileRoute("/_authenticated/editor/$projectId")({
  component: EditorPage,
});

function EditorPage() {
  const { projectId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("Untitled video");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [fps] = useState(30);
  const [width] = useState(1920);
  const [height] = useState(1080);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSave = useRef(true);

  const audioUrl = useSignedUrl("video-audio", audioPath);

  // load
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("title, scenes, audio_url")
        .eq("id", projectId)
        .single();
      if (error || !data) {
        toast.error("Could not load project");
        navigate({ to: "/projects" });
        return;
      }
      setTitle(data.title);
      setScenes((data.scenes as unknown as Scene[]) ?? []);
      setAudioPath(data.audio_url);
      setSelectedId(((data.scenes as unknown as Scene[]) ?? [])[0]?.id ?? null);
      setLoading(false);
      skipNextSave.current = true;
    })();
  }, [projectId, navigate]);

  // autosave (debounced)
  useEffect(() => {
    if (loading) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      const { error } = await supabase
        .from("projects")
        .update({
          title,
          scenes: scenes as unknown as never,
          audio_url: audioPath,
          duration_frames: totalDurationFrames(scenes),
        })
        .eq("id", projectId);
      setSaving(false);
      if (error) toast.error("Save failed: " + error.message);
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [title, scenes, audioPath, projectId, loading]);

  const composition = useMemo(
    () => ({ scenes, audioUrl, fps, width, height }),
    [scenes, audioUrl, fps, width, height],
  );
  const durationInFrames = Math.max(1, totalDurationFrames(scenes));
  const selected = scenes.find((s) => s.id === selectedId) ?? null;

  function updateScene(id: string, patch: Partial<Scene>) {
    setScenes((prev) => prev.map((s) => (s.id === id ? ({ ...s, ...patch } as Scene) : s)));
  }
  function addScene(type: SceneType) {
    const s = makeScene(type);
    setScenes((prev) => [...prev, s]);
    setSelectedId(s.id);
  }
  function removeScene(id: string) {
    setScenes((prev) => prev.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  }
  function move(id: string, dir: -1 | 1) {
    setScenes((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = prev.slice();
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  }

  async function onUploadImage(file: File) {
    if (!user || !selected || selected.type !== "image-caption") return;
    try {
      const path = await uploadToBucket("video-images", user.id, file);
      const { data } = await supabase.storage.from("video-images").createSignedUrl(path, 60 * 60);
      updateScene(selected.id, { imageUrl: data?.signedUrl ?? "" });
      toast.success("Image uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onUploadAudio(file: File) {
    if (!user) return;
    try {
      const path = await uploadToBucket("video-audio", user.id, file);
      setAudioPath(path);
      toast.success("Audio uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-7xl px-6 py-12 text-muted-foreground">Loading editor…</div>;
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="max-w-md text-lg font-semibold"
        />
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {saving ? "Saving…" : "Saved"}
          <label className="cursor-pointer rounded-md border border-border bg-card px-3 py-1.5 text-foreground hover:border-primary">
            {audioPath ? "Replace audio" : "Upload audio"}
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onUploadAudio(e.target.files[0])}
            />
          </label>
          <Button asChild>
            <Link to="/export/$projectId" params={{ projectId }}>
              <Download className="mr-2 h-4 w-4" /> Export MP4
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr_320px]">
        {/* Scene list */}
        <aside className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Scenes
          </div>
          <ul className="space-y-1">
            {scenes.map((s, i) => (
              <li
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm ${
                  s.id === selectedId ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                <GripVertical className="h-3 w-3 opacity-50" />
                <span className="flex-1 truncate">
                  {i + 1}. {SCENE_TEMPLATE_LABEL[s.type]}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    move(s.id, -1);
                  }}
                  className="text-xs opacity-60 hover:opacity-100"
                >
                  ↑
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    move(s.id, 1);
                  }}
                  className="text-xs opacity-60 hover:opacity-100"
                >
                  ↓
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeScene(s.id);
                  }}
                  className="opacity-60 hover:text-destructive hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Add scene
            </div>
            {(Object.keys(SCENE_TEMPLATE_LABEL) as SceneType[]).map((t) => (
              <button
                key={t}
                onClick={() => addScene(t)}
                className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-muted"
              >
                <Plus className="h-3 w-3" /> {SCENE_TEMPLATE_LABEL[t]}
              </button>
            ))}
          </div>
        </aside>

        {/* Player */}
        <section className="rounded-xl border border-border bg-card p-3">
          {scenes.length === 0 ? (
            <div className="flex aspect-video items-center justify-center text-muted-foreground">
              Add a scene to get started
            </div>
          ) : (
            <Player
              component={MainComposition}
              inputProps={composition}
              durationInFrames={durationInFrames}
              fps={fps}
              compositionWidth={width}
              compositionHeight={height}
              style={{ width: "100%", aspectRatio: `${width} / ${height}` }}
              controls
              loop
            />
          )}
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {(durationInFrames / fps).toFixed(1)}s · {scenes.length} scene{scenes.length === 1 ? "" : "s"}
          </p>
        </section>

        {/* Inspector */}
        <aside className="rounded-xl border border-border bg-card p-4">
          {selected ? (
            <Inspector
              scene={selected}
              onChange={(patch) => updateScene(selected.id, patch)}
              onUploadImage={onUploadImage}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Select a scene to edit it.</p>
          )}
        </aside>
      </div>
    </main>
  );
}

function Inspector({
  scene,
  onChange,
  onUploadImage,
}: {
  scene: Scene;
  onChange: (patch: Partial<Scene>) => void;
  onUploadImage: (f: File) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-primary">{SCENE_TEMPLATE_LABEL[scene.type]}</h3>

      <div className="space-y-2">
        <Label>Duration: {(scene.durationFrames / 30).toFixed(1)}s</Label>
        <Slider
          min={30}
          max={300}
          step={15}
          value={[scene.durationFrames]}
          onValueChange={([v]) => onChange({ durationFrames: v })}
        />
      </div>

      <div className="space-y-2">
        <Label>Accent color</Label>
        <div className="flex gap-2">
          {(Object.keys(ACCENT_HEX) as AccentKey[]).map((k) => (
            <button
              key={k}
              onClick={() => onChange({ accent: k })}
              className={`h-8 w-8 rounded-full border-2 ${
                scene.accent === k ? "border-foreground" : "border-transparent"
              }`}
              style={{ background: ACCENT_HEX[k] }}
              title={k}
            />
          ))}
        </div>
      </div>

      {scene.type === "title" && (
        <>
          <Field label="Title">
            <Input value={scene.title} onChange={(e) => onChange({ title: e.target.value })} />
          </Field>
          <Field label="Subtitle">
            <Input value={scene.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })} />
          </Field>
        </>
      )}
      {scene.type === "talking-point" && (
        <>
          <Field label="Heading">
            <Input value={scene.heading} onChange={(e) => onChange({ heading: e.target.value })} />
          </Field>
          <Field label="Bullets (one per line)">
            <Textarea
              rows={5}
              value={scene.bullets.join("\n")}
              onChange={(e) =>
                onChange({ bullets: e.target.value.split("\n").filter(Boolean) })
              }
            />
          </Field>
        </>
      )}
      {scene.type === "image-caption" && (
        <>
          <Field label="Image">
            <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground hover:border-primary">
              {scene.imageUrl ? "Replace image" : "Upload image"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onUploadImage(e.target.files[0])}
              />
            </label>
          </Field>
          <Field label="Caption">
            <Textarea
              rows={3}
              value={scene.caption}
              onChange={(e) => onChange({ caption: e.target.value })}
            />
          </Field>
        </>
      )}
      {scene.type === "outro" && (
        <>
          <Field label="Message">
            <Input value={scene.message} onChange={(e) => onChange({ message: e.target.value })} />
          </Field>
          <Field label="Sign-off">
            <Input value={scene.signoff} onChange={(e) => onChange({ signoff: e.target.value })} />
          </Field>
        </>
      )}
      {scene.type === "cinematic-title" && (
        <>
          <VideoField url={scene.videoUrl} onPick={(videoUrl) => onChange({ videoUrl })} />
          <Field label="Title">
            <Input value={scene.title} onChange={(e) => onChange({ title: e.target.value })} />
          </Field>
          <Field label="Subtitle">
            <Input value={scene.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })} />
          </Field>
        </>
      )}
      {scene.type === "split-video" && (
        <>
          <VideoField url={scene.videoUrl} onPick={(videoUrl) => onChange({ videoUrl })} />
          <Field label="Video side">
            <div className="flex gap-2">
              {(["left", "right"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => onChange({ videoSide: side })}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-sm capitalize ${
                    scene.videoSide === side
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:border-primary"
                  }`}
                >
                  {side}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Heading">
            <Input value={scene.heading} onChange={(e) => onChange({ heading: e.target.value })} />
          </Field>
          <Field label="Body">
            <Textarea rows={4} value={scene.body} onChange={(e) => onChange({ body: e.target.value })} />
          </Field>
        </>
      )}
      {scene.type === "lower-third" && (
        <>
          <VideoField url={scene.videoUrl} onPick={(videoUrl) => onChange({ videoUrl })} />
          <Field label="Name">
            <Input value={scene.name} onChange={(e) => onChange({ name: e.target.value })} />
          </Field>
          <Field label="Role / affiliation">
            <Textarea rows={2} value={scene.role} onChange={(e) => onChange({ role: e.target.value })} />
          </Field>
        </>
      )}
      {scene.type === "quote-video" && (
        <>
          <VideoField url={scene.videoUrl} onPick={(videoUrl) => onChange({ videoUrl })} />
          <Field label="Quote">
            <Textarea rows={4} value={scene.quote} onChange={(e) => onChange({ quote: e.target.value })} />
          </Field>
          <Field label="Attribution">
            <Input value={scene.attribution} onChange={(e) => onChange({ attribution: e.target.value })} />
          </Field>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function VideoField({ url, onPick }: { url: string; onPick: (url: string) => void }) {
  const isUpload = url.startsWith("upload://");
  const uploadPath = isUpload ? url.slice("upload://".length) : null;
  const signed = useSignedUrl("video-uploads", uploadPath);
  const previewUrl = isUpload ? signed : url;
  return (
    <div className="space-y-1.5">
      <Label>Stock video</Label>
      <div className="overflow-hidden rounded-md border border-border bg-black">
        {url && previewUrl ? (
          <video
            src={previewUrl}
            muted
            loop
            autoPlay
            playsInline
            className="aspect-video w-full object-cover"
          />
        ) : url && isUpload ? (
          <div className="flex aspect-video items-center justify-center text-xs text-muted-foreground">
            Loading preview…
          </div>
        ) : (
          <div className="flex aspect-video items-center justify-center text-xs text-muted-foreground">
            No video selected
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <StockVideoPicker currentUrl={url} onPick={onPick} />
        {url && (
          <Button variant="ghost" size="sm" type="button" onClick={() => onPick("")}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}