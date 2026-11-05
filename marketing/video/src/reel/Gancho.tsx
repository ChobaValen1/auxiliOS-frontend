import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import { clamp, display, hand, mono, sans } from "../theme";
import { SAFE } from "../gastos/common";
import { ReelsGuide } from "../monogrua/StepFrame";

// Reel nuevo, parte 1: el gancho y la pregunta. 60 cuadros por segundo, cámara que no para,
// cortes con desenfoque y grano. Oscuro y desordenado a propósito: la solución va a ser clara.
export const FPS60 = 60;
const W = SAFE.right - SAFE.left;
const AMBER = "#f5a623";
const PAPEL = "#eee8da";
const TINTA = "#1f2a5c";

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const r = (f: number, a: number, b: number, e = ease) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: e });

// Voz en off (prueba): cuándo arranca cada frase y cuánto dura, en cuadros a 60 fps
const VOZ: { src: string; at: number; dur: number; texto: string; cap: boolean }[] = [
  { src: "vo/gancho-l1.wav", at: 18, dur: 69, texto: "Remitos en la guantera.", cap: true },
  { src: "vo/gancho-l2.wav", at: 120, dur: 61, texto: "Cobros que se atrasan.", cap: true },
  { src: "vo/gancho-l3.wav", at: 222, dur: 78, texto: "Gastos que nunca anotás.", cap: true },
  { src: "vo/gancho-l4.wav", at: 336, dur: 51, texto: "Y a fin de mes…", cap: true },
  { src: "vo/gancho-l5.wav", at: 430, dur: 43, texto: "¿cuánto te quedó?", cap: false },
];
const CORTES = [114, 216, 330];
export const GANCHO_DUR = 560;

// ── Herramientas de cámara y terminación ────────────────────────────
// Cada toma entra y sale desenfocada y con un empujón de escala (corte «whip»)
const Toma: React.FC<{ f: number; from: number; to: number; children: React.ReactNode }> = ({ f, from, to, children }) => {
  if (f < from - 10 || f > to + 10) return null;
  const inn = from === 0 ? 1 : r(f, from - 4, from + 10);
  const out = r(f, to - 2, to + 10, Easing.in(Easing.cubic));
  const blur = (1 - inn) * 28 + out * 28;
  return (
    <AbsoluteFill style={{ opacity: Math.min(inn * 1.4, 1) * (1 - out), filter: blur > 0.3 ? `blur(${blur}px)` : undefined, scale: 1 + (1 - inn) * 0.18 + out * 0.25 }}>
      {children}
    </AbsoluteFill>
  );
};
// Cámara en mano: una deriva lenta y continua
const Camara: React.FC<{ f: number; zoom: [number, number]; from: number; to: number; rot?: number; children: React.ReactNode }> = ({ f, zoom, from, to, rot = 1.2, children }) => {
  const k = interpolate(f, [from, to], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const s = zoom[0] + (zoom[1] - zoom[0]) * k;
  const dx = Math.sin(f / 37) * 10 + Math.sin(f / 13) * 3;
  const dy = Math.cos(f / 41) * 8 + Math.cos(f / 17) * 2;
  return <AbsoluteFill style={{ scale: s, translate: `${dx}px ${dy}px`, rotate: `${(k - 0.5) * rot}deg` }}>{children}</AbsoluteFill>;
};
const Grano: React.FC<{ f: number }> = ({ f }) => (
  <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, opacity: 0.11, mixBlendMode: "overlay", pointerEvents: "none" }}>
    <filter id="grano">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={Math.floor(f / 2) % 24} />
    </filter>
    <rect width="100%" height="100%" filter="url(#grano)" />
  </svg>
);
const Vineta: React.FC = () => <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(0,0,0,.65) 100%)", pointerEvents: "none" }} />;
// Palabra gigante de fondo, en contorno, que se mueve más lento que lo de adelante
const Palabra: React.FC<{ f: number; children: string; from: number }> = ({ f, children, from }) => (
  <div
    style={{
      position: "absolute", left: -60, right: -60, top: 640, textAlign: "center", fontFamily: display, fontSize: 330, lineHeight: 1, color: "transparent",
      WebkitTextStroke: "3px rgba(255,255,255,.13)", letterSpacing: 6, translate: `${-(f - from) * 0.6}px 0px`, opacity: r(f, from, from + 16),
    }}
  >
    {children}
  </div>
);

