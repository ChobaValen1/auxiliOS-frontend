import { useMemo } from "react";
import { AbsoluteFill, CanvasImage, Easing, Interactive, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, clamp, display, mono, sans } from "../theme";
import { Truck } from "../comparacion/Truck";
import route from "./route.json";

export const RECORRIDO_DUR = 420;

type Pt = [number, number];
const AMBER = "#f5a623";
const LEG_STYLE = [
  { color: AMBER, width: 8, dash: "18 12", name: "Base → Origen", note: "va a buscar" },
  { color: C.orange, width: 12, dash: undefined, name: "Origen → Destino", note: "con el vehículo" },
  { color: "#4a90e2", width: 8, dash: "2 16", name: "Destino → Base", note: "regreso" },
];
// cuándo se dibuja cada tramo [inicio, fin] en frames
const LEG_T: [number, number][] = [
  [40, 105],
  [125, 215],
  [230, 300],
];

const cumulative = (pts: Pt[]) => {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return acc;
};

// Parte del recorrido dibujada hasta la fracción t, y la posición de la punta
const partial = (pts: Pt[], acc: number[], t: number): { pts: Pt[]; head: Pt } => {
  const target = acc[acc.length - 1] * t;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (acc[i] <= target) {
      out.push(pts[i]);
      continue;
    }
    const k = (target - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
    const head: Pt = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
    out.push(head);
    return { pts: out, head };
  }
  return { pts: out, head: pts[pts.length - 1] };
};

const kmText = (n: number) => n.toFixed(1).replace(".", ",");

const Pin: React.FC<{ f: number; at: Pt; color: string; label: string; sub: string; from: number; side: "right" | "below" }> = ({ f, at, color, label, sub, from, side }) => {
  const s = interpolate(f, [from, from + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.8)) });
  const ring = interpolate((f - from) % 40, [0, 40], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", left: at[0], top: at[1], width: 0, height: 0 }}>
      <div style={{ position: "absolute", left: -45, top: -45, width: 90, height: 90, borderRadius: "50%", border: `4px solid ${color}`, opacity: f > from ? (1 - ring) * 0.8 : 0, scale: 0.5 + ring }} />
      <div style={{ position: "absolute", left: -20, top: -20, width: 40, height: 40, borderRadius: "50%", background: color, border: "6px solid #fff", boxShadow: "0 6px 20px rgba(0,0,0,0.6)", scale: s }} />
      <div
        style={{
          position: "absolute",
          ...(side === "right" ? { left: 40, top: -38 } : { left: -150, top: 36 }),
          background: "rgba(12,14,18,0.92)",
          border: `2px solid ${color}`,
          borderRadius: 14,
          padding: "8px 16px",
          whiteSpace: "nowrap",
          opacity: s,
        }}
      >
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 24, color, letterSpacing: 2 }}>{label}</div>
        <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 24, color: C.text }}>{sub}</div>
      </div>
    </div>
  );
};

