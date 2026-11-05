import { Audio } from "@remotion/media";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Flow, Step, typed } from "./Flow";
import { B1Socio, B2Adicionales, B3Evidencia, B4Firma, B5Enviar } from "./Screens";
import { Ripple } from "./ui";

export const DESTINO_DUR = 245;
const FIRMA_SLOW = 0.5; // la firma se dibuja a la mitad de la velocidad real
const FIRMA_FROM = 128;
const SHOTS = [76, 84, 92, 100];
// FIRMA_FROM + 1,14 s ÷ 0,5 ≈ cuadro 197: el toque en «Finalizar» va en el 200
// Botón «Siguiente / Finalizar» del pie (1080×1920)
const NEXT = { x: 800, y: 1796 };
const NEXT_TAPS = [28, 64, 112, 200];

const steps: Step[] = [
  { from: 0, render: (f) => <B1Socio phone={typed("11 5555 0182", f, 4, 20)} /> },
  { from: 35, tap: 50, render: (f) => <B2Adicionales sel={f >= 15 ? "Transferencia" : ""} /> },
  { from: 70, render: (f) => <B3Evidencia count={SHOTS.filter((t) => f >= t - 70).length} /> },
  { from: 120, render: (f) => <B4Firma ms={Math.max(0, ((f - (FIRMA_FROM - 120)) / 30) * 1000 * FIRMA_SLOW)} /> },
  { from: 205, tap: 232, render: (f) => <B5Enviar sheet={interpolate(f, [2, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} /> },
];

// Parte B: en el destino se completa el remito y se manda por WhatsApp
export const RemitoDestinoScene: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Flow steps={steps} />
      {NEXT_TAPS.map((t) => (
        <div key={t} style={{ position: "absolute", left: NEXT.x, top: NEXT.y, width: 0, height: 0, zIndex: 60 }}>
          <Ripple f={f} at={t} />
        </div>
      ))}
      {[...NEXT_TAPS, 50, 232].map((t) => (
        <Audio key={`c${t}`} name="Toque" src={staticFile("sfx/mouse-click.wav")} from={t} volume={0.45} />
      ))}
      {SHOTS.map((t) => (
        <Audio key={`s${t}`} name="Foto" src={staticFile("sfx/shutter.wav")} from={t} volume={0.35} />
      ))}
    </AbsoluteFill>
  );
};
