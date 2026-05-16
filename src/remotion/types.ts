export type AccentKey = "marine" | "brons" | "mos" | "ocean";

export const ACCENT_HEX: Record<AccentKey, string> = {
  marine: "#003366",
  brons: "#cc9933",
  mos: "#619623",
  ocean: "#008ec6",
};

export type TransitionKind = "fade" | "slide" | "wipe" | "flip";

export type SceneTransition = {
  kind: TransitionKind;
  durationFrames: number;
};

export const TRANSITION_LABEL: Record<TransitionKind, string> = {
  fade: "Fade",
  slide: "Slide",
  wipe: "Wipe",
  flip: "Flip",
};

export type SceneBase = {
  id: string;
  durationFrames: number;
  accent: AccentKey;
  transitionAfter?: SceneTransition;
  /** Track lane (1 = main V1, 2 = overlay V2). Defaults to 1. */
  track?: number;
  /** Absolute start frame on the track. Optional in single-mode (derived from order). */
  startFrame?: number;
  /** Fade-in length in frames (opacity 0→1 from clip start). Phase-4 keyframes will supersede this. */
  fadeInFrames?: number;
  /** Fade-out length in frames (opacity 1→0 at clip end). Phase-4 keyframes will supersede this. */
  fadeOutFrames?: number;
};

export type TitleScene = SceneBase & {
  type: "title";
  title: string;
  subtitle: string;
};

export type TalkingPointScene = SceneBase & {
  type: "talking-point";
  heading: string;
  bullets: string[];
};

export type ImageCaptionScene = SceneBase & {
  type: "image-caption";
  imageUrl: string;
  caption: string;
};

export type OutroScene = SceneBase & {
  type: "outro";
  message: string;
  signoff: string;
};

export type CinematicTitleScene = SceneBase & {
  type: "cinematic-title";
  videoUrl: string;
  title: string;
  subtitle: string;
};

export type SplitVideoScene = SceneBase & {
  type: "split-video";
  videoUrl: string;
  heading: string;
  body: string;
  videoSide: "left" | "right";
};

export type LowerThirdScene = SceneBase & {
  type: "lower-third";
  videoUrl: string;
  name: string;
  role: string;
};

export type QuoteVideoScene = SceneBase & {
  type: "quote-video";
  videoUrl: string;
  quote: string;
  attribution: string;
};

export type VideoOnlyScene = SceneBase & {
  type: "video-only";
  videoUrl: string;
  fit?: "cover" | "contain";
};

export type Scene =
  | TitleScene
  | TalkingPointScene
  | ImageCaptionScene
  | OutroScene
  | CinematicTitleScene
  | SplitVideoScene
  | LowerThirdScene
  | QuoteVideoScene
  | VideoOnlyScene;

export type SceneType = Scene["type"];

export type ProjectComposition = {
  scenes: Scene[];
  audioUrl: string | null;
  fps: number;
  width: number;
  height: number;
  mode?: ProjectMode;
};

export type ProjectMode = "single" | "multi";

export const DEFAULT_FPS = 30;
export const DEFAULT_WIDTH = 1920;
export const DEFAULT_HEIGHT = 1080;

/**
 * Fill in missing track/startFrame on scenes so the renderer + timeline can
 * always assume they're present. In single mode, startFrame is rebuilt from
 * array order with transition overlaps. In multi mode, missing values fall
 * back to track 1 with sequential start frames.
 */
export function normalizeScenes(scenes: Scene[], mode: ProjectMode = "single"): Scene[] {
  if (mode === "single") {
    let acc = 0;
    return scenes.map((s, i) => {
      const dur = Math.max(1, s.durationFrames);
      const start = acc;
      acc += dur;
      const t = s.transitionAfter;
      if (t && i < scenes.length - 1) {
        const next = Math.max(1, scenes[i + 1].durationFrames);
        const maxOverlap = Math.max(0, Math.min(dur, next) - 1);
        acc -= Math.max(0, Math.min(t.durationFrames, maxOverlap));
      }
      return { ...s, track: 1, startFrame: start } as Scene;
    });
  }
  // multi: keep what's there, fill gaps deterministically
  let acc = 0;
  return scenes.map((s) => {
    const track = s.track ?? 1;
    const startFrame = s.startFrame ?? acc;
    acc = Math.max(acc, startFrame + Math.max(1, s.durationFrames));
    return { ...s, track, startFrame } as Scene;
  });
}

