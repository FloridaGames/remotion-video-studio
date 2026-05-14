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

export type Scene =
  | TitleScene
  | TalkingPointScene
  | ImageCaptionScene
  | OutroScene;

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
  }
}

export const SCENE_TEMPLATE_LABEL: Record<SceneType, string> = {
  title: "Title card",
  "talking-point": "Talking point",
  "image-caption": "Image + caption",
  outro: "Outro",
};