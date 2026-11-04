import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import React from "react";
import { AbsoluteFill, Easing, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import { C, clamp, display, mono, sans } from "../theme";
import { Logo } from "../scenes/Logo";
import { ReelsGuide } from "../monogrua/StepFrame";
import { Ico, money, Phone, pop, ramp, Shot, Shots, U } from "../monogrua/v2/ui";
import { SAFE, Stripe } from "./common";

// Reel de solución de gastos: un día del gruero cargando gastos en AuxiliOS y, a la noche, sus números.
// Mismos datos de ejemplo que «¿Cuántos días laburás para vos?» (noviembre, 32 servicios, $ 3.600.000).
const W = SAFE.right - SAFE.left;
const AMBER = "#f5a623";
const INK = "#14161b";

// ── Teclado del alta de gasto (el mismo orden que en la app) ─────────
type Key = [string, number, number, number?];
const KEYS: Key[] = [
  ["7", 0, 0], ["8", 0, 1], ["9", 0, 2], ["⌫", 0, 3],
  ["4", 1, 0], ["5", 1, 1], ["6", 1, 2], ["+", 1, 3],
  ["1", 2, 0], ["2", 2, 1], ["3", 2, 2], ["OK", 2, 3, 2],
  ["000", 3, 0], ["0", 3, 1], [",", 3, 2],
];
const KX = 44, KW = 184, KG = 10, KY = 476, KH = 58, KR = 66;
const keyBox = (k: string) => {
  const [, r, c, span = 1] = KEYS.find((x) => x[0] === k)!;
  return { x: KX + c * (KW + KG), y: KY + r * KR, w: KW, h: KH * span + (span - 1) * (KR - KH) };
};
const keyCenter = (k: string) => {
  const b = keyBox(k);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
};
type Tap = { k: string; at: number };
const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
// Lo que quedó escrito con los toques hasta el cuadro f
const typed = (taps: Tap[], f: number) => {
  let expr = "";
  for (const t of taps) {
    if (t.at > f) break;
    if (t.k === "+") expr += "+";
    else if (/^\d+$/.test(t.k)) expr += t.k;
  }
  const terms = expr.split("+").filter(Boolean).map(Number);
  return { terms, total: terms.reduce((a, b) => a + b, 0) };
};

// Toque corto: círculo que baja y suelta una onda (para tipear rápido sin que se pisen)
const TapDot: React.FC<{ f: number; at: number; x: number; y: number }> = ({ f, at, x, y }) => {
  if (f < at - 7 || f > at + 12) return null;
  const come = ramp(f, at - 7, at);
  const out = ramp(f, at, at + 12);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, zIndex: 80 }}>
      <div style={{ position: "absolute", left: -70, top: -70, width: 140, height: 140, borderRadius: "50%", border: "5px solid rgba(255,255,255,.8)", opacity: f >= at ? 1 - out : 0, scale: 0.5 + out }} />
      <div style={{ position: "absolute", left: -36, top: -36, width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,.85)", boxShadow: "0 8px 24px rgba(0,0,0,.4)", opacity: (f < at ? come : 1 - out) * 0.9, scale: f < at ? 1.3 - come * 0.3 : 0.85 }} />
    </div>
  );
};

const Keypad: React.FC<{ f: number; taps: Tap[] }> = ({ f, taps }) => (
  <>
    {KEYS.map(([k]) => {
      const b = keyBox(k);
      const hit = taps.some((t) => t.k === k && f >= t.at && f < t.at + 6);
      const ok = k === "OK";
      return (
        <div
          key={k}
          style={{
            position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: 18, display: "grid", placeItems: "center",
            background: ok ? AMBER : hit ? "#3a4152" : U.card2, color: ok ? INK : k === "+" || k === "⌫" ? AMBER : U.text,
            fontFamily: ok ? sans : mono, fontWeight: 700, fontSize: ok ? 34 : 38, scale: hit ? 0.94 : 1,
          }}
        >
          {ok ? (
            <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <Ico n="check" s={16} w={3} />
              Guardar
            </span>
          ) : (
            k
          )}
        </div>
      );
    })}
  </>
);

type Cat = [string, string];
const CATS_DIA: Cat[] = [["⛽", "Combustible"], ["🔧", "Taller"], ["🔩", "Repuestos"], ["🛞", "Cubiertas"], ["🛣️", "Peajes"], ["🍔", "Comida"], ["🧽", "Lavado"], ["•••", "Otro"]];
const CATS_FIJO: Cat[] = [["🛡️", "Seguro"], ["🚗", "Patente"], ["🧾", "Monotributo"], ["🔍", "VTV"], ["📡", "GPS / celular"], ["🏗️", "Cuota de la grúa"], ["•••", "Otro"]];
const cellCenter = (i: number) => ({ x: KX + (i % 4) * (KW + KG) + KW / 2, y: 340 + Math.floor(i / 4) * 170 + 75 });

