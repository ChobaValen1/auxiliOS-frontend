import { Audio } from "@remotion/media";
import { Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { clamp, hand, mono } from "../theme";
import { Flow, Step } from "../solo/Flow";
import { FacturacionPrestadora, MisNumeros } from "../solo/ScreensPrestadora";
import { Ripple } from "../solo/ui";
import { PASO_T, PasoPreview } from "./PasoPreview";
import { KeyCard, PhoneBox, StepFrame } from "./StepFrame";

export const PASO3_SIN = 120; // 3 s de escena + 1 s de la ✕
export const PASO3_CON = 255;
export const PASO3_DUR = PASO3_SIN + PASO3_CON - PASO_T;

// ❌ El cuaderno de cobros: ¿me pagó?, ¿cuánto me quedó?
export const Paso3Sin: React.FC = () => {
  const f = useCurrentFrame();
  const page = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const lines: [string, string][] = [
    ["Asist. del Sur · 4 remitos", "#2a3a8a"],
    ["¿Me pagó? ¿Cuándo vence?", "#b3261e"],
    ["Cobré: 52.500 + 45… + ¿?", "#2a3a8a"],
    ["¿Cuánto me quedó?", "#b3261e"],
  ];
  return (
    <StepFrame n={3} mode="sin" title="Cobrar el servicio">
      <div
        style={{
          position: "absolute", left: 130, top: 500, width: 780, height: 700, rotate: "2deg", opacity: page, translate: `0px ${(1 - page) * 120}px`,
          background: "repeating-linear-gradient(180deg, #f4f1e8 0 70px, #b9c7dd 70px 72px)", boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          borderLeft: "8px solid #d86a6a", padding: "34px 40px 0 56px", filter: "saturate(0.7)",
        }}
      >
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, color: "#5b574c", letterSpacing: 3, height: 72 }}>COBROS · NOV</div>
        {lines.map(([l, col], i) => (
          <div key={l} style={{ position: "relative", height: 72, fontFamily: hand, fontWeight: 700, fontSize: 62, lineHeight: "72px", color: col, opacity: interpolate(f, [16 + i * 12, 22 + i * 12], [0, 1], clamp) }}>
            {l}
            {i === 2 ? <div style={{ position: "absolute", left: -6, top: 36, height: 6, background: "#b3261e", width: interpolate(f, [52, 60], [0, 560], clamp), rotate: "-3deg" }} /> : null}
          </div>
        ))}
      </div>
    </StepFrame>
  );
};

// ✅ Facturación de la asistencia → Marcar cobrado → confirmar → Mis números
const TAP_COBRADO = 76;
const TAP_CONFIRMAR = 106;
const NUMEROS_FROM = 148;
const steps: Step[] = [
  { from: 0, render: (f) => <FacturacionPrestadora estado={f < TAP_COBRADO + 2 ? "porCobrar" : f < TAP_CONFIRMAR + 2 ? "confirmar" : "cobrado"} /> },
  { from: NUMEROS_FROM, render: (f) => <MisNumeros queda={interpolate(f, [8, 40], [0, 722000], { ...clamp, easing: Easing.out(Easing.cubic) })} /> },
];

export const Paso3Con: React.FC = () => {
  const f = useCurrentFrame();
  // baja hasta el botón «Marcar cobrado» y, en Mis números, vuelve arriba
  const scroll = f < NUMEROS_FROM ? interpolate(f, [46, 60], [0, 640], { ...clamp, easing: Easing.inOut(Easing.cubic) }) : 0;
  return (
    <StepFrame n={3} mode="con" title="Cobrar el servicio">
      <PhoneBox scroll={scroll}>
        <Flow steps={steps} />
        {[TAP_COBRADO, TAP_CONFIRMAR].map((t) => (
          <div key={t} style={{ position: "absolute", left: 760, top: 1796, width: 0, height: 0, zIndex: 60 }}>
            <Ripple f={f} at={t} />
          </div>
        ))}
        {/* aviso de la app al marcar */}
        <div
          style={{
            position: "absolute", left: 140, right: 140, top: 1520, zIndex: 70, padding: "22px 30px", borderRadius: 24, background: "#27c47a", color: "#06180f",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 40, textAlign: "center",
            opacity: interpolate(f, [TAP_CONFIRMAR + 4, TAP_CONFIRMAR + 10, NUMEROS_FROM - 8, NUMEROS_FROM - 2], [0, 1, 1, 0], clamp),
          }}
        >
          ✓ Marcado como cobrado
        </div>
      </PhoneBox>
      <KeyCard
        show={interpolate(f, [198, 210], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.5)) })}
        label="✓ COBRADO · NOVIEMBRE"
        title="Te quedaron $ 722.000"
        sub="Cada servicio te dejó $ 40.111"
      />
      {[TAP_COBRADO, TAP_CONFIRMAR].map((t) => (
        <Audio key={t} name="Toque" src={staticFile("sfx/mouse-click.wav")} from={t} volume={0.45} />
      ))}
      <Audio name="Cobrado" src={staticFile("sfx/ding.wav")} from={TAP_CONFIRMAR + 4} volume={0.5} />
    </StepFrame>
  );
};

export const Paso3: React.FC<{ guia?: boolean }> = ({ guia = false }) => (
  <PasoPreview sin={<Paso3Sin />} con={<Paso3Con />} sinDur={PASO3_SIN} conDur={PASO3_CON} guia={guia} />
);
