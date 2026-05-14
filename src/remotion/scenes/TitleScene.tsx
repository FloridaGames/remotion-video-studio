import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ACCENT_HEX, type TitleScene as TitleSceneProps } from "../types";

export function TitleScene(props: TitleSceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = ACCENT_HEX[props.accent];

  const titleY = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  const subY = spring({ frame: frame - 12, fps, config: { damping: 20, stiffness: 110 } });
  const lineWidth = interpolate(frame, [10, 40], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#003366",
        color: "white",
        fontFamily: "Arial, sans-serif",
        padding: "8% 10%",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          height: 8,
          width: `${lineWidth * 240}px`,
          background: accent,
          marginBottom: 40,
        }}
      />
      <h1
        style={{
          fontSize: 140,
          lineHeight: 1.05,
          fontWeight: 700,
          margin: 0,
          transform: `translateY(${(1 - titleY) * 40}px)`,
          opacity: titleY,
          letterSpacing: -2,
        }}
      >
        {props.title}
      </h1>
      <p
        style={{
          fontSize: 48,
          marginTop: 32,
          opacity: subY * 0.85,
          transform: `translateY(${(1 - subY) * 24}px)`,
          color: "#e8edf3",
        }}
      >
        {props.subtitle}
      </p>
    </AbsoluteFill>
  );
}