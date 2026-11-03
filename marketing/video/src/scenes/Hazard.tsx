import { AbsoluteFill } from "remotion";
import { C } from "../theme";

// Franja de peligro amarilla/negra, como en el logo
export const Hazard: React.FC<{ top?: boolean; bottom?: boolean }> = ({ top = true, bottom = false }) => {
  const stripe = `repeating-linear-gradient(-45deg, ${C.yellow} 0 26px, #111 26px 52px)`;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {top ? <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 26, background: stripe }} /> : null}
      {bottom ? <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 26, background: stripe }} /> : null}
    </AbsoluteFill>
  );
};
