import { useEffect, useMemo, useRef, useState } from "react";
import { MainComposition } from "@/remotion/MainComposition";
import { Thumbnail } from "@remotion/player";
import type { ProjectComposition, Scene } from "@/remotion/types";
import { SCENE_TEMPLATE_LABEL, ACCENT_HEX, totalDurationFrames } from "@/remotion/types";

type Props = {
  scenes: Scene[];
  composition: ProjectComposition;
  fps: number;
  width: number;
  height: number;
  frame: number;
  selectedId: string | null;
  pxPerSecond?: number;
  onSelect: (id: string, startFrame: number) => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
  onTrim: (id: string, durationFrames: number) => void;
  onSeek: (frame: number) => void;
};

const SNAP_SECONDS = 0.5;
const MIN_SECONDS = 0.5;

export function Timeline({
  scenes,
  composition,
  fps,
  width,
  height,
  frame,
  selectedId,
  pxPerSecond = 80,
  onSelect,
  onReorder,
  onTrim,
  onSeek,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const totalFrames = useMemo(() => totalDurationFrames(scenes), [scenes]);
  const totalSeconds = totalFrames / fps;

  const starts = useMemo(() => {
    const arr: number[] = [];
    let acc = 0;
    for (const s of scenes) {
      arr.push(acc);
      acc += Math.max(1, s.durationFrames);
    }
    return arr;
  }, [scenes]);

  const blocks = scenes.map((s, i) => {
    const startSec = starts[i] / fps;
    const durSec = Math.max(1, s.durationFrames) / fps;
    return {
      scene: s,
      idx: i,
      left: startSec * pxPerSecond,
      width: durSec * pxPerSecond,
      startFrame: starts[i],
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

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Timeline
        </div>
        <div className="text-[10px] text-muted-foreground">
          Drag block to reorder · Drag right edge to trim (snap 0.5s) · Click ruler to seek
        </div>
      </div>
      <div className="overflow-x-auto" ref={trackRef}>
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
                  className={`group absolute top-1 bottom-1 overflow-hidden rounded-md border-2 select-none ${
                    isSelected ? "border-primary" : "border-border"
                  } ${isDragging ? "opacity-70 z-20" : "z-10"}`}
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
                  <div className="pointer-events-none absolute inset-0">
                    <Thumbnail
                      component={MainComposition}
                      inputProps={composition}
                      durationInFrames={Math.max(1, totalFrames)}
                      fps={fps}
                      compositionWidth={width}
                      compositionHeight={height}
                      frameToDisplay={Math.min(
                        totalFrames - 1,
                        b.startFrame + Math.floor(b.scene.durationFrames / 2),
                      )}
                      style={{ width: "100%", height: "100%", opacity: 0.55 }}
                    />
                  </div>
                  <div className="pointer-events-none relative flex h-full flex-col justify-between p-1.5">
                    <div className="truncate text-[10px] font-semibold text-foreground drop-shadow">
                      {b.idx + 1}. {SCENE_TEMPLATE_LABEL[b.scene.type]}
                    </div>
                    <div className="text-[10px] font-mono text-foreground/80 drop-shadow">
                      {(b.scene.durationFrames / fps).toFixed(1)}s
                    </div>
                  </div>
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