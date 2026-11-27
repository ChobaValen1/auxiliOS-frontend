import React, { createContext, useContext } from "react";
import { interpolate } from "remotion";
import { display, mono, sans } from "../theme";

// Tokens de AuxiliOS (ui/tokens.css), escalados del ancho de la app (~400 px) al video (1080 px)
export const K = 2.7;
export const T = {
  bg: "#0c0e12",
  s1: "#13161d",
  s2: "#191d27",
  s3: "#20242f",
  border: "#252a38",
  strong: "#343a4d",
  text: "#e8eaf2",
  text2: "#a3acc2",
  text3: "#818ba1",
  accent: "#f5a623",
  accentFg: "#1a1203",
  accentSoft: "rgba(245,166,35,.12)",
  ok: "#27c47a",
  okSoft: "rgba(39,196,122,.12)",
  info: "#6aa6ee",
};
export const k = (n: number) => Math.round(n * K);

// Íconos estilo lucide (trazo)
const P: Record<string, React.ReactNode> = {
  back: <path d="M19 12H5M12 19l-7-7 7-7" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  cal: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  building: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
  car: <><path d="M5 17h14l-1.5-6.5A2 2 0 0 0 15.6 9H8.4a2 2 0 0 0-1.9 1.5z" /><circle cx="7.5" cy="17.5" r="1.8" /><circle cx="16.5" cy="17.5" r="1.8" /></>,
  route: <><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></>,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />,
  camera: <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  right: <path d="m9 18 6-6-6-6" />,
  left: <path d="m15 18-6-6 6-6" />,
  cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /></>,
  bank: <path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M12 3 2 8h20z" />,
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  wallet: <><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5" /></>,
  dots: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  msg: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
  trash: <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />,
  upload: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />,
  gauge: <path d="m12 14 4-4M3.3 19a10 10 0 1 1 17.4 0" />,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  dash: <><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8" /></>,
};
export const Ico: React.FC<{ n: keyof typeof P | string; s?: number; c?: string; w?: number }> = ({ n, s = 20, c = "currentColor", w = 2 }) => (
  <svg viewBox="0 0 24 24" width={k(s)} height={k(s)} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {P[n]}
  </svg>
);

