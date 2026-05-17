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
  ANIMATABLE_LABEL,
  type AnimatableProperty,
  type EasingKind,
  type Keyframe,
} from "@/remotion/types";
import {
  buildPresetKeyframes,
  presetProperties,
  PRESET_LABEL,
  type PresetKey,
  valueAt,
} from "@/remotion/animation";
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
  ChevronUp,
  Diamond,
  Clock,
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
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [elementsOpen, setElementsOpen] = useState(true);

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

  // Where does the selected scene start on the global timeline?
  const selectedSceneStart = useMemo(() => {
    if (!selected) return 0;
    if (mode === "multi") return selected.startFrame ?? 0;
    const idx = scenes.findIndex((s) => s.id === selected.id);
    return sceneStarts[idx] ?? 0;
  }, [selected, scenes, sceneStarts, mode]);
  const localFrame = Math.max(
    0,
    Math.min((selected?.durationFrames ?? 1) - 1, frame - selectedSceneStart),
  );

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
      // Transitions are owned by the clip they're attached to (transitionAfter
      // lives on the owner clip). They ride along with that scene object during
      // reorders — moving a neighbor never re-parents the transition, and
      // moving the owner carries the transition with it. If the owner ends up
      // last, the transition is kept on the scene but becomes inert (no next
      // neighbor to transition into); it re-activates if the owner is later
      // moved back in front of another clip.
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
    if (!user || !selected) return;
    if (selected.type !== "image-caption" && selected.type !== "image") return;
    try {
      const path = await uploadToBucket("video-images", user.id, file);
      const { data } = await supabase.storage.from("video-images").createSignedUrl(path, 60 * 60);
      updateScene(selected.id, { imageUrl: data?.signedUrl ?? "" } as Partial<Scene>);
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
      ? {
          aspectRatio: `${width} / ${height}`,
          width: "100%",
          maxWidth: "100%",
          maxHeight: "100%",
        }
      : { width: width * Number(zoom), aspectRatio: `${width} / ${height}` };

  return (
    <main className="mx-auto flex h-[calc(100dvh-65px)] max-w-[1600px] flex-col gap-3 px-4 py-3">
      <div className="flex shrink-0 items-center justify-between gap-4">
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
        className={`grid min-h-0 flex-1 gap-4 ${
          viewMode === "storyboard"
            ? "lg:grid-cols-[280px_1fr_340px]"
            : elementsOpen
              ? "lg:grid-cols-[220px_1fr_340px]"
              : "lg:grid-cols-[44px_1fr_340px]"
        }`}
      >
        {/* Elements palette (timeline mode) */}
        {viewMode === "timeline" && (
          <aside className="min-h-0 min-w-0 overflow-y-auto rounded-xl border border-border bg-card p-2">
            <button
              onClick={() => setElementsOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              title={elementsOpen ? "Collapse elements" : "Expand elements"}
            >
              {elementsOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {elementsOpen && <span>Elements</span>}
            </button>
            {elementsOpen && (
              <div className="mt-1 space-y-1">
                {(Object.keys(SCENE_TEMPLATE_LABEL) as SceneType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => addScene(t)}
                    className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs hover:border-primary hover:bg-muted"
                    title={`Add ${SCENE_TEMPLATE_LABEL[t]}`}
                  >
                    <Plus className="h-3 w-3 shrink-0" />
                    <span className="truncate">{SCENE_TEMPLATE_LABEL[t]}</span>
                  </button>
                ))}
              </div>
            )}
          </aside>
        )}

        {/* Scene list with thumbnails (storyboard mode only) */}
        {viewMode === "storyboard" && (
        <aside className="min-h-0 min-w-0 overflow-y-auto rounded-xl border border-border bg-card p-3">
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
        <section className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-3">
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
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg bg-muted/40 p-2">
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
            <div className="shrink-0 space-y-2">
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
            </div>
          )}
        </div>
        </section>

        {/* Inspector */}
        <aside className="min-h-0 min-w-0 overflow-y-auto rounded-xl border border-border bg-card p-4">
          {selected ? (
            <Inspector
              scene={selected}
              onChange={(patch) => updateScene(selected.id, patch)}
              onUploadImage={onUploadImage}
              fps={fps}
              localFrame={localFrame}
              onSeekLocal={(lf) => seekToFrame(selectedSceneStart + lf)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Select a scene to edit it.</p>
          )}
        </aside>
      </div>

      {/* Bottom dock: timeline (always visible header, collapsible body) */}
      {viewMode === "timeline" && (
        <div className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <button
            onClick={() => setTimelineOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            title={timelineOpen ? "Collapse timeline" : "Expand timeline"}
          >
            {timelineOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronUp className="h-3 w-3" />
            )}
            Timeline
          </button>
          {timelineOpen && scenes.length > 0 && (
            <div className="border-t border-border">
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
                onTransitionChange={(id, transitionBefore) =>
                  updateScene(id, { transitionBefore, transitionAfter: undefined } as any)
                }
                onMoveClip={moveClip}
              />
            </div>
          )}
        </div>
      )}
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
  fps,
  localFrame,
  onSeekLocal,
}: {
  scene: Scene;
  onChange: (patch: Partial<Scene>) => void;
  onUploadImage: (f: File) => void;
  fps: number;
  localFrame: number;
  onSeekLocal: (localFrame: number) => void;
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
        {scene.type === "video-only" && (
          <>
            <VideoField
              url={scene.videoUrl}
              onPick={(videoUrl, durationFrames) =>
                onChange(durationFrames ? { videoUrl, durationFrames } : { videoUrl })
              }
            />
            <Field label="Fit">
              <div className="flex gap-2">
                {(["cover", "contain"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => onChange({ fit: f })}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm capitalize ${
                      (scene.fit ?? "cover") === f
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-primary"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}
        {scene.type === "image" && (
          <>
            <Field label="Image (PNG keeps transparency)">
              <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground hover:border-primary">
                {scene.imageUrl ? "Replace image" : "Upload PNG / JPG"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onUploadImage(e.target.files[0])}
                />
              </label>
            </Field>
            <Field label="Fit">
              <div className="flex gap-2">
                {(["contain", "cover"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => onChange({ fit: f })}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm capitalize ${
                      (scene.fit ?? "contain") === f
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-primary"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={`Box size (${Math.round((scene.size ?? 0.5) * 100)}% of canvas)`}>
              <Slider
                min={10}
                max={100}
                step={5}
                value={[Math.round((scene.size ?? 0.5) * 100)]}
                onValueChange={([v]) => onChange({ size: v / 100 })}
              />
            </Field>
            <p className="text-[10px] text-muted-foreground">
              Tip: use Properties → keyframes (X, Y, Scale, Rotation, Opacity) to position and animate this image inside the frame.
            </p>
          </>
        )}
        {scene.type === "text" && (
          <>
            <Field label="Text">
              <Textarea
                rows={3}
                value={scene.text}
                onChange={(e) => onChange({ text: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Font size">
                <Input
                  type="number"
                  min={8}
                  max={400}
                  step={2}
                  value={scene.fontSize}
                  onChange={(e) => onChange({ fontSize: Math.max(8, Number(e.target.value) || 0) })}
                />
              </Field>
              <Field label="Weight">
                <select
                  value={scene.fontWeight}
                  onChange={(e) => onChange({ fontWeight: Number(e.target.value) })}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {[300, 400, 500, 600, 700, 800, 900].map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Font family">
              <select
                value={scene.fontFamily ?? "Arial"}
                onChange={(e) => onChange({ fontFamily: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {[
                  "Arial",
                  "Helvetica",
                  "Georgia",
                  "Times New Roman",
                  "Courier New",
                  "Verdana",
                  "Trebuchet MS",
                  "Impact",
                ].map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Color">
                <input
                  type="color"
                  value={scene.color}
                  onChange={(e) => onChange({ color: e.target.value })}
                  className="h-9 w-full cursor-pointer rounded-md border border-input bg-transparent"
                />
              </Field>
              <Field label="Line height">
                <Input
                  type="number"
                  step={0.05}
                  min={0.8}
                  max={3}
                  value={scene.lineHeight}
                  onChange={(e) => onChange({ lineHeight: Number(e.target.value) || 1 })}
                />
              </Field>
            </div>
            <Field label="Align">
              <div className="flex gap-2">
                {(["left", "center", "right"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => onChange({ align: a })}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm capitalize ${
                      scene.align === a
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-primary"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Background box">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!scene.bgColor}
                  onChange={(e) =>
                    onChange({ bgColor: e.target.checked ? "#003366" : undefined })
                  }
                />
                <input
                  type="color"
                  value={scene.bgColor ?? "#003366"}
                  disabled={!scene.bgColor}
                  onChange={(e) => onChange({ bgColor: e.target.value })}
                  className="h-8 w-14 cursor-pointer rounded-md border border-input bg-transparent disabled:opacity-40"
                />
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span>pad</span>
                  <Input
                    type="number"
                    min={0}
                    max={200}
                    value={scene.bgPaddingX}
                    onChange={(e) =>
                      onChange({ bgPaddingX: Math.max(0, Number(e.target.value) || 0) })
                    }
                    className="h-7 w-14 text-right text-xs"
                    title="Horizontal padding"
                  />
                  <span>×</span>
                  <Input
                    type="number"
                    min={0}
                    max={200}
                    value={scene.bgPaddingY}
                    onChange={(e) =>
                      onChange({ bgPaddingY: Math.max(0, Number(e.target.value) || 0) })
                    }
                    className="h-7 w-14 text-right text-xs"
                    title="Vertical padding"
                  />
                </div>
              </div>
            </Field>
            <p className="text-[10px] text-muted-foreground">
              Tip: use Properties → keyframes (X, Y, Scale, Rotation, Opacity) to position and animate this text inside the frame.
            </p>
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
        <DurationField
          label="Duration"
          valueFrames={scene.durationFrames}
          minFrames={30}
          maxFrames={18000}
          stepFrames={15}
          onChange={(v) => onChange({ durationFrames: v })}
        />
        <DurationField
          label="Fade in"
          valueFrames={scene.fadeInFrames ?? 0}
          minFrames={0}
          maxFrames={Math.min(scene.durationFrames, 180)}
          stepFrames={3}
          onChange={(v) => onChange({ fadeInFrames: v })}
        />
        <DurationField
          label="Fade out"
          valueFrames={scene.fadeOutFrames ?? 0}
          minFrames={0}
          maxFrames={Math.min(scene.durationFrames, 180)}
          stepFrames={3}
          onChange={(v) => onChange({ fadeOutFrames: v })}
        />
      </Section>

      <Section title="Properties (keyframes)" defaultOpen={false}>
        <PropertiesPanel
          scene={scene}
          fps={fps}
          localFrame={localFrame}
          onChange={onChange}
          onSeekLocal={onSeekLocal}
        />
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

function DurationField({
  label,
  valueFrames,
  minFrames,
  maxFrames,
  stepFrames,
  onChange,
}: {
  label: string;
  valueFrames: number;
  minFrames: number;
  maxFrames: number;
  stepFrames: number;
  onChange: (frames: number) => void;
}) {
  const seconds = valueFrames / FPS;
  const minSec = minFrames / FPS;
  const maxSec = maxFrames / FPS;
  const stepSec = stepFrames / FPS;

  const [inputValue, setInputValue] = useState(String(seconds.toFixed(label === "Duration" ? 1 : 2)));

  useEffect(() => {
    setInputValue(String(seconds.toFixed(label === "Duration" ? 1 : 2)));
  }, [seconds, label]);

  const clamp = (v: number) => Math.max(minFrames, Math.min(maxFrames, Math.round(v / stepFrames) * stepFrames));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={minSec}
            max={maxSec}
            step={stepSec}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              const n = parseFloat(e.target.value);
              if (!Number.isNaN(n)) {
                onChange(clamp(Math.round(n * FPS)));
              }
            }}
            onBlur={() => {
              const n = parseFloat(inputValue);
              if (!Number.isNaN(n)) {
                const clamped = clamp(Math.round(n * FPS));
                onChange(clamped);
              }
              setInputValue(String(seconds.toFixed(label === "Duration" ? 1 : 2)));
            }}
            className="h-7 w-20 text-right text-xs"
          />
          <span className="text-[10px] text-muted-foreground">s</span>
        </div>
      </div>
      <Slider
        min={minFrames}
        max={maxFrames}
        step={stepFrames}
        value={[valueFrames]}
        onValueChange={([v]) => onChange(clamp(v))}
      />
    </div>
  );
}

const PROPERTY_GROUPS: { label: string; properties: AnimatableProperty[] }[] = [
  { label: "Transform", properties: ["x", "y", "scale", "rotation", "opacity"] },
  { label: "Crop (0–1)", properties: ["cropTop", "cropRight", "cropBottom", "cropLeft"] },
];

const PROPERTY_STEP: Record<AnimatableProperty, number> = {
  x: 1,
  y: 1,
  scale: 0.01,
  rotation: 1,
  opacity: 0.01,
  cropTop: 0.01,
  cropRight: 0.01,
  cropBottom: 0.01,
  cropLeft: 0.01,
};

function PropertiesPanel({
  scene,
  fps,
  localFrame,
  onChange,
  onSeekLocal,
}: {
  scene: Scene;
  fps: number;
  localFrame: number;
  onChange: (patch: Partial<Scene>) => void;
  onSeekLocal: (localFrame: number) => void;
}) {
  const kfs = scene.keyframes ?? [];

  const sortedKfs = (prop: AnimatableProperty) =>
    kfs.filter((k) => k.property === prop).sort((a, b) => a.frame - b.frame);

  function setStatic(prop: AnimatableProperty, value: number) {
    const transform = { ...(scene.transform ?? {}), [prop]: value };
    onChange({ transform });
  }

  /** Insert or update the keyframe for prop at the given local frame. */
  function upsertKeyframe(prop: AnimatableProperty, frame: number, value: number) {
    const f = Math.max(0, Math.min(scene.durationFrames, Math.round(frame)));
    const without = kfs.filter((k) => !(k.property === prop && k.frame === f));
    const existingEasing = kfs.find((k) => k.property === prop)?.easing ?? "linear";
    const next: Keyframe[] = [
      ...without,
      { property: prop, frame: f, value, easing: existingEasing },
    ];
    onChange({ keyframes: next });
  }

  /** AE-style stopwatch click: if no KFs → arm by seeding one at playhead; if KFs exist → clear all (disarm). */
  function toggleStopwatch(prop: AnimatableProperty) {
    const propKfs = sortedKfs(prop);
    if (propKfs.length === 0) {
      const v = valueAt(scene, prop, localFrame);
      upsertKeyframe(prop, localFrame, v);
      return;
    }
    // Disarm: clear KFs but keep the currently-shown value as the new base.
    const live = valueAt(scene, prop, localFrame);
    const transform = { ...(scene.transform ?? {}), [prop]: live };
    const nextKfs = kfs.filter((k) => k.property !== prop);
    onChange({ keyframes: nextKfs, transform });
  }

  /** Called when the user edits the value field. Armed → KF, not armed → base. */
  function commitValue(prop: AnimatableProperty, value: number) {
    if (Number.isNaN(value)) return;
    const propKfs = sortedKfs(prop);
    if (propKfs.length > 0) upsertKeyframe(prop, localFrame, value);
    else setStatic(prop, value);
  }

  function moveKeyframe(prop: AnimatableProperty, oldFrame: number, newFrame: number) {
    const f = Math.max(0, Math.min(scene.durationFrames, Math.round(newFrame)));
    const idx = kfs.findIndex((k) => k.property === prop && k.frame === oldFrame);
    if (idx < 0) return;
    // Avoid collision: if another KF already lives at f, drop it.
    const cleared = kfs.filter(
      (k, i) => i === idx || !(k.property === prop && k.frame === f),
    );
    const next = cleared.map((k) =>
      k.property === prop && k.frame === oldFrame ? { ...k, frame: f } : k,
    );
    onChange({ keyframes: next });
  }

  function removeKeyframeAt(prop: AnimatableProperty, frame: number) {
    const next = kfs.filter((k) => !(k.property === prop && k.frame === frame));
    onChange({ keyframes: next });
  }

  function setKeyframeEasing(prop: AnimatableProperty, frame: number, easing: EasingKind) {
    const next = kfs.map((k) =>
      k.property === prop && k.frame === frame ? { ...k, easing } : k,
    );
    onChange({ keyframes: next });
  }

  function applyPreset(preset: PresetKey) {
    const props = presetProperties(preset);
    const cleared = kfs.filter((k) => !props.includes(k.property));
    const added = buildPresetKeyframes(preset, scene.durationFrames, fps);
    onChange({ keyframes: [...cleared, ...added] });
  }

  function nearestKeyframe(prop: AnimatableProperty, dir: -1 | 1): number | null {
    const list = sortedKfs(prop).map((k) => k.frame);
    if (list.length === 0) return null;
    if (dir === -1) {
      const before = list.filter((f) => f < localFrame);
      return before.length ? before[before.length - 1] : list[list.length - 1];
    }
    const after = list.filter((f) => f > localFrame);
    return after.length ? after[0] : list[0];
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
        Playhead inside this clip:{" "}
        <span className="font-mono text-foreground">
          {(localFrame / fps).toFixed(2)}s ({localFrame}f)
        </span>
      </div>

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Presets
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(PRESET_LABEL) as PresetKey[]).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className="rounded-md border border-border px-2 py-1 text-[11px] hover:border-primary hover:bg-muted"
            >
              {PRESET_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {PROPERTY_GROUPS.map((group) => (
        <div key={group.label} className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </div>
          {group.properties.map((prop) => {
            const propKfs = sortedKfs(prop);
            const armed = propKfs.length > 0;
            const live = valueAt(scene, prop, localFrame);
            const atKf = propKfs.find((k) => k.frame === localFrame);
            return (
              <PropertyRow
                key={prop}
                prop={prop}
                duration={scene.durationFrames}
                localFrame={localFrame}
                armed={armed}
                liveValue={live}
                keyframes={propKfs}
                onToggleStopwatch={() => toggleStopwatch(prop)}
                onCommitValue={(v) => commitValue(prop, v)}
                onSeekLocal={onSeekLocal}
                onMoveKeyframe={(oldF, newF) => moveKeyframe(prop, oldF, newF)}
                onRemoveKeyframe={(f) => removeKeyframeAt(prop, f)}
                onSetKeyframeEasing={(f, e) => setKeyframeEasing(prop, f, e)}
                onAddAt={(f) => upsertKeyframe(prop, f, valueAt(scene, prop, f))}
                onJumpKf={(dir) => {
                  const t = nearestKeyframe(prop, dir);
                  if (t !== null) onSeekLocal(t);
                }}
                onAddRemoveAtPlayhead={() => {
                  if (atKf) removeKeyframeAt(prop, localFrame);
                  else upsertKeyframe(prop, localFrame, live);
                }}
                atKeyframe={!!atKf}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function PropertyRow({
  prop,
  duration,
  localFrame,
  armed,
  liveValue,
  keyframes,
  onToggleStopwatch,
  onCommitValue,
  onSeekLocal,
  onMoveKeyframe,
  onRemoveKeyframe,
  onSetKeyframeEasing,
  onAddAt,
  onJumpKf,
  onAddRemoveAtPlayhead,
  atKeyframe,
}: {
  prop: AnimatableProperty;
  duration: number;
  localFrame: number;
  armed: boolean;
  liveValue: number;
  keyframes: Keyframe[];
  onToggleStopwatch: () => void;
  onCommitValue: (v: number) => void;
  onSeekLocal: (f: number) => void;
  onMoveKeyframe: (oldFrame: number, newFrame: number) => void;
  onRemoveKeyframe: (frame: number) => void;
  onSetKeyframeEasing: (frame: number, e: EasingKind) => void;
  onAddAt: (frame: number) => void;
  onJumpKf: (dir: -1 | 1) => void;
  onAddRemoveAtPlayhead: () => void;
  atKeyframe: boolean;
}) {
  const step = PROPERTY_STEP[prop];
  const [inputValue, setInputValue] = useState(liveValue.toFixed(2));
  const [selectedKf, setSelectedKf] = useState<number | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setInputValue(liveValue.toFixed(2));
  }, [liveValue]);

  const selectedKeyframe = keyframes.find((k) => k.frame === selectedKf) ?? null;

  function laneToFrame(clientX: number): number {
    const rect = laneRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * duration);
  }

  function onLaneClick(e: React.MouseEvent<HTMLDivElement>) {
    // Click on the lane background → seek to that frame (AE-style scrub click).
    onSeekLocal(laneToFrame(e.clientX));
  }

  function onLaneDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    // Double-click empty lane → add KF at that frame.
    e.stopPropagation();
    onAddAt(laneToFrame(e.clientX));
  }

  function startDragKf(e: React.PointerEvent<HTMLButtonElement>, kfFrame: number) {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    let lastFrame = kfFrame;
    const onMove = (ev: PointerEvent) => {
      const f = laneToFrame(ev.clientX);
      if (f !== lastFrame) {
        onMoveKeyframe(lastFrame, f);
        lastFrame = f;
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="flex items-center gap-1.5">
        {/* Stopwatch */}
        <button
          onClick={onToggleStopwatch}
          title={
            armed
              ? "Stopwatch ON — value edits create keyframes. Click to disarm and clear all keyframes."
              : "Stopwatch OFF — click to start animating this property (creates a keyframe at the playhead)."
          }
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${
            armed
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Clock className="h-3 w-3" />
        </button>
        <Label className="flex-1 truncate text-[11px]">{ANIMATABLE_LABEL[prop]}</Label>
        {/* Prev/Add/Next KF cluster */}
        <button
          onClick={() => onJumpKf(-1)}
          disabled={keyframes.length === 0}
          title="Previous keyframe"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <button
          onClick={onAddRemoveAtPlayhead}
          title={
            atKeyframe
              ? "Remove keyframe at playhead"
              : "Add keyframe at playhead"
          }
          className={`rounded p-0.5 hover:bg-muted ${
            atKeyframe ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Diamond className="h-3 w-3" fill={atKeyframe ? "currentColor" : "none"} />
        </button>
        <button
          onClick={() => onJumpKf(1)}
          disabled={keyframes.length === 0}
          title="Next keyframe"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
        {/* Value input */}
        <Input
          type="number"
          step={step}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={() => {
            const n = parseFloat(inputValue);
            if (!Number.isNaN(n)) onCommitValue(n);
            else setInputValue(liveValue.toFixed(2));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-6 w-20 text-right text-[11px]"
          title={armed ? "Edit to create/update a keyframe at the playhead" : "Edit to set the base value"}
        />
      </div>

      {/* Mini timeline lane */}
      <div
        ref={laneRef}
        onClick={onLaneClick}
        onDoubleClick={onLaneDoubleClick}
        className="relative mt-2 h-5 cursor-crosshair select-none rounded bg-muted/50"
        title="Click = seek · double-click = add keyframe · drag a diamond to retime"
      >
        {/* Playhead */}
        <div
          className="pointer-events-none absolute top-0 h-full w-px bg-primary"
          style={{ left: `${(localFrame / Math.max(1, duration)) * 100}%` }}
        />
        {/* Keyframe diamonds */}
        {keyframes.map((k) => {
          const left = (k.frame / Math.max(1, duration)) * 100;
          const isSel = selectedKf === k.frame;
          return (
            <button
              key={k.frame}
              onPointerDown={(e) => {
                setSelectedKf(k.frame);
                onSeekLocal(k.frame);
                startDragKf(e, k.frame);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onRemoveKeyframe(k.frame);
                if (selectedKf === k.frame) setSelectedKf(null);
              }}
              title={`Frame ${k.frame} · value ${k.value.toFixed(2)} · double-click to delete`}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${
                isSel ? "scale-125" : ""
              }`}
              style={{ left: `${left}%` }}
            >
              <Diamond
                className={`h-3 w-3 ${isSel ? "text-accent" : "text-primary"}`}
                fill="currentColor"
              />
            </button>
          );
        })}
      </div>

      {/* Selected-keyframe inline controls (easing) */}
      {selectedKeyframe && (
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span>
            Selected KF · <span className="font-mono text-foreground">f{selectedKeyframe.frame}</span>{" "}
            <span className="font-mono text-foreground">{selectedKeyframe.value.toFixed(2)}</span>
          </span>
          <div className="flex items-center gap-1">
            <span>easing</span>
            <select
              value={selectedKeyframe.easing ?? "linear"}
              onChange={(e) =>
                onSetKeyframeEasing(selectedKeyframe.frame, e.target.value as EasingKind)
              }
              className="h-5 rounded border border-border bg-background text-[10px]"
            >
              <option value="linear">linear</option>
              <option value="ease-in">ease-in</option>
              <option value="ease-out">ease-out</option>
              <option value="ease-in-out">ease-in-out</option>
            </select>
            <button
              onClick={() => {
                onRemoveKeyframe(selectedKeyframe.frame);
                setSelectedKf(null);
              }}
              className="rounded p-0.5 hover:bg-muted hover:text-destructive"
              title="Delete selected keyframe"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
