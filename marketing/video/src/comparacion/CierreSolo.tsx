import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { C, clamp, display, sans } from "../theme";
import { Truck } from "./Truck";
import { AMBER, SoloBrand } from "./ui";

export const CIERRE_DUR = 105;

export const CierreSolo: React.FC = () => {
  const f = useCurrentFrame();
  const stripe = `repeating-linear-gradient(-45deg, ${C.yellow} 0 26px, #111 26px 52px)`;
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, alignItems: "center" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 26, background: stripe }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 26, background: stripe }} />
      <Interactive.Div
        name="Marca"
        style={{
          position: "absolute",
          top: 300,
          opacity: interpolate(f, [0, 8], [0, 1], { ...clamp }),
          scale: interpolate(f, [0, 18], [0.8, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1), output: "perceptual-scale" }),
        }}
      >
        <SoloBrand size={210} />
      </Interactive.Div>
      <Interactive.Div
        name="Bajada"
        style={{ position: "absolute", top: 540, fontFamily: sans, fontWeight: 500, fontSize: 46, color: C.muted, opacity: interpolate(f, [8, 16], [0, 1], { ...clamp }) }}
      >
        Para el gruero que trabaja solo.
      </Interactive.Div>
      <div style={{ position: "absolute", top: 640, opacity: interpolate(f, [10, 20], [0, 1], clamp), translate: `${interpolate(f, [10, 40], [-300, 0], { ...clamp, easing: Easing.out(Easing.cubic) })}px 0px` }}>
        <Truck solo wheelTurn={interpolate(f, [10, 40], [-500, 0], { ...clamp, easing: Easing.out(Easing.cubic) })} />
      </div>
      <Interactive.Div
        name="Remate"
        style={{
          position: "absolute",
          top: 880,
          left: 80,
          right: 80,
          textAlign: "center",
          fontFamily: display,
          fontSize: 140,
          lineHeight: 0.95,
          color: C.text,
          opacity: interpolate(f, [22, 30], [0, 1], { ...clamp }),
          translate: interpolate(f, [22, 36], ["0px 40px", "0px 0px"], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
        }}
      >
        Dejá el talonario.
        <br />
        <span style={{ color: AMBER }}>Llevá la cuenta.</span>
      </Interactive.Div>
      <Interactive.Div
        name="CTA"
        style={{
          position: "absolute",
          top: 1200,
          background: AMBER,
          color: "#14161b",
          fontFamily: sans,
          fontWeight: 700,
          fontSize: 54,
          padding: "30px 64px",
          borderRadius: 999,
          opacity: interpolate(f, [38, 44], [0, 1], { ...clamp }),
          scale: interpolate(f, [38, 50, 72, 80, 88], [0.6, 1, 1, 1.06, 1], {
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