// Subtítulo con la palabra que se está diciendo en ámbar
const Subtitulo: React.FC<{ f: number }> = ({ f }) => {
  const v = VOZ.find((x) => x.cap && f >= x.at - 6 && f < x.at + x.dur + 24);
  if (!v) return null;
  const words = v.texto.split(" ");
  const total = words.reduce((s, w) => s + w.length + 1, 0);
  let acc = 0;
  const e = r(f, v.at - 6, v.at + 4);
  const out = r(f, v.at + v.dur + 12, v.at + v.dur + 24);
  return (
    <div style={{ position: "absolute", top: 1110, left: SAFE.left, width: W, display: "flex", justifyContent: "center", opacity: e * (1 - out), translate: `0px ${(1 - e) * 16}px`, zIndex: 50 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 16px", padding: "14px 26px", borderRadius: 22, background: "rgba(8,9,12,.72)", fontFamily: sans, fontWeight: 700, fontSize: 58, lineHeight: 1.15 }}>
        {words.map((w, i) => {
          const at = v.at + (acc / total) * v.dur;
          acc += w.length + 1;
          const on = f >= at;
          return (
            <span key={i} style={{ color: on ? AMBER : "rgba(255,255,255,.92)", scale: on ? 1 + Math.max(0, 1 - (f - at) / 8) * 0.08 : 1, display: "inline-block" }}>
              {w}
            </span>
          );
        })}
      </div>
    </div>
  );
};

// ── 1 · Remitos en la guantera ──────────────────────────────────────
const REMITOS = [
  { x: 150, y: 560, rot: -14, n: "0476", cliente: "Asist. del Sur", total: "45.000", mancha: false },
  { x: 330, y: 610, rot: 9, n: "0479", cliente: "Particular", total: "60.000", mancha: true },
  { x: 210, y: 700, rot: -4, n: "0481", cliente: "Auxilio Vial N.", total: "52.500", mancha: false },
  { x: 380, y: 760, rot: 15, n: "0482", cliente: "Asist. del Sur", total: "48.000", mancha: false },
];
const Remito: React.FC<{ n: string; cliente: string; total: string; mancha: boolean }> = ({ n, cliente, total, mancha }) => (
  <div style={{ position: "absolute", inset: 0, padding: "26px 30px", color: TINTA }}>
    <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: "#3a3a3a" }}>REMITO N.º {n}</div>
    <div style={{ borderTop: "2px solid #c8bfa8", margin: "10px 0 12px" }} />
    {[
      ["Cliente", cliente],
      ["Patente", "AB 1?? CD"],
      ["Desde", "Monte Gde."],
      ["Total", `$ ${total}`],
    ].map(([k, v]) => (
      <div key={k} style={{ display: "flex", gap: 12, alignItems: "baseline", borderBottom: "1px dashed #cfc6b0", height: 58 }}>
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 18, color: "#7a7462", width: 86 }}>{k}</span>
        <span style={{ fontFamily: hand, fontWeight: 700, fontSize: 40, rotate: "-2deg" }}>{v}</span>
      </div>
    ))}
    <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 18, color: "#7a7462", marginTop: 18 }}>Firma</div>
    <svg width={300} height={70} viewBox="0 0 300 70">
      <path d="M10 50 C 40 10, 60 60, 90 30 S 140 55, 160 25 S 210 50, 240 30 L 290 40" fill="none" stroke={TINTA} strokeWidth={3} strokeLinecap="round" />
    </svg>
    {mancha ? <div style={{ position: "absolute", right: 30, bottom: 60, width: 170, height: 170, borderRadius: "50%", border: "14px solid rgba(120,80,40,.22)", filter: "blur(1px)" }} /> : null}
    {/* arrugas */}
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, transparent 30%, rgba(0,0,0,.07) 31%, transparent 34%), linear-gradient(65deg, transparent 58%, rgba(255,255,255,.35) 59%, transparent 62%)" }} />
  </div>
);
const Remitos: React.FC<{ f: number }> = ({ f }) => (
  <Camara f={f} zoom={[1, 1.22]} from={0} to={CORTES[0] + 10}>
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 45% 40%, #2a2622, #0a0908 75%)" }} />
    <Palabra f={f} from={0}>REMITOS</Palabra>
    {REMITOS.map((p, i) => {
      const at = 4 + i * 9;
      const e = r(f, at, at + 22, Easing.out(Easing.back(1.3)));
      return (
        <div
          key={p.n}
          style={{
            position: "absolute", left: p.x, top: p.y, width: 470, height: 600, background: PAPEL, borderRadius: 6, overflow: "hidden",
            rotate: `${p.rot + (1 - e) * 30}deg`, translate: `${(1 - e) * (i % 2 ? 300 : -300)}px ${(1 - e) * -900}px`,
            boxShadow: "0 30px 60px rgba(0,0,0,.6), 0 2px 0 rgba(255,255,255,.4) inset", filter: `brightness(${0.78 + i * 0.06})`,
          }}
        >
          <Remito {...p} />
        </div>
      );
    })}
  </Camara>
);

