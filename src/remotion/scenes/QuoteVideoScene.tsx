import { AbsoluteFill, Video, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ACCENT_HEX, type QuoteVideoScene as Props } from "../types";

export function QuoteVideoScene({ videoUrl, quote, attribution, accent }: Props) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const fade = interpolate(frame, [0, 24, durationInFrames - 24, durationInFrames], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
  });
  const quoteY = spring({ frame, fps, config: { damping: 20, stiffness: 80 } });
  const attrOpacity = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: "clamp" });
  const zoom = interpolate(frame, [0, durationInFrames], [1.0, 1.12]);
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
            transform: `scale(${zoom})`,
            filter: "blur(2px)",
          }}
        />
      ) : null}
      <AbsoluteFill style={{ background: "rgba(0,0,0,0.55)" }} />
      <AbsoluteFill
        style={{
          padding: 140,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          opacity: fade,
        }}
      >
        <div style={{ maxWidth: 1400 }}>
          <div
            style={{
              color: ACCENT_HEX[accent],
              fontSize: 120,
              fontWeight: 900,
              lineHeight: 0.6,
              marginBottom: 16,
            }}
          >
            “
          </div>
          <p
            style={{
              color: "#fff",
              fontSize: 60,
              fontWeight: 600,
              lineHeight: 1.25,
              margin: 0,
              fontStyle: "italic",
              transform: `translateY(${interpolate(quoteY, [0, 1], [30, 0])}px)`,
              opacity: quoteY,
            }}
          >
            {quote}
          </p>
          <div
            style={{
              color: "rgba(255,255,255,0.8)",
              fontSize: 24,
              marginTop: 36,
              letterSpacing: 2,
              textTransform: "uppercase",
              opacity: attrOpacity,
            }}
          >
            — {attribution}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
