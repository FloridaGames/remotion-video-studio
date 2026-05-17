import {
  ANIMATABLE_DEFAULTS,
  type AnimatableProperty,
  type EasingKind,
  type Keyframe,
  type Scene,
} from "./types";

function easeFn(t: number, kind: EasingKind = "linear"): number {
  const c = Math.max(0, Math.min(1, t));
  switch (kind) {
    case "ease-in":
      return c * c;
    case "ease-out":
      return 1 - (1 - c) * (1 - c);
    case "ease-in-out":
      return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
    case "linear":
    default:
      return c;
  }
}

/**
 * Resolve the effective value of an animatable property at a given local frame
 * within the scene. Falls back to static transform, then to defaults.
 */
export function valueAt(scene: Scene, prop: AnimatableProperty, localFrame: number): number {
  const base = scene.transform?.[prop] ?? ANIMATABLE_DEFAULTS[prop];
  const kfs = (scene.keyframes ?? [])
    .filter((k) => k.property === prop)
    .sort((a, b) => a.frame - b.frame);
  if (kfs.length === 0) return base;
  if (localFrame <= kfs[0].frame) return kfs[0].value;
  const last = kfs[kfs.length - 1];
  if (localFrame >= last.frame) return last.value;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (localFrame >= a.frame && localFrame <= b.frame) {
      const span = Math.max(1, b.frame - a.frame);
      const t = (localFrame - a.frame) / span;
      const e = easeFn(t, a.easing ?? "linear");
      return a.value + (b.value - a.value) * e;
    }
  }
  return base;
}

/** All transform values for a scene at a given local frame. */
export function computeTransform(scene: Scene, localFrame: number) {
  return {
    x: valueAt(scene, "x", localFrame),
    y: valueAt(scene, "y", localFrame),
    scale: valueAt(scene, "scale", localFrame),
    rotation: valueAt(scene, "rotation", localFrame),
    opacity: valueAt(scene, "opacity", localFrame),
    cropTop: valueAt(scene, "cropTop", localFrame),
    cropRight: valueAt(scene, "cropRight", localFrame),
    cropBottom: valueAt(scene, "cropBottom", localFrame),
    cropLeft: valueAt(scene, "cropLeft", localFrame),
  };
}

/**
 * Preset keyframe generators. Each returns the keyframes to ADD (caller is
 * responsible for merging — typically by removing any existing keyframes for
 * the same properties first so presets stay predictable).
 */
export type PresetKey =
  | "ken-burns"
  | "fade-in"
  | "fade-out"
  | "slide-in-left"
  | "slide-in-right"
  | "scale-up-reveal";

export const PRESET_LABEL: Record<PresetKey, string> = {
  "ken-burns": "Ken Burns",
  "fade-in": "Fade in",
  "fade-out": "Fade out",
  "slide-in-left": "Slide in from left",
  "slide-in-right": "Slide in from right",
  "scale-up-reveal": "Scale-up reveal",
};

/** Properties that a given preset writes to (used to clear before applying). */
export function presetProperties(preset: PresetKey): AnimatableProperty[] {
  switch (preset) {
    case "ken-burns":
      return ["scale", "x"];
    case "fade-in":
    case "fade-out":
      return ["opacity"];
    case "slide-in-left":
    case "slide-in-right":
      return ["x", "opacity"];
    case "scale-up-reveal":
      return ["scale", "opacity"];
  }
}

export function buildPresetKeyframes(
  preset: PresetKey,
  durationFrames: number,
  fps: number,
): Keyframe[] {
  const dur = Math.max(1, durationFrames);
  const half = Math.min(dur, Math.round(fps * 0.5));
  switch (preset) {
    case "ken-burns":
      return [
        { property: "scale", frame: 0, value: 1, easing: "ease-in-out" },
        { property: "scale", frame: dur, value: 1.15, easing: "linear" },
      ];
    case "fade-in":
      return [
        { property: "opacity", frame: 0, value: 0, easing: "ease-out" },
        { property: "opacity", frame: half, value: 1, easing: "linear" },
      ];
    case "fade-out":
      return [
        { property: "opacity", frame: Math.max(0, dur - half), value: 1, easing: "ease-in" },
        { property: "opacity", frame: dur, value: 0, easing: "linear" },
      ];
    case "slide-in-left":
      return [
        { property: "x", frame: 0, value: -400, easing: "ease-out" },
        { property: "x", frame: half, value: 0, easing: "linear" },
        { property: "opacity", frame: 0, value: 0, easing: "ease-out" },
        { property: "opacity", frame: half, value: 1, easing: "linear" },
      ];
    case "slide-in-right":
      return [
        { property: "x", frame: 0, value: 400, easing: "ease-out" },
        { property: "x", frame: half, value: 0, easing: "linear" },
        { property: "opacity", frame: 0, value: 0, easing: "ease-out" },
        { property: "opacity", frame: half, value: 1, easing: "linear" },
      ];
    case "scale-up-reveal":
      return [
        { property: "scale", frame: 0, value: 0.85, easing: "ease-out" },
        { property: "scale", frame: half, value: 1, easing: "linear" },
        { property: "opacity", frame: 0, value: 0, easing: "ease-out" },
        { property: "opacity", frame: half, value: 1, easing: "linear" },
      ];
  }
}