// ── 2 · Cobros que se atrasan ───────────────────────────────────────
const AVISOS: [string, string, string, number][] = [
  ["AS", "Asistencia del Sur", "El pago de octubre sale a 60 días.", 124],
  ["M", "Martín · particular", "Te transfiero mañana sin falta 🙏", 142],
  ["AS", "Asistencia del Sur", "Falta el remito del 12 para pagarte.", 160],
  ["$", "Banco", "Saldo disponible: $ 18.400", 180],
];
const Cobros: React.FC<{ f: number }> = ({ f }) => {
  const llegaron = AVISOS.filter((a) => f >= a[3]).length;
  return (
    <Camara f={f} zoom={[1, 1.07]} from={CORTES[0]} to={CORTES[1] + 10} rot={-1.5}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 35%, #1c2230, #07080b 75%)" }} />
      <Palabra f={f} from={CORTES[0]}>COBROS</Palabra>
      <div style={{ position: "absolute", inset: 0, perspective: 1800 }}>
        <div style={{ position: "absolute", left: SAFE.left, width: W, top: 470, height: 640, rotate: "x 8deg", transformStyle: "preserve-3d" }}>
          {AVISOS.map(([ini, quien, msg, at], i) => {
            if (f < at) return null;
            const e = r(f, at, at + 14, Easing.out(Easing.back(1.4)));
            const pos = llegaron - 1 - i;
            const buzz = f - at < 8 ? Math.sin((f - at) * 2.4) * 7 : 0;
            return (
              <div
                key={msg}
                style={{
                  position: "absolute", left: 0, right: 0, top: pos * 150, height: 132, borderRadius: 34, background: "rgba(40,45,58,.9)", backdropFilter: "blur(10px)",
                  border: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", gap: 22, padding: "0 28px", boxShadow: "0 24px 50px rgba(0,0,0,.5)",
                  translate: `${buzz}px ${(1 - e) * -160}px`, opacity: e * (1 - pos * 0.14), scale: 1 - pos * 0.025,
                }}
              >
                <span style={{ width: 78, height: 78, borderRadius: 22, background: ini === "$" ? "#4a5060" : "#5b6378", display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 700, fontSize: 30, color: "#e9ecf2", flexShrink: 0 }}>{ini}</span>
                <span style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: sans, fontWeight: 700, fontSize: 26, color: "#9aa3b8" }}>
                    <span>{quien}</span>
                    <span>ahora</span>
                  </div>
                  <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 34, color: "#eef0f5", marginTop: 2 }}>{msg}</div>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Camara>
  );
};

// ── 3 · Gastos que nunca anotás ─────────────────────────────────────
const TICKETS = Array.from({ length: 16 }).map((_, i) => ({
  x: 120 + random(`tx${i}`) * 700,
  rot: (random(`tr${i}`) - 0.5) * 70,
  at: CORTES[1] + 4 + i * 5,
  pila: 900 + (i % 5) * 24 - Math.floor(i / 5) * 40,
  amt: ["$ 95.000", "$ 4.200", "$ 12.700", "$ 3.200", "$ 18.000", "$ 8.500", "$ 2.600", "$ 120.000"][i % 8],
  que: ["GASOIL", "PEAJE", "COMIDA", "PEAJE", "GOMERÍA", "COMIDA", "LAVADO", "CUBIERTAS"][i % 8],
}));
const Gastos: React.FC<{ f: number }> = ({ f }) => (
  <Camara f={f} zoom={[1.05, 1.24]} from={CORTES[1]} to={CORTES[2] + 10}>
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, #23211d, #080807 75%)" }} />
    <Palabra f={f} from={CORTES[1]}>GASTOS</Palabra>
    {TICKETS.map((t, i) => {
      const k = f - t.at;
      if (k < 0) return null;
      const fall = Math.min(1, k / 26);
      const y = -300 + (t.pila + 300) * Easing.out(Easing.quad)(fall);
      return (
        <div
          key={i}
          style={{
            position: "absolute", left: t.x - 80, top: y - 110, width: 170, height: 230, background: "#f3efe6", padding: "14px 14px", rotate: `${t.rot * (0.4 + fall * 0.6)}deg`,
            boxShadow: "0 16px 30px rgba(0,0,0,.55)", filter: `brightness(${0.8 + (i % 4) * 0.05})`,
            clipPath: "polygon(0 0,100% 0,100% 95%,90% 100%,80% 95%,70% 100%,60% 95%,50% 100%,40% 95%,30% 100%,20% 95%,10% 100%,0 95%)",
          }}
        >
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 20, color: "#55524a", letterSpacing: 2 }}>{t.que}</div>
          {[0.9, 0.6, 0.8].map((w, j) => <div key={j} style={{ height: 6, width: `${w * 100}%`, background: "#cfc8b8", borderRadius: 3, marginTop: 12 }} />)}
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, color: "#2b2a26", marginTop: 22 }}>{t.amt}</div>
        </div>
      );
    })}
    {/* la cuenta en una servilleta */}
    <div
      style={{
        position: "absolute", left: 560, top: 470, width: 330, height: 260, background: "#f7f4ee", rotate: `${8 - r(f, CORTES[1] + 40, CORTES[1] + 60) * 4}deg`, padding: 22,
        boxShadow: "0 20px 40px rgba(0,0,0,.5)", opacity: r(f, CORTES[1] + 40, CORTES[1] + 52), translate: `0px ${(1 - r(f, CORTES[1] + 40, CORTES[1] + 60)) * -60}px`,
        backgroundImage: "radial-gradient(circle at 20% 30%, rgba(0,0,0,.04) 0 2px, transparent 3px)", backgroundSize: "18px 18px",
      }}
    >
      <div style={{ fontFamily: hand, fontWeight: 700, fontSize: 46, color: TINTA, lineHeight: 1.05, rotate: "-3deg" }}>
        gasoil ¿95?
        <br />
        peaje 4,2
        <br />
        <span style={{ textDecoration: "line-through" }}>gomería</span> ¿?
      </div>
    </div>
  </Camara>
);

// ── 4 · Y a fin de mes… ¿cuánto te quedó? ───────────────────────────
const SLAM = 428;
const CAL0 = CORTES[2] + 6, CAL1 = SLAM - 10;
const DIA0 = 20, DIA1 = 30;
// El almanaque arranca despacio y se acelera hasta el 30
const diaEn = (f: number) => DIA0 + Math.floor(interpolate(f, [CAL0, CAL1], [0, DIA1 - DIA0 + 0.999], { ...clamp, easing: Easing.in(Easing.quad) }));
const Hoja: React.FC<{ dia: number; children?: React.ReactNode; style?: React.CSSProperties }> = ({ dia, children, style }) => (
  <div style={{ position: "absolute", left: 0, top: 80, width: 340, height: 250, background: "#e9e7e1", display: "grid", placeItems: "center", fontFamily: display, fontSize: 210, color: "#22242a", transformOrigin: "50% 0", backfaceVisibility: "hidden", ...style }}>
    {dia}
    {children}
  </div>
);
// Los billetes: una pila gruesa que se va quedando sin plata
const BILLETES = 14;
const SE_VAN = ["Gasoil", "Seguro", "Taller", "Peajes", "Cubiertas", "Monotributo", "Comida", "Patente", "Repuestos", "GPS", "VTV", "Lavado"];
const VUELA0 = SLAM + 26, VUELA_CADA = 7;
const Billete: React.FC<{ style?: React.CSSProperties; label?: string }> = ({ style, label }) => (
  <div
    style={{
      position: "absolute", width: 560, height: 250, borderRadius: 14, background: "linear-gradient(135deg, #d7dccd 0%, #c3cbb6 55%, #d3d8c8 100%)",
      border: "3px solid #9aa58c", boxShadow: "0 10px 24px rgba(0,0,0,.45)", overflow: "hidden", ...style,
    }}
  >
    <div style={{ position: "absolute", inset: 12, borderRadius: 8, border: "2px solid rgba(70,82,62,.35)" }} />
    <div style={{ position: "absolute", left: 30, top: 24, fontFamily: display, fontSize: 64, color: "#46523e", lineHeight: 1 }}>$</div>
    <div style={{ position: "absolute", right: 30, bottom: 18, fontFamily: display, fontSize: 64, color: "#46523e", lineHeight: 1 }}>$</div>
    <div style={{ position: "absolute", left: 200, top: 45, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(70,82,62,.28), rgba(70,82,62,.08) 70%)", border: "2px solid rgba(70,82,62,.3)" }} />
    <div style={{ position: "absolute", left: 30, right: 30, top: 118, height: 14, background: "repeating-linear-gradient(90deg, rgba(70,82,62,.3) 0 6px, transparent 6px 10px)" }} />
    {label ? <div style={{ position: "absolute", left: 0, right: 0, bottom: 30, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 40, color: "#2f3829" }}>{label}</div> : null}
  </div>
);
const Pregunta: React.FC<{ f: number }> = ({ f }) => {
  const alm = r(f, CORTES[2], CORTES[2] + 14);
  const dia = diaEn(f);
  // cuándo cambió la hoja por última vez, para arrancarla
  let cambio = f;
  while (cambio > CAL0 && diaEn(cambio - 1) === dia) cambio--;
  const arranca = dia > DIA0 ? r(f, cambio, cambio + 7, Easing.in(Easing.quad)) : 1;
  const sale = r(f, SLAM - 6, SLAM + 6);
  const slam = interpolate(f, [SLAM, SLAM + 8], [2.2, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const t = f - SLAM - 8;
  const shake = t >= 0 && t < 16 ? Math.sin(t * 2.6) * 18 * (1 - t / 16) : 0;
  const pila = r(f, SLAM + 6, SLAM + 22, Easing.out(Easing.back(1.3)));
  const quedan = BILLETES - SE_VAN.filter((_, i) => f >= VUELA0 + i * VUELA_CADA).length;
  const tiembla = quedan <= 2 ? Math.sin(f * 1.7) * 4 : 0;
  return (
    <Camara f={f} zoom={[1.15, 1]} from={CORTES[2]} to={GANCHO_DUR}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #1d2029, #050608 72%)", translate: `${shake}px 0px` }}>
        {/* almanaque que se arranca hoja por hoja */}
        <div style={{ position: "absolute", inset: 0, perspective: 1400 }}>
          <div
            style={{
              position: "absolute", left: 540 - 170, top: 420, width: 340, height: 330, borderRadius: 26, overflow: "visible", opacity: alm * (1 - sale),
              scale: 0.9 + alm * 0.1 - sale * 0.15, filter: sale > 0 ? `blur(${sale * 12}px)` : undefined, boxShadow: "0 40px 80px rgba(0,0,0,.6)",
            }}
          >
            <div style={{ position: "absolute", left: 0, top: 0, width: 340, height: 330, borderRadius: 26, overflow: "hidden", background: "#e9e7e1" }}>
              <div style={{ height: 80, background: "#3a3d45", color: "#e4e6ea", fontFamily: mono, fontWeight: 700, fontSize: 32, letterSpacing: 4, display: "grid", placeItems: "center" }}>NOVIEMBRE</div>
              <Hoja dia={dia} style={{ color: dia === DIA1 ? "#b06f0a" : "#22242a" }} />
            </div>
            {dia > DIA0 && arranca < 1 ? <Hoja dia={dia - 1} style={{ borderRadius: "0 0 26px 26px", rotate: `x ${-arranca * 110}deg`, opacity: 1 - arranca * 0.6, boxShadow: "0 20px 40px rgba(0,0,0,.35)" }} /> : null}
          </div>
        </div>
        {f >= SLAM ? (
          <div style={{ position: "absolute", top: 330, left: SAFE.left - 20, width: W + 40, textAlign: "center", fontFamily: display, fontSize: 180, lineHeight: 0.88, color: "#f2f3f6", scale: slam, opacity: r(f, SLAM, SLAM + 4), textShadow: "0 12px 50px rgba(0,0,0,.7)", zIndex: 20 }}>
            ¿Cuánto
            <br />
            te <span style={{ color: AMBER }}>quedó?</span>
          </div>
        ) : null}
        {/* la pila de billetes que se vacía */}
        {f >= SLAM + 6 ? (
          <div style={{ position: "absolute", left: 540 - 280, top: 860, width: 560, height: 260, opacity: pila, scale: 0.7 + pila * 0.3, translate: `${tiembla}px 0px` }}>
            {Array.from({ length: BILLETES }).map((_, i) => {
              // los de arriba son los primeros en irse
              const idx = BILLETES - 1 - i;
              const vuela = idx < SE_VAN.length ? VUELA0 + idx * VUELA_CADA : Infinity;
              const k = f - vuela;
              if (k > 40) return null;
              const lado = idx % 2 ? 1 : -1;
              const y = -i * 11;
              if (k < 0) return <Billete key={i} style={{ left: 0, top: y, filter: `brightness(${0.75 + (i / BILLETES) * 0.3})` }} />;
              const p = k / 40;
              return (
                <Billete
                  key={i}
                  label={SE_VAN[idx]}
                  style={{
                    left: lado * p * 820, top: y - p * 140 + p * p * 620, rotate: `${lado * p * 80}deg`, scale: 1 - p * 0.35, opacity: 1 - Math.max(0, p - 0.6) / 0.4, zIndex: 10,
                  }}
                />
              );
            })}
          </div>
        ) : null}
      </AbsoluteFill>
    </Camara>
  );
};

// ── Armado ──────────────────────────────────────────────────────────
export const Gancho: React.FC<{ guia?: boolean }> = ({ guia = false }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#050608", overflow: "hidden" }}>
      <Toma f={f} from={0} to={CORTES[0]}>
        <Remitos f={f} />
      </Toma>
      <Toma f={f} from={CORTES[0]} to={CORTES[1]}>
        <Cobros f={f} />
      </Toma>
      <Toma f={f} from={CORTES[1]} to={CORTES[2]}>
        <Gastos f={f} />
      </Toma>
      <Toma f={f} from={CORTES[2]} to={GANCHO_DUR + 20}>
        <Pregunta f={f} />
      </Toma>
      <Vineta />
      <Grano f={f} />
      <Subtitulo f={f} />
      {VOZ.map((v) => (
        <Audio key={v.src} name={v.texto} src={staticFile(v.src)} from={v.at} volume={1} />
      ))}
      {/* sonido */}
      {REMITOS.map((_, i) => (
        <Audio key={`p${i}`} name="Papel" src={staticFile("sfx/page-turn.wav")} from={4 + i * 9} volume={0.35} />
      ))}
      {CORTES.map((c) => (
        <Audio key={`w${c}`} name="Corte" src={staticFile("sfx/whoosh.wav")} from={c - 6} volume={0.45} />
      ))}
      {AVISOS.map((a) => (
        <Audio key={a[2]} name="Aviso" src={staticFile("sfx/ding.wav")} from={a[3]} volume={0.22} />
      ))}
      {TICKETS.filter((_, i) => i % 4 === 0).map((t) => (
        <Audio key={`t${t.at}`} name="Tickets" src={staticFile("sfx/page-turn.wav")} from={t.at} volume={0.3} />
      ))}
      <Audio name="Pregunta" src={staticFile("sfx/whip.wav")} from={SLAM + 4} volume={0.8} />
      {Array.from({ length: DIA1 - DIA0 }).map((_, i) => {
        let at = CAL0;
        while (at < CAL1 && diaEn(at) < DIA0 + i + 1) at++;
        return <Audio key={`h${i}`} name="Hoja" src={staticFile("sfx/page-turn.wav")} from={at} volume={0.18 + i * 0.02} />;
      })}
      {SE_VAN.map((g, i) => (
        <Audio key={g} name="Billete" src={staticFile("sfx/whoosh.wav")} from={VUELA0 + i * VUELA_CADA} volume={0.22} />
      ))}
      {guia ? <ReelsGuide /> : null}
    </AbsoluteFill>
  );
};