export const Screen: React.FC<{ children: React.ReactNode; time?: string }> = ({ children, time = "17:45" }) => (
  <div style={{ position: "absolute", inset: 0, background: T.bg, color: T.text, fontFamily: sans, fontSize: k(13), overflow: "hidden" }}>
    <div style={{ height: k(36), display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${k(22)}px`, fontWeight: 700, fontSize: k(14) }}>
      <span>{time}</span>
      <span style={{ display: "flex", gap: k(5), alignItems: "flex-end" }}>
        {[5, 7, 9, 11].map((h) => (
          <i key={h} style={{ width: k(3), height: k(h), background: T.text, borderRadius: 2 }} />
        ))}
        <i style={{ width: k(22), height: k(11), border: `${k(1.2)}px solid ${T.text}`, borderRadius: k(3), marginLeft: k(6), position: "relative" }}>
          <i style={{ position: "absolute", left: 2, top: 2, bottom: 2, width: "60%", background: T.text, borderRadius: 2 }} />
        </i>
      </span>
    </div>
    <div style={{ position: "absolute", top: k(36), left: k(16), right: k(16), bottom: 0, display: "flex", flexDirection: "column", gap: k(12) }}>{children}</div>
  </div>
);

export const Top: React.FC<{ icon?: string; title: string; hint?: string; right?: React.ReactNode }> = ({ icon = "back", title, hint, right }) => (
  <div style={{ display: "flex", alignItems: "center", gap: k(10), paddingTop: k(6) }}>
    <div style={{ width: k(44), height: k(44), display: "grid", placeItems: "center", color: T.text2 }}>
      <Ico n={icon} s={22} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: k(21), fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
      {hint ? <div style={{ fontSize: k(13), color: T.text3, marginTop: k(1) }}>{hint}</div> : null}
    </div>
    {right}
  </div>
);

export const Bars: React.FC<{ n: number; of: number }> = ({ n, of }) => (
  <div style={{ display: "flex", gap: k(6) }}>
    {Array.from({ length: of }).map((_, i) => (
      <i key={i} style={{ flex: 1, height: k(4), borderRadius: 99, background: i < n ? T.accent : T.s3 }} />
    ))}
  </div>
);

const STEPS = ["Servicio", "Socio", "Adicionales", "Evidencia", "Firma"];
export const RmSteps: React.FC<{ cur: number }> = ({ cur }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: k(4), position: "relative" }}>
    {STEPS.map((l, i) => {
      const n = i + 1, done = n < cur, on = n === cur;
      return (
        <div key={l} style={{ display: "grid", justifyItems: "center", gap: k(6), position: "relative", fontSize: k(11), color: on ? T.text : T.text3 }}>
          {i < 4 ? <i style={{ position: "absolute", top: k(15), left: `calc(50% + ${k(18)}px)`, right: `calc(-50% + ${k(18)}px)`, height: k(2), background: done ? T.accent : T.s3 }} /> : null}
          <span
            style={{
              width: k(30), height: k(30), borderRadius: "50%", display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 700, fontSize: k(13),
              background: on ? T.accent : done ? T.accentSoft : T.s2, border: `${k(1)}px solid ${on || done ? T.accent : T.strong}`,
              color: on ? T.accentFg : done ? T.accent : T.text3, scale: on ? 1.1 : 1,
            }}
          >
            {done ? <Ico n="check" s={14} w={3} /> : n}
          </span>
          <span>{l}</span>
        </div>
      );
    })}
  </div>
);

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: T.s2, border: `${k(1)}px solid ${T.border}`, borderRadius: k(16), padding: k(14), display: "flex", flexDirection: "column", gap: k(14), ...style }}>{children}</div>
);

export const Group: React.FC<{ icon: string; label: string; small?: string; children: React.ReactNode }> = ({ icon, label, small, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: k(8) }}>
    <div style={{ display: "flex", alignItems: "center", gap: k(6), fontSize: k(11), fontWeight: 700, letterSpacing: k(0.6), textTransform: "uppercase", color: T.text3 }}>
      <Ico n={icon} s={14} c={T.accent} />
      {label}
      {small ? <small style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>{small}</small> : null}
    </div>
    {children}
  </div>
);

export const Field: React.FC<{ label: string; value?: string; ph?: string; pre?: string; post?: string; small?: string; focus?: boolean }> = ({ label, value, ph, pre, post, small, focus }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: k(5) }}>
    <div style={{ fontSize: k(12), fontWeight: 700, color: T.text2 }}>
      {label}
      {small ? <small style={{ fontWeight: 500, color: T.text3, marginLeft: k(6) }}>{small}</small> : null}
    </div>
    <div
      style={{
        height: k(44), borderRadius: k(10), background: T.s1, border: `${k(1)}px solid ${focus ? T.accent : T.strong}`, boxShadow: focus ? `0 0 0 ${k(3)}px rgba(245,166,35,.35)` : "none",
        display: "flex", alignItems: "center", padding: `0 ${k(12)}px`, gap: k(8), fontSize: k(15), fontWeight: 500,
      }}
    >
      {pre ? <span style={{ color: T.text3 }}>{pre}</span> : null}
      <span style={{ flex: 1, color: value ? T.text : T.text3 }}>{value || ph}</span>
      {post ? <span style={{ color: T.text3 }}>{post}</span> : null}
    </div>
  </div>
);

export const Btn: React.FC<{ children: React.ReactNode; pri?: boolean; ghost?: boolean; style?: React.CSSProperties }> = ({ children, pri, ghost, style }) => (
  <div
    style={{
      minHeight: k(48), borderRadius: k(12), display: "flex", alignItems: "center", justifyContent: "center", gap: k(8), fontWeight: 700, fontSize: k(15), padding: `0 ${k(12)}px`,
      background: pri ? T.accent : ghost ? "none" : T.s2, color: pri ? T.accentFg : ghost ? T.text2 : T.text, border: `${k(1)}px solid ${pri ? T.accent : ghost ? "transparent" : T.strong}`, ...style,
    }}
  >
    {children}
  </div>
);

export const RmTop: React.FC<{ title: string; hint: string }> = ({ title, hint }) => (
  <Top icon="x" title={title} hint={hint} right={<span style={{ fontSize: k(12), fontWeight: 700, color: T.accent, background: T.accentSoft, padding: `${k(4)}px ${k(10)}px`, borderRadius: 99 }}>En curso</span>} />
);

export const RmFooter: React.FC<{ last?: boolean; first?: boolean }> = ({ last, first }) => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: k(22), display: "flex", gap: k(8) }}>
    {!first ? (
      <Btn style={{ flex: `0 0 ${k(52)}px`, padding: 0 }}>
        <Ico n="left" s={20} />
      </Btn>
    ) : null}
    <Btn ghost style={{ flex: 1, fontSize: k(13), lineHeight: 1.2 }}>Guardar y seguir después</Btn>
    <Btn pri style={{ flex: 1.4 }}>
      {last ? <><Ico n="check" s={18} w={3} /> Finalizar</> : <>Siguiente <Ico n="right" s={18} /></>}
    </Btn>
  </div>
);

// Marca de toque para las imágenes de referencia
export const Tap: React.FC<{ x: number; y: number; label?: string }> = ({ x, y, label = "toque" }) => (
  <div style={{ position: "absolute", left: x - 48, top: y - 48, width: 96, height: 96, zIndex: 50 }}>
    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(255,255,255,.18)", border: "5px solid rgba(255,255,255,.9)", boxShadow: "0 0 0 4px rgba(0,0,0,.35)" }} />
    <div style={{ position: "absolute", left: 36, top: 36, width: 24, height: 24, borderRadius: "50%", background: "#fff" }} />
    <div style={{ position: "absolute", left: 60, top: 92, fontFamily: mono, fontWeight: 700, fontSize: 26, color: "#fff", background: "rgba(0,0,0,.75)", padding: "3px 12px", borderRadius: 8, whiteSpace: "nowrap" }}>{label}</div>
  </div>
);

export const SoloMark: React.FC = () => (
  <span style={{ fontFamily: display, fontSize: k(22), letterSpacing: k(0.9) }}>
    AUXILI<span style={{ color: T.accent }}>OS</span>
    <span style={{ fontSize: k(12), letterSpacing: k(2.4), color: T.text3, marginLeft: k(4) }}>SOLO</span>
  </span>
);

// En el video, cada pantalla recibe el cuadro local y en qué cuadro se toca;
// sin contexto (imágenes de referencia) el toque se muestra fijo con su etiqueta.
export const Anim = createContext<{ f: number; tapAt?: number } | null>(null);
export const useAnim = () => useContext(Anim);

export const Ripple: React.FC<{ f: number; at: number }> = ({ f, at }) => {
  if (f < at - 6 || f > at + 14) return null;
  const press = interpolate(f, [at - 6, at], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const out = interpolate(f, [at, at + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: -60, top: -60, width: 120, height: 120, zIndex: 50, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(255,255,255,.35)", scale: 0.4 + out * 1.1, opacity: f < at ? 0 : 1 - out }} />
      <div style={{ position: "absolute", left: 30, top: 30, width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,.75)", scale: 0.6 + press * 0.4, opacity: f < at ? press : 1 - out }} />
    </div>
  );
};

// Toque centrado en el elemento que lo contiene (el padre tiene que ser position: relative)
export const TapIn: React.FC<{ label?: string; dx?: number; dy?: number }> = ({ label, dx = 0, dy = 0 }) => {
  const a = useAnim();
  if (a && a.tapAt === undefined) return null;
  return (
    <div style={{ position: "absolute", left: `calc(50% + ${a ? 0 : dx}px)`, top: `calc(50% + ${a ? 0 : dy}px)`, width: 0, height: 0, zIndex: 50 }}>
      {a ? <Ripple f={a.f} at={a.tapAt as number} /> : <Tap x={0} y={0} label={label} />}
    </div>
  );
};
