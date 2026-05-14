import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ACCENT_HEX, type OutroScene as Props } from "../types";

export function OutroScene(props: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = ACCENT_HEX[props.accent];
  const m = spring({ frame, fps, config: { damping: 18 } });
  const s = spring({ frame: frame - 14, fps, config: { damping: 18 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#003366",
        color: "white",
        fontFamily: "Arial, sans-serif",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: "8%",
      }}
    >
      <div
        style={{
          fontSize: 96,
          fontWeight: 700,
          opacity: m,
          transform: `scale(${0.92 + m * 0.08})`,
          letterSpacing: -1.5,
        }}
      >
        {props.message}
      </div>
      <div
        style={{
          marginTop: 40,
          height: 4,
          width: interpolate(frame, [10, 40], [0, 320], { extrapolateRight: "clamp" }),
          background: accent,
        }}
      />
      <div
        style={{
          fontSize: 36,
          marginTop: 32,
          opacity: s * 0.85,
          color: "#e8edf3",
        }}
      >
        {props.signoff}
      </div>
    </AbsoluteFill>
  );
}