import { AbsoluteFill, Audio, Sequence, useCurrentFrame, interpolate } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { transitionIntoScene, type ProjectComposition, type Scene, type TransitionKind } from "./types";
import { TitleScene } from "./scenes/TitleScene";
import { TalkingPointScene } from "./scenes/TalkingPointScene";
import { ImageCaptionScene } from "./scenes/ImageCaptionScene";
import { OutroScene } from "./scenes/OutroScene";
import { CinematicTitleScene } from "./scenes/CinematicTitleScene";
import { SplitVideoScene } from "./scenes/SplitVideoScene";
import { LowerThirdScene } from "./scenes/LowerThirdScene";
import { QuoteVideoScene } from "./scenes/QuoteVideoScene";
import { VideoOnlyScene } from "./scenes/VideoOnlyScene";

function SceneInner({ scene }: { scene: Scene }) {
  switch (scene.type) {
    case "title":
      return <TitleScene {...scene} />;
    case "talking-point":
      return <TalkingPointScene {...scene} />;
    case "image-caption":
      return <ImageCaptionScene {...scene} />;
    case "outro":
      return <OutroScene {...scene} />;
    case "cinematic-title":
      return <CinematicTitleScene {...scene} />;
    case "split-video":
      return <SplitVideoScene {...scene} />;
    case "lower-third":
      return <LowerThirdScene {...scene} />;
    case "quote-video":
      return <QuoteVideoScene {...scene} />;
    case "video-only":
      return <VideoOnlyScene {...scene} />;
  }
}

function RenderScene({ scene }: { scene: Scene }) {
  const frame = useCurrentFrame();
  const dur = Math.max(1, scene.durationFrames);
  const fadeIn = Math.max(0, Math.min(scene.fadeInFrames ?? 0, dur));
  const fadeOut = Math.max(0, Math.min(scene.fadeOutFrames ?? 0, dur));
  let opacity = 1;
  if (fadeIn > 0 || fadeOut > 0) {
    const inEnd = fadeIn;
    const outStart = dur - fadeOut;
    // Build a monotonic stop list to keep interpolate happy.
    const stops: number[] = [0];
    const values: number[] = [fadeIn > 0 ? 0 : 1];
    if (fadeIn > 0) {
      stops.push(inEnd);
      values.push(1);
    }
    if (fadeOut > 0 && outStart > stops[stops.length - 1]) {
      stops.push(outStart);
      values.push(1);
    }
    stops.push(dur);
    values.push(fadeOut > 0 ? 0 : 1);
    opacity = interpolate(frame, stops, values, {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }
  return (
    <AbsoluteFill style={{ opacity }}>
      <SceneInner scene={scene} />
    </AbsoluteFill>
  );
}

function presentationFor(kind: TransitionKind): any {
  switch (kind) {
    case "fade":
      return fade();
    case "slide":
      return slide();
    case "wipe":
      return wipe();
    case "flip":
      return flip();
  }
}

export function MainComposition({ scenes, audioUrl, mode }: ProjectComposition) {
  if (mode === "multi") {
    const tracks = new Map<number, Scene[]>();
    for (const s of scenes) {
      const t = s.track ?? 1;
      if (!tracks.has(t)) tracks.set(t, []);
      tracks.get(t)!.push(s);
    }
    const sortedTrackKeys = Array.from(tracks.keys()).sort((a, b) => a - b);
    return (
      <AbsoluteFill style={{ backgroundColor: "#0b1a2e" }}>
        {sortedTrackKeys.map((track) => {
          const clips = tracks
            .get(track)!
            .slice()
            .sort((a, b) => (a.startFrame ?? 0) - (b.startFrame ?? 0));
          if (clips.length === 0) return null;
          const trackStart = clips[0].startFrame ?? 0;
          const items: React.ReactNode[] = [];
          for (let i = 0; i < clips.length; i++) {
            const s = clips[i];
            const dur = Math.max(1, s.durationFrames);
            items.push(
              <TransitionSeries.Sequence key={s.id} durationInFrames={dur}>
                <RenderScene scene={s} />
              </TransitionSeries.Sequence>,
            );
            const next = clips[i + 1];
            if (!next) continue;
            const curStart = s.startFrame ?? 0;
            const nextStart = next.startFrame ?? 0;
            const nextDur = Math.max(1, next.durationFrames);
            const gap = nextStart - (curStart + dur);
            const t = next.transitionBefore ?? s.transitionAfter;
            if (gap > 0) {
              items.push(
                <TransitionSeries.Sequence
                  key={s.id + "-gap"}
                  durationInFrames={gap}
                >
                  <AbsoluteFill />
                </TransitionSeries.Sequence>,
              );
            }
            if (t) {
              const maxOverlap = Math.max(1, Math.min(dur, nextDur) - 1);
              const tFrames = Math.max(1, Math.min(t.durationFrames, maxOverlap));
              items.push(
                <TransitionSeries.Transition
                  key={s.id + "-t"}
                  presentation={presentationFor(t.kind)}
                  timing={linearTiming({ durationInFrames: tFrames })}
                />,
              );
            }
          }
          return (
            <AbsoluteFill key={track} style={{ zIndex: track }}>
              <Sequence from={trackStart} layout="none">
                <TransitionSeries>{items}</TransitionSeries>
              </Sequence>
            </AbsoluteFill>
          );
        })}
        {audioUrl ? <Audio src={audioUrl} /> : null}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b1a2e" }}>
      <TransitionSeries>
        {scenes.flatMap((s, i) => {
          const dur = Math.max(1, s.durationFrames);
          const items: React.ReactNode[] = [
            <TransitionSeries.Sequence key={s.id} durationInFrames={dur}>
              <RenderScene scene={s} />
            </TransitionSeries.Sequence>,
          ];
          const t = transitionIntoScene(scenes, i + 1);
          if (t && i < scenes.length - 1) {
            const next = Math.max(1, scenes[i + 1].durationFrames);
            const maxOverlap = Math.max(1, Math.min(dur, next) - 1);
            const tFrames = Math.max(1, Math.min(t.durationFrames, maxOverlap));
            items.push(
              <TransitionSeries.Transition
                key={s.id + "-t"}
                presentation={presentationFor(t.kind)}
                timing={linearTiming({ durationInFrames: tFrames })}
              />,
            );
          }
          return items;
        })}
      </TransitionSeries>
      {audioUrl ? <Audio src={audioUrl} /> : null}
    </AbsoluteFill>
  );
}