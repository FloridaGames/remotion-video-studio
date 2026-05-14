import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ACCENT_HEX, type TalkingPointScene as Props } from "../types";

export function TalkingPointScene(props: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = ACCENT_HEX[props.accent];

  const headOpacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  const headY = (1 - spring({ frame, fps, config: { damping: 18 } })) * 30;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#fafbfc",
        color: "#003366",
        fontFamily: "Arial, sans-serif",
        padding: "8% 10%",
        justifyContent: "center",
      }}
    >
      <h2
        style={{
          fontSize: 88,
          margin: 0,
          opacity: headOpacity,
          transform: `translateY(${headY}px)`,
          fontWeight: 700,
          letterSpacing: -1,
        }}
      >
        {props.heading}
      </h2>
      <ul style={{ marginTop: 56, padding: 0, listStyle: "none" }}>
        {props.bullets.map((b, i) => {
          const start = 20 + i * 12;
          const o = interpolate(frame, [start, start + 18], [0, 1], { extrapolateRight: "clamp" });
          const x = (1 - o) * 40;
          return (
            <li
              key={i}
              style={{
                fontSize: 48,
                marginBottom: 28,
                opacity: o,
                transform: `translateX(${x}px)`,
                display: "flex",
                alignItems: "center",
                gap: 24,
                lineHeight: 1.3,
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  background: accent,
                  flexShrink: 0,
                  borderRadius: 2,
                }}
              />
              {b}
            </li>
          );
        })}
      </ul>
    </AbsoluteFill>
  );
}