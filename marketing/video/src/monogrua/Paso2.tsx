import { Audio } from "@remotion/media";
import { Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, clamp, hand, mono } from "../theme";
import { Flow, Step } from "../solo/Flow";
import { B3Evidencia, B4Firma } from "../solo/Screens";
import { Ripple } from "../solo/ui";
import { PASO_T, PasoPreview } from "./PasoPreview";
import { KeyCard, PhoneBox, StepFrame } from "./StepFrame";

export const PASO2_SIN = 96;
export const PASO2_CON = 250;
export const PASO2_DUR = PASO2_SIN + PASO2_CON - PASO_T;

const HINT = "Asistencia del Sur · Remolque";

// Garabato que se escribe rápido (firma apurada)
const Garabato: React.FC<{ from: number; to: number }> = ({ from, to }) => {
  const f = useCurrentFrame();
  return (
    <svg viewBox="0 0 400 120" width={400} height={120} style={{ overflow: "visible" }}>
      <path
        d="M10 80 C 40 10, 60 110, 90 50 S 130 20, 140 70 L 170 40 C 190 90, 210 20, 240 60 S 300 90, 390 30"
        fill="none" stroke="#24306a" strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray={1}
        strokeDashoffset={interpolate(f, [from, to], [1, 0], clamp)}
      />
    </svg>
  );
};

// ❌ Remito de talonario: a mano, sin fotos y con la firma apurada
export const Paso2Sin: React.FC = () => {
  const f = useCurrentFrame();
  const sheet = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const stamp = interpolate(f, [74, 82], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.8)) });
  const lines = ["Asist. del Sur", "Pat. AB 123 C…", "Luis Guillón → Lomas", "Fotos: —"];
  return (
    <StepFrame n={2} mode="sin" title="El remito">
      {/* copia en carbónico, asomando abajo */}
      <div style={{ position: "absolute", left: 180, top: 500, width: 720, height: 720, background: "#cfd6ea", rotate: "3deg", opacity: sheet * 0.9 }} />
      <div
        style={{
          position: "absolute", left: 150, top: 470, width: 720, height: 720, background: "#ece6d6", rotate: "-2deg", boxShadow: "0 24px 60px rgba(0,0,0,.5)",
          padding: "34px 44px", translate: `0px ${(1 - sheet) * 120}px`, opacity: sheet, filter: "saturate(0.7)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontWeight: 700, fontSize: 34, color: "#3d3a33", borderBottom: "3px solid #3d3a33", paddingBottom: 10 }}>
          <span>REMITO</span>
          <span style={{ color: "#a33" }}>N° 0482</span>
        </div>
        {lines.map((l, i) => (
          <div key={l} style={{ fontFamily: hand, fontWeight: 700, fontSize: 64, lineHeight: 1.25, color: "#2a3a8a", marginTop: i === 0 ? 14 : 0, opacity: interpolate(f, [16 + i * 10, 22 + i * 10], [0, 1], clamp) }}>
            {l}
          </div>
        ))}
        <div style={{ position: "absolute", left: 44, right: 44, bottom: 40, borderTop: "2px dashed #8a8372", paddingTop: 6, fontFamily: mono, fontSize: 24, color: "#5b574c" }}>Firma</div>
        <div style={{ position: "absolute", left: 70, bottom: 70 }}>
          <Garabato from={58} to={66} />
        </div>
      </div>
      <div
        style={{
          position: "absolute", left: 470, top: 860, fontFamily: mono, fontWeight: 700, fontSize: 52, color: C.red, border: `6px solid ${C.red}`, padding: "6px 22px",
          rotate: "-12deg", opacity: stamp, scale: 1.8 - stamp * 0.8,
        }}
      >
        SIN FOTOS
      </div>
    </StepFrame>
  );
};

// ✅ Evidencia con tus fotos → firma con tu trazo → Finalizar
const SHOTS = [20, 38, 56, 74];
const FIRMA_FROM = 128; // a la mitad de la velocidad real: 1,14 s → 2,3 s (termina en el cuadro ~196)
const FIRMA_SLOW = 0.5;
const steps: Step[] = [
  { from: 0, render: (f) => <B3Evidencia hint={HINT} time="15:58" count={SHOTS.filter((t) => f >= t).length} /> },
  { from: 110, render: (f) => <B4Firma hint={HINT} time="16:01" ms={Math.max(0, ((f - (FIRMA_FROM - 110)) / 30) * 1000 * FIRMA_SLOW)} /> },
];
const NEXT_TAPS = [100, 206];

export const Paso2Con: React.FC = () => {
  const f = useCurrentFrame();
  // sube para mostrar la segunda fila de fotos y, en la firma, el recuadro de firma
  const scroll = f < 110 ? interpolate(f, [48, 62], [0, 260], { ...clamp, easing: Easing.inOut(Easing.cubic) }) : 430;
  return (
    <StepFrame n={2} mode="con" title="El remito">
      <PhoneBox scroll={scroll}>
        <Flow steps={steps} />
        {NEXT_TAPS.map((t) => (
          <div key={t} style={{ position: "absolute", left: 800, top: 1796, width: 0, height: 0, zIndex: 60 }}>
            <Ripple f={f} at={t} />
          </div>
        ))}
      </PhoneBox>
      <KeyCard
        show={interpolate(f, [212, 224], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.5)) })}
        label="✓ REMITO N.º 0482 FIRMADO"
        title="4 fotos y la firma del socio"
        sub="Con código para verificar que es original"
      />
      {SHOTS.map((t) => (
        <Audio key={`s${t}`} name="Foto" src={staticFile("sfx/shutter.wav")} from={t} volume={0.35} />
      ))}
      {NEXT_TAPS.map((t) => (
        <Audio key={`c${t}`} name="Toque" src={staticFile("sfx/mouse-click.wav")} from={t} volume={0.45} />
      ))}
    </StepFrame>
  );
};

export const Paso2: React.FC<{ guia?: boolean }> = ({ guia = false }) => (
  <PasoPreview sin={<Paso2Sin />} con={<Paso2Con />} sinDur={PASO2_SIN} conDur={PASO2_CON} guia={guia} />
);

