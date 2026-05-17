import { AbsoluteFill } from "remotion";
import type { TextElementScene as Props } from "../types";

export function TextElementScene(props: Props) {
  const {
    text,
    fontFamily,
    fontSize,
    fontWeight,
    color,
    align,
    lineHeight,
    bgColor,
    bgPaddingX,
    bgPaddingY,
  } = props;
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
      }}
    >
      <div
        style={{
          maxWidth: "80%",
          fontFamily: fontFamily || "Arial, sans-serif",
          fontSize,
          fontWeight,
          color,
          textAlign: align,
          lineHeight,
          background: bgColor && bgColor.length > 0 ? bgColor : "transparent",
          padding: `${bgPaddingY}px ${bgPaddingX}px`,
          whiteSpace: "pre-wrap",
          borderRadius: bgColor && bgColor.length > 0 ? 8 : 0,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}