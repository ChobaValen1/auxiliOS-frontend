import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, interpolate, Series, staticFile, useCurrentFrame } from "remotion";
import { C, clamp, hand, mono, sans } from "../theme";
import { Flow, Step } from "../solo/Flow";
import { A2ParaQuien } from "../solo/Screens";
import { P2QuePrestadora, P3QueServicio } from "../solo/ScreensPrestadora";
import { AMBER, BOX, PhoneBox, StepFrame } from "./StepFrame";

export const PASO1_SIN = 40;
export const PASO1_CON = 100;

// ❌ La asistencia llama y la tarifa queda en un papelito con dudas
export const Paso1Sin: React.FC = () => {
  const f = useCurrentFrame();
  const ring = Math.sin(f * 1.2) * 4;
  const nota = interpolate(f, [10, 20], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.4)) });
  const lines = ["Asist. del Sur", "Remolque → Lomas", "¿$ 40.000? ¿45?", "¿km incluidos??"];
  return (
    <StepFrame n={1} mode="sin" title="Te pasan el servicio">
      <div
        style={{
          position: "absolute", left: 120, right: 120, top: BOX.top + 20, background: "#2a2c31", borderRadius: 32, padding: "28px 34px",
          display: "flex", alignItems: "center", gap: 24, rotate: `${ring * 0.3}deg`, opacity: interpolate(f, [0, 6], [0, 1], clamp),
        }}
      >
        <div style={{ width: 96, height: 96, borderRadius: "50%", background: "#3d8f5a", display: "grid", placeItems: "center", fontSize: 54 }}>📞</div>
        <div style={{ fontFamily: sans }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: "#e3e5ea" }}>Asistencia del Sur</div>
          <div style={{ fontSize: 30, color: "#9aa0aa" }}>llamando…</div>
        </div>
      </div>
      <div
        style={{
          position: "absolute", left: 170, top: BOX.top + 250, width: 740, height: 700, background: "#efe29a", rotate: "-4deg",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)", padding: "60px 56px", scale: nota, opacity: nota, filter: "saturate(0.7)",
        }}
      >
        {lines.map((l, i) => (
          <div
            key={l}
            style={{
              fontFamily: hand, fontWeight: 700, fontSize: 86, lineHeight: 1.25, color: i >= 2 ? "#b3261e" : "#2c3550",
              opacity: interpolate(f, [16 + i * 4, 20 + i * 4], [0, 1], clamp),
            }}
          >
            {l}
          </div>
        ))}
      </div>
    </StepFrame>
  );
};

// ✅ Nuevo servicio → Prestadora → Asistencia del Sur → Remolque, con su tarifa
const steps: Step[] = [
  { from: 0, tap: 20, render: () => <A2ParaQuien pick="prestadora" time="15:12" /> },
  { from: 30, tap: 50, render: () => <P2QuePrestadora /> },
  { from: 60, tap: 80, render: () => <P3QueServicio /> },
];

export const Paso1Con: React.FC = () => {
  const f = useCurrentFrame();
  const card = interpolate(f, [84, 94], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.5)) });
  return (
    <StepFrame n={1} mode="con" title="Te pasan el servicio">
      <PhoneBox>
        <Flow steps={steps} />
      </PhoneBox>
      <div
        style={{
          position: "absolute", left: 110, right: 110, top: 1340, background: "rgba(12,14,18,0.96)", border: `4px solid ${AMBER}`, borderRadius: 32,
          padding: "28px 34px", opacity: card, scale: card,
        }}
      >
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 2, color: AMBER }}>✓ TARIFA DE ASISTENCIA DEL SUR</div>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 46, color: C.text, marginTop: 8, lineHeight: 1.15 }}>Base $ 45.000 · 20 km incluidos</div>
        <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 34, color: C.muted, marginTop: 6 }}>$ 1.500 por km de más · paga a 30 días</div>
      </div>
      {steps.map((s) => (
        <Audio key={s.tap} name="Toque" src={staticFile("sfx/mouse-click.wav")} from={s.tap} volume={0.45} />
      ))}
    </StepFrame>
  );
};

// Vista previa del paso: primero sin, después con
export const Paso1: React.FC = () => (
  <AbsoluteFill>
    <Series>
      <Series.Sequence durationInFrames={PASO1_SIN}>
        <Paso1Sin />
      </Series.Sequence>
      <Series.Sequence durationInFrames={PASO1_CON}>
        <Paso1Con />
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);
