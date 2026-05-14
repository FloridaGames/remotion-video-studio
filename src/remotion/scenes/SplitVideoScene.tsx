import { AbsoluteFill, Video, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ACCENT_HEX, type SplitVideoScene as Props } from "../types";

export function SplitVideoScene({ videoUrl, heading, body, videoSide, accent }: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slide = spring({ frame, fps, config: { damping: 22, stiffness: 110 } });
  const textOpacity = interpolate(frame, [10, 30], [0, 1], { extrapolateRight: "clamp" });
  const videoLeft = videoSide === "left";
  return (
    <AbsoluteFill style={{ background: "#0b1a2e", display: "flex", flexDirection: "row" }}>
      <div
        style={{
          width: "50%",
          order: videoLeft ? 0 : 1,
          position: "relative",
          overflow: "hidden",
          transform: `translateX(${interpolate(slide, [0, 1], [videoLeft ? -60 : 60, 0])}px)`,
          opacity: slide,
        }}
      >
        {videoUrl ? (
          <Video
            src={videoUrl}
            muted
            loop
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#13243f" }} />
        )}
      </div>
      <div
        style={{
          width: "50%",
          order: videoLeft ? 1 : 0,
          padding: 96,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          opacity: textOpacity,
        }}
      >
        <div style={{ height: 4, width: 80, background: ACCENT_HEX[accent], marginBottom: 24 }} />
        <h2 style={{ color: "#fff", fontSize: 72, fontWeight: 800, lineHeight: 1.1, margin: 0, letterSpacing: -1 }}>
          {heading}
        </h2>
        <p style={{ color: "rgba(255,255,255,0.78)", fontSize: 28, lineHeight: 1.4, marginTop: 28 }}>{body}</p>
      </div>
    </AbsoluteFill>
  );
}
