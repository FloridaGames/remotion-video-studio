import { AbsoluteFill, Img } from "remotion";
import type { ImageElementScene as Props } from "../types";

export function ImageElementScene({ imageUrl, fit, size }: Props) {
  const pct = `${Math.round((size ?? 0.5) * 100)}%`;
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
      }}
    >
      {imageUrl ? (
        <Img
          src={imageUrl}
          style={{
            maxWidth: pct,
            maxHeight: pct,
            objectFit: fit ?? "contain",
          }}
        />
      ) : (
        <div
          style={{
            width: pct,
            height: pct,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px dashed rgba(255,255,255,0.3)",
            color: "rgba(255,255,255,0.5)",
            fontFamily: "Arial, sans-serif",
            fontSize: 22,
            borderRadius: 12,
          }}
        >
          Upload an image (PNG / JPG)
        </div>
      )}
    </AbsoluteFill>
  );
}