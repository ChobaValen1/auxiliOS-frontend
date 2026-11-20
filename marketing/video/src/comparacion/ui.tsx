import { Easing, interpolate, useCurrentFrame } from "remotion";
import { C, clamp, display, mono, sans } from "../theme";

export const AMBER = "#f5a623"; // acento de AuxiliOS Solo (ui/tokens.css)
export const PAPER_BG = "#1c1d20";

// Layout de la pantalla partida (1080×1920)
export const PAPER_TOP = 150;
export const HALF_H = 650;
export const BAND_TOP = 800;
export const BAND_H = 90;
export const SOLO_TOP = 890;

export const fade = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], clamp);
export const pop = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0.4, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
export const money = (n: number) => "$ " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const countUp = (f: number, a: number, b: number, to: number) =>
  interpolate(f, [a, b], [0, to], { ...clamp, easing: Easing.out(Easing.cubic) });

export const SoloBrand: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ fontFamily: display, fontSize: size, color: C.text, letterSpacing: size * 0.04, lineHeight: 1, whiteSpace: "nowrap" }}>
    AUXILI<span style={{ color: AMBER }}>OS</span>
    <span style={{ fontSize: size * 0.5, letterSpacing: size * 0.1, color: C.muted, marginLeft: size * 0.18 }}>SOLO</span>
  </div>
);

// Celular recortado: se ve la parte de arriba de la pantalla
export const Phone: React.FC<{ children: React.ReactNode; signal?: "ok" | "off" }> = ({ children, signal = "ok" }) => (
  <div
    style={{
      position: "absolute",
      left: 70,
      top: 0,
      width: 410,
      height: 560,
      borderRadius: "54px 54px 0 0",
      background: "#05060a",
      border: "4px solid #3a4152",
      borderBottom: "none",
      padding: "18px 18px 0",
      boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
    }}
  >
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: "38px 38px 0 0", background: "#0c0e12", overflow: "hidden", padding: "56px 24px 0" }}>
      <div style={{ position: "absolute", top: 14, left: "50%", marginLeft: -55, width: 110, height: 28, borderRadius: 16, background: "#05060a" }} />
      <div style={{ position: "absolute", top: 18, right: 26, display: "flex", alignItems: "flex-end", gap: 3 }}>
        {[8, 12, 16, 20].map((h, i) => (
          <div key={i} style={{ width: 5, height: h, borderRadius: 2, background: signal === "ok" ? C.text : "#3a4152" }} />
        ))}
        {signal === "off" ? <div style={{ position: "absolute", left: -4, right: -4, top: 9, height: 3, background: C.red, rotate: "-35deg" }} /> : null}
      </div>
      <div style={{ marginBottom: 14 }}>
        <SoloBrand size={30} />
      </div>
      {children}
    </div>
  </div>
);

export const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontFamily: mono, fontSize: 17, color: C.muted, letterSpacing: 1.5, marginTop: 14, marginBottom: 8 }}>{children}</div>
);

// Columna derecha: resultado del momento
export const Verdict: React.FC<{ ok: boolean; title: string; sub: string; at: number }> = ({ ok, title, sub, at }) => {
  const f = useCurrentFrame();
  const col = ok ? C.green : C.red;
  return (
    <div style={{ position: "absolute", left: 560, right: 50, top: 150, opacity: fade(f, at, at + 6), translate: interpolate(f, [at, at + 12], ["0px 30px", "0px 0px"], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) }) }}>
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: "50%",
          background: ok ? "rgba(39,196,122,0.16)" : "rgba(226,80,74,0.16)",
          border: `4px solid ${col}`,
          color: col,
          fontFamily: sans,
          fontWeight: 700,
          fontSize: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          scale: pop(f, at, at + 12),
        }}
      >
        {ok ? "✓" : "!"}
      </div>
      <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 54, lineHeight: 1.05, color: C.text, marginTop: 22 }}>{title}</div>
      <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 34, lineHeight: 1.25, color: C.muted, marginTop: 14 }}>{sub}</div>
    </div>
  );
};

// Hoja de papel (remito de talonario)
export const PaperSlip: React.FC<{ children?: React.ReactNode; blur?: number }> = ({ children, blur = 0 }) => (
  <div
    style={{
      position: "absolute",
      left: 70,
      top: 30,
      width: 420,
      height: 500,
      background: "#ece6d6",
      borderRadius: 6,
      rotate: "-3deg",
      boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
      padding: 30,
      overflow: "hidden",
      fontFamily: mono,
      color: "#3d3a33",
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, fontWeight: 700, borderBottom: "3px solid #3d3a33", paddingBottom: 10, filter: `blur(${blur}px)` }}>
      <span>REMITO</span>
      <span style={{ color: "#a33" }}>N° 0482</span>
    </div>
    {children}
  </div>
);

// Garabato manuscrito que se va escribiendo
export const Scribble: React.FC<{ y: number; w: number; from: number; to: number; seed: number; color?: string; blur?: number }> = ({ y, w, from, to, seed, color = "#2a3a8a", blur = 0 }) => {
  const f = useCurrentFrame();
  let d = `M0 ${y}`;
  for (let i = 1; i <= 14; i++) {
    const x = (w / 14) * i;
    const dy = Math.sin(i * 1.7 + seed) * 9 + Math.cos(i * 0.9 + seed * 2) * 5;
    d += ` Q ${x - w / 28} ${y + dy - 10} ${x} ${y + dy}`;
  }
  return (
    <svg width={360} height={y + 30} style={{ position: "absolute", left: 30, top: 0, overflow: "visible", filter: `blur(${blur}px)` }}>
      <path d={d} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={interpolate(f, [from, to], [1, 0], clamp)} />
    </svg>
  );
};
