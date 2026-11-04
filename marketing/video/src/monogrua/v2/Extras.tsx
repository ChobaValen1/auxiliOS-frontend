import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, clamp, display, mono, sans } from "../../theme";
import { Truck } from "../../comparacion/Truck";
import { Logo } from "../../scenes/Logo";
import { SAFE } from "../StepFrame";
import { pop, ramp } from "./ui";

const Stripe: React.FC<{ bottom?: boolean }> = ({ bottom }) => (
  <div style={{ position: "absolute", [bottom ? "bottom" : "top"]: 0, left: 0, right: 0, height: 26, background: `repeating-linear-gradient(-45deg, ${C.yellow} 0 26px, #111 26px 52px)` }} />
);

export const GANCHO_DUR = 84;
// Gancho: un servicio, dos formas de cobrarlo
export const Gancho: React.FC = () => {
  const f = useCurrentFrame();
  const drive = interpolate(f, [0, 34], [-1100, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, rgba(245,166,35,.12), transparent 60%), ${C.bg}` }}>
      <Stripe />
      <div style={{ position: "absolute", top: SAFE.top + 20, left: SAFE.left, right: 1080 - SAFE.right, fontFamily: display, fontSize: 150, lineHeight: 0.92, color: C.text, opacity: ramp(f, 0, 10), translate: `0px ${(1 - ramp(f, 0, 10)) * 30}px` }}>
        Un servicio de asistencia.
      </div>
      <div style={{ position: "absolute", top: SAFE.top + 330, left: SAFE.left, right: 1080 - SAFE.right, fontFamily: display, fontSize: 150, lineHeight: 0.92, color: C.yellow, opacity: ramp(f, 16, 26), translate: `0px ${(1 - ramp(f, 16, 26)) * 30}px` }}>
        Dos formas de cobrarlo.
      </div>
      <div style={{ position: "absolute", top: 940, left: SAFE.left, right: 1080 - SAFE.right, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 34, letterSpacing: 2, padding: "12px 26px", borderRadius: 999, background: "#3a3c42", color: "#c9ccd2", translate: `${(1 - ramp(f, 30, 42)) * -400}px 0px` }}>SIN AUXILIOS</span>
        <span style={{ fontFamily: display, fontSize: 70, color: C.muted, opacity: ramp(f, 40, 48) }}>vs</span>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 34, letterSpacing: 2, padding: "12px 26px", borderRadius: 999, background: "#f5a623", color: "#14161b", translate: `${(1 - ramp(f, 34, 46)) * 400}px 0px` }}>CON AUXILIOS</span>
      </div>
      <div style={{ position: "absolute", left: 320, top: 1040, translate: `${drive}px 0px` }}>
        <Truck solo wheelTurn={(drive / 188) * 360} />
      </div>
      <Audio name="Entrada" src={staticFile("sfx/whoosh.wav")} from={2} volume={0.5} />
    </AbsoluteFill>
  );
};

export const TABLERO_DUR = 110;
const FILAS = ["Te pasan el servicio", "El remito", "Cobrar el servicio"];
// Tablero: los 3 pasos, papel contra AuxiliOS
export const Tablero: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Stripe />
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, fontFamily: display, fontSize: 130, color: C.text, opacity: ramp(f, 0, 10) }}>El mismo servicio</div>
      <div style={{ position: "absolute", top: SAFE.top + 160, left: SAFE.left, right: 1080 - SAFE.right }}>
        <div style={{ display: "flex", justifyContent: "flex-end", fontFamily: mono, fontWeight: 700, fontSize: 28, letterSpacing: 2, opacity: ramp(f, 6, 14) }}>
          <span style={{ width: 160, textAlign: "center", color: "#9a9ea6" }}>SIN</span>
          <span style={{ width: 160, textAlign: "center", color: "#f5a623" }}>CON</span>
        </div>
        {FILAS.map((r, i) => {
          const at = 12 + i * 12;
          return (
            <div key={r} style={{ display: "flex", alignItems: "center", height: 150, borderBottom: `3px solid ${C.border}`, opacity: ramp(f, at, at + 8), translate: `${(1 - ramp(f, at, at + 12)) * -80}px 0px` }}>
              <span style={{ flex: 1, fontFamily: sans, fontWeight: 700, fontSize: 50, color: C.text }}>{r}</span>
              <span style={{ width: 160, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 80, color: C.red, scale: pop(f, at + 6, at + 16) }}>✕</span>
              <span style={{ width: 160, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 80, color: C.green, scale: pop(f, at + 10, at + 20) }}>✓</span>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", top: 1060, left: SAFE.left, right: 1080 - SAFE.right, fontFamily: sans, fontWeight: 700, fontSize: 50, lineHeight: 1.2, color: C.text, opacity: ramp(f, 56, 68) }}>
        Lo cargás una vez. <span style={{ color: "#f5a623" }}>La plata la seguís hasta que entra.</span>
      </div>
    </AbsoluteFill>
  );
};

export const CIERRE_DUR = 105;
// Cierre con marca y CTA, todo dentro de la zona segura de Reels
export const Cierre: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: "center" }}>
      <Stripe />
      <Stripe bottom />
      <div style={{ position: "absolute", top: SAFE.top + 40, opacity: ramp(f, 0, 10), scale: 0.85 + ramp(f, 0, 18) * 0.15 }}>
        <Logo size={0.9} />
      </div>
      <div style={{ position: "absolute", top: SAFE.top + 300, fontFamily: mono, fontWeight: 500, fontSize: 38, color: C.muted, opacity: ramp(f, 8, 16) }}>Para el gruero independiente.</div>
      <div style={{ position: "absolute", top: SAFE.top + 400, left: SAFE.left, right: 1080 - SAFE.right, textAlign: "center", fontFamily: display, fontSize: 140, lineHeight: 0.95, color: C.text, opacity: ramp(f, 18, 26), translate: `0px ${(1 - ramp(f, 18, 32)) * 40}px` }}>
        Dejá el cuaderno.
        <br />
        <span style={{ color: "#f5a623" }}>Cobrá todo.</span>
      </div>
      <div
        style={{
          position: "absolute", top: SAFE.top + 740, background: "#f5a623", color: "#14161b", fontFamily: sans, fontWeight: 700, fontSize: 54, padding: "28px 60px", borderRadius: 999,
          opacity: ramp(f, 36, 42), scale: interpolate(f, [36, 48, 70, 78, 86], [0.6, 1, 1, 1.06, 1], clamp),
        }}
      >
        Tocá «Más información» ↓
      </div>
    </AbsoluteFill>
  );
};