export function totalDurationFrames(scenes: Scene[], mode: ProjectMode = "single"): number {
  if (mode === "multi") {
    let max = 0;
    for (const s of scenes) {
      const start = s.startFrame ?? 0;
      const end = start + Math.max(1, s.durationFrames);
      if (end > max) max = end;
    }
    return Math.max(1, max);
  }
  let total = 0;
  for (let i = 0; i < scenes.length; i++) {
    total += Math.max(1, scenes[i].durationFrames);
    // Transitions overlap the next scene, so subtract the overlap.
    const t = scenes[i].transitionAfter;
    if (t && i < scenes.length - 1) {
      const next = Math.max(1, scenes[i + 1].durationFrames);
      const cur = Math.max(1, scenes[i].durationFrames);
      const maxOverlap = Math.max(0, Math.min(cur, next) - 1);
      total -= Math.max(0, Math.min(t.durationFrames, maxOverlap));
    }
  }
  return Math.max(1, total);
}

export function makeScene(type: SceneType): Scene {
  const id = (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)) as string;
  switch (type) {
    case "title":
      return {
        id,
        type: "title",
        durationFrames: 90,
        accent: "brons",
        title: "Lecture title",
        subtitle: "A short, descriptive subtitle",
      };
    case "talking-point":
      return {
        id,
        type: "talking-point",
        durationFrames: 150,
        accent: "marine",
        heading: "Key points",
        bullets: ["First point", "Second point", "Third point"],
      };
    case "image-caption":
      return {
        id,
        type: "image-caption",
        durationFrames: 120,
        accent: "ocean",
        imageUrl: "",
        caption: "Describe what learners are seeing.",
      };
    case "outro":
      return {
        id,
        type: "outro",
        durationFrames: 90,
        accent: "brons",
        message: "Thanks for watching",
        signoff: "Tilburg University",
      };
    case "cinematic-title":
      return {
        id,
        type: "cinematic-title",
        durationFrames: 150,
        accent: "brons",
        videoUrl: "",
        title: "Big idea, in one line",
        subtitle: "Tilburg University",
      };
    case "split-video":
      return {
        id,
        type: "split-video",
        durationFrames: 180,
        accent: "marine",
        videoUrl: "",
        heading: "What you'll learn",
        body: "A short paragraph that explains the concept clearly and concisely.",
        videoSide: "left",
      };
    case "lower-third":
      return {
        id,
        type: "lower-third",
        durationFrames: 150,
        accent: "brons",
        videoUrl: "",
        name: "Dr. Jane Doe",
        role: "Associate Professor, Tilburg School of Economics and Management",
      };
    case "quote-video":
      return {
        id,
        type: "quote-video",
        durationFrames: 180,
        accent: "ocean",
        videoUrl: "",
        quote: "Education is the most powerful weapon which you can use to change the world.",
        attribution: "Nelson Mandela",
      };
    case "video-only":
      return {
        id,
        type: "video-only",
        durationFrames: 90,
        accent: "marine",
        videoUrl: "",
        fit: "cover",
      };
  }
}

export const SCENE_TEMPLATE_LABEL: Record<SceneType, string> = {
  title: "Title card",
  "talking-point": "Talking point",
  "image-caption": "Image + caption",
  outro: "Outro",
  "cinematic-title": "Cinematic title",
  "split-video": "Split video + text",
  "lower-third": "Lower-third over video",
  "quote-video": "Quote over video",
  "video-only": "Video only",
};