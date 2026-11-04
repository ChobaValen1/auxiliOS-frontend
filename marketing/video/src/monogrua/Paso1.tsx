import { Audio } from "@remotion/media";
import { Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { clamp, hand, sans } from "../theme";
import { Flow, Step } from "../solo/Flow";
import { A2ParaQuien } from "../solo/Screens";
import { P2QuePrestadora, P3QueServicio } from "../solo/ScreensPrestadora";
import { PASO_T, PasoPreview } from "./PasoPreview";
import { KeyCard, PhoneBox, SAFE, StepFrame } from "./StepFrame";

export const PASO1_SIN = 48;
export const PASO1_CON = 104;
export const PASO1_DUR = PASO1_SIN + PASO1_CON - PASO_T;

// ❌ La asistencia llama y la tarifa queda en un papelito con dudas
export const Paso1Sin: React.FC = () => {
  const f = useCurrentFrame();
  const ring = Math.sin(f * 1.2) * 4;
  const nota = interpolate(f, [8, 18], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.4)) });
  const lines = ["Asist. del Sur", "Remolque → Lomas", "¿$ 40.000? ¿45?", "¿km incluidos??"];
  return (
    <StepFrame n={1} mode="sin" title="Te pasan el servicio">
      <div
        style={{
          position: "absolute", left: SAFE.left + 20, right: 1080 - SAFE.right + 20, top: 470, background: "#2a2c31", borderRadius: 32, padding: "24px 30px",
          display: "flex", alignItems: "center", gap: 22, rotate: `${ring * 0.3}deg`, opacity: interpolate(f, [0, 6], [0, 1], clamp),
        }}
      >
        <div style={{ width: 88, height: 88, borderRadius: "50%", background: "#3d8f5a", display: "grid", placeItems: "center", fontSize: 48 }}>📞</div>
        <div style={{ fontFamily: sans }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: "#e3e5ea" }}>Asistencia del Sur</div>
          <div style={{ fontSize: 30, color: "#9aa0aa" }}>llamando…</div>
        </div>
      </div>
      <div
        style={{
          position: "absolute", left: 150, top: 640, width: 720, height: 560, background: "#efe29a", rotate: "-4deg",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)", padding: "44px 50px", scale: nota, opacity: nota, filter: "saturate(0.7)",
        }}
      >
        {lines.map((l, i) => (
          <div key={l} style={{ fontFamily: hand, fontWeight: 700, fontSize: 82, lineHeight: 1.2, color: i >= 2 ? "#b3261e" : "#2c3550", opacity: interpolate(f, [14 + i * 4, 18 + i * 4], [0, 1], clamp) }}>
            {l}
          </div>
        ))}
      </div>
    </StepFrame>
  );
};

// ✅ Nuevo servicio → Prestadora → Asistencia del Sur → Remolque, con su tarifa
const steps: Step[] = [
  { from: 0, tap: 22, render: () => <A2ParaQuien pick="prestadora" time="15:12" /> },
  { from: 32, tap: 54, render: () => <P2QuePrestadora /> },
  { from: 64, tap: 84, render: () => <P3QueServicio /> },
];

export const Paso1Con: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <StepFrame n={1} mode="con" title="Te pasan el servicio">
      <PhoneBox>
        <Flow steps={steps} />
      </PhoneBox>
      <KeyCard
        show={interpolate(f, [88, 98], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.5)) })}
        label="✓ TARIFA DE ASISTENCIA DEL SUR"
        title="Base $ 45.000 · 20 km incluidos"
        sub="$ 1.500 por km de más · paga a 30 días"
      />
      {steps.map((s) => (
        <Audio key={s.tap} name="Toque" src={staticFile("sfx/mouse-click.wav")} from={s.tap} volume={0.45} />
      ))}
    </StepFrame>
  );
};

// El paso completo: sin → barrido → con
export const Paso1: React.FC<{ guia?: boolean }> = ({ guia = false }) => (
  <PasoPreview sin={<Paso1Sin />} con={<Paso1Con />} sinDur={PASO1_SIN} conDur={PASO1_CON} guia={guia} />
);