export const RecorridoScene: React.FC<{ speed?: number }> = ({ speed = 1 }) => {
  const f = useCurrentFrame() * speed;
  const legs = route.legs.map((l) => l.points as Pt[]);
  const accs = useMemo(() => legs.map(cumulative), [legs]);
  const progress = LEG_T.map(([a, b]) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) }));
  const drawn = legs.map((pts, i) => partial(pts, accs[i], progress[i]));
  const active = progress.findIndex((p) => p < 1);
  const head: Pt = active === -1 ? (route.base as Pt) : progress[active] > 0 ? drawn[active].head : legs[active][0];
  const km = route.legs.reduce((s, l, i) => s + l.km * progress[i], 0);
  const base = route.base as Pt;
  const card = interpolate(f, [304, 318], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      {/* Cámara: arranca cerca de la base y se abre al recorrido completo */}
      <AbsoluteFill
        style={{
          transformOrigin: `${base[0]}px ${base[1]}px`,
          scale: interpolate(f, [8, 80], [1.9, 1], { ...clamp, easing: Easing.inOut(Easing.cubic), output: "perceptual-scale" }),
        }}
      >
        <CanvasImage src={staticFile("mapa-recorrido.png")} style={{ width: 1080, height: 1920, filter: "brightness(1.6) contrast(1.1)" }} />
        <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
          {drawn.map((d, i) => {
            const st = LEG_STYLE[i];
            const pts = d.pts.map((p) => p.join(",")).join(" ");
            return (
              <g key={i}>
                <polyline points={pts} fill="none" stroke={st.color} strokeOpacity={0.25} strokeWidth={st.width + 14} strokeLinecap="round" strokeLinejoin="round" />
                <polyline points={pts} fill="none" stroke={st.color} strokeWidth={st.width} strokeDasharray={st.dash} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          })}
        </svg>
        <Pin f={f} at={base} color={AMBER} label="BASE" sub="Monte Grande" from={4} side="right" />
        <Pin f={f} at={route.origen as Pt} color={C.red} label="ORIGEN" sub="Auxilio" from={105} side="right" />
        <Pin f={f} at={route.destino as Pt} color={C.green} label="DESTINO" sub="Taller · Lomas" from={215} side="below" />
        {/* Grúa en la punta del recorrido */}
        <div
          style={{
            position: "absolute",
            left: head[0] - 46,
            top: head[1] - 46,
            width: 92,
            height: 92,
            borderRadius: "50%",
            background: "#0c0e12",
            border: `5px solid ${AMBER}`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: interpolate(f, [30, 40], [0, 1], clamp),
          }}
        >
          <div style={{ scale: 0.17, width: 440, height: 200, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Truck solo wheelTurn={f * 12} />
          </div>
        </div>
      </AbsoluteFill>

      {/* Degradés para que se lean los textos */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 520, background: "linear-gradient(180deg, rgba(15,17,21,0.96) 30%, rgba(15,17,21,0))" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 640, background: "linear-gradient(0deg, rgba(15,17,21,0.97) 55%, rgba(15,17,21,0))" }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 26, background: `repeating-linear-gradient(-45deg, ${C.yellow} 0 26px, #111 26px 52px)` }} />

      <Interactive.Div
        name="Chip"
        style={{
          position: "absolute",
          top: 150,
          left: 80,
          fontFamily: mono,
          fontWeight: 700,
          fontSize: 30,
          letterSpacing: 2,
          color: AMBER,
          opacity: interpolate(f, [0, 10], [0, 1], { ...clamp }),
        }}
      >
        SERVICIO #0482 · REMOLQUE
      </Interactive.Div>
      <Interactive.Div
        name="Titulo"
        style={{
          position: "absolute",
          top: 200,
          left: 80,
          right: 80,
          fontFamily: display,
          fontSize: 120,
          lineHeight: 0.92,
          color: C.text,
          opacity: interpolate(f, [4, 14], [0, 1], { ...clamp }),
          translate: interpolate(f, [4, 18], ["0px 30px", "0px 0px"], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
        }}
      >
        Los km del servicio,
        <br />
        <span style={{ color: AMBER }}>calculados solos.</span>
      </Interactive.Div>

      {/* Contador en vivo */}
      <div style={{ position: "absolute", left: 80, top: 1420, opacity: interpolate(f, [36, 44, 300, 308], [0, 1, 1, 0], clamp) }}>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, letterSpacing: 2, color: C.muted }}>
          {active === -1 ? "RECORRIDO COMPLETO" : LEG_STYLE[Math.max(0, active)].name.toUpperCase()}
        </div>
        <div style={{ fontFamily: display, fontSize: 200, lineHeight: 1, color: C.text }}>
          {kmText(km)} <span style={{ fontSize: 100, color: AMBER }}>km</span>
        </div>
      </div>

      {/* Tarjeta final con el desglose */}
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          top: 1405,
          background: "rgba(22,26,34,0.96)",
          border: `2px solid ${C.border}`,
          borderRadius: 28,
          padding: "20px 36px",
          opacity: card,
          translate: `0px ${(1 - card) * 60}px`,
        }}
      >
        {route.legs.map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", height: 66, opacity: interpolate(f, [312 + i * 8, 320 + i * 8], [0, 1], clamp) }}>
            <div style={{ width: 44, height: 8, borderRadius: 4, background: LEG_STYLE[i].color, marginRight: 22 }} />
            <div style={{ flex: 1, fontFamily: sans, fontWeight: 700, fontSize: 36, color: C.text }}>
              {LEG_STYLE[i].name} <span style={{ fontWeight: 500, fontSize: 28, color: C.muted }}>· {LEG_STYLE[i].note}</span>
            </div>
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 36, color: C.text }}>{kmText(l.km)} km</div>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", borderTop: `2px solid ${C.border}`, marginTop: 10, paddingTop: 16, opacity: interpolate(f, [340, 348], [0, 1], clamp) }}>
          <div style={{ flex: 1, fontFamily: sans, fontWeight: 700, fontSize: 40, color: C.text }}>Total del recorrido</div>
          <div style={{ fontFamily: display, fontSize: 92, lineHeight: 1, color: AMBER, scale: interpolate(f, [340, 352], [0.6, 1], { ...clamp, easing: Easing.out(Easing.back(1.8)) }) }}>
            {kmText(route.legs.reduce((s, l) => s + l.km, 0))} km
          </div>
        </div>
        <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 28, color: C.muted, marginTop: 10, opacity: interpolate(f, [356, 364], [0, 1], clamp) }}>
          Según el recorrido que pide cada prestadora.
        </div>
      </div>

      <div style={{ position: "absolute", right: 30, bottom: 22, fontFamily: sans, fontSize: 18, color: "#6b7385" }}>
        © OpenFreeMap © OpenMapTiles © OpenStreetMap
      </div>
    </AbsoluteFill>
  );
};
