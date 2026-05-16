import { useEffect, useMemo, useRef, useState } from "react";
import { MainComposition } from "@/remotion/MainComposition";
import { Thumbnail } from "@remotion/player";
import type {
  ProjectComposition,
  ProjectMode,
  Scene,
  SceneTransition,
  TransitionKind,
} from "@/remotion/types";
import {
  SCENE_TEMPLATE_LABEL,
  ACCENT_HEX,
  totalDurationFrames,
  TRANSITION_LABEL,
} from "@/remotion/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

type Props = {
  scenes: Scene[];
  composition: ProjectComposition;
  fps: number;
  width: number;
  height: number;
  frame: number;
  selectedId: string | null;
  /** Initial pixels-per-second; user can zoom inside the timeline. */
  pxPerSecond?: number;
  mode?: ProjectMode;
  onSelect: (id: string, startFrame: number) => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
  onTrim: (id: string, durationFrames: number) => void;
  onSeek: (frame: number) => void;
  onTransitionChange: (id: string, transition: SceneTransition | undefined) => void;
  /** Multi-mode only: change a scene's lane + start frame. */
  onMoveClip?: (id: string, patch: { track: number; startFrame: number }) => void;
};

const SNAP_SECONDS = 0.5;
const MIN_SECONDS = 0.5;
const MULTI_TRACKS = [2, 1] as const; // top-to-bottom: V2 (overlay), V1 (main)
const MULTI_LANE_HEIGHT = 64;
const MIN_PX_PER_SEC = 8;
const MAX_PX_PER_SEC = 400;

function FadeOverlays({
  scene,
  fps,
  pxPerSecond,
  blockWidth,
}: {
  scene: Scene;
  fps: number;
  pxPerSecond: number;
  blockWidth: number;
}) {
  const fadeIn = Math.max(0, scene.fadeInFrames ?? 0);
  const fadeOut = Math.max(0, scene.fadeOutFrames ?? 0);
  if (fadeIn === 0 && fadeOut === 0) return null;
  const inW = Math.min(blockWidth, (fadeIn / fps) * pxPerSecond);
  const outW = Math.min(blockWidth, (fadeOut / fps) * pxPerSecond);
  return (
    <>
      {fadeIn > 0 && (
        <div
          className="pointer-events-none absolute left-0 top-0 bottom-0 z-[15]"
          style={{
            width: inW,
            background:
              "linear-gradient(to right, rgba(0,0,0,0.65), rgba(0,0,0,0))",
            clipPath: `polygon(0 0, 100% 100%, 0 100%)`,
          }}
          title={`Fade in ${(fadeIn / fps).toFixed(2)}s`}
        />
      )}
      {fadeOut > 0 && (
        <div
          className="pointer-events-none absolute right-0 top-0 bottom-0 z-[15]"
          style={{
            width: outW,
            background:
              "linear-gradient(to left, rgba(0,0,0,0.65), rgba(0,0,0,0))",
            clipPath: `polygon(100% 0, 100% 100%, 0 100%)`,
          }}
          title={`Fade out ${(fadeOut / fps).toFixed(2)}s`}
        />
      )}
    </>
  );
}

