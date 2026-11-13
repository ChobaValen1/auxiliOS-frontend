import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { C, display, mono, sans, clamp } from "../theme";
import { Hazard } from "./Hazard";

const Tile: React.FC<{ tag: string; title: string; sub: string; delay: number }> = ({ tag, title, sub, delay }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        background: C.card,
        border: `2px solid ${C.border}`,
        borderTop: `8px solid ${C.orange}`,
        borderRadius: 24,
        padding: "34px 32px",
        height: 330,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        opacity: interpolate(frame, [delay, delay + 6], [0, 1], clamp),
        scale: interpolate(frame, [delay, delay + 12], [0.7, 1], { ...clamp, easing: Easing.out(Easing.back(1.5)) }),
      }}
    >
      <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 34, color: C.orange }}>{tag}</div>
      <div>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 50, color: C.text, lineHeight: 1.05 }}>{title}</div>
        <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 32, color: C.muted, marginTop: 10, lineHeight: 1.2 }}>{sub}</div>
      </div>
    </div>
  );
};

// 12,5–15,5 s: el resto de la plataforma
export const FeaturesScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <Hazard />
      <Interactive.Div
        name="Titulo"
        style={{
          position: "absolute",
          top: 270,
          left: 80,
          right: 80,
          fontFamily: display,
          fontSize: 150,
          lineHeight: 0.95,
          color: C.text,
          opacity: interpolate(frame, [0, 8], [0, 1], { ...clamp }),
        }}
      >
        Y además, la oficina
      </Interactive.Div>
      <div style={{ position: "absolute", top: 560, left: 80, right: 80, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
        <Tile delay={8} tag="$ SUELDOS" title="Liquidación" sub="calculada con los servicios" />
        <Tile delay={14} tag="⛽ GASOIL" title="Combustible" sub="controlado contra los km" />
        <Tile delay={20} tag="# TARIFAS" title="Por cliente" sub="sin hacer cuentas a mano" />
        <Tile delay={26} tag="↗ COBROS" title="Cobranzas" sub="sabés quién te debe" />
      </div>
    </AbsoluteFill>
  );
};
