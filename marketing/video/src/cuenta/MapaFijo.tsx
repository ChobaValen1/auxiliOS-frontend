import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { sans } from "../theme";
import datos from "./mapa-traslado.json";

// El mapa del traslado como imagen fija (public/mapa-traslado.jpg, hecha con
// scripts/render_map_cuenta.js: MapLibre + OpenFreeMap «fiord», recorrido de OSRM) y, encima,
// el recorrido animado en SVG con los puntos ya proyectados a px del video.
// Monte Grande → San Vicente (29 km) → La Plata (52 km) → Monte Grande (65 km).
export const CELESTE = "#4fc3f7";
export const AMBAR = "#f5a623";
export const CORAL = "#ff7a6b";
export const COLORES = [CELESTE, AMBAR, CORAL];
export const KM_REALES = datos.legs.map((l) => l.km);

type P = [number, number];
const RUTAS = datos.legs.map((l) => l.points as P[]);
const ACUM = RUTAS.map((pts) => {
  const a = [0];
  for (let i = 1; i < pts.length; i++) a.push(a[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return a;
});
// dónde queda el peaje sobre la vuelta, como fracción del largo dibujado
export const PEAJE_EN = ACUM[2][datos.peajeIndex] / ACUM[2][ACUM[2].length - 1];

// el pedazo hecho de un tramo (0..1) y la punta
const parcial = (k: number, t: number): { pts: P[]; punta: P } => {
  const pts = RUTAS[k], a = ACUM[k];
  const L = a[a.length - 1] * Math.min(1, Math.max(0, t));
  const out: P[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (a[i] <= L) {
      out.push(pts[i]);
      continue;
    }
    const f = (L - a[i - 1]) / (a[i] - a[i - 1] || 1);
    const punta: P = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
    out.push(punta);
    return { pts: out, punta };
  }
  return { pts: out, punta: pts[pts.length - 1] };
};
const linea = (pts: P[]) => pts.map((p) => `${p[0]},${p[1]}`).join(" ");
const halo = "0 0 6px #0b1020, 0 0 4px #0b1020, 0 0 2px #0b1020, 0 2px 0 #0b1020, 0 -2px 0 #0b1020, 2px 0 0 #0b1020, -2px 0 0 #0b1020";

const LUGARES = [
  { k: 0, nombre: "Base · Monte Grande", color: "#ffffff" },
  { k: 1, nombre: "Origen · San Vicente", color: CELESTE },
  { k: 2, nombre: "Destino · La Plata", color: AMBAR },
];
const ETIQUETAS = ["a buscarlo", "con el auto arriba", "vuelve vacío"];
// dónde va el cartel de km de cada tramo y hacia qué lado
const CARTEL: { en: number; dx: number; dy: number; ancla: string }[] = [
  { en: 0.68, dx: 22, dy: -18, ancla: "0% 50%" },
  { en: 0.74, dx: 0, dy: 26, ancla: "50% 0%" },
  { en: 0.3, dx: 0, dy: 34, ancla: "50% 0%" },
];

export const MapaFijo: React.FC<{ avance: [number, number, number]; f: number }> = ({ avance, f }) => {
  const enCurso = avance[1] <= 0 ? 0 : avance[2] <= 0 ? 1 : 2;
  const grua = parcial(enCurso, avance[enCurso]).punta;
  const peaje = parcial(2, PEAJE_EN).punta;
  const pasoPeaje = avance[2] >= PEAJE_EN;
  const halo2 = 1 + 0.25 * Math.sin(f / 6);
  return (
    <AbsoluteFill>
      <Img src={staticFile("mapa-traslado.jpg")} style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920 }} />
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        {RUTAS.map((pts, k) => (
          <polyline key={`t${k}`} points={linea(pts)} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {RUTAS.map((_, k) => {
          if (avance[k] <= 0) return null;
          const { pts } = parcial(k, avance[k]);
          return (
            <g key={`h${k}`}>
              {k !== 2 ? <polyline points={linea(pts)} fill="none" stroke="#0b1020" strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} /> : null}
              <polyline points={linea(pts)} fill="none" stroke={COLORES[k]} strokeWidth={k === 1 ? 12 : 10} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={k === 2 ? "1 20" : undefined} />
            </g>
          );
        })}
        {LUGARES.map((l) => (
          <circle key={l.nombre} cx={RUTAS[l.k][0][0]} cy={RUTAS[l.k][0][1]} r={13} fill={l.color} stroke="#0b1020" strokeWidth={6} />
        ))}
        {pasoPeaje ? <circle cx={peaje[0]} cy={peaje[1]} r={14} fill={CORAL} stroke="#fff" strokeWidth={4} /> : null}
        {avance[0] > 0 ? (
          <>
            <circle cx={grua[0]} cy={grua[1]} r={34 * halo2} fill={AMBAR} opacity={0.25} />
            <circle cx={grua[0]} cy={grua[1]} r={18} fill={AMBAR} stroke="#fff" strokeWidth={6} />
          </>
        ) : null}
      </svg>
      {/* nombres de los lugares, debajo del punto */}
      {LUGARES.map((l) => (
        <div key={l.nombre} style={{ position: "absolute", left: RUTAS[l.k][0][0], top: RUTAS[l.k][0][1] + 24, translate: "-50% 0", whiteSpace: "nowrap", fontFamily: sans, fontWeight: 700, fontSize: 30, color: "#fff", textShadow: halo }}>
          {l.nombre}
        </div>
      ))}
      {/* el km de cada tramo, cuando arranca */}
      {CARTEL.map((c, k) => {
        if (avance[k] <= 0.15) return null;
        const p = parcial(k, c.en).punta;
        return (
          <div
            key={k}
            style={{
              position: "absolute", left: p[0] + c.dx, top: p[1] + c.dy, translate: c.ancla === "0% 50%" ? "0 -50%" : c.ancla === "50% 100%" ? "-50% -100%" : "-50% 0",
              whiteSpace: "nowrap", fontFamily: sans, fontWeight: 700, fontSize: 29, color: COLORES[k], textShadow: halo,
            }}
          >
            {KM_REALES[k]} km · {ETIQUETAS[k]}
          </div>
        );
      })}
      {pasoPeaje ? (
        <div style={{ position: "absolute", left: peaje[0], top: peaje[1] - 28, translate: "-50% -100%", whiteSpace: "nowrap", fontFamily: sans, fontWeight: 700, fontSize: 28, color: CORAL, textShadow: halo }}>
          Peaje + $ 1.400
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
