import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { clamp, display, mono, sans } from "../../theme";
import { Ico } from "../../solo/ui";

// Pantallas «de anuncio»: inspiradas en AuxiliOS Solo, simplificadas y grandes para Reels.
// Todo se mide en px del video dentro del celular (ancho útil 860).
export const U = {
  bg: "#0c0e12",
  card: "#171b24",
  card2: "#1e2330",
  line: "#2c3242",
  text: "#eef0f5",
  muted: "#9aa3b8",
  accent: "#f5a623",
  accentFg: "#1a1203",
  ok: "#27c47a",
  bad: "#f0716b",
};
export const PHONE = { left: 110, top: 440, w: 860, h: 1520 };
export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const ramp = (f: number, a: number, b: number, e = ease) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: e });
export const pop = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
export const money = (n: number) => "$ " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
// Se achica un poco al tocarlo
export const press = (f: number, at?: number) => (at === undefined ? 1 : interpolate(f, [at - 4, at, at + 6], [1, 0.95, 1], clamp));

// Celular: entra con una leve inclinación 3D y queda fijo
export const Phone: React.FC<{ children: React.ReactNode; time?: string }> = ({ children, time = "15:12" }) => {
  const f = useCurrentFrame();
  const e = ramp(f, 0, 16);
  return (
    <div style={{ position: "absolute", inset: 0, perspective: 1600 }}>
      <div
        style={{
          position: "absolute", left: PHONE.left - 16, top: PHONE.top - 16, width: PHONE.w + 32, height: PHONE.h + 32, borderRadius: 78,
          background: "#05060a", border: "4px solid #3a4152", boxShadow: "0 50px 140px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.04) inset",
          rotate: `x ${(1 - e) * 16}deg`, translate: `0px ${(1 - e) * 160}px`, opacity: e, transformOrigin: "50% 100%",
        }}
      >
        <div style={{ position: "absolute", left: 16, top: 16, width: PHONE.w, height: PHONE.h, borderRadius: 62, overflow: "hidden", background: U.bg }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 44px", fontFamily: sans, fontWeight: 700, fontSize: 30, color: U.text, zIndex: 5 }}>
            <span>{time}</span>
            <span style={{ width: 150, height: 34, borderRadius: 20, background: "#05060a" }} />
            <span style={{ display: "flex", gap: 5, alignItems: "flex-end" }}>
              {[10, 15, 20, 25].map((h) => <i key={h} style={{ width: 6, height: h, borderRadius: 2, background: U.text }} />)}
            </span>
          </div>
          <div style={{ position: "absolute", top: 64, left: 0, right: 0, bottom: 0 }}>{children}</div>
        </div>
      </div>
    </div>
  );
};

export const Header: React.FC<{ title: string; sub?: string; f: number }> = ({ title, sub, f }) => (
  <div style={{ padding: "18px 44px 0", opacity: ramp(f, 0, 10), translate: `0px ${(1 - ramp(f, 0, 10)) * 20}px` }}>
    <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: U.accent }}>
      AUXILI<span style={{ color: U.text }}>OS</span>
    </div>
    <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 54, color: U.text, marginTop: 8, lineHeight: 1.05 }}>{title}</div>
    {sub ? <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 32, color: U.muted, marginTop: 6 }}>{sub}</div> : null}
  </div>
);

// Pantallas en orden con transición «zoom»: la que sale se achica y se apaga, la que entra crece
export type Shot = { from: number; render: (f: number) => React.ReactNode };
const T = 10;
export const Shots: React.FC<{ shots: Shot[] }> = ({ shots }) => {
  const f = useCurrentFrame();
  const cur = shots.reduce((k, s, i) => (f >= s.from ? i : k), 0);
  const next = shots[cur];
  const inT = ramp(f, next.from, next.from + T);
  return (
    <AbsoluteFill>
      {cur > 0 && inT < 1 ? (
        <AbsoluteFill style={{ opacity: 1 - inT, scale: 1 - inT * 0.06 }}>{shots[cur - 1].render(f - shots[cur - 1].from)}</AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ opacity: cur > 0 ? inT : 1, scale: cur > 0 ? 1.06 - inT * 0.06 : 1 }}>{next.render(f - next.from)}</AbsoluteFill>
    </AbsoluteFill>
  );
};

// Dedo: círculo que baja, aprieta y suelta una onda
export const Finger: React.FC<{ f: number; at: number; x: number; y: number }> = ({ f, at, x, y }) => {
  if (f < at - 14 || f > at + 16) return null;
  const come = ramp(f, at - 14, at - 2);
  const out = ramp(f, at, at + 16);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, zIndex: 80, pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: -90, top: -90, width: 180, height: 180, borderRadius: "50%", border: "6px solid rgba(255,255,255,.8)", opacity: f >= at ? 1 - out : 0, scale: 0.5 + out }} />
      <div style={{ position: "absolute", left: -44, top: -44, width: 88, height: 88, borderRadius: "50%", background: "rgba(255,255,255,.85)", boxShadow: "0 8px 30px rgba(0,0,0,.4)", opacity: (f < at ? come : 1 - out) * 0.9, scale: f < at ? 1.4 - come * 0.4 : 0.85 }} />
    </div>
  );
};

export const Pill: React.FC<{ children: React.ReactNode; color: string; style?: React.CSSProperties }> = ({ children, color, style }) => (
  <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 26, padding: "6px 16px", borderRadius: 999, color, background: `${color}22`, whiteSpace: "nowrap", ...style }}>{children}</span>
);

export const BigButton: React.FC<{ children: React.ReactNode; f: number; tap?: number; color?: string; fg?: string; style?: React.CSSProperties }> = ({ children, f, tap, color = U.accent, fg = U.accentFg, style }) => (
  <div
    style={{
      height: 112, borderRadius: 28, background: color, color: fg, display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
      fontFamily: sans, fontWeight: 700, fontSize: 42, scale: press(f, tap), boxShadow: `0 16px 40px ${color}55`, ...style,
    }}
  >
    {children}
  </div>
);

export { Ico, display };
