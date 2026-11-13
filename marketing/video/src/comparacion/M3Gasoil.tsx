import { interpolate, useCurrentFrame } from "remotion";
import { C, clamp, mono, sans } from "../theme";
import { Split } from "./Split";
import { AMBER, countUp, fade, Label, money, Phone, pop, Verdict } from "./ui";

export const M3_DUR = 165;

const Ticket: React.FC<{ left: number; top: number; rot: number; ink: number; scale?: number }> = ({ left, top, rot, ink, scale = 1 }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width: 280,
      height: 470,
      background: "#f7f6f2",
      rotate: `${rot}deg`,
      scale,
      boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
      clipPath: "polygon(0 0,100% 0,100% 96%,92% 100%,84% 96%,76% 100%,68% 96%,60% 100%,52% 96%,44% 100%,36% 96%,28% 100%,20% 96%,12% 100%,4% 96%,0 100%)",
      padding: "30px 24px",
      fontFamily: mono,
      fontSize: 20,
      color: "#3a3a3a",
    }}
  >
    <div style={{ opacity: ink }}>
      <div style={{ textAlign: "center", fontWeight: 700 }}>ESTACIÓN DE SERVICIO</div>
      <div style={{ textAlign: "center", fontSize: 16, marginTop: 4 }}>-----------------------</div>
      <div style={{ marginTop: 20 }}>GASOIL</div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>62,4 L</span>
        <span>x 1.362</span>
      </div>
      <div style={{ marginTop: 26, fontSize: 16 }}>-----------------------</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 26, marginTop: 8 }}>
        <span>TOTAL</span>
        <span>$ 85.000</span>
      </div>
      <div style={{ marginTop: 40, fontSize: 15, lineHeight: 1.6 }}>
        23/10 18:31
        <br />
        GRACIAS POR SU COMPRA
      </div>
    </div>
  </div>
);

const PaperSide: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <>
      <Ticket left={260} top={70} rot={9} ink={0.25} scale={0.85} />
      <Ticket left={80} top={40} rot={-4} ink={interpolate(f, [24, 96], [1, 0.07], clamp)} />
      <Verdict ok={false} at={90} title="El ticket se borra" sub="¿Cuánto gastaste en gasoil este mes?" />
    </>
  );
};

const SoloSide: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <>
      <Phone>
        <Label>TIPO DE GASTO</Label>
        <div style={{ display: "flex", gap: 8 }}>
          {["Combustible", "Peaje", "Comida"].map((c, i) => (
            <div
              key={c}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                fontFamily: sans,
                fontWeight: 700,
                fontSize: 19,
                background: i === 0 && f > 14 ? AMBER : "#191d27",
                color: i === 0 && f > 14 ? "#14161b" : C.muted,
                border: "2px solid #2a3040",
              }}
            >
              {c}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14, background: "#191d27", border: "2px solid #2a3040", borderRadius: 14, padding: 12, opacity: fade(f, 26, 32), scale: pop(f, 26, 38) }}>
          <div style={{ width: 60, height: 80, background: "#f7f6f2", borderRadius: 4 }} />
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 22, color: C.green }}>✓ Foto del ticket agregada</div>
        </div>
        <Label>IMPORTE</Label>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 52, color: C.text }}>{money(countUp(f, 42, 70, 85000))}</div>
        <div
          style={{
            marginTop: 16,
            background: "rgba(245,166,35,0.12)",
            border: `2px solid ${AMBER}`,
            borderRadius: 14,
            padding: "12px 16px",
            opacity: fade(f, 84, 90),
            scale: pop(f, 84, 96),
          }}
        >
          <div style={{ fontFamily: mono, fontSize: 17, color: AMBER, letterSpacing: 1 }}>TOTAL GASTADO · OCTUBRE</div>
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 36, color: C.text }}>{money(countUp(f, 88, 110, 412000))}</div>
        </div>
      </Phone>
      <Verdict ok at={104} title="Cada ticket, con foto" sub="Se suma solo al total del mes." />
    </>
  );
};

export const M3Gasoil: React.FC = () => <Split dur={M3_DUR} time="18:30" prevTime="14:15" label="GASOIL" paper={<PaperSide />} solo={<SoloSide />} />;