const SEG = { x: 500, y: 22, w: 316, h: 64 };
const ROW_CAT = 276, ROW_2 = 372, ROW_H = 84;

type Gasto = {
  kind: "dia" | "fijo";
  taps: Tap[];
  saveAt: number;
  saved: string;
  cat?: Cat; // categoría ya elegida desde el principio
  pick?: { open: number; at: number; i: number }; // elige la categoría en la hoja
  ticketAt?: number; // saca la foto del ticket
  toggleAt?: number; // pasa de «Del día» a «Fijo»
};

// Pantalla «Nuevo gasto», simplificada y grande
const NuevoGasto: React.FC<{ f: number; g: Gasto }> = ({ f, g }) => {
  const fijo = g.kind === "fijo" && (g.toggleAt === undefined || f >= g.toggleAt + 2);
  const { terms, total } = typed(g.taps, f);
  const cats = g.kind === "fijo" ? CATS_FIJO : CATS_DIA;
  const cat = g.cat ?? (g.pick && f >= g.pick.at + 2 ? cats[g.pick.i] : null);
  const catPop = g.pick ? pop(f, g.pick.at + 6, g.pick.at + 16) : 1;
  const sheetOn = g.pick ? ramp(f, g.pick.open + 2, g.pick.open + 12) * (1 - ramp(f, g.pick.at + 4, g.pick.at + 14)) : 0;
  const shot = g.ticketAt !== undefined && f >= g.ticketAt + 2;
  const flash = g.ticketAt !== undefined ? interpolate(f, [g.ticketAt + 1, g.ticketAt + 3, g.ticketAt + 12], [0, 1, 0], clamp) : 0;
  const toast = pop(f, g.saveAt + 2, g.saveAt + 12);
  const segX = fijo ? SEG.w / 2 : 0;
  const segMove = g.toggleAt !== undefined ? ramp(f, g.toggleAt + 1, g.toggleAt + 9) * (SEG.w / 2) : segX;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* encabezado */}
      <div style={{ position: "absolute", left: 44, top: 30, display: "flex", alignItems: "center", gap: 18, color: U.text }}>
        <Ico n="left" s={18} w={2.6} />
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 44 }}>Nuevo gasto</span>
      </div>
      <div style={{ position: "absolute", left: SEG.x, top: SEG.y, width: SEG.w, height: SEG.h, borderRadius: 18, background: U.card, border: `3px solid ${U.line}` }}>
        <div style={{ position: "absolute", top: 4, left: 4 + segMove, width: SEG.w / 2 - 8, height: SEG.h - 14, borderRadius: 14, background: AMBER }} />
        {["Del día", "Fijo"].map((l, i) => (
          <span key={l} style={{ position: "absolute", top: 0, left: (i * SEG.w) / 2, width: SEG.w / 2, height: SEG.h - 6, display: "grid", placeItems: "center", fontFamily: sans, fontWeight: 700, fontSize: 28, color: (i === 1) === fijo ? INK : U.muted }}>
            {l}
          </span>
        ))}
      </div>
      {/* monto */}
      <div style={{ position: "absolute", left: 44, top: 108, display: "flex", alignItems: "baseline", gap: 14 }}>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 56, color: U.muted }}>$</span>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 104, color: total ? U.text : "#4a5266", lineHeight: 1 }}>{fmt(total)}</span>
      </div>
      <div style={{ position: "absolute", left: 44, top: 226, fontFamily: mono, fontWeight: 700, fontSize: 30, color: U.muted, height: 40 }}>
        {terms.length > 1 ? terms.map(fmt).join(" + ") : null}
        {g.kind === "fijo" && fijo && total ? <span style={{ color: AMBER }}>= {money(total / 12)} por mes</span> : null}
      </div>
      {/* categoría */}
      <div
        style={{
          position: "absolute", left: 44, right: 44, top: ROW_CAT, height: ROW_H, borderRadius: 22, background: U.card,
          border: `3px solid ${cat ? AMBER : U.line}`, display: "flex", alignItems: "center", gap: 18, padding: "0 20px", scale: cat ? 0.97 + catPop * 0.03 : 1,
        }}
      >
        <span style={{ width: 56, height: 56, borderRadius: 14, background: U.card2, display: "grid", placeItems: "center", fontSize: 32, color: U.muted }}>{cat ? cat[0] : "☰"}</span>
        <span style={{ flex: 1 }}>
          <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 22, color: U.muted }}>Categoría</div>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 32, color: U.text }}>{cat ? cat[1] : "Elegir categoría"}</div>
        </span>
      </div>
      {/* foto del ticket o, en los fijos, cuántos meses cubre */}
      {g.kind === "dia" || !fijo ? (
        <div style={{ position: "absolute", left: 44, right: 44, top: ROW_2, height: ROW_H, borderRadius: 22, background: U.card, border: `3px ${shot ? "solid" : "dashed"} ${shot ? AMBER : U.line}`, display: "flex", alignItems: "center", gap: 18, padding: "0 20px" }}>
          <span style={{ width: 56, height: 64, borderRadius: 10, background: shot ? "#f4f1ea" : U.card2, display: "grid", placeItems: "center", color: U.muted, overflow: "hidden", scale: shot ? pop(f, g.ticketAt! + 2, g.ticketAt! + 12) : 1 }}>
            {shot ? (
              <span style={{ display: "flex", flexDirection: "column", gap: 5, width: 36 }}>
                {[1, 0.7, 0.9, 0.5].map((w, i) => <i key={i} style={{ height: 4, width: `${w * 100}%`, background: "#9b968a", borderRadius: 2 }} />)}
              </span>
            ) : (
              <Ico n="camera" s={16} />
            )}
          </span>
          <span style={{ flex: 1 }}>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, color: U.text }}>{shot ? "Ticket guardado" : "Foto del ticket"}</div>
            <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 22, color: shot ? AMBER : U.muted }}>{shot ? "Queda con el gasto, por si lo necesitás" : "Opcional · sacala o elegila de la galería"}</div>
          </span>
          {shot ? <span style={{ color: AMBER }}><Ico n="check" s={16} w={3} /></span> : <Ico n="plus" s={14} c={U.muted} />}
        </div>
      ) : (
        <div style={{ position: "absolute", left: 44, top: ROW_2 + 10, display: "flex", gap: 14 }}>
          {[["📅", "Cubre 12 meses"], ["✏️", "Detalle"]].map(([e, l], i) => (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: 10, height: 64, padding: "0 22px", borderRadius: 999, background: U.card, border: `3px solid ${i === 0 ? AMBER : U.line}`, fontFamily: sans, fontWeight: 700, fontSize: 28, color: i === 0 ? AMBER : U.muted }}>
              <span style={{ fontSize: 26 }}>{e}</span>
              {l}
            </span>
          ))}
        </div>
      )}
      <Keypad f={f} taps={g.taps} />
      {/* hoja de categorías */}
      {sheetOn > 0 ? (
        <>
          <div style={{ position: "absolute", inset: 0, background: "rgba(5,6,9,.6)", opacity: sheetOn }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 250, height: 760, borderRadius: "36px 36px 0 0", background: "#141821", borderTop: `3px solid ${U.line}`, translate: `0px ${(1 - sheetOn) * 520}px` }}>
            <div style={{ position: "absolute", left: 44, top: 26, fontFamily: sans, fontWeight: 700, fontSize: 36, color: U.text }}>Elegir categoría</div>
          </div>
          {cats.map(([e, l], i) => {
            const c = cellCenter(i);
            const picked = g.pick && i === g.pick.i && f >= g.pick.at;
            return (
              <div
                key={l}
                style={{
                  position: "absolute", left: c.x - KW / 2, top: c.y - 75, width: KW, height: 150, borderRadius: 22, background: picked ? AMBER : U.card,
                  border: `3px solid ${picked ? AMBER : U.line}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: sheetOn, translate: `0px ${(1 - sheetOn) * 520}px`,
                }}
              >
                <span style={{ fontSize: 46, color: U.muted }}>{e}</span>
                <span style={{ fontFamily: sans, fontWeight: 700, fontSize: l.length > 12 ? 20 : 24, color: picked ? INK : U.text, textAlign: "center", lineHeight: 1.1 }}>{l}</span>
              </div>
            );
          })}
        </>
      ) : null}
      {/* flash de la cámara */}
      <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash * 0.85 }} />
      {/* guardado */}
      {toast > 0 ? (
        <div
          style={{
            position: "absolute", left: 44, right: 44, top: 100, height: 150, borderRadius: 28, background: "#1b2030", border: `3px solid ${AMBER}`,
            display: "flex", alignItems: "center", gap: 22, padding: "0 28px", boxShadow: "0 30px 60px rgba(0,0,0,.55)", opacity: Math.min(1, toast), scale: 0.85 + toast * 0.15,
          }}
        >
          <span style={{ width: 84, height: 84, borderRadius: "50%", background: AMBER, color: INK, display: "grid", placeItems: "center" }}>
            <Ico n="check" s={22} w={3.2} />
          </span>
          <span>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 36, color: U.text }}>Gasto guardado</div>
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, color: AMBER }}>{g.saved}</div>
          </span>
        </div>
      ) : null}
    </div>
  );
};

// Los toques de cada alta, en coordenadas de la pantalla del celular
const taps = (g: Gasto) => {
  const out: { at: number; x: number; y: number }[] = [];
  if (g.toggleAt !== undefined) out.push({ at: g.toggleAt, x: SEG.x + (SEG.w * 3) / 4, y: SEG.y + SEG.h / 2 });
  if (g.ticketAt !== undefined) out.push({ at: g.ticketAt, x: 430, y: ROW_2 + ROW_H / 2 });
  if (g.pick) {
    out.push({ at: g.pick.open, x: 430, y: ROW_CAT + ROW_H / 2 });
    out.push({ at: g.pick.at, ...cellCenter(g.pick.i) });
  }
  for (const t of g.taps) out.push({ at: t.at, ...keyCenter(t.k) });
  out.push({ at: g.saveAt, ...keyCenter("OK") });
  return out;
};
const seq = (keys: string[], start: number, every: number): Tap[] => keys.map((k, i) => ({ k, at: start + i * every }));

const GASOIL: Gasto = { kind: "dia", ticketAt: 24, pick: { open: 54, at: 78, i: 0 }, taps: seq(["9", "5", "000"], 102, 9), saveAt: 142, saved: "⛽ Combustible · $ 95.000" };
const COMIDA: Gasto = { kind: "dia", cat: CATS_DIA[5], taps: [...seq(["8", "5", "0", "0"], 26, 6), { k: "+", at: 52 }, ...seq(["4", "2", "0", "0"], 60, 6)], saveAt: 100, saved: "🍔 Comida · $ 12.700" };
const SEGURO: Gasto = { kind: "fijo", toggleAt: 16, pick: { open: 40, at: 62, i: 0 }, taps: seq(["3", "8", "4", "0", "000"], 84, 7), saveAt: 132, saved: "🛡️ Seguro · $ 320.000 por mes" };

// ── Mis números: punto de equilibrio a mitad de mes y el cierre del mes ─
const SERV_FIJOS = 9;
const FIJOS = 622000;
const QUEDA = 1810000;
const SKIP = 110; // salto del 12 al 30 de noviembre
const NOTI = 222;
const Numeros: React.FC<{ f: number }> = ({ f }) => {
  const skip = ramp(f, SKIP, SKIP + 40, Easing.inOut(Easing.cubic));
  const n = Math.round(7 + skip * 25);
  const dia = Math.round(12 + skip * 18);
  const fill = f < SKIP ? ramp(f, 14, 44) * (7 / SERV_FIJOS) : Math.min(1, n / SERV_FIJOS);
  const cubierto = n >= SERV_FIJOS;
  const cubAt = SKIP + 6;
  const burst = ramp(f, cubAt, cubAt + 24);
  const queda = interpolate(f, [164, 204], [0, QUEDA], { ...clamp, easing: Easing.out(Easing.cubic) });
  const notiIn = ramp(f, NOTI, NOTI + 14, Easing.out(Easing.back(1.4)));
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", left: 44, top: 26 }}>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: AMBER }}>
          AUXILI<span style={{ color: U.text }}>OS</span>
        </div>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 54, color: U.text, marginTop: 6 }}>Mis números</div>
      </div>
      {/* fecha: el mes avanza */}
      <div style={{ position: "absolute", right: 44, top: 60, height: 64, padding: "0 22px", borderRadius: 999, background: U.card, border: `3px solid ${U.line}`, display: "flex", alignItems: "center", gap: 10, fontFamily: sans, fontWeight: 700, fontSize: 28, color: U.text }}>
        <Ico n="cal" s={14} c={U.muted} />
        <span style={{ fontFamily: mono, minWidth: 40, textAlign: "right" }}>{dia}</span> de noviembre
      </div>
      {/* punto de equilibrio */}
      <div
        style={{
          position: "absolute", left: 44, right: 44, top: 170, height: 270, borderRadius: 32, background: U.card, border: `3px solid ${cubierto ? AMBER : U.line}`, padding: "24px 30px",
          opacity: ramp(f, 4, 16), translate: `0px ${(1 - ramp(f, 4, 16)) * 30}px`, boxShadow: cubierto ? `0 0 ${50 * (1 - burst * 0.6)}px rgba(245,166,35,.35)` : "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 34, color: U.text }}>Punto de equilibrio</span>
          <span
            style={{
              fontFamily: sans, fontWeight: 700, fontSize: 28, padding: "8px 20px", borderRadius: 999, display: "flex", alignItems: "center", gap: 8,
              background: cubierto ? AMBER : "transparent", border: `3px solid ${AMBER}`, color: cubierto ? INK : AMBER, scale: cubierto ? 1 + (1 - pop(f, cubAt, cubAt + 12)) * 0.4 : 1,
            }}
          >
            {cubierto ? <><Ico n="check" s={13} w={3.2} /> Cubierto</> : `Faltan ${SERV_FIJOS - n}`}
          </span>
        </div>
        <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 30, color: U.muted, marginTop: 16, lineHeight: 1.3 }}>
          Necesitás <b style={{ color: U.text, fontFamily: mono }}>{SERV_FIJOS}</b> servicios por mes para cubrir <b style={{ color: U.text, whiteSpace: "nowrap" }}>{money(FIJOS)}</b> de fijos. Llevás <b style={{ color: AMBER, fontFamily: mono }}>{n}</b>.
        </div>
        <div style={{ position: "relative", marginTop: 18, height: 26, borderRadius: 13, background: U.card2, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${fill * 100}%`, borderRadius: 13, background: AMBER }} />
          {/* marcas de cada servicio que falta */}
          {Array.from({ length: SERV_FIJOS - 1 }).map((_, i) => (
            <i key={i} style={{ position: "absolute", top: 0, bottom: 0, left: `${((i + 1) / SERV_FIJOS) * 100}%`, width: 3, background: U.card }} />
          ))}
        </div>
      </div>
      {/* chispas cuando se cubren los fijos */}
      {f >= cubAt && f < cubAt + 30
        ? Array.from({ length: 16 }).map((_, i) => {
            const a = random(`sa${i}`) * Math.PI * 2;
            const d = (60 + random(`sd${i}`) * 140) * (1 - Math.exp(-(f - cubAt) / 6));
            return <div key={i} style={{ position: "absolute", left: 700 + Math.cos(a) * d, top: 222 + Math.sin(a) * d, width: 12, height: 12, borderRadius: i % 3 ? "50%" : 3, background: i % 2 ? AMBER : "#fff", opacity: 1 - (f - cubAt) / 30 }} />;
          })
        : null}
      {/* lo que te queda en el mes */}
      <div style={{ position: "absolute", left: 44, right: 44, top: 466, opacity: ramp(f, 160, 170), translate: `0px ${(1 - ramp(f, 160, 174)) * 30}px` }}>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 34, color: U.muted }}>Este mes te quedan</div>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 112, color: AMBER, lineHeight: 1.1, textShadow: "0 0 40px rgba(245,166,35,.3)" }}>{money(queda)}</div>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 28, color: U.text, marginTop: 6, opacity: ramp(f, 196, 206) }}>
          32 servicios · <span style={{ color: AMBER }}>{money(QUEDA / 32)}</span> limpios cada uno
        </div>
      </div>
      {/* aviso de vencimiento */}
      {f >= NOTI ? (
        <div
          style={{
            position: "absolute", left: 28, right: 28, top: 14, borderRadius: 32, background: "rgba(36,41,54,.97)", border: `3px solid ${U.line}`, padding: "22px 26px",
            display: "flex", gap: 20, alignItems: "center", boxShadow: "0 30px 70px rgba(0,0,0,.6)", translate: `0px ${(1 - notiIn) * -220}px`,
          }}
        >
          <span style={{ width: 78, height: 78, borderRadius: 20, background: AMBER, color: INK, display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 700, fontSize: 28, flexShrink: 0 }}>OS</span>
          <span style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: sans, fontWeight: 700, fontSize: 24, color: U.muted }}>
              <span>AuxiliOS</span>
              <span>ahora</span>
            </div>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 34, color: U.text, marginTop: 2 }}>Renová la VTV de la grúa</div>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 28, color: AMBER }}>Vence el 07/12 · en 7 días</div>
          </span>
        </div>
      ) : null}
    </div>
  );
};

// ── El día: un celular que no se va y la hora que avanza ─────────────
const B0 = 0, C0 = 200, D0 = 350, E0 = 515;
const DIA_DUR = 815;
const MOMENTOS: { from: number; hora: string; titulo: string }[] = [
  { from: B0, hora: "08:10", titulo: "Cargás el gasoil" },
  { from: C0, hora: "13:30", titulo: "Sumás los tickets" },
  { from: D0, hora: "18:20", titulo: "El seguro, por mes" },
  { from: E0, hora: "21:00", titulo: "Tus números, al día" },
  { from: E0 + NOTI, hora: "21:00", titulo: "Y te avisa a tiempo" },
];
const CRONO: { from: number; start: number; end: number }[] = [
  { from: B0, start: B0 + 22, end: B0 + GASOIL.saveAt },
  { from: C0, start: C0 + 26, end: C0 + COMIDA.saveAt },
  { from: D0, start: D0 + 14, end: D0 + SEGURO.saveAt },
];
const shots: Shot[] = [
  { from: B0, render: (f) => <NuevoGasto f={f} g={GASOIL} /> },
  { from: C0, render: (f) => <NuevoGasto f={f} g={COMIDA} /> },
  { from: D0, render: (f) => <NuevoGasto f={f} g={SEGURO} /> },
  { from: E0, render: (f) => <Numeros f={f} /> },
];
const GASTOS: [Gasto, number][] = [[GASOIL, B0], [COMIDA, C0], [SEGURO, D0]];

const Titulo: React.FC<{ f: number }> = ({ f }) => {
  const cur = MOMENTOS.reduce((k, m, i) => (f >= m.from ? i : k), 0);
  return (
    <div style={{ position: "absolute", top: SAFE.top + 56, left: SAFE.left, width: W, height: 100, overflow: "hidden", zIndex: 20 }}>
      {MOMENTOS.map((m, i) => {
        if (i < cur - 1 || i > cur) return null;
        const e = i === 0 ? ramp(f, 4, 16) : ramp(f, m.from, m.from + 12);
        const outE = i < cur ? ramp(f, MOMENTOS[cur].from, MOMENTOS[cur].from + 12) : 0;
        return (
          <div key={m.titulo} style={{ position: "absolute", inset: 0, fontFamily: display, fontSize: 96, lineHeight: 1.04, color: C.text, translate: `0px ${(1 - e) * 100 - outE * 100}px`, opacity: 1 - outE, textShadow: "0 4px 24px rgba(0,0,0,.6)" }}>
            {m.titulo}
          </div>
        );
      })}
    </div>
  );
};

const Dia: React.FC = () => {
  const f = useCurrentFrame();
  const cur = MOMENTOS.reduce((k, m, i) => (f >= m.from ? i : k), 0);
  const hora = MOMENTOS[cur].hora;
  const horaE = cur === 0 ? 1 : ramp(f, MOMENTOS[cur].from, MOMENTOS[cur].from + 10);
  const crono = CRONO.filter((c) => f >= c.from && f < c.from + 200).pop();
  const segs = crono ? Math.max(0, Math.min(f, crono.end) - crono.start) / 30 : 0;
  const cronoOn = crono && f < (CRONO[CRONO.indexOf(crono) + 1]?.from ?? E0) ? ramp(f, crono.start - 6, crono.start) : 0;
  const listo = crono ? f >= crono.end : false;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, rgba(245,166,35,0.12), transparent 60%), ${C.bg}`, overflow: "hidden" }}>
      <Stripe />
      <Phone time={hora}>
        <Shots shots={shots} />
        {GASTOS.flatMap(([g, from]) => taps(g).map((t, i) => <TapDot key={`${from}-${i}`} f={f} at={from + t.at} x={t.x} y={t.y} />))}
      </Phone>
      {/* dos tickets de la calle que entran al celular */}
      {[-1, 1].map((side, i) => {
        const k = ramp(f, C0 + 2 + i * 4, C0 + 22 + i * 4, Easing.in(Easing.cubic));
        if (f < C0 || k >= 1) return null;
        return (
          <div
            key={side}
            style={{
              position: "absolute", left: 540 - 90 + side * (420 - k * 420), top: 760 - k * 120, width: 180, height: 250, background: "#f4f1ea", borderRadius: 6, padding: 16,
              rotate: `${side * (18 - k * 18)}deg`, scale: 1 - k * 0.6, opacity: 1 - k * 0.6, boxShadow: "0 20px 40px rgba(0,0,0,.5)", zIndex: 30,
              clipPath: "polygon(0 0,100% 0,100% 94%,90% 100%,80% 94%,70% 100%,60% 94%,50% 100%,40% 94%,30% 100%,20% 94%,10% 100%,0 94%)",
            }}
          >
            {[0.9, 0.6, 0.8, 0.5, 0.7].map((w, j) => <div key={j} style={{ height: 8, width: `${w * 100}%`, background: "#b9b3a4", borderRadius: 4, marginBottom: 12 }} />)}
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, color: INK, marginTop: 10 }}>{i === 0 ? "$ 8.500" : "$ 4.200"}</div>
          </div>
        );
      })}
      {/* chip, hora y cronómetro */}
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, width: W, display: "flex", alignItems: "center", gap: 14, zIndex: 20, opacity: ramp(f, 0, 8) }}>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 2, padding: "8px 18px", borderRadius: 999, background: AMBER, color: INK }}>CON AUXILIOS</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: mono, fontWeight: 700, fontSize: 28, color: C.text, overflow: "hidden", height: 40 }}>
          <Ico n="clock" s={14} c={C.muted} />
          <span style={{ translate: `0px ${(1 - horaE) * 40}px`, opacity: horaE }}>{hora}</span>
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: mono, fontWeight: 700, fontSize: 26, padding: "8px 16px", borderRadius: 999, border: `3px solid ${listo ? AMBER : C.border}`,
            background: listo ? AMBER : "transparent", color: listo ? INK : C.text, opacity: cronoOn, scale: listo && crono ? 1 + (1 - pop(f, crono.end, crono.end + 10)) * 0.3 : 1,
          }}
        >
          ⏱ {segs.toFixed(1).replace(".", ",")} s
        </span>
      </div>
      <Titulo f={f} />
      {/* sonidos */}
      {GASTOS.flatMap(([g, from]) => taps(g).map((t, i) => <Audio key={`s${from}-${i}`} name="Toque" src={staticFile("sfx/mouse-click.wav")} from={from + t.at} volume={0.25} />))}
      {GASTOS.map(([g, from]) => (
        <Audio key={`ok${from}`} name="Guardado" src={staticFile("sfx/ding.wav")} from={from + g.saveAt + 2} volume={0.45} />
      ))}
      <Audio name="Foto" src={staticFile("sfx/shutter.wav")} from={B0 + GASOIL.ticketAt! + 1} volume={0.5} />
      <Audio name="Tickets" src={staticFile("sfx/whoosh.wav")} from={C0} volume={0.4} />
      <Audio name="Mes" src={staticFile("sfx/whoosh.wav")} from={E0 + SKIP} volume={0.45} />
      <Audio name="Cubierto" src={staticFile("sfx/whip.wav")} from={E0 + SKIP + 6} volume={0.55} />
      <Audio name="Aviso" src={staticFile("sfx/ding.wav")} from={E0 + NOTI} volume={0.5} />
    </AbsoluteFill>
  );
};

// ── Gancho: la guantera que larga tickets ───────────────────────────
const G_DUR = 120;
const OPEN = 20;
const PAPELES = Array.from({ length: 16 }).map((_, i) => ({
  vx: (random(`vx${i}`) - 0.5) * 26,
  vy: -14 - random(`vy${i}`) * 16,
  rot: (random(`r${i}`) - 0.5) * 30,
  at: OPEN + 2 + Math.floor(i / 2) * 2,
  amt: ["$ 95.000", "$ 4.200", "$ 12.700", "$ 3.200", "$ 120.000", "$ 8.500", "$ 18.000", "$ 2.600"][i % 8],
  w: 150 + random(`w${i}`) * 40,
}));
const Guantera: React.FC = () => {
  const f = useCurrentFrame();
  const open = ramp(f, OPEN, OPEN + 8, Easing.out(Easing.back(2)));
  const t = f - OPEN;
  const shake = t >= 0 && t < 10 ? Math.sin(t * 3) * 10 * (1 - t / 10) : 0;
  const q = ramp(f, 72, 84);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 70%, #1d212b, #07080b 70%)", overflow: "hidden", translate: `${shake}px 0px` }}>
      <Stripe />
      {/* tablero */}
      <div style={{ position: "absolute", left: -40, right: -40, top: 980, height: 1000, background: "linear-gradient(180deg, #252a35, #14171e)", borderRadius: "80px 80px 0 0", boxShadow: "0 -30px 80px rgba(0,0,0,.5)" }} />
      {/* hueco y tapa de la guantera */}
      <div style={{ position: "absolute", left: 240, top: 1040, width: 600, height: 260, borderRadius: 30, background: "#07080b", boxShadow: "inset 0 20px 40px rgba(0,0,0,.8)" }} />
      <div style={{ position: "absolute", inset: 0, perspective: 1400 }}>
        <div
          style={{
            position: "absolute", left: 240, top: 1040, width: 600, height: 260, borderRadius: 30, background: "linear-gradient(180deg, #333947, #232833)", border: "4px solid #3d4453",
            transformOrigin: "50% 100%", rotate: `x ${-open * 100}deg`,
          }}
        >
          <div style={{ position: "absolute", left: 250, top: 40, width: 100, height: 26, borderRadius: 13, background: "#14171e" }} />
        </div>
      </div>
      {/* tickets que salen volando */}
      {PAPELES.map((p, i) => {
        const k = f - p.at;
        if (k < 0) return null;
        const x = 540 + p.vx * k;
        const y = 1100 + p.vy * k + 0.55 * k * k;
        if (y > 2100) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: x - p.w / 2, top: y - 110, width: p.w, height: 220, background: "#f1ede3", borderRadius: 6, padding: 14,
              rotate: `${p.rot * k * 0.6}deg`, boxShadow: "0 16px 30px rgba(0,0,0,.45)",
              clipPath: "polygon(0 4%,8% 0,100% 2%,96% 50%,100% 96%,90% 100%,10% 97%,0 100%,3% 50%)",
              filter: `brightness(${0.85 + (i % 3) * 0.06})`,
            }}
          >
            {[0.9, 0.6, 0.8, 0.5].map((w, j) => <div key={j} style={{ height: 7, width: `${w * 100}%`, background: "#b9b3a4", borderRadius: 4, marginBottom: 10 }} />)}
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, color: "#2b2a26", marginTop: 8 }}>{p.amt}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, width: W, fontFamily: display, fontSize: 112, lineHeight: 0.92, color: C.text, opacity: ramp(f, 0, 10), translate: `0px ${(1 - ramp(f, 0, 14)) * 30}px` }}>
        Los tickets
        <br />
        en la guantera
        <br />
        <span style={{ color: AMBER }}>no te dicen nada.</span>
      </div>
      <div style={{ position: "absolute", top: SAFE.top + 330, left: SAFE.left, width: W, fontFamily: sans, fontWeight: 700, fontSize: 44, color: C.muted, opacity: q, translate: `0px ${(1 - q) * 20}px` }}>
        ¿Cuánto te queda de cada servicio?
      </div>
      <Audio name="Guantera" src={staticFile("sfx/mouse-click.wav")} from={OPEN} volume={0.6} />
      <Audio name="Papeles" src={staticFile("sfx/page-turn.wav")} from={OPEN + 2} volume={0.6} />
      <Audio name="Papeles 2" src={staticFile("sfx/page-turn.wav")} from={OPEN + 10} volume={0.4} />
    </AbsoluteFill>
  );
};

// ── Cierre ──────────────────────────────────────────────────────────
const E_DUR = 120;
const Cierre: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg, alignItems: "center" }}>
      <Stripe />
      <Stripe bottom />
      <div style={{ position: "absolute", top: SAFE.top + 40, opacity: ramp(f, 0, 10), scale: 0.85 + ramp(f, 0, 18) * 0.15 }}>
        <Logo size={0.9} />
      </div>
      <div style={{ position: "absolute", top: SAFE.top + 300, fontFamily: mono, fontWeight: 500, fontSize: 38, color: C.muted, opacity: ramp(f, 8, 16) }}>Para el gruero independiente.</div>
      <div style={{ position: "absolute", top: SAFE.top + 390, left: SAFE.left, width: W, textAlign: "center", fontFamily: display, fontSize: 120, lineHeight: 0.95, color: C.text, opacity: ramp(f, 18, 26), translate: `0px ${(1 - ramp(f, 18, 32)) * 40}px` }}>
        Sabé cuánto
        <br />
        te queda.
        <br />
        <span style={{ color: AMBER }}>Todos los días.</span>
      </div>
      <div style={{ position: "absolute", top: SAFE.top + 790, background: AMBER, color: INK, fontFamily: sans, fontWeight: 700, fontSize: 54, padding: "28px 60px", borderRadius: 999, opacity: ramp(f, 36, 42), scale: interpolate(f, [36, 48, 72, 80, 88], [0.6, 1, 1, 1.06, 1], clamp) }}>
        Tocá «Más información» ↓
      </div>
    </AbsoluteFill>
  );
};

const T = 15;
export const UN_DIA_DUR = G_DUR + DIA_DUR + E_DUR - 2 * T;

// Reel de solución de gastos: «Un día, todos tus gastos»
export const UnDia: React.FC<{ guia?: boolean }> = ({ guia = false }) => (
  <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence name="Guantera" durationInFrames={G_DUR}>
        <Guantera />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="Un día" durationInFrames={DIA_DUR}>
        <Dia />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="Cierre" durationInFrames={E_DUR}>
        <Cierre />
      </TransitionSeries.Sequence>
    </TransitionSeries>
    {guia ? <ReelsGuide /> : null}
  </AbsoluteFill>
);
