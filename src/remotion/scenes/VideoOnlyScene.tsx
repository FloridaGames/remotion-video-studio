import { AbsoluteFill, Video } from "remotion";
import type { VideoOnlyScene as Props } from "../types";

export function VideoOnlyScene({ videoUrl, fit }: Props) {
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
            objectFit: fit ?? "cover",
          }}
        />
      ) : (
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.4)",
            fontSize: 28,
            fontFamily: "Arial, sans-serif",
          }}
        >
          No video selected
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
