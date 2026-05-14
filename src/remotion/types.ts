export type AccentKey = "marine" | "brons" | "mos" | "ocean";

export const ACCENT_HEX: Record<AccentKey, string> = {
  marine: "#003366",
  brons: "#cc9933",
  mos: "#619623",
  ocean: "#008ec6",
};

export type SceneBase = {
  id: string;
  durationFrames: number;
  accent: AccentKey;
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

export type Scene =
  | TitleScene
  | TalkingPointScene
  | ImageCaptionScene
  | OutroScene
  | CinematicTitleScene
  | SplitVideoScene
  | LowerThirdScene
  | QuoteVideoScene;

export type SceneType = Scene["type"];

export type ProjectComposition = {
  scenes: Scene[];
  audioUrl: string | null;
  fps: number;
  width: number;
  height: number;
};

export const DEFAULT_FPS = 30;
export const DEFAULT_WIDTH = 1920;
export const DEFAULT_HEIGHT = 1080;

export function totalDurationFrames(scenes: Scene[]): number {
  const total = scenes.reduce((acc, s) => acc + Math.max(1, s.durationFrames), 0);
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
};