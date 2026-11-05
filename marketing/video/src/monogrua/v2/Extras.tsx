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

export const TABLERO_DUR = 120;
const SIN_ITEMS: [string, string][] = [
  ["📝", "La tarifa, de memoria"],
  ["🧾", "Remito sin fotos ni copia"],
  ["📒", "¿Me pagaron? ¿Cuánto quedó?"],
];
const CON_ITEMS = ["Tarifa cargada", "Fotos y firma del socio", "Cobrado y contado"];

const Lado: React.FC<{ con: boolean; f: number }> = ({ con, f }) => {
  const enter = ramp(f, con ? 6 : 0, con ? 22 : 16);
  const win = ramp(f, 54, 70);
  const pulse = con ? 0.5 + 0.5 * Math.sin(Math.max(0, f - 70) / 6) : 0;
  return (
    <div
      style={{
        width: 430, height: 560, borderRadius: 40, padding: "28px 26px", display: "flex", flexDirection: "column", gap: 18,
        background: con ? "linear-gradient(170deg, rgba(245,166,35,.22), #171b24 55%)" : "repeating-linear-gradient(0deg, #232428 0 6px, #25262a 6px 12px)",
        border: `4px solid ${con ? "#f5a623" : "#3a3c42"}`,
        boxShadow: con ? `0 0 ${40 + win * 50 + pulse * 20}px rgba(245,166,35,${0.2 + win * 0.25})` : "0 20px 50px rgba(0,0,0,.4)",
        translate: `${(1 - enter) * (con ? 600 : -600)}px 0px`, opacity: con ? 1 : 1 - win * 0.45,
        scale: con ? 1 + win * 0.05 : 1 - win * 0.05, filter: con ? "none" : `grayscale(${0.3 + win * 0.6})`,
        rotate: `${(1 - enter) * (con ? 8 : -8)}deg`,
      }}
    >
      <span
        style={{
          alignSelf: "flex-start", fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 2, padding: "8px 18px", borderRadius: 999,
          background: con ? "#f5a623" : "#3a3c42", color: con ? "#14161b" : "#c9ccd2",
        }}
      >
        {con ? "CON AUXILIOS" : "SIN AUXILIOS"}
      </span>
      {(con ? CON_ITEMS.map((t) => ["", t] as [string, string]) : SIN_ITEMS).map(([emoji, t], i) => {
        const at = (con ? 26 : 18) + i * 8;
        const e = pop(f, at, at + 12);
        return (
          <div key={t} style={{ flex: 1, display: "flex", alignItems: "center", gap: 18, opacity: e, translate: `0px ${(1 - e) * 30}px`, borderTop: i ? `2px solid ${con ? "rgba(245,166,35,.25)" : "#34363c"}` : "none", paddingTop: i ? 14 : 0 }}>
            <span
              style={{
                width: 84, height: 84, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 44, position: "relative",
                background: con ? C.green : "#33353b", color: "#06180f", fontFamily: sans, fontWeight: 700, scale: 0.6 + e * 0.4,
              }}
            >
              {con ? "✓" : emoji}
              {con ? null : (
                <span style={{ position: "absolute", right: -8, bottom: -8, width: 40, height: 40, borderRadius: "50%", background: C.red, color: "#fff", fontSize: 26, display: "grid", placeItems: "center" }}>✕</span>
              )}
            </span>
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 36, lineHeight: 1.15, color: con ? C.text : "#b9bcc4" }}>{t}</span>
          </div>
        );
      })}
    </div>
  );
};

// Tablero: cara a cara del mismo servicio, papel contra AuxiliOS
export const Tablero: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 75% 55%, rgba(245,166,35,${0.06 + ramp(f, 54, 70) * 0.12}), transparent 60%), ${C.bg}` }}>
      <Stripe />
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, right: 1080 - SAFE.right, fontFamily: display, fontSize: 118, lineHeight: 0.95, color: C.text, opacity: ramp(f, 0, 10), translate: `0px ${(1 - ramp(f, 0, 12)) * 30}px` }}>
        El mismo servicio
      </div>
      <div style={{ position: "absolute", top: SAFE.top + 140, left: 60, right: 60, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Lado con={false} f={f} />
        <Lado con f={f} />
      </div>
      <div style={{ position: "absolute", top: SAFE.top + 730, left: SAFE.left, right: 1080 - SAFE.right, fontFamily: display, fontSize: 82, lineHeight: 0.95 }}>
        <div style={{ color: C.text, opacity: ramp(f, 66, 74), translate: `0px ${(1 - ramp(f, 66, 78)) * 30}px` }}>Lo cargás una vez.</div>
        <div style={{ color: "#f5a623", opacity: ramp(f, 76, 84), translate: `0px ${(1 - ramp(f, 76, 88)) * 30}px` }}>
          La plata la seguís
          <br />
          hasta que entra.
        </div>
      </div>
      {/* fondo de la zona que tapa Reels: grúa grande apagada y franja */}
      <div style={{ position: "absolute", left: 160, top: 1420, scale: 1.9, opacity: 0.1, translate: `${interpolate(f, [0, 120], [40, -40])}px 0px` }}>
        <Truck solo wheelTurn={f * 4} />
      </div>
      <Stripe bottom />
      <Audio name="Tarjetas" src={staticFile("sfx/whoosh.wav")} from={2} volume={0.5} />
      <Audio name="Gana AuxiliOS" src={staticFile("sfx/ding.wav")} from={56} volume={0.45} />
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
