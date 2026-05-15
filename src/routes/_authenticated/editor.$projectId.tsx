import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, Thumbnail, type PlayerRef } from "@remotion/player";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { uploadToBucket, useSignedUrl, useResolvedUploadUrls } from "@/lib/use-signed-url";
import { MainComposition } from "@/remotion/MainComposition";
import {
  ACCENT_HEX,
  type AccentKey,
  type Scene,
  SCENE_TEMPLATE_LABEL,
  type SceneType,
  type ProjectMode,
  makeScene,
  totalDurationFrames,
  normalizeScenes,
} from "@/remotion/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  GripVertical,
  Download,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Repeat,
  Undo2,
  Redo2,
  Copy,
  ChevronDown,
} from "lucide-react";
import { StockVideoPicker } from "@/components/StockVideoPicker";
import { Timeline } from "@/components/Timeline";

export const Route = createFileRoute("/_authenticated/editor/$projectId")({
  component: EditorPage,
});

const FPS = 30;
const ZOOM_OPTIONS = [
  { value: "fit", label: "Fit" },
  { value: "0.5", label: "50%" },
  { value: "1", label: "100%" },
  { value: "2", label: "200%" },
] as const;

function fmtTime(frame: number, fps: number) {
  const totalSec = frame / fps;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const f = Math.floor(frame % fps);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${f.toString().padStart(2, "0")}`;
}

function EditorPage() {
  const { projectId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("Untitled video");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [mode, setMode] = useState<ProjectMode>("single");
  const [fps] = useState(FPS);
  const [width] = useState(1920);
  const [height] = useState(1080);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSave = useRef(true);

  // History (undo/redo) — snapshots of scenes only, capped at 50
  const history = useRef<Scene[][]>([]);
  const future = useRef<Scene[][]>([]);
  const skipHistory = useRef(false);
  const [, forceTick] = useState(0);
  const tick = useCallback(() => forceTick((n) => n + 1), []);

  // Player + transport
  const playerRef = useRef<PlayerRef | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const [loop, setLoop] = useState(true);
  const [zoom, setZoom] = useState<(typeof ZOOM_OPTIONS)[number]["value"]>("fit");
  const [showSafe, setShowSafe] = useState(false);
  const [viewMode, setViewMode] = useState<"timeline" | "storyboard">("timeline");

  const audioUrl = useSignedUrl("video-audio", audioPath);

  // Load
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("title, scenes, audio_url, mode")
        .eq("id", projectId)
        .single();
      if (error || !data) {
        toast.error("Could not load project");
        navigate({ to: "/projects" });
        return;
      }
      const loadedMode = ((data as { mode?: ProjectMode }).mode ?? "single") as ProjectMode;
      const raw = (data.scenes as unknown as Scene[]) ?? [];
      const loaded = normalizeScenes(raw, loadedMode);
      setTitle(data.title);
      setMode(loadedMode);
      setScenes(loaded);
      setAudioPath(data.audio_url);
      setSelectedId(loaded[0]?.id ?? null);
      history.current = [loaded];
      future.current = [];
      setLoading(false);
      skipNextSave.current = true;
    })();
  }, [projectId, navigate]);

  // Push to history on every scenes change (unless undo/redo did it)
  useEffect(() => {
    if (loading) return;
    if (skipHistory.current) {
      skipHistory.current = false;
      return;
    }
    const last = history.current[history.current.length - 1];
    if (last === scenes) return;
    history.current.push(scenes);
    if (history.current.length > 50) history.current.shift();
    future.current = [];
    tick();
  }, [scenes, loading, tick]);

  // Autosave
  useEffect(() => {
    if (loading) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      const normalized = normalizeScenes(scenes, mode);
      const { error } = await supabase
        .from("projects")
        .update({
          title,
          scenes: normalized as unknown as never,
          audio_url: audioPath,
          duration_frames: totalDurationFrames(normalized, mode),
          mode,
        })
        .eq("id", projectId);
      setSaving(false);
      if (error) toast.error("Save failed: " + error.message);
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [title, scenes, audioPath, projectId, loading, mode]);

  const uploadSentinels = useMemo(
    () =>
      scenes
        .map((s) => ("videoUrl" in s ? (s as { videoUrl?: string }).videoUrl : undefined))
        .filter((v): v is string => typeof v === "string" && v.startsWith("upload://")),
    [scenes],
  );
  const resolvedUploads = useResolvedUploadUrls("video-uploads", uploadSentinels);
  const resolvedScenes = useMemo(
    () =>
      scenes.map((s) => {
        const v = (s as { videoUrl?: string }).videoUrl;
        if (typeof v === "string" && v.startsWith("upload://")) {
          return { ...s, videoUrl: resolvedUploads[v] ?? "" } as Scene;
        }
        return s;
      }),
    [scenes, resolvedUploads],
  );
  const composition = useMemo(
    () => ({ scenes: normalizeScenes(resolvedScenes, mode), audioUrl, fps, width, height, mode }),
    [resolvedScenes, audioUrl, fps, width, height, mode],
  );
  const durationInFrames = Math.max(1, totalDurationFrames(scenes, mode));
  const selected = scenes.find((s) => s.id === selectedId) ?? null;

  // Cumulative scene start frames (for thumbnails + click-to-seek)
  const sceneStarts = useMemo(() => {
    const arr: number[] = [];
    let acc = 0;
    for (const s of scenes) {
      arr.push(acc);
      acc += Math.max(1, s.durationFrames);
    }
    return arr;
  }, [scenes]);

  // Subscribe to player events
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
    };
  }, [scenes.length]);

  // Mutations
  const updateScene = useCallback((id: string, patch: Partial<Scene>) => {
    setScenes((prev) => prev.map((s) => (s.id === id ? ({ ...s, ...patch } as Scene) : s)));
  }, []);
  const addScene = useCallback((type: SceneType) => {
    const s = makeScene(type);
    setScenes((prev) => [...prev, s]);
    setSelectedId(s.id);
  }, []);
  const removeScene = useCallback((id: string) => {
    setScenes((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const next = prev.filter((s) => s.id !== id);
      const fallback = next[Math.max(0, idx - 1)] ?? null;
      setSelectedId((cur) => (cur === id ? (fallback?.id ?? null) : cur));
      return next;
    });
  }, []);
  const duplicateScene = useCallback((id: string) => {
    setScenes((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const original = prev[idx];
      const copy = {
        ...original,
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2),
      } as Scene;
      const next = prev.slice();
      next.splice(idx + 1, 0, copy);
      setSelectedId(copy.id);
      return next;
    });
  }, []);
  const move = useCallback((id: string, dir: -1 | 1) => {
    setScenes((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = prev.slice();
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  }, []);
  const reorderTo = useCallback((from: number, to: number) => {
    setScenes((prev) => {
      if (from === to || from < 0 || from >= prev.length) return prev;
      const copy = prev.slice();
      const [item] = copy.splice(from, 1);
      const insertAt = Math.max(0, Math.min(copy.length, to));
      copy.splice(insertAt, 0, item);
      return copy;
    });
  }, []);

  const moveClip = useCallback(
    (id: string, patch: { track: number; startFrame: number }) => {
      setScenes((prev) =>
        prev.map((s) =>
          s.id === id
            ? ({ ...s, track: patch.track, startFrame: Math.max(0, patch.startFrame) } as Scene)
            : s,
        ),
      );
    },
    [],
  );

  // Mode toggle: single → multi is free; multi → single may drop overlay clips.
  const toggleMode = useCallback(() => {
    if (mode === "single") {
      // Promote: assign explicit track=1 + sequential startFrames.
      setScenes((prev) => normalizeScenes(prev, "single"));
      setMode("multi");
      toast.success("Multi-track enabled · V2 overlay lane unlocked");
      return;
    }
    // multi → single
    const offTrack = scenes.filter((s) => (s.track ?? 1) !== 1);
    if (offTrack.length > 0) {
      const ok = window.confirm(
        `Switch to single-track?\n\nThis will permanently remove ${offTrack.length} clip${
          offTrack.length === 1 ? "" : "s"
        } on the V2 overlay lane. Re-enabling multi-track later won't bring them back.`,
      );
      if (!ok) return;
    }
    setScenes((prev) => {
      const onMain = prev
        .filter((s) => (s.track ?? 1) === 1)
        .sort((a, b) => (a.startFrame ?? 0) - (b.startFrame ?? 0));
      return normalizeScenes(onMain, "single");
    });
    setMode("single");
    toast.success("Switched to single-track");
  }, [mode, scenes]);

  // Undo / redo
  const canUndo = history.current.length > 1;
  const canRedo = future.current.length > 0;
  const undo = useCallback(() => {
    if (history.current.length <= 1) return;
    const popped = history.current.pop()!;
    future.current.push(popped);
    const prev = history.current[history.current.length - 1];
    skipHistory.current = true;
    setScenes(prev);
    tick();
  }, [tick]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(next);
    skipHistory.current = true;
    setScenes(next);
    tick();
  }, [tick]);

  // Transport
  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isPlaying()) p.pause();
    else p.play();
  }, []);
  const stepFrames = useCallback(
    (delta: number) => {
      const p = playerRef.current;
      if (!p) return;
      const next = Math.max(0, Math.min(durationInFrames - 1, p.getCurrentFrame() + delta));
      p.pause();
      p.seekTo(next);
    },
    [durationInFrames],
  );
  const seekToFrame = useCallback((f: number) => {
    playerRef.current?.seekTo(f);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const isEditing =
        tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;

      // Undo/redo work even in inputs (browser default is also fine, but we override)
      if (mod && e.key.toLowerCase() === "z") {
        if (isEditing) return; // don't fight native input undo
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        if (isEditing) return;
        e.preventDefault();
        redo();
        return;
      }

      if (isEditing) return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
        return;
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        togglePlay();
        return;
      }
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        stepFrames(-fps);
        return;
      }
      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        stepFrames(fps);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepFrames(e.shiftKey ? -fps : -1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        stepFrames(e.shiftKey ? fps : 1);
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        if (selectedId) {
          e.preventDefault();
          duplicateScene(selectedId);
        }
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        if (selectedId) {
          e.preventDefault();
          removeScene(selectedId);
        }
        return;
      }
      if (e.altKey && e.key === "ArrowUp") {
        if (selectedId) {
          e.preventDefault();
          move(selectedId, -1);
        }
        return;
      }
      if (e.altKey && e.key === "ArrowDown") {
        if (selectedId) {
          e.preventDefault();
          move(selectedId, 1);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, stepFrames, undo, redo, selectedId, duplicateScene, removeScene, move, fps]);

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
    return (
      <div className="mx-auto max-w-7xl px-6 py-12 text-muted-foreground">Loading editor…</div>
    );
  }

  // Player container styling for zoom
  const playerContainerStyle: React.CSSProperties =
    zoom === "fit"
      ? { width: "100%", aspectRatio: `${width} / ${height}` }
      : { width: width * Number(zoom), aspectRatio: `${width} / ${height}` };

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="max-w-md text-lg font-semibold"
        />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button
            variant="ghost"
            size="icon"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (⌘Z)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (⇧⌘Z)"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <div className="ml-2 flex rounded-md border border-border p-0.5">
            <button
              onClick={() => setViewMode("timeline")}
              className={`rounded px-2 py-1 text-xs ${
                viewMode === "timeline" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setViewMode("storyboard")}
              className={`rounded px-2 py-1 text-xs ${
                viewMode === "storyboard" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Storyboard
            </button>
          </div>
          <button
            onClick={toggleMode}
            className={`ml-1 rounded-md border px-2 py-1 text-xs ${
              mode === "multi"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary"
            }`}
            title={
              mode === "multi"
                ? "Switch back to single-track (may drop overlay clips)"
                : "Enable multi-track (adds V2 overlay lane)"
            }
          >
            {mode === "multi" ? "Multi-track" : "Single-track"}
          </button>
          <span className="px-1 text-xs">{saving ? "Saving…" : "Saved"}</span>
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

      <div
        className={`grid gap-4 ${
          viewMode === "storyboard"
            ? "lg:grid-cols-[280px_1fr_340px]"
            : "lg:grid-cols-[1fr_340px]"
        }`}
      >
        {/* Scene list with thumbnails (storyboard mode only) */}
        {viewMode === "storyboard" && (
        <aside className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Scenes
          </div>
          <ul className="space-y-1.5">
            {scenes.map((s, i) => (
              <li
                key={s.id}
                onClick={() => {
                  setSelectedId(s.id);
                  seekToFrame(sceneStarts[i] ?? 0);
                }}
                className={`group flex cursor-pointer items-center gap-2 rounded-md p-1.5 text-sm transition-colors ${
                  s.id === selectedId
                    ? "bg-primary/10 ring-1 ring-primary"
                    : "hover:bg-muted"
                }`}
              >
                <GripVertical className="h-3 w-3 shrink-0 opacity-40" />
                <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded bg-black">
                  <Thumbnail
                    component={MainComposition}
                    inputProps={composition}
                    durationInFrames={durationInFrames}
                    fps={fps}
                    compositionWidth={width}
                    compositionHeight={height}
                    frameToDisplay={Math.min(
                      durationInFrames - 1,
                      (sceneStarts[i] ?? 0) + Math.floor(s.durationFrames / 2),
                    )}
                    style={{ width: "100%", height: "100%" }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">
                    {i + 1}. {SCENE_TEMPLATE_LABEL[s.type]}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {(s.durationFrames / fps).toFixed(1)}s
                  </div>
                </div>
                <div className="flex shrink-0 flex-col opacity-0 group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateScene(s.id);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                    title="Duplicate (⌘D)"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeScene(s.id);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                    title="Delete (⌫)"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
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
        )}

        {/* Player + transport */}
        <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
          {/* Toolbar above player */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <label className="text-muted-foreground">Zoom</label>
              <select
                value={zoom}
                onChange={(e) => setZoom(e.target.value as typeof zoom)}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              >
                {ZOOM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowSafe((v) => !v)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  showSafe
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary"
                }`}
                title="Toggle safe area + thirds"
              >
                Safe area
              </button>
            </div>
            <button
              onClick={() => setLoop((v) => !v)}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 ${
                loop
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary"
              }`}
              title="Loop playback"
            >
              <Repeat className="h-3 w-3" /> Loop
            </button>
          </div>

          {/* Player */}
          <div className="flex items-center justify-center overflow-auto rounded-lg bg-muted/40 p-2">
            {scenes.length === 0 ? (
              <div className="flex aspect-video w-full items-center justify-center text-muted-foreground">
                Add a scene to get started
              </div>
            ) : (
              <div className="relative" style={playerContainerStyle}>
                <Player
                  ref={playerRef}
                  component={MainComposition}
                  inputProps={composition}
                  durationInFrames={durationInFrames}
                  fps={fps}
                  compositionWidth={width}
                  compositionHeight={height}
                  style={{ width: "100%", height: "100%" }}
                  loop={loop}
                  clickToPlay
                />
                {showSafe && (
                  <div className="pointer-events-none absolute inset-0">
                    {/* Title-safe (90%) */}
                    <div className="absolute inset-[5%] border border-primary/60" />
                    {/* Action-safe (95%) */}
                    <div className="absolute inset-[2.5%] border border-primary/30" />
                    {/* Rule of thirds */}
                    <div className="absolute inset-0">
                      <div className="absolute left-1/3 top-0 h-full w-px bg-primary/20" />
                      <div className="absolute left-2/3 top-0 h-full w-px bg-primary/20" />
                      <div className="absolute top-1/3 left-0 h-px w-full bg-primary/20" />
                      <div className="absolute top-2/3 left-0 h-px w-full bg-primary/20" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Transport bar */}
          {scenes.length > 0 && (
            <div className="space-y-2">
              {/* Scrub */}
              <div className="relative h-2 w-full">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, durationInFrames - 1)}
                  step={1}
                  value={frame}
                  onChange={(e) => seekToFrame(Number(e.target.value))}
                  className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent
                    [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-muted
                    [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:-mt-0.5
                    [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-muted
                    [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => stepFrames(-fps)}
                    title="Back 1s (J)"
                  >
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => stepFrames(-1)}
                    title="Prev frame (←)"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="default"
                    size="icon"
                    onClick={togglePlay}
                    title="Play/pause (Space)"
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => stepFrames(1)}
                    title="Next frame (→)"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => stepFrames(fps)}
                    title="Forward 1s (L)"
                  >
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </div>
                <div className="font-mono text-xs tabular-nums text-muted-foreground">
                  {fmtTime(frame, fps)} / {fmtTime(durationInFrames, fps)}
                </div>
              </div>
              <p className="text-center text-[10px] text-muted-foreground">
                Space: play · J/L: ±1s · ←/→: ±1f (Shift = ±1s) · ⌘D dup · ⌫ delete · ⌥↑↓ reorder · ⌘Z undo
              </p>
            </div>
          )}
        </div>
        {viewMode === "timeline" && scenes.length > 0 && (
          <Timeline
            scenes={scenes}
            composition={composition}
            fps={fps}
            width={width}
            height={height}
            frame={frame}
            selectedId={selectedId}
            mode={mode}
            onSelect={(id, startFrame) => {
              setSelectedId(id);
              seekToFrame(startFrame);
            }}
            onReorder={reorderTo}
            onTrim={(id, durationFrames) => updateScene(id, { durationFrames })}
            onSeek={seekToFrame}
            onTransitionChange={(id, transitionAfter) =>
              updateScene(id, { transitionAfter } as any)
            }
            onMoveClip={moveClip}
          />
        )}
        {viewMode === "timeline" && (
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Add scene
            </div>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(SCENE_TEMPLATE_LABEL) as SceneType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => addScene(t)}
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:border-primary hover:bg-muted"
                >
                  <Plus className="h-3 w-3" /> {SCENE_TEMPLATE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        )}
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

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group border-b border-border pb-3 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
        {title}
        <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 pt-1">{children}</div>
    </details>
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
    <div className="space-y-1">
      <h3 className="mb-2 text-sm font-semibold text-primary">
        {SCENE_TEMPLATE_LABEL[scene.type]}
      </h3>

      <Section title="Content">
        {scene.type === "title" && (
          <>
            <Field label="Title">
              <Input value={scene.title} onChange={(e) => onChange({ title: e.target.value })} />
            </Field>
            <Field label="Subtitle">
              <Input
                value={scene.subtitle}
                onChange={(e) => onChange({ subtitle: e.target.value })}
              />
            </Field>
          </>
        )}
        {scene.type === "talking-point" && (
          <>
            <Field label="Heading">
              <Input
                value={scene.heading}
                onChange={(e) => onChange({ heading: e.target.value })}
              />
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
              <Input
                value={scene.message}
                onChange={(e) => onChange({ message: e.target.value })}
              />
            </Field>
            <Field label="Sign-off">
              <Input
                value={scene.signoff}
                onChange={(e) => onChange({ signoff: e.target.value })}
              />
            </Field>
          </>
        )}
        {scene.type === "cinematic-title" && (
          <>
            <VideoField
              url={scene.videoUrl}
              onPick={(videoUrl, durationFrames) =>
                onChange(durationFrames ? { videoUrl, durationFrames } : { videoUrl })
              }
            />
            <Field label="Title">
              <Input value={scene.title} onChange={(e) => onChange({ title: e.target.value })} />
            </Field>
            <Field label="Subtitle">
              <Input
                value={scene.subtitle}
                onChange={(e) => onChange({ subtitle: e.target.value })}
              />
            </Field>
          </>
        )}
        {scene.type === "split-video" && (
          <>
            <VideoField
              url={scene.videoUrl}
              onPick={(videoUrl, durationFrames) =>
                onChange(durationFrames ? { videoUrl, durationFrames } : { videoUrl })
              }
            />
            <Field label="Heading">
              <Input
                value={scene.heading}
                onChange={(e) => onChange({ heading: e.target.value })}
              />
            </Field>
            <Field label="Body">
              <Textarea
                rows={4}
                value={scene.body}
                onChange={(e) => onChange({ body: e.target.value })}
              />
            </Field>
          </>
        )}
        {scene.type === "lower-third" && (
          <>
            <VideoField
              url={scene.videoUrl}
              onPick={(videoUrl, durationFrames) =>
                onChange(durationFrames ? { videoUrl, durationFrames } : { videoUrl })
              }
            />
            <Field label="Name">
              <Input value={scene.name} onChange={(e) => onChange({ name: e.target.value })} />
            </Field>
            <Field label="Role / affiliation">
              <Textarea
                rows={2}
                value={scene.role}
                onChange={(e) => onChange({ role: e.target.value })}
              />
            </Field>
          </>
        )}
        {scene.type === "quote-video" && (
          <>
            <VideoField
              url={scene.videoUrl}
              onPick={(videoUrl, durationFrames) =>
                onChange(durationFrames ? { videoUrl, durationFrames } : { videoUrl })
              }
            />
            <Field label="Quote">
              <Textarea
                rows={4}
                value={scene.quote}
                onChange={(e) => onChange({ quote: e.target.value })}
              />
            </Field>
            <Field label="Attribution">
              <Input
                value={scene.attribution}
                onChange={(e) => onChange({ attribution: e.target.value })}
              />
            </Field>
          </>
        )}
      </Section>

      <Section title="Style">
        <Field label="Accent color">
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
        </Field>
        {scene.type === "split-video" && (
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
        )}
      </Section>

      <Section title="Timing">
        <Field label={`Duration: ${(scene.durationFrames / FPS).toFixed(1)}s`}>
          <Slider
            min={30}
            max={18000}
            step={15}
            value={[scene.durationFrames]}
            onValueChange={([v]) => onChange({ durationFrames: v })}
          />
        </Field>
      </Section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function VideoField({
  url,
  onPick,
}: {
  url: string;
  onPick: (url: string, durationFrames?: number) => void;
}) {
  const isUpload = url.startsWith("upload://");
  const uploadPath = isUpload ? url.slice("upload://".length) : null;
  const signed = useSignedUrl("video-uploads", uploadPath);
  const previewUrl = isUpload ? signed : url;
  const handlePick = useCallback(
    async (newUrl: string) => {
      if (!newUrl) {
        onPick(newUrl);
        return;
      }
      // Probe duration. For upload:// we need a signed URL first.
      let probeUrl = newUrl;
      if (newUrl.startsWith("upload://")) {
        const path = newUrl.slice("upload://".length);
        const { data } = await supabase.storage
          .from("video-uploads")
          .createSignedUrl(path, 60 * 10);
        if (!data?.signedUrl) {
          onPick(newUrl);
          return;
        }
        probeUrl = data.signedUrl;
      }
      try {
        const seconds = await new Promise<number>((resolve, reject) => {
          const v = document.createElement("video");
          v.preload = "metadata";
          v.muted = true;
          v.src = probeUrl;
          const cleanup = () => {
            v.removeAttribute("src");
            v.load();
          };
          v.onloadedmetadata = () => {
            const d = v.duration;
            cleanup();
            if (Number.isFinite(d) && d > 0) resolve(d);
            else reject(new Error("invalid duration"));
          };
          v.onerror = () => {
            cleanup();
            reject(new Error("probe failed"));
          };
          setTimeout(() => {
            cleanup();
            reject(new Error("probe timeout"));
          }, 8000);
        });
        const frames = Math.max(30, Math.round(seconds * FPS));
        onPick(newUrl, frames);
      } catch {
        onPick(newUrl);
      }
    },
    [onPick],
  );
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Stock video</Label>
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
        <StockVideoPicker currentUrl={url} onPick={handlePick} />
        {url && (
          <Button variant="ghost" size="sm" type="button" onClick={() => onPick("")}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
