import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from "remotion";
import { C, clamp, display, mono, sans } from "../theme";
import { AMBER, fade, pop } from "./ui";

export const BALANCE_DUR = 105;

const rows = ["Fotos y firma del servicio", "Comprobante que no se pierde", "Gastos con su ticket", "Sabés cuánto te queda"];

export const Balance: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 26, background: `repeating-linear-gradient(-45deg, ${C.yellow} 0 26px, #111 26px 52px)` }} />
      <Interactive.Div
        name="Titulo balance"
        style={{
          position: "absolute",
          top: 260,
          left: 80,
          right: 80,
          fontFamily: display,
          fontSize: 140,
          lineHeight: 0.95,
          color: C.text,
          opacity: interpolate(f, [0, 8], [0, 1], { ...clamp }),
        }}
      >
        El balance del día
      </Interactive.Div>
      <div style={{ position: "absolute", top: 450, left: 80, right: 80 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 0, fontFamily: mono, fontWeight: 700, fontSize: 28, letterSpacing: 2, opacity: fade(f, 6, 12) }}>
          <div style={{ width: 170, textAlign: "center", color: "#9a9ea6" }}>PAPEL</div>
          <div style={{ width: 170, textAlign: "center", color: AMBER }}>SOLO</div>
        </div>
        {rows.map((r, i) => {
          const at = 12 + i * 10;
          return (
            <div
              key={r}
              style={{
                display: "flex",
                alignItems: "center",
                height: 150,
                borderBottom: `2px solid ${C.border}`,
                opacity: fade(f, at, at + 6),
                translate: interpolate(f, [at, at + 12], ["-60px 0px", "0px 0px"], clamp),
              }}
            >
              <div style={{ flex: 1, fontFamily: sans, fontWeight: 700, fontSize: 46, color: C.text, lineHeight: 1.1, paddingRight: 20 }}>{r}</div>
              <div style={{ width: 170, display: "flex", justifyContent: "center" }}>
                <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 70, color: C.red, scale: pop(f, at + 6, at + 16) }}>✕</div>
              </div>
              <div style={{ width: 170, display: "flex", justifyContent: "center" }}>
                <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 70, color: C.green, scale: pop(f, at + 10, at + 20) }}>✓</div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
