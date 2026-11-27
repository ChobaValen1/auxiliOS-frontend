import { Easing, interpolate, useCurrentFrame } from "remotion";
import { C, clamp, mono, sans } from "../theme";
import { Split } from "./Split";
import { AMBER, fade, Label, PaperSlip, Phone, pop, Scribble, Verdict } from "./ui";

export const M1_DUR = 180;

const Qr: React.FC = () => {
  const cells = [];
  for (let y = 0; y < 13; y++)
    for (let x = 0; x < 13; x++) {
      const finder = (x < 4 && y < 4) || (x > 8 && y < 4) || (x < 4 && y > 8);
      const on = finder ? !(x % 9 === 1 || y % 9 === 1) || (x % 9 === 2 && y % 9 === 2) : (x * 7 + y * 13 + x * y) % 3 === 0;
      if (on) cells.push(<rect key={`${x}-${y}`} x={x * 10} y={y * 10} width={10} height={10} fill="#0c0e12" />);
    }
  return (
    <svg viewBox="-10 -10 150 150" width={150} height={150} style={{ background: "#fff", borderRadius: 10 }}>
      {cells}
    </svg>
  );
};

const PaperSide: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <>
      <PaperSlip>
        <div style={{ position: "absolute", left: 0, right: 0, top: 70 }}>
          <Scribble y={20} w={330} from={10} to={30} seed={1} />
          <Scribble y={70} w={280} from={28} to={44} seed={2} />
          <Scribble y={120} w={310} from={42} to={56} seed={3} />
          <Scribble y={170} w={200} from={54} to={64} seed={4} />
        </div>
        <div style={{ position: "absolute", left: 30, bottom: 120, fontSize: 22 }}>FOTOS: —</div>
        <div style={{ position: "absolute", left: 30, right: 30, bottom: 40, borderTop: "2px dashed #8a8372", paddingTop: 8, fontSize: 20 }}>Firma</div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 30 }}>
          <Scribble y={0} w={180} from={64} to={72} seed={9} color="#1d2b6b" />
        </div>
      </PaperSlip>
      <div style={{ position: "absolute", left: 300, top: 340, fontFamily: mono, fontWeight: 700, fontSize: 30, color: C.red, border: `4px solid ${C.red}`, padding: "4px 14px", rotate: "-10deg", opacity: fade(f, 80, 84), scale: pop(f, 80, 92) }}>
        SIN FOTOS
      </div>
      <Verdict ok={false} at={84} title="Sin fotos del vehículo" sub="Letra ilegible. Si se pierde, no hay copia." />
    </>
  );
};

const SoloSide: React.FC = () => {
  const f = useCurrentFrame();
  const step = f < 48 ? 4 : 5;
  const qr = fade(f, 100, 108);
  return (
    <>
      <Phone>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, color: C.text }}>Remito N.º 0482</div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: i <= step ? AMBER : "#2a3040" }} />
          ))}
        </div>
        <div style={{ fontFamily: mono, fontSize: 18, color: AMBER, marginTop: 8 }}>{step === 4 ? "Paso 4: Evidencia" : "Paso 5: Firma"}</div>
        <Label>FIRMA Y FOTOS</Label>
        <div style={{ display: "flex", gap: 10 }}>
          {[14, 22, 30].map((d) => (
            <div key={d} style={{ flex: 1, height: 84, borderRadius: 12, background: "linear-gradient(160deg,#3a4256,#232836)", scale: pop(f, d, d + 10), opacity: fade(f, d, d + 4), position: "relative" }}>
              <div style={{ position: "absolute", left: "20%", right: "20%", bottom: 20, height: 20, borderRadius: "10px 10px 4px 4px", background: "#59627a" }} />
              <div style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: "50%", background: C.green, color: "#0b1a12", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, height: 120, borderRadius: 12, background: "#f3f4f7", position: "relative" }}>
          <svg viewBox="0 0 340 120" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <path
              d="M20 80 C 40 25, 62 22, 68 70 S 90 108, 108 56 S 140 18, 148 72 C 152 98, 175 88, 186 62 S 215 44, 222 72 S 255 95, 266 54 L 280 68 C 292 78, 310 56, 325 50"
              fill="none"
              stroke="#1b2a6b"
              strokeWidth={5}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={interpolate(f, [50, 90], [1, 0], { ...clamp, easing: Easing.inOut(Easing.quad) })}
            />
          </svg>
        </div>
        {/* QR de verificación */}
        <div style={{ position: "absolute", inset: 0, background: "rgba(12,14,18,0.95)", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 110, gap: 16, opacity: qr }}>
          <div style={{ scale: pop(f, 100, 114) }}>
            <Qr />
          </div>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, color: C.green }}>✓ Remito firmado</div>
          <div style={{ fontFamily: mono, fontSize: 18, color: C.muted }}>Código de verificación</div>
        </div>
      </Phone>
      <Verdict ok at={112} title="Fotos, firma y QR" sub="Queda guardado y se puede verificar." />
    </>
  );
};

export const M1Remito: React.FC = () => <Split dur={M1_DUR} time="09:40" label="EL REMITO" paper={<PaperSide />} solo={<SoloSide />} />;
