import React from "react";
import firma from "./firma.json";

// Firma real grabada con el dedo (trazos normalizados 0..1 con su tiempo en ms).
// Sin `ms` se dibuja completa; con `ms` se dibuja hasta ese momento, a la velocidad original.
const W = 1000;
const H = W / firma.aspect;
const pts = firma.trazos as number[][][];
const all = pts.flat();
const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
const PAD = 0.06;
const VB = `${(minX - PAD) * W} ${(minY - PAD) * H} ${(maxX - minX + 2 * PAD) * W} ${(maxY - minY + 2 * PAD) * H}`;
export const FIRMA_MS = firma.duracion_ms;

export const Firma: React.FC<{ ms?: number; color?: string; stroke?: number; style?: React.CSSProperties }> = ({ ms, color = "#1b2a6b", stroke = 9, style }) => {
  const upTo = ms ?? Infinity;
  return (
    <svg viewBox={VB} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", ...style }}>
      {pts.map((s, i) => {
        const shown: number[][] = [];
        for (let j = 0; j < s.length; j++) {
          if (s[j][2] <= upTo) shown.push(s[j]);
          else {
            const a = s[j - 1];
            if (a) {
              const k = (upTo - a[2]) / (s[j][2] - a[2] || 1);
              shown.push([a[0] + (s[j][0] - a[0]) * k, a[1] + (s[j][1] - a[1]) * k, upTo]);
            }
            break;
          }
        }
        if (!shown.length) return null;
        return (
          <polyline
            key={i}
            points={shown.map((p) => `${p[0] * W},${p[1] * H}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
};
