import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { C, clamp, display, mono } from "../theme";

export const AMBER = "#f5a623";
export const TOTAL_PASOS = 6;
// Área de contenido debajo del título (celular o escritorio de papel)
export const BOX = { top: 380, left: 140, w: 800, h: 1422 };
const SCALE = BOX.w / 1080;

// Marco común de cada paso: franja, chip «sin / con», número de paso y título
export const StepFrame: React.FC<{ n: number; title: string; mode: "sin" | "con"; children: React.ReactNode }> = ({ n, title, mode, children }) => {
  const f = useCurrentFrame();
  const sin = mode === "sin";
  const enter = interpolate(f, [0, 8], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  return (
    <AbsoluteFill
      style={{
        background: sin
          ? "repeating-linear-gradient(0deg, #1b1c1f 0 6px, #1d1e21 6px 12px)"
          : `radial-gradient(ellipse at 50% 30%, rgba(245,166,35,0.13), transparent 60%), ${C.bg}`,
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 26, background: `repeating-linear-gradient(-45deg, ${sin ? "#5d6169" : C.yellow} 0 26px, #111 26px 52px)` }} />
      <div style={{ position: "absolute", top: 120, left: 80, right: 80, display: "flex", alignItems: "center", gap: 18, opacity: enter }}>
        <span
          style={{
            fontFamily: mono, fontWeight: 700, fontSize: 28, letterSpacing: 2, padding: "8px 20px", borderRadius: 999,
            background: sin ? "#3a3c42" : AMBER, color: sin ? "#c9ccd2" : "#14161b",
          }}
        >
          {sin ? "SIN AUXILIOS" : "CON AUXILIOS SOLO"}
        </span>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 28, letterSpacing: 2, color: sin ? "#8a8f98" : C.muted }}>
          PASO {n} DE {TOTAL_PASOS}
        </span>
      </div>
      <div
        style={{
          position: "absolute", top: 186, left: 80, right: 80, fontFamily: display, fontSize: 112, lineHeight: 0.95,
          color: sin ? "#d4d6db" : C.text, opacity: enter, translate: `0px ${(1 - enter) * 24}px`,
        }}
      >
        {title}
      </div>
      {children}
    </AbsoluteFill>
  );
};

// La pantalla de la app (1080×1920) achicada dentro de un celular
export const PhoneBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      position: "absolute", left: BOX.left - 14, top: BOX.top - 14, width: BOX.w + 28, height: BOX.h + 28, borderRadius: 70,
      background: "#05060a", border: "4px solid #3a4152", boxShadow: "0 40px 120px rgba(0,0,0,0.55)",
    }}
  >
    <div style={{ position: "absolute", left: 14, top: 14, width: BOX.w, height: BOX.h, borderRadius: 56, overflow: "hidden" }}>
      <div style={{ width: 1080, height: 1920, scale: SCALE, transformOrigin: "0 0", position: "relative" }}>{children}</div>
    </div>
  </div>
);
