import { AbsoluteFill, Audio, Sequence } from "remotion";
import type { ProjectComposition, Scene } from "./types";
import { TitleScene } from "./scenes/TitleScene";
import { TalkingPointScene } from "./scenes/TalkingPointScene";
import { ImageCaptionScene } from "./scenes/ImageCaptionScene";
import { OutroScene } from "./scenes/OutroScene";

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
  }
}

export function MainComposition({ scenes, audioUrl }: ProjectComposition) {
  let cursor = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b1a2e" }}>
      {scenes.map((s) => {
        const from = cursor;
        cursor += Math.max(1, s.durationFrames);
        return (
          <Sequence key={s.id} from={from} durationInFrames={Math.max(1, s.durationFrames)}>
            <RenderScene scene={s} />
          </Sequence>
        );
      })}
      {audioUrl ? <Audio src={audioUrl} /> : null}
    </AbsoluteFill>
  );
}