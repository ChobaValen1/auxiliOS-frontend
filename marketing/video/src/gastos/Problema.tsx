import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { clamp, display, mono, sans } from "../theme";
import { money, pop, ramp, SAFE } from "./common";

// Escenas del problema para el reel de solución: sin AuxiliOS, el gasto se pierde, el servicio
// te cuesta plata y el vencimiento te para la grúa. Grises y ámbar, sin colores de semáforo.
const W = SAFE.right - SAFE.left;
const AMBER = "#f5a623";

const Sin: React.FC<{ children: React.ReactNode; shake?: number }> = ({ children, shake = 0 }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "repeating-linear-gradient(0deg, #1b1c1f 0 6px, #1d1e21 6px 12px)", overflow: "hidden", translate: `${shake}px 0px` }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 26, background: "repeating-linear-gradient(-45deg, #5d6169 0 26px, #111 26px 52px)" }} />
      {children}
      <span
        style={{
          position: "absolute", top: SAFE.top, left: SAFE.left, fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 2, padding: "8px 18px", borderRadius: 999,
          background: "#3a3c42", color: "#c9ccd2", opacity: ramp(f, 0, 8),
        }}
      >
        SIN AUXILIOS
      </span>
    </AbsoluteFill>
  );
};

const Titulo: React.FC<{ f: number; at?: number; children: React.ReactNode; size?: number; top?: number }> = ({ f, at = 0, children, size = 104, top = SAFE.top + 56 }) => {
  const e = ramp(f, at, at + 12);
  return (
    <div style={{ position: "absolute", top, left: SAFE.left, width: W, fontFamily: display, fontSize: size, lineHeight: 0.95, color: "#e4e6ea", opacity: e, translate: `0px ${(1 - e) * 30}px`, textShadow: "0 6px 30px rgba(0,0,0,.6)" }}>
      {children}
    </div>
  );
};

const golpe = (f: number, at: number, fuerza = 14) => {
  const t = f - at;
  return t >= 0 && t < 12 ? Math.sin(t * 3.2) * fuerza * (1 - t / 12) : 0;
};

// ── 1 · El ticket se borra ───────────────────────────────────────────
export const BORRA_DUR = 140;
const LINEAS: [string, string, number][] = [
  ["ESTACIÓN DE SERVICIO", "", 0],
  ["04/11/2026", "08:07", 1],
  ["", "", 2],
  ["GASOIL G2", "60,0 L", 3],
  ["SURTIDOR 4", "", 4],
  ["", "", 5],
  ["TOTAL", "$ 95.000", 6],
];
export const TicketBorra: React.FC = () => {
  const f = useCurrentFrame();
  const zoom = interpolate(f, [0, BORRA_DUR], [1, 1.05]);
  const drift = Math.sin(f / 22) * 6;
  // la tinta térmica se va: primero los renglones de arriba, el total al final
  const ink = (i: number) => 1 - ramp(f, 22 + i * 7, 74 + i * 7, Easing.inOut(Easing.quad)) * 0.94;
  const amarillo = ramp(f, 20, 110);
  return (
    <Sin>
      <Titulo f={f}>El ticket se borra.</Titulo>
      <Titulo f={f} at={96} top={1140}>
        <span style={{ color: AMBER }}>El gasto, no.</span>
      </Titulo>
      <div
        style={{
          position: "absolute", left: 540 - 260, top: 480, width: 520, height: 620, padding: "34px 40px", rotate: `${-4 + drift * 0.15}deg`, scale: zoom, translate: `${drift}px 0px`,
          background: `linear-gradient(170deg, ${interpolateColor(amarillo)} 0%, #e9e1cc 100%)`, boxShadow: "0 40px 90px rgba(0,0,0,.6)",
          clipPath: "polygon(0 0,100% 0,100% 96%,92% 100%,84% 96%,76% 100%,68% 96%,60% 100%,52% 96%,44% 100%,36% 96%,28% 100%,20% 96%,12% 100%,4% 96%,0 100%)",
        }}
      >
        {LINEAS.map(([l, r, i]) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontWeight: 700, fontSize: i === 6 ? 46 : i === 0 ? 30 : 32, color: "#2b2a26", opacity: ink(i), height: i === 6 ? 76 : 56, alignItems: "center", filter: `blur(${(1 - ink(i)) * 1.5}px)` }}>
            <span>{l}</span>
            <span>{r}</span>
          </div>
        ))}
        <div style={{ borderTop: "3px dashed rgba(43,42,38,.35)", marginTop: 20, opacity: ink(5) }} />
        <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 24, color: "#2b2a26", opacity: ink(6) * 0.8, marginTop: 20, textAlign: "center" }}>GRACIAS POR SU COMPRA</div>
      </div>
      <Audio name="Golpe" src={staticFile("sfx/whip.wav")} from={96} volume={0.5} />
    </Sin>
  );
};
// Papel térmico que amarillea con el tiempo
const interpolateColor = (t: number) => {
  const a = [246, 243, 236], b = [233, 221, 190];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
};

// ── 2 · El servicio que te cuesta plata ─────────────────────────────
export const CUESTA_DUR = 200;
// Un servicio largo de 140 km con el costo por km del mes (gasoil $ 585 y desgaste $ 250 por km)
const COBRA = 125000;
const COSTOS: [string, string, number][] = [
  ["⛽", "Gasoil · 140 km", 82000],
  ["🛞", "Cubiertas y taller (desgaste)", 35000],
  ["🍔", "Comida en la ruta", 9000],
  ["🛣️", "Peajes ida y vuelta", 8000],
];
const C0 = 40, C_EVERY = 18;
export const ServicioCuesta: React.FC = () => {
  const f = useCurrentFrame();
  const restados = COSTOS.reduce((s, c, i) => s + c[2] * ramp(f, C0 + i * C_EVERY + 4, C0 + i * C_EVERY + 16), 0);
  const queda = COBRA - restados;
  const negAt = C0 + 3 * C_EVERY + 12;
  const neg = queda < 0;
  const sello = pop(f, negAt + 4, negAt + 16);
  const pie = ramp(f, 150, 162);
  return (
    <Sin shake={golpe(f, negAt + 4, 16)}>
      <Titulo f={f}>
        Hay servicios
        <br />
        <span style={{ color: AMBER }}>que te cuestan plata.</span>
      </Titulo>
      <div style={{ position: "absolute", left: SAFE.left, width: W, top: 520, background: "rgba(23,25,30,.96)", border: "3px solid #34373e", borderRadius: 32, padding: "26px 34px", boxShadow: "0 30px 70px rgba(0,0,0,.5)", opacity: ramp(f, 10, 22), translate: `0px ${(1 - ramp(f, 10, 22)) * 40}px` }}>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: "#8d929c" }}>SERVICIO LARGO · 140 KM</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 14, fontFamily: sans, fontWeight: 700, fontSize: 34, color: "#e4e6ea" }}>
          <span>Te paga la prestadora</span>
          <span style={{ fontFamily: mono, fontSize: 40 }}>{money(COBRA)}</span>
        </div>
        {COSTOS.map(([e, l, v], i) => {
          const at = C0 + i * C_EVERY;
          const k = ramp(f, at, at + 10);
          return (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 64, fontFamily: sans, fontWeight: 700, fontSize: 30, color: "#b9bdc6", opacity: k, translate: `${(1 - k) * 40}px 0px` }}>
              <span>{e} {l}</span>
              <span style={{ fontFamily: mono, color: AMBER }}>− {money(v)}</span>
            </div>
          );
        })}
        <div style={{ borderTop: "4px dashed #3c4048", margin: "14px 0 10px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 38, color: "#e4e6ea" }}>Te queda</span>
          <span style={{ position: "relative", fontFamily: mono, fontWeight: 700, fontSize: 72, color: neg ? INK : "#e4e6ea", padding: "0 12px" }}>
            <span style={{ position: "absolute", inset: 0, background: AMBER, borderRadius: 10, transformOrigin: "100% 50%", scale: `${neg ? sello : 0} 1` }} />
            <span style={{ position: "relative" }}>{queda < 0 ? "− " + money(-queda) : money(queda)}</span>
          </span>
        </div>
      </div>
      <div style={{ position: "absolute", top: 1130, left: SAFE.left, width: W, fontFamily: sans, fontWeight: 700, fontSize: 40, color: "#b9bdc6", opacity: pie, translate: `0px ${(1 - pie) * 20}px` }}>
        Y todavía no pagaste el seguro.
      </div>
      {COSTOS.map((c, i) => (
        <Audio key={c[1]} name="Gasto" src={staticFile("sfx/mouse-click.wav")} from={C0 + i * C_EVERY} volume={0.35} />
      ))}
      <Audio name="En rojo" src={staticFile("sfx/record-scratch.wav")} from={negAt + 4} volume={0.5} />
    </Sin>
  );
};
const INK = "#14161b";

// ── 3 · La VTV vencida: grúa parada ─────────────────────────────────
export const VENCE_DUR = 160;
const SELLO = 58;
export const VtvVencida: React.FC = () => {
  const f = useCurrentFrame();
  // el almanaque pasa días hasta el 08/12, un día después del vencimiento
  const dia = Math.min(8, 1 + Math.floor(interpolate(f, [14, 52], [0, 7.99], { ...clamp, easing: Easing.in(Easing.quad) })));
  const flip = (f - 14) % 5;
  const sello = interpolate(f, [SELLO, SELLO + 6], [2.4, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const selloOn = ramp(f, SELLO, SELLO + 4);
  const parada = ramp(f, 92, 104);
  const plata = ramp(f, 108, 120);
  return (
    <Sin shake={golpe(f, SELLO + 6, 18)}>
      <Titulo f={f} size={96}>
        Se te vence la VTV
        <br />
        <span style={{ color: AMBER }}>y te enterás en el control.</span>
      </Titulo>
      {/* almanaque */}
      <div style={{ position: "absolute", left: 540 - 230, top: 520, width: 460, height: 420, borderRadius: 30, background: "#ecebe6", boxShadow: "0 40px 90px rgba(0,0,0,.55)", overflow: "hidden", opacity: ramp(f, 4, 14), rotate: "-2deg" }}>
        <div style={{ height: 96, background: "#3a3c42", color: "#e4e6ea", fontFamily: mono, fontWeight: 700, fontSize: 40, letterSpacing: 4, display: "grid", placeItems: "center" }}>DICIEMBRE</div>
        <div style={{ height: 324, display: "grid", placeItems: "center", fontFamily: display, fontSize: 260, color: "#24262b", translate: f >= 14 && f < 54 ? `0px ${-flip * 6}px` : "0px 0px" }}>
          {String(dia).padStart(2, "0")}
        </div>
      </div>
      {/* sello */}
      {f >= SELLO ? (
        <div style={{ position: "absolute", left: 540 - 200, top: 830, width: 400, textAlign: "center", fontFamily: display, fontSize: 112, color: AMBER, border: `8px solid ${AMBER}`, borderRadius: 24, rotate: "-12deg", scale: sello, opacity: selloOn * 0.95, background: "rgba(20,22,27,.55)", textShadow: "0 4px 20px rgba(0,0,0,.5)" }}>
          VENCIDA
        </div>
      ) : null}
      <div style={{ position: "absolute", top: 1010, left: SAFE.left, width: W, textAlign: "center" }}>
        <div style={{ fontFamily: display, fontSize: 92, color: "#e4e6ea", opacity: parada, translate: `0px ${(1 - parada) * 30}px` }}>Grúa parada.</div>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 60, color: AMBER, opacity: plata, scale: 0.9 + plata * 0.1 }}>− {money(120000)} por día</div>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 32, color: "#8d929c", opacity: ramp(f, 122, 132) }}>lo que facturás en un día de laburo</div>
      </div>
      <Audio name="Almanaque" src={staticFile("sfx/page-turn.wav")} from={14} volume={0.5} />
      <Audio name="Sello" src={staticFile("sfx/whip.wav")} from={SELLO + 4} volume={0.8} />
    </Sin>
  );
};
