import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { C, clamp, display, mono, sans } from "../theme";

export const AMBER = "#f5a623";
export const TOTAL_PASOS = 6;

// Zona segura de Reels (1080×1920): arriba ~14 % lo tapa el nombre de la cuenta, abajo ~35 % el texto,
// el audio y el botón del anuncio, y a la derecha la columna de íconos. Lo importante va en SAFE.
export const SAFE = { top: 270, bottom: 1250, left: 70, right: 940 };
// El celular arranca dentro de la zona segura y sigue hacia abajo (lo de abajo es fondo, no información)
export const BOX = { top: 470, left: 80, w: 860 };
const SCALE = BOX.w / 1080;
// Altura en pantalla de un punto de la app (coordenada 0..1920 de la pantalla de Solo)
export const appY = (y: number) => BOX.top + y * SCALE;

// Marco común de cada paso: chip «sin / con», número de paso y título, todo dentro de la zona segura
export const StepFrame: React.FC<{ n: number; title: string; mode: "sin" | "con"; children: React.ReactNode }> = ({ n, title, mode, children }) => {
  const f = useCurrentFrame();
  const sin = mode === "sin";
  const enter = interpolate(f, [0, 8], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: sin
          ? "repeating-linear-gradient(0deg, #1b1c1f 0 6px, #1d1e21 6px 12px)"
          : `radial-gradient(ellipse at 50% 35%, rgba(245,166,35,0.14), transparent 60%), ${C.bg}`,
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 26, background: `repeating-linear-gradient(-45deg, ${sin ? "#5d6169" : C.yellow} 0 26px, #111 26px 52px)` }} />
      {children}
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, right: 1080 - SAFE.right, display: "flex", alignItems: "center", gap: 16, opacity: enter, zIndex: 20 }}>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 2, padding: "8px 18px", borderRadius: 999, background: sin ? "#3a3c42" : AMBER, color: sin ? "#c9ccd2" : "#14161b" }}>
          {sin ? "SIN AUXILIOS" : "CON AUXILIOS SOLO"}
        </span>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 2, color: sin ? "#8a8f98" : C.muted }}>
          PASO {n} DE {TOTAL_PASOS}
        </span>
      </div>
      <div
        style={{
          position: "absolute", top: SAFE.top + 58, left: SAFE.left, right: 1080 - SAFE.right, fontFamily: display, fontSize: 104, lineHeight: 0.95,
          color: sin ? "#d4d6db" : C.text, opacity: enter, translate: `0px ${(1 - enter) * 24}px`, zIndex: 20, textShadow: "0 4px 24px rgba(0,0,0,.6)",
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  );
};

// La pantalla de la app (1080×1920) achicada dentro de un celular que sigue hacia abajo
export const PhoneBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      position: "absolute", left: BOX.left - 14, top: BOX.top - 14, width: BOX.w + 28, height: 1920 * SCALE + 28, borderRadius: 70,
      background: "#05060a", border: "4px solid #3a4152", boxShadow: "0 40px 120px rgba(0,0,0,0.55)",
    }}
  >
    <div style={{ position: "absolute", left: 14, top: 14, width: BOX.w, height: 1920 * SCALE, borderRadius: 56, overflow: "hidden" }}>
      <div style={{ width: 1080, height: 1920, scale: SCALE, transformOrigin: "0 0", position: "relative" }}>{children}</div>
    </div>
  </div>
);

// Tarjeta con el dato clave del paso, dentro de la zona segura (sobre la parte baja del celular)
export const KeyCard: React.FC<{ show: number; label: string; title: string; sub?: string }> = ({ show, label, title, sub }) => (
  <div
    style={{
      position: "absolute", left: SAFE.left + 10, right: 1080 - SAFE.right + 10, bottom: 1920 - SAFE.bottom, zIndex: 30,
      background: "rgba(12,14,18,0.97)", border: `4px solid ${AMBER}`, borderRadius: 32, padding: "26px 32px",
      opacity: show, scale: 0.85 + show * 0.15, transformOrigin: "50% 100%", boxShadow: "0 20px 60px rgba(0,0,0,.6)",
    }}
  >
    <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 25, letterSpacing: 2, color: AMBER }}>{label}</div>
    <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 46, color: C.text, marginTop: 8, lineHeight: 1.12 }}>{title}</div>
    {sub ? <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 32, color: C.muted, marginTop: 6 }}>{sub}</div> : null}
  </div>
);

// Guía para revisar: simula lo que tapa la interfaz de Reels (no va en el video final)
export const ReelsGuide: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none", zIndex: 100 }}>
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: SAFE.top, background: "linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.15))" }}>
      <div style={{ position: "absolute", left: 40, top: 120, display: "flex", alignItems: "center", gap: 18, fontFamily: sans, fontWeight: 700, fontSize: 34, color: "#fff" }}>
        <span style={{ width: 64, height: 64, borderRadius: "50%", background: "#888" }} /> auxilios.solo · Publicidad
      </div>
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, top: SAFE.bottom, bottom: 0, background: "linear-gradient(rgba(0,0,0,.15), rgba(0,0,0,.7))" }}>
      <div style={{ position: "absolute", left: 40, right: 200, top: 180, fontFamily: sans, color: "#fff", fontSize: 32, lineHeight: 1.35 }}>
        <b>auxilios.solo</b> Un servicio de asistencia. Dos formas de cobrarlo… <span style={{ opacity: 0.7 }}>más</span>
      </div>
      <div style={{ position: "absolute", left: 40, right: 200, top: 360, height: 90, borderRadius: 16, background: "rgba(255,255,255,.92)", color: "#111", fontFamily: sans, fontWeight: 700, fontSize: 34, display: "grid", placeItems: "center" }}>
        Más información
      </div>
    </div>
    <div style={{ position: "absolute", right: 30, top: 1000, display: "flex", flexDirection: "column", gap: 56, alignItems: "center" }}>
      {["♥", "💬", "➤", "⋯"].map((i) => (
        <span key={i} style={{ fontSize: 58, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,.6)" }}>{i}</span>
      ))}
    </div>
    <div style={{ position: "absolute", left: SAFE.left, top: SAFE.top, width: SAFE.right - SAFE.left, height: SAFE.bottom - SAFE.top, border: "4px dashed rgba(0,255,170,.8)" }} />
  </AbsoluteFill>
);
