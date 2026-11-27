import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { C, display, mono, sans, out, clamp } from "../theme";
import { Hazard } from "./Hazard";
import { Logo } from "./Logo";

// 15,5–19 s: cierre con marca y CTA
export const CtaScene: React.FC<{ bajada?: string; linea1?: string; linea2?: string }> = ({
  bajada = "Operaciones para flotas de grúas",
  linea1 = "Dejá el papel.",
  linea2 = "Cobrá todo.",
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, alignItems: "center" }}>
      <Hazard top bottom />
      <Interactive.Div
        name="Logo"
        style={{
          position: "absolute",
          top: 380,
          opacity: interpolate(frame, [0, 8], [0, 1], { ...clamp }),
          scale: interpolate(frame, [0, 18], [0.8, 1], { ...clamp, easing: out, output: "perceptual-scale" }),
        }}
      >
        <Logo size={0.9} />
      </Interactive.Div>
      <Interactive.Div
        name="Bajada"
        style={{
          position: "absolute",
          top: 630,
          fontFamily: mono,
          fontWeight: 500,
          fontSize: 38,
          color: C.muted,
          opacity: interpolate(frame, [8, 16], [0, 1], { ...clamp }),
        }}
      >
        {bajada}
      </Interactive.Div>
      <Interactive.Div
        name="Remate"
        style={{
          position: "absolute",
          top: 790,
          left: 80,
          right: 80,
          textAlign: "center",
          fontFamily: display,
          fontSize: 150,
          lineHeight: 0.95,
          color: C.text,
          opacity: interpolate(frame, [18, 26], [0, 1], { ...clamp }),
          translate: interpolate(frame, [18, 32], ["0px 40px", "0px 0px"], { ...clamp, easing: out }),
        }}
      >
        {linea1}
        <br />
        <span style={{ color: C.orange }}>{linea2}</span>
      </Interactive.Div>
      <Interactive.Div
        name="CTA"
        style={{
          position: "absolute",
          top: 1160,
          background: C.orange,
          color: "#14161b",
          fontFamily: sans,
          fontWeight: 700,
          fontSize: 54,
          padding: "30px 64px",
          borderRadius: 999,
          opacity: interpolate(frame, [34, 40], [0, 1], { ...clamp }),
          scale: interpolate(frame, [34, 46, 70, 78, 86], [0.6, 1, 1, 1.06, 1], {
            ...clamp,
            easing: [Easing.out(Easing.back(1.6)), Easing.linear, Easing.inOut(Easing.quad), Easing.inOut(Easing.quad)],
          }),
        }}
      >
        Tocá «Más información» ↓
      </Interactive.Div>
    </AbsoluteFill>
  );
};
