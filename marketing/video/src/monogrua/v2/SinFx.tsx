import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, hand } from "../../theme";

// Cámara en mano: acercamiento lento y un vaivén suave
export const Handheld: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        scale: interpolate(f, [0, durationInFrames], [1, 1.07], clamp),
        rotate: `${Math.sin(f / 19) * 0.6}deg`,
        translate: `${Math.sin(f / 13) * 6}px ${Math.cos(f / 17) * 5}px`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

// Birome
const Pen: React.FC = () => (
  <svg width={150} height={150} viewBox="0 0 150 150" style={{ position: "absolute", left: -6, top: -128, pointerEvents: "none", filter: "drop-shadow(4px 8px 6px rgba(0,0,0,.35))" }}>
    <g transform="rotate(35 10 140)">
      <rect x={4} y={10} width={14} height={118} rx={4} fill="#1f4fa8" />
      <rect x={4} y={10} width={14} height={22} rx={3} fill="#173a7d" />
      <polygon points="4,128 18,128 11,146" fill="#e8e1cf" />
      <polygon points="9,140 13,140 11,146" fill="#222" />
    </g>
  </svg>
);

// Línea escrita a mano: aparece de izquierda a derecha con la birome en la punta
export const Written: React.FC<{ text: string; from: number; dur?: number; size: number; color: string; style?: React.CSSProperties }> = ({ text, from, dur = 12, size, color, style }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [from, from + dur], [0, 100], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const writing = p > 0 && p < 100;
  return (
    <div style={{ position: "relative", display: "inline-block", fontFamily: hand, fontWeight: 700, fontSize: size, lineHeight: 1.2, color, whiteSpace: "nowrap", ...style }}>
      <span style={{ clipPath: `inset(-20% ${100 - p}% -20% 0)`, display: "inline-block" }}>{text}</span>
      {writing ? (
        <div style={{ position: "absolute", left: `${p}%`, top: "78%", translate: `0px ${Math.sin(f * 2.2) * 6}px` }}>
          <Pen />
        </div>
      ) : null}
    </div>
  );
};

// Signos de pregunta que suben y se desvanecen
export const Dudas: React.FC<{ from: number; spots: [number, number][]; color?: string }> = ({ from, spots, color = "#e2504a" }) => {
  const f = useCurrentFrame();
  return (
    <>
      {spots.map(([x, y], i) => {
        const t = f - from - i * 5;
        if (t < 0) return null;
        const e = interpolate(t, [0, 30], [0, 1], clamp);
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: x, top: y - e * 90, fontFamily: hand, fontWeight: 700, fontSize: 110, color,
              opacity: interpolate(t, [0, 6, 22, 30], [0, 1, 1, 0], clamp), scale: interpolate(t, [0, 8], [0.3, 1], { ...clamp, easing: Easing.out(Easing.back(2)) }),
              rotate: `${(i % 2 ? 1 : -1) * 14}deg`, textShadow: "0 6px 18px rgba(0,0,0,.4)",
            }}
          >
            ?
          </div>
        );
      })}
    </>
  );
};

// Golpe: devuelve un desplazamiento que decae (para sacudir algo cuando cae el sello)
export const thump = (f: number, at: number, amp = 18) => {
  const t = f - at;
  if (t < 0 || t > 12) return { x: 0, y: 0 };
  const k = 1 - t / 12;
  return { x: Math.sin(t * 3.1) * amp * k, y: Math.cos(t * 2.7) * amp * 0.6 * k };
};