function ZoomControls({
  pxPerSecond,
  fitMode,
  onZoomOut,
  onZoomIn,
  onFit,
}: {
  pxPerSecond: number;
  fitMode: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
      <button
        onClick={onZoomOut}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Zoom out"
      >
        <ZoomOut className="h-3 w-3" />
      </button>
      <span className="min-w-[3.5rem] text-center font-mono text-[10px] tabular-nums text-muted-foreground">
        {Math.round(pxPerSecond)} px/s
      </span>
      <button
        onClick={onZoomIn}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Zoom in"
      >
        <ZoomIn className="h-3 w-3" />
      </button>
      <button
        onClick={onFit}
        className={`rounded p-1 ${fitMode ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        title="Fit to width"
      >
        <Maximize2 className="h-3 w-3" />
      </button>
    </div>
  );
}

export function Timeline({
  scenes,
  composition,
  fps,
  width,
  height,
  frame,
  selectedId,
  pxPerSecond: pxPerSecondProp = 80,
  mode = "single",
  onSelect,
  onReorder,
  onTrim,
  onSeek,
  onTransitionChange,
  onMoveClip,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pxPerSecond, setPxPerSecond] = useState<number>(pxPerSecondProp);
  const [fitMode, setFitMode] = useState<boolean>(false);

  const totalFrames = useMemo(() => totalDurationFrames(scenes, mode), [scenes, mode]);
  const totalSeconds = totalFrames / fps;

  // Fit-to-width: observe scroll container width and recompute pxPerSecond.
  useEffect(() => {
    if (!fitMode) return;
    const el = scrollRef.current;
    if (!el) return;
    const recompute = () => {
      const w = el.clientWidth;
      if (w <= 0 || totalSeconds <= 0) return;
      // Leave ~24px right padding so last clip isn't flush.
      const next = Math.max(MIN_PX_PER_SEC, Math.min(MAX_PX_PER_SEC, (w - 24) / totalSeconds));
      setPxPerSecond(next);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitMode, totalSeconds]);

  const zoomBy = (factor: number) => {
    setFitMode(false);
    setPxPerSecond((p) => Math.max(MIN_PX_PER_SEC, Math.min(MAX_PX_PER_SEC, p * factor)));
  };

  const starts = useMemo(() => {
    const arr: number[] = [];
    let acc = 0;
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      arr.push(acc);
      acc += Math.max(1, s.durationFrames);
      const t = s.transitionAfter;
      if (t && i < scenes.length - 1) {
        const next = Math.max(1, scenes[i + 1].durationFrames);
        const cur = Math.max(1, s.durationFrames);
        const maxOverlap = Math.max(0, Math.min(cur, next) - 1);
        acc -= Math.max(0, Math.min(t.durationFrames, maxOverlap));
      }
    }
    return arr;
  }, [scenes]);

  const blocks = scenes.map((s, i) => {
    const startSec =
      mode === "multi"
        ? Math.max(0, s.startFrame ?? 0) / fps
        : starts[i] / fps;
    const durSec = Math.max(1, s.durationFrames) / fps;
    return {
      scene: s,
      idx: i,
      left: startSec * pxPerSecond,
      width: durSec * pxPerSecond,
      startFrame: mode === "multi" ? Math.max(0, s.startFrame ?? 0) : starts[i],
      track: s.track ?? 1,
    };
  });

  const trackWidth = Math.max(totalSeconds * pxPerSecond + 200, 600);

  // ----- TRIM -----
  const [trimming, setTrimming] = useState<{ id: string; startX: number; startDur: number } | null>(null);

  useEffect(() => {
    if (!trimming) return;
    function onMove(e: MouseEvent) {
      if (!trimming) return;
      const dx = e.clientX - trimming.startX;
      const deltaSec = dx / pxPerSecond;
      const newSec = Math.max(MIN_SECONDS, trimming.startDur / fps + deltaSec);
      const snapped = Math.round(newSec / SNAP_SECONDS) * SNAP_SECONDS;
      onTrim(trimming.id, Math.max(1, Math.round(snapped * fps)));
    }
    function onUp() {
      setTrimming(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [trimming, pxPerSecond, fps, onTrim]);

  // ----- DRAG REORDER -----
  const [dragging, setDragging] = useState<{ idx: number; startX: number; dx: number } | null>(null);
  const dropTarget = useRef<number | null>(null);

  // ----- MULTI-MODE: free position drag (h = startFrame, v = track) -----
  const [posDrag, setPosDrag] = useState<{
    id: string;
    startX: number;
    startY: number;
    origStart: number;
    origTrack: number;
    dx: number;
    dy: number;
  } | null>(null);

  useEffect(() => {
    if (!posDrag || mode !== "multi") return;
    function onMove(e: MouseEvent) {
      if (!posDrag) return;
      setPosDrag({ ...posDrag, dx: e.clientX - posDrag.startX, dy: e.clientY - posDrag.startY });
    }
    function onUp() {
      if (!posDrag || !onMoveClip) {
        setPosDrag(null);
        return;
      }
      const deltaSec = posDrag.dx / pxPerSecond;
      const newSec = Math.max(0, posDrag.origStart / fps + deltaSec);
      const snapped = Math.round(newSec / SNAP_SECONDS) * SNAP_SECONDS;
      const newStart = Math.max(0, Math.round(snapped * fps));
      // Vertical: pick lane by absolute y inside lanes container
      const laneShift = Math.round(posDrag.dy / MULTI_LANE_HEIGHT);
      // MULTI_TRACKS = [2,1]; index 0 is top lane (track 2), index 1 is bottom (track 1)
      const origIdx = MULTI_TRACKS.indexOf(posDrag.origTrack as 1 | 2);
      const newIdx = Math.max(0, Math.min(MULTI_TRACKS.length - 1, origIdx + laneShift));
      const newTrack = MULTI_TRACKS[newIdx];
      onMoveClip(posDrag.id, { track: newTrack, startFrame: newStart });
      setPosDrag(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [posDrag, mode, pxPerSecond, fps, onMoveClip]);

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      if (!dragging) return;
      const dx = e.clientX - dragging.startX;
      setDragging({ ...dragging, dx });
      // Compute target idx from x position relative to track
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const localX = e.clientX - rect.left + track.scrollLeft;
      let target = scenes.length - 1;
      let acc = 0;
      for (let i = 0; i < scenes.length; i++) {
        const w = (Math.max(1, scenes[i].durationFrames) / fps) * pxPerSecond;
        if (localX < acc + w / 2) {
          target = i;
          break;
        }
        acc += w;
      }
      dropTarget.current = target;
    }
    function onUp() {
      const from = dragging!.idx;
      const to = dropTarget.current;
      if (to !== null && to !== from) onReorder(from, to);
      dropTarget.current = null;
      setDragging(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, scenes, fps, pxPerSecond, onReorder]);

  // ----- RULER click → seek -----
  function rulerSeek(e: React.MouseEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const localX = e.clientX - rect.left + track.scrollLeft;
    const sec = Math.max(0, localX / pxPerSecond);
    onSeek(Math.min(totalFrames - 1, Math.round(sec * fps)));
  }

  const playheadLeft = (frame / fps) * pxPerSecond;

  // Ruler ticks every second
  const ticks: number[] = [];
  for (let s = 0; s <= Math.ceil(totalSeconds) + 5; s++) ticks.push(s);

  // ----- MULTI-MODE rendering -----
  if (mode === "multi") {
    const lanesHeight = MULTI_TRACKS.length * MULTI_LANE_HEIGHT;
    return (
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Timeline · Multi-track
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] text-muted-foreground md:inline">
              Drag to reposition · between lanes to change track · right edge to trim
            </span>
            <ZoomControls
              pxPerSecond={pxPerSecond}
              fitMode={fitMode}
              onZoomOut={() => zoomBy(1 / 1.4)}
              onZoomIn={() => zoomBy(1.4)}
              onFit={() => setFitMode((v) => !v)}
            />
          </div>
        </div>
        <div className="overflow-x-auto" ref={(el) => { trackRef.current = el; scrollRef.current = el; }}>
          <div className="relative" style={{ width: trackWidth }}>
            <div
              onClick={rulerSeek}
              className="relative h-6 cursor-pointer border-b border-border bg-muted/30"
            >
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute top-0 bottom-0 border-l border-border/60 pl-1 text-[10px] text-muted-foreground"
                  style={{ left: t * pxPerSecond }}
                >
                  {t}s
                </div>
              ))}
            </div>
            <div
              className="relative bg-background/40"
              style={{ height: lanesHeight }}
            >
              {/* Lane labels + dividers */}
              {MULTI_TRACKS.map((tr, i) => (
                <div
                  key={tr}
                  className="absolute left-0 right-0 border-b border-border/40"
                  style={{
                    top: i * MULTI_LANE_HEIGHT,
                    height: MULTI_LANE_HEIGHT,
                  }}
                >
                  <div className="absolute left-1 top-1 z-0 rounded bg-muted/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {tr === 2 ? "V2 · Overlay" : "V1 · Main"}
                  </div>
                </div>
              ))}

              {/* Clips */}
              {blocks.map((b) => {
                const isSelected = b.scene.id === selectedId;
                const isDragging = posDrag?.id === b.scene.id;
                const dx = isDragging ? posDrag!.dx : 0;
                const dy = isDragging ? posDrag!.dy : 0;
                const laneIdx = MULTI_TRACKS.indexOf(b.track as 1 | 2);
                const top = (laneIdx < 0 ? MULTI_TRACKS.length - 1 : laneIdx) * MULTI_LANE_HEIGHT + 4;
                return (
                  <div
                    key={b.scene.id}
                    className={`group absolute overflow-hidden rounded-md border-2 select-none ${
                      isSelected ? "border-primary" : "border-border"
                    } ${isDragging ? "z-20 opacity-80" : "z-10"}`}
                    style={{
                      left: b.left + dx,
                      top: top + dy,
                      width: Math.max(20, b.width),
                      height: MULTI_LANE_HEIGHT - 8,
                      background: ACCENT_HEX[b.scene.accent] + "44",
                      cursor: isDragging ? "grabbing" : "grab",
                    }}
                    onMouseDown={(e) => {
                      if ((e.target as HTMLElement).dataset.handle === "trim") return;
                      onSelect(b.scene.id, b.startFrame);
                      setPosDrag({
                        id: b.scene.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        origStart: b.startFrame,
                        origTrack: b.track,
                        dx: 0,
                        dy: 0,
                      });
                    }}
                  >
                    <div className="pointer-events-none relative flex h-full flex-col justify-between p-1.5">
                      <div className="truncate text-[10px] font-semibold text-foreground drop-shadow">
                        {b.idx + 1}. {SCENE_TEMPLATE_LABEL[b.scene.type]}
                      </div>
                      <div className="text-[10px] font-mono text-foreground/80 drop-shadow">
                        {(b.scene.durationFrames / fps).toFixed(1)}s
                      </div>
                    </div>
                    <FadeOverlays
                      scene={b.scene}
                      fps={fps}
                      pxPerSecond={pxPerSecond}
                      blockWidth={Math.max(20, b.width)}
                    />
                    <div
                      data-handle="trim"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setTrimming({
                          id: b.scene.id,
                          startX: e.clientX,
                          startDur: b.scene.durationFrames,
                        });
                      }}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-primary/50 opacity-0 group-hover:opacity-100 hover:opacity-100"
                      title="Drag to trim duration"
                    />
                  </div>
                );
              })}

              {/* Playhead */}
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-primary"
                style={{ left: playheadLeft }}
              >
                <div className="absolute -top-1 -left-[5px] h-2 w-[11px] rounded-sm bg-primary" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Timeline
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] text-muted-foreground md:inline">
            Drag to reorder · right edge to trim · seam (○) for transition
          </span>
          <ZoomControls
            pxPerSecond={pxPerSecond}
            fitMode={fitMode}
            onZoomOut={() => zoomBy(1 / 1.4)}
            onZoomIn={() => zoomBy(1.4)}
            onFit={() => setFitMode((v) => !v)}
          />
        </div>
      </div>
      <div className="overflow-x-auto" ref={(el) => { trackRef.current = el; scrollRef.current = el; }}>
        <div className="relative" style={{ width: trackWidth }}>
          {/* Ruler */}
          <div
            onClick={rulerSeek}
            className="relative h-6 cursor-pointer border-b border-border bg-muted/30"
          >
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 bottom-0 border-l border-border/60 pl-1 text-[10px] text-muted-foreground"
                style={{ left: t * pxPerSecond }}
              >
                {t}s
              </div>
            ))}
          </div>

          {/* Track */}
          <div className="relative h-20 bg-background/40">
            {blocks.map((b) => {
              const isSelected = b.scene.id === selectedId;
              const isDragging = dragging?.idx === b.idx;
              const dx = isDragging ? dragging!.dx : 0;
              return (
                <div
                  key={b.scene.id}
                  className={`group absolute top-1 bottom-1 rounded-md border-2 select-none ${
                    isSelected ? "border-primary" : "border-border"
                  } ${isDragging ? "opacity-70 z-40" : isSelected ? "z-40" : "z-10 hover:z-40"}`}
                  style={{
                    left: b.left + dx,
                    width: Math.max(20, b.width),
                    background: ACCENT_HEX[b.scene.accent] + "33",
                    cursor: isDragging ? "grabbing" : "grab",
                  }}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).dataset.handle === "trim") return;
                    setDragging({ idx: b.idx, startX: e.clientX, dx: 0 });
                    onSelect(b.scene.id, b.startFrame);
                  }}
                >
                  <div className="pointer-events-none relative flex h-full flex-col justify-between p-1.5">
                    <div className="truncate text-[10px] font-semibold text-foreground drop-shadow">
                      {b.idx + 1}. {SCENE_TEMPLATE_LABEL[b.scene.type]}
                    </div>
                    <div className="text-[10px] font-mono text-foreground/80 drop-shadow">
                      {(b.scene.durationFrames / fps).toFixed(1)}s
                    </div>
                  </div>
                  <FadeOverlays
                    scene={b.scene}
                    fps={fps}
                    pxPerSecond={pxPerSecond}
                    blockWidth={Math.max(20, b.width)}
                  />
                  {/* Trim handle (right edge) */}
                  <div
                    data-handle="trim"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setTrimming({
                        id: b.scene.id,
                        startX: e.clientX,
                        startDur: b.scene.durationFrames,
                      });
                    }}
                    className="absolute -right-1 top-0 bottom-0 z-40 w-3 cursor-ew-resize rounded-sm bg-primary/70 opacity-0 group-hover:opacity-100 hover:opacity-100"
                    title="Drag to trim duration"
                  />
                </div>
              );
            })}

            {/* Playhead */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-primary"
              style={{ left: playheadLeft }}
            >
              <div className="absolute -top-1 -left-[5px] h-2 w-[11px] rounded-sm bg-primary" />
            </div>
          </div>

          {/* Transition lane (below the clip track, like multi-track UX) */}
          <div className="relative h-6 border-t border-border/40 bg-muted/20">
            {blocks.slice(0, -1).map((b) => {
              const t = b.scene.transitionAfter;
              const seamLeft = b.left + b.width;
              return (
                <Popover key={b.scene.id + "-seam"}>
                  <PopoverTrigger asChild>
                    <button
                      title={t ? `${TRANSITION_LABEL[t.kind]} ${(t.durationFrames / fps).toFixed(1)}s` : "Add transition"}
                      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border text-[10px] font-bold leading-none ${
                        t
                          ? "h-5 px-2 border-primary bg-primary text-primary-foreground"
                          : "h-4 w-4 border-border bg-background text-muted-foreground opacity-70 hover:opacity-100"
                      }`}
                      style={{ left: seamLeft }}
                    >
                      {t ? TRANSITION_LABEL[t.kind] : "+"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 space-y-3 p-3" align="center">
                    <div className="text-xs font-semibold">Transition</div>
                    <div className="grid grid-cols-2 gap-1">
                      {(Object.keys(TRANSITION_LABEL) as TransitionKind[]).map((k) => (
                        <button
                          key={k}
                          onClick={() =>
                            onTransitionChange(b.scene.id, {
                              kind: k,
                              durationFrames: t?.durationFrames ?? Math.round(fps * 0.5),
                            })
                          }
                          className={`rounded-md border px-2 py-1 text-xs ${
                            t?.kind === k
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          {TRANSITION_LABEL[k]}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Duration</span>
                        <span className="font-mono">
                          {((t?.durationFrames ?? Math.round(fps * 0.5)) / fps).toFixed(2)}s
                        </span>
                      </div>
                      <input
                        type="range"
                        min={Math.max(1, Math.round(fps * 0.1))}
                        max={Math.round(fps * 2)}
                        step={1}
                        value={t?.durationFrames ?? Math.round(fps * 0.5)}
                        onChange={(e) =>
                          onTransitionChange(b.scene.id, {
                            kind: t?.kind ?? "fade",
                            durationFrames: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full"
                      />
                    </div>
                    {t ? (
                      <button
                        onClick={() => onTransitionChange(b.scene.id, undefined)}
                        className="flex w-full items-center justify-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                      >
                        <X className="h-3 w-3" /> Remove transition
                      </button>
                    ) : null}
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}