import { AbsoluteFill, Audio } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import type { ProjectComposition, Scene, TransitionKind } from "./types";
import { TitleScene } from "./scenes/TitleScene";
import { TalkingPointScene } from "./scenes/TalkingPointScene";
import { ImageCaptionScene } from "./scenes/ImageCaptionScene";
import { OutroScene } from "./scenes/OutroScene";
import { CinematicTitleScene } from "./scenes/CinematicTitleScene";
import { SplitVideoScene } from "./scenes/SplitVideoScene";
import { LowerThirdScene } from "./scenes/LowerThirdScene";
import { QuoteVideoScene } from "./scenes/QuoteVideoScene";

function RenderScene({ scene }: { scene: Scene }) {
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
  }
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

export function MainComposition({ scenes, audioUrl }: ProjectComposition) {
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
          const t = s.transitionAfter;
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