import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from "remotion";
import { C, display, mono, sans, out, clamp } from "../theme";
import { Hazard } from "./Hazard";

const PainItem: React.FC<{ text: string; delay: number }> = ({ text, delay }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 34,
        background: C.card,
        border: `2px solid ${C.border}`,
        borderLeft: `10px solid ${C.red}`,
        borderRadius: 22,
        padding: "40px 44px",
        opacity: interpolate(frame, [delay, delay + 8], [0, 1], clamp),
        translate: interpolate(frame, [delay, delay + 14], ["-120px 0px", "0px 0px"], { ...clamp, easing: out }),
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 84,
          height: 84,
          borderRadius: "50%",
          background: "rgba(226,80,74,0.15)",
          color: C.red,
          fontFamily: sans,
          fontWeight: 700,
          fontSize: 54,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ✕
      </div>
      <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 54, color: C.text, lineHeight: 1.15 }}>{text}</div>
    </div>
  );
};

// 3,5–7 s: los dolores de la cabina
export const PainScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <Hazard />
      <Interactive.Div
        name="Kicker"
        style={{
          position: "absolute",
          top: 300,
          left: 80,
          fontFamily: mono,
          fontWeight: 700,
          fontSize: 44,
          color: C.orange,
          letterSpacing: 4,
          opacity: interpolate(frame, [0, 8], [0, 1], { ...clamp }),
        }}
      >
        ¿TE SUENA?
      </Interactive.Div>
      <Interactive.Div
        name="Titulo"
        style={{
          position: "absolute",
          top: 370,
          left: 80,
          right: 80,
          fontFamily: display,
          fontSize: 140,
          lineHeight: 0.95,
          color: C.text,
          opacity: interpolate(frame, [2, 12], [0, 1], { ...clamp }),
        }}
      >
        El papel en la cabina
      </Interactive.Div>
      <div style={{ position: "absolute", top: 720, left: 80, right: 80, display: "flex", flexDirection: "column", gap: 34 }}>
        <PainItem delay={14} text="Remito mojado en la guantera" />
        <PainItem delay={28} text="La firma que faltó" />
        <PainItem delay={42} text="Facturás una semana tarde" />
      </div>
    </AbsoluteFill>
  );
};
