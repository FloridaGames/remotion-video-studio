import { AbsoluteFill, Video, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ACCENT_HEX, type LowerThirdScene as Props } from "../types";

export function LowerThirdScene({ videoUrl, name, role, accent }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slide = spring({ frame: frame - 12, fps, config: { damping: 18, stiffness: 100 } });
  const x = interpolate(slide, [0, 1], [-700, 0]);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {videoUrl ? (
        <Video
          src={videoUrl}
          muted
          loop
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 80,
          bottom: 100,
          transform: `translateX(${x}px)`,
          display: "flex",
          alignItems: "stretch",
        }}
      >
        <div style={{ width: 8, background: ACCENT_HEX[accent] }} />
        <div
          style={{
            background: "rgba(0, 51, 102, 0.92)",
            padding: "24px 36px",
            backdropFilter: "blur(8px)",
          }}
        >
          <div style={{ color: "#fff", fontSize: 44, fontWeight: 800, lineHeight: 1.1 }}>{name}</div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 22, marginTop: 8, maxWidth: 900 }}>
            {role}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
