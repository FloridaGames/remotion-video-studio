import { Composition } from "remotion";
import { MainComposition } from "./remotion/MainComposition";
import {
  DEFAULT_FPS,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  totalDurationFrames,
  type ProjectComposition,
} from "./remotion/types";

const defaultProps: ProjectComposition = {
  scenes: [],
  audioUrl: null,
  fps: DEFAULT_FPS,
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
};

export const RemotionRoot = () => (
  <Composition
    id="main"
    component={MainComposition as any}
    defaultProps={defaultProps}
    durationInFrames={1}
    fps={DEFAULT_FPS}
    width={DEFAULT_WIDTH}
    height={DEFAULT_HEIGHT}
    calculateMetadata={({ props }) => {
      const p = props as ProjectComposition;
      return {
        durationInFrames: Math.max(1, totalDurationFrames(p.scenes)),
        fps: p.fps || DEFAULT_FPS,
        width: p.width || DEFAULT_WIDTH,
        height: p.height || DEFAULT_HEIGHT,
      };
    }}
  />
);