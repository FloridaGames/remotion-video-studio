import { AbsoluteFill, Video, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ACCENT_HEX, type CinematicTitleScene as Props } from "../types";

export function CinematicTitleScene({ videoUrl, title, subtitle, accent }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleY = spring({ frame, fps, config: { damping: 18, stiffness: 90 } });
  const subOpacity = interpolate(frame, [12, 32], [0, 1], { extrapolateRight: "clamp" });
  const barW = interpolate(spring({ frame: frame - 6, fps, config: { damping: 20 } }), [0, 1], [0, 120]);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {videoUrl ? (
        <Video
          src={videoUrl}
          muted
          loop
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${interpolate(frame, [0, 150], [1.05, 1.15])})`,
          }}
        />
      ) : null}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.7) 100%)" }} />
      <AbsoluteFill style={{ display: "flex", justifyContent: "flex-end", padding: 96 }}>
        <div style={{ height: 6, width: barW, background: ACCENT_HEX[accent], marginBottom: 32 }} />
        <h1
          style={{
            color: "#fff",
            fontSize: 110,
            fontWeight: 800,
            lineHeight: 1.05,
            margin: 0,
            maxWidth: 1500,
            transform: `translateY(${interpolate(titleY, [0, 1], [40, 0])}px)`,
            opacity: titleY,
            letterSpacing: -2,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            color: "rgba(255,255,255,0.85)",
            fontSize: 32,
            fontWeight: 500,
            marginTop: 24,
            opacity: subOpacity,
          }}
        >
          {subtitle}
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
