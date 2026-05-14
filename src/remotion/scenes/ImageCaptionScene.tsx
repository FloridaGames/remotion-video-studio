import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { ACCENT_HEX, type ImageCaptionScene as Props } from "../types";

export function ImageCaptionScene(props: Props) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const accent = ACCENT_HEX[props.accent];

  // Ken Burns
  const scale = interpolate(frame, [0, durationInFrames], [1.05, 1.18]);
  const tx = interpolate(frame, [0, durationInFrames], [0, -30]);
  const captionO = interpolate(frame, [10, 30], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b1a2e" }}>
      {props.imageUrl ? (
        <Img
          src={props.imageUrl}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale}) translateX(${tx}px)`,
          }}
        />
      ) : (
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            color: "#94a3b8",
            fontFamily: "Arial, sans-serif",
            fontSize: 32,
          }}
        >
          Upload an image in the inspector
        </AbsoluteFill>
      )}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, transparent 40%, rgba(0,20,40,0.85) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          bottom: 80,
          opacity: captionO,
          transform: `translateY(${(1 - captionO) * 20}px)`,
        }}
      >
        <div style={{ height: 6, width: 120, background: accent, marginBottom: 24 }} />
        <p
          style={{
            fontSize: 48,
            color: "white",
            fontFamily: "Arial, sans-serif",
            margin: 0,
            lineHeight: 1.3,
            fontWeight: 600,
            maxWidth: "80%",
          }}
        >
          {props.caption}
        </p>
      </div>
    </AbsoluteFill>
  );
}