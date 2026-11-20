import { Audio } from "@remotion/media";
import { staticFile, useCurrentFrame } from "remotion";
import { display, mono, sans } from "../../theme";
import { StepFrame } from "../StepFrame";
import { Finger, Header, Ico, Phone, Pill, pop, press, ramp, Shot, Shots, U } from "./ui";

export const P1_CON = 225;
const TAP1 = 40, TAP2 = 100, TAP3 = 152;

const Tile: React.FC<{ icon: string; title: string; sub: string; on?: boolean; f: number; tap?: number }> = ({ icon, title, sub, on, f, tap }) => (
  <div
    style={{
      width: 370, height: 380, borderRadius: 36, background: on && f >= (tap ?? 0) ? "rgba(245,166,35,.14)" : U.card, border: `3px solid ${on && f >= (tap ?? 0) ? U.accent : U.line}`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, scale: press(f, tap),
      boxShadow: on && f >= (tap ?? 0) ? "0 0 60px rgba(245,166,35,.35)" : "none",
    }}
  >
    <span style={{ width: 120, height: 120, borderRadius: "50%", background: "rgba(245,166,35,.14)", color: U.accent, display: "grid", placeItems: "center" }}>
      <Ico n={icon} s={24} />
    </span>
    <span style={{ fontFamily: display, fontSize: 60, color: U.text, letterSpacing: 2 }}>{title}</span>
    <span style={{ fontFamily: sans, fontSize: 28, color: U.muted, textAlign: "center", padding: "0 24px", lineHeight: 1.25 }}>{sub}</span>
  </div>
);

const Row: React.FC<{ ini: string; name: string; sub: string; i: number; f: number; tap?: number; on?: boolean }> = ({ ini, name, sub, i, f, tap, on }) => {
  const e = ramp(f, 6 + i * 5, 18 + i * 5);
  const sel = on && f >= (tap ?? 1e9);
  return (
    <div
      style={{
        height: 150, borderRadius: 32, background: sel ? "rgba(245,166,35,.14)" : U.card, border: `3px solid ${sel ? U.accent : U.line}`, display: "flex", alignItems: "center", gap: 26, padding: "0 30px",
        opacity: e, translate: `${(1 - e) * 120}px 0px`, scale: on ? press(f, tap) : 1,
      }}
    >
      <span style={{ width: 92, height: 92, borderRadius: "50%", background: on ? U.accent : U.card2, color: on ? U.accentFg : U.muted, display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 700, fontSize: 34 }}>{ini}</span>
      <span style={{ flex: 1 }}>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 42, color: U.text }}>{name}</div>
        <div style={{ fontFamily: sans, fontSize: 28, color: U.muted, marginTop: 4 }}>{sub}</div>
      </span>
      <span style={{ color: U.muted }}>
        <Ico n="right" s={14} />
      </span>
    </div>
  );
};

const SERVICIOS: [string, string, string][] = [
  ["Remolque", "$ 45.000", "20 km incl."],
  ["Auxilio mecánico", "$ 28.000", "10 km incl."],
  ["Traslado", "$ 52.000", "30 km incl."],
  ["Paso de corriente", "$ 18.000", "Sin km"],
];

// Remolque elegido: la tarjeta crece y muestra la tarifa completa
const Tarifa: React.FC<{ f: number }> = ({ f }) => {
  const grow = ramp(f, TAP3 - 120 + 6, TAP3 - 120 + 24);
  const L = (a: number, b: number) => a + (b - a) * grow;
  const others = 1 - ramp(f, TAP3 - 120 + 2, TAP3 - 120 + 10);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Header f={f} title="Asistencia del Sur" sub="¿Qué servicio?" />
      {SERVICIOS.map(([n, m, km], i) => {
        const x = 44 + (i % 2) * 402, y = 200 + Math.floor(i / 2) * 290;
        const e = ramp(f, 6 + i * 4, 18 + i * 4);
        if (i === 0) return null;
        return (
          <div key={n} style={{ position: "absolute", left: x, top: y, width: 370, height: 260, borderRadius: 32, background: U.card, border: `3px solid ${U.line}`, padding: 26, opacity: e * others, scale: 0.9 + e * 0.1 }}>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 36, color: U.text }}>{n}</div>
            <div style={{ fontFamily: sans, fontSize: 24, color: U.muted, marginTop: 14 }}>Base</div>
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 44, color: U.accent }}>{m}</div>
            <Pill color={km === "Sin km" ? U.muted : U.ok} style={{ position: "absolute", left: 26, bottom: 22 }}>{km}</Pill>
          </div>
        );
      })}
      {/* tarjeta de Remolque: de su lugar en la grilla a toda la pantalla */}
      <div
        style={{
          position: "absolute", left: 44, top: 200, width: L(370, 772), height: L(260, 540), borderRadius: 32, padding: L(26, 40),
          background: grow > 0 ? `linear-gradient(160deg, rgba(245,166,35,${0.1 + grow * 0.12}), ${U.card})` : U.card,
          border: `3px solid ${f >= TAP3 - 120 ? U.accent : U.line}`, boxShadow: grow > 0 ? `0 30px 80px rgba(245,166,35,${grow * 0.28})` : "none",
          opacity: ramp(f, 6, 18), scale: press(f, TAP3 - 120), overflow: "hidden",
        }}
      >
        <div style={{ fontFamily: grow > 0.5 ? mono : sans, fontWeight: 700, fontSize: L(36, 26), letterSpacing: grow > 0.5 ? 3 : 0, color: grow > 0.5 ? U.accent : U.text }}>
          {grow > 0.5 ? "REMOLQUE · ASISTENCIA DEL SUR" : "Remolque"}
        </div>
        <div style={{ fontFamily: sans, fontSize: L(24, 30), color: U.muted, marginTop: L(14, 22) }}>Base</div>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: L(44, 96), color: U.accent, lineHeight: 1.05 }}>$ 45.000</div>
        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14, opacity: ramp(f, TAP3 - 120 + 18, TAP3 - 120 + 28) }}>
          {["20 km incluidos", "$ 1.500 por km de más", "Paga a 30 días"].map((t) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: sans, fontWeight: 700, fontSize: 36, color: U.text }}>
              <span style={{ width: 46, height: 46, borderRadius: "50%", background: U.ok, color: "#06180f", display: "grid", placeItems: "center" }}>
                <Ico n="check" s={10} w={3.5} />
              </span>
              {t}
            </div>
          ))}
        </div>
        {grow < 0.5 ? <Pill color={U.ok} style={{ position: "absolute", left: 26, bottom: 22 }}>20 km incl.</Pill> : null}
        <div style={{ marginTop: 26, opacity: pop(f, TAP3 - 120 + 30, TAP3 - 120 + 40), scale: 0.6 + pop(f, TAP3 - 120 + 30, TAP3 - 120 + 40) * 0.4, transformOrigin: "0 50%" }}>
          <Pill color={U.ok} style={{ fontSize: 32, padding: "10px 24px" }}>✓ Tarifa lista, sin acordarte de nada</Pill>
        </div>
      </div>
    </div>
  );
};

const shots: Shot[] = [
  {
    from: 0,
    render: (f) => (
      <div style={{ position: "absolute", inset: 0 }}>
        <Header f={f} title="Nuevo servicio" sub="¿Para quién es?" />
        <div style={{ position: "absolute", left: 44, top: 200, display: "flex", gap: 32, opacity: ramp(f, 4, 16), translate: `0px ${(1 - ramp(f, 4, 16)) * 40}px` }}>
          <Tile icon="building" title="Prestadora" sub="Te lo pasó una asistencia" on f={f} tap={TAP1} />
          <Tile icon="user" title="Particular" sub="Te paga en el momento" f={f} />
        </div>
      </div>
    ),
  },
  {
    from: 60,
    render: (f) => (
      <div style={{ position: "absolute", inset: 0 }}>
        <Header f={f} title="¿Qué prestadora?" sub="Cada una con sus tarifas" />
        <div style={{ position: "absolute", left: 44, right: 44, top: 200, display: "flex", flexDirection: "column", gap: 22 }}>
          <Row ini="AS" name="Asistencia del Sur" sub="Paga a 30 días · 2 tarifas" i={0} f={f} tap={TAP2 - 60} on />
          <Row ini="AI" name="Auxilio Integral" sub="Paga a 45 días · 3 tarifas" i={1} f={f} />
          <Row ini="RA" name="Rutas Asistencia" sub="Paga a 60 días · 1 tarifa" i={2} f={f} />
        </div>
      </div>
    ),
  },
  { from: 120, render: (f) => <Tarifa f={f} /> },
];

export const Paso1Con: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <StepFrame n={1} mode="con" title="Te pasan el servicio">
      <Phone>
        <Shots shots={shots} />
        <Finger f={f} at={TAP1} x={229} y={390} />
        <Finger f={f} at={TAP2} x={430} y={275} />
        <Finger f={f} at={TAP3} x={229} y={330} />
      </Phone>
      {[TAP1, TAP2, TAP3].map((t) => (
        <Audio key={t} name="Toque" src={staticFile("sfx/mouse-click.wav")} from={t} volume={0.45} />
      ))}
      <Audio name="Tarifa" src={staticFile("sfx/ding.wav")} from={TAP3 + 32} volume={0.35} />
    </StepFrame>
  );
};
