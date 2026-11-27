import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import React from "react";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, clamp, display, mono, sans } from "../theme";
import { Logo } from "../scenes/Logo";
import { ReelsGuide } from "../monogrua/StepFrame";
import { Ico, money, Phone, pop, ramp, Shot, Shots, U } from "../monogrua/v2/ui";
import { SAFE, Stripe } from "./common";
import { golpe, Sin, Titulo } from "./Problema";
import { TapDot } from "./UnDia";

// Creativo de gastos 3: «La factura que se achica». Le facturás a la prestadora y, antes de que la cobres,
// los gastos le cortan pedazos, la espera la achica y lo que no te pagan ni lo ves.
// Mismos datos de ejemplo de noviembre que los otros dos reels de gastos.
const W = SAFE.right - SAFE.left;
const AMBER = "#f5a623";
const INK = "#14161b";
const PAPEL = "#f2eee4";

const FACT = 3600000;
const CORTES: [string, string, number][] = [
  ["⛽", "Gasoil", 712000],
  ["🔧", "Taller y repuestos", 180000],
  ["🛞", "Cubiertas", 120000],
  ["🍔", "Comida en la calle", 92000],
  ["🛣️", "Peajes", 64000],
  ["🛡️", "Seguro de la grúa", 320000],
  ["🧾", "Monotributo", 180000],
  ["🚗", "Patente", 70000],
  ["📡", "GPS y celular", 35000],
  ["🔍", "VTV", 17000],
];
const QUEDA = FACT - CORTES.reduce((s, c) => s + c[2], 0); // 1.810.000
// Cobrar a 60 días con 2 % de inflación por mes: la factura vale 3.600.000 / 1,02² cuando entra
const PIERDE = Math.round((FACT - FACT / 1.02 ** 2) / 10000) * 10000; // 140.000

// La factura en papel: su alto representa la plata que queda
const PX = 240, PW = 600, PH0 = 720;
const Hoja: React.FC<{ top: number; valor: number; label: string; tint?: number; children?: React.ReactNode }> = ({ top, valor, label, tint = 0, children }) => {
  const h = (PH0 * valor) / FACT;
  return (
    <div
      style={{
        position: "absolute", left: PX, top, width: PW, height: h, background: PAPEL, borderRadius: "8px 8px 0 0", overflow: "hidden", boxShadow: "0 40px 90px rgba(0,0,0,.55)",
        filter: `saturate(${1 - tint * 0.6}) brightness(${1 - tint * 0.18})`,
      }}
    >
      <div style={{ padding: "26px 34px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontWeight: 700, fontSize: 30, color: INK, letterSpacing: 3 }}>
          <span>FACTURA C</span>
          <span style={{ fontSize: 22, letterSpacing: 1, color: "#6b675c" }}>N.º 0001-00000127</span>
        </div>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 32, color: INK, marginTop: 14 }}>Asistencia del Sur</div>
        <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 26, color: "#6b675c" }}>Noviembre 2026 · 32 servicios de auxilio</div>
        <div style={{ borderTop: "3px dashed #c9c2b0", margin: "18px 0 12px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 28, color: "#6b675c", letterSpacing: 2 }}>{label}</span>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 54, color: INK }}>{money(valor)}</span>
        </div>
      </div>
      {/* renglones de detalle: se ven mientras la hoja es alta */}
      <div style={{ position: "absolute", left: 34, right: 34, top: 300, bottom: 0, background: "repeating-linear-gradient(180deg, transparent 0 30px, #ddd6c6 30px 34px)", opacity: 0.8 }} />
      {children}
    </div>
  );
};

// ── A · La factura sale de la impresora ─────────────────────────────
const A_DUR = 120;
const Imprime: React.FC = () => {
  const f = useCurrentFrame();
  const sale = ramp(f, 10, 56, Easing.out(Easing.quad));
  const total = interpolate(f, [30, 60], [0, FACT], { ...clamp, easing: Easing.out(Easing.cubic) });
  const t2 = ramp(f, 82, 94);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 30%, #1d2230, ${C.bg} 70%)`, overflow: "hidden" }}>
      <Stripe />
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, width: W, fontFamily: display, fontSize: 112, lineHeight: 0.92, color: C.text, opacity: ramp(f, 0, 10) }}>
        Le facturaste
        <br />
        <span style={{ color: AMBER }}>{money(total)}.</span>
      </div>
      {/* ranura de la impresora */}
      <div style={{ position: "absolute", left: PX - 40, top: 610, width: PW + 80, height: 40, borderRadius: 20, background: "#05060a", boxShadow: "0 0 0 6px #2c3242", zIndex: 2 }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 630, height: 1400, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -PH0 + sale * PH0, left: 0, right: 0, height: PH0 }}>
          <Hoja top={0} valor={FACT} label="TOTAL" />
        </div>
      </div>
      <div style={{ position: "absolute", top: SAFE.top + 220, left: SAFE.left, width: W, fontFamily: sans, fontWeight: 700, fontSize: 46, color: C.muted, opacity: t2, translate: `0px ${(1 - t2) * 20}px` }}>
        Ahora mirá cómo se achica.
      </div>
      <Audio name="Impresora" src={staticFile("sfx/page-turn.wav")} from={10} volume={0.5} />
    </AbsoluteFill>
  );
};

// ── B · Cada gasto le corta un pedazo ───────────────────────────────
const B_DUR = 330;
const CUT0 = 30, CUT_EVERY = 23, B_TOP = 470;
const cutAt = (i: number) => CUT0 + i * CUT_EVERY;
const restoTras = (n: number) => FACT - CORTES.slice(0, n).reduce((s, c) => s + c[2], 0);
const Cortes: React.FC = () => {
  const f = useCurrentFrame();
  // la hoja baja de alto cuando pasa la tijera
  const valor = CORTES.reduce((v, c, i) => v - c[2] * ramp(f, cutAt(i) + 8, cutAt(i) + 14), FACT);
  const fin = ramp(f, cutAt(CORTES.length - 1) + 30, cutAt(CORTES.length - 1) + 42);
  return (
    <AbsoluteFill style={{ background: "repeating-linear-gradient(0deg, #1b1c1f 0 6px, #1d1e21 6px 12px)", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 26, background: "repeating-linear-gradient(-45deg, #5d6169 0 26px, #111 26px 52px)" }} />
      <Titulo f={f} top={SAFE.top}>Mirá cómo se achica.</Titulo>
      <Hoja top={B_TOP} valor={valor} label={f >= cutAt(0) + 8 ? "TE QUEDA" : "TOTAL"} />
      {CORTES.map(([e, l, v], i) => {
        const at = cutAt(i);
        if (f < at) return null;
        const y0 = B_TOP + (PH0 * restoTras(i + 1)) / FACT;
        const h = Math.max(8, (PH0 * v) / FACT);
        const k = f - (at + 8);
        const side = i % 2 ? 1 : -1;
        const tijera = ramp(f, at, at + 8, Easing.inOut(Easing.quad));
        return (
          <React.Fragment key={l}>
            {/* la tira que se va */}
            {k >= 0 && k < 46 ? (
              <div
                style={{
                  position: "absolute", left: PX, top: y0 + 0.5 * k * k + k * 2, width: PW, height: h, background: PAPEL, opacity: 1 - k / 46,
                  rotate: `${side * k * 0.5}deg`, translate: `${side * k * 3}px 0px`, backgroundImage: "repeating-linear-gradient(180deg, transparent 0 30px, #ddd6c6 30px 34px)",
                  boxShadow: "0 20px 40px rgba(0,0,0,.4)",
                }}
              />
            ) : null}
            {/* línea de corte con la tijera */}
            {f < at + 10 ? (
              <>
                <div style={{ position: "absolute", left: PX - 20, top: y0 - 2, width: (PW + 40) * tijera, height: 4, backgroundImage: `repeating-linear-gradient(90deg, ${AMBER} 0 14px, transparent 14px 24px)` }} />
                <div style={{ position: "absolute", left: PX - 50 + (PW + 60) * tijera, top: y0 - 32, fontSize: 56, rotate: "-90deg" }}>✂️</div>
              </>
            ) : null}
            {/* qué gasto fue */}
            {k > -8 && k < 40 ? (
              <div
                style={{
                  position: "absolute", left: side < 0 ? SAFE.left : undefined, right: side > 0 ? 1080 - SAFE.right : undefined, top: y0 + 10 + Math.max(0, k) * 4,
                  background: "rgba(20,22,27,.95)", border: `3px solid ${AMBER}`, borderRadius: 20, padding: "10px 18px", display: "flex", gap: 12, alignItems: "center",
                  fontFamily: sans, fontWeight: 700, fontSize: 30, color: C.text, opacity: pop(f, at + 2, at + 10) * (1 - ramp(f, at + 36, at + 48)), zIndex: 5,
                }}
              >
                <span>{e} {l}</span>
                <span style={{ fontFamily: mono, color: AMBER }}>− {money(v)}</span>
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
      <div style={{ position: "absolute", top: 900, left: SAFE.left, width: W, fontFamily: display, fontSize: 96, lineHeight: 0.98, color: "#e4e6ea", opacity: fin, translate: `0px ${(1 - fin) * 30}px` }}>
        De cada $ 100
        <br />
        que facturás,
        <br />
        <span style={{ color: AMBER }}>te quedan $ 50.</span>
      </div>
      {CORTES.map((c, i) => (
        <Audio key={c[1]} name="Corte" src={staticFile("sfx/whip.wav")} from={cutAt(i) + 6} volume={0.28 + (i % 3) * 0.06} />
      ))}
    </AbsoluteFill>
  );
};

// ── C · Y encima te la pagan a 60 días ──────────────────────────────
const C_DUR = 210;
const C_TOP = 560;
const Plazo: React.FC = () => {
  const f = useCurrentFrame();
  const espera = ramp(f, 30, 150, Easing.inOut(Easing.quad));
  const dia = Math.round(espera * 60);
  const valor = QUEDA - PIERDE * espera;
  const cuenta = ramp(f, 150, 162);
  return (
    <Sin>
      <Titulo f={f} size={96}>
        Y encima te la pagan
        <br />
        <span style={{ color: AMBER }}>a 60 días.</span>
      </Titulo>
      <Hoja top={C_TOP} valor={valor} label="TE QUEDA" tint={espera} />
      {/* contador de días esperando */}
      <div style={{ position: "absolute", top: C_TOP + (PH0 * QUEDA) / FACT + 40, left: SAFE.left, width: W, display: "flex", justifyContent: "center", opacity: ramp(f, 20, 30) }}>
        <span style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 30px", borderRadius: 999, border: "3px solid #3a3d45", background: "rgba(20,22,27,.9)", fontFamily: mono, fontWeight: 700, fontSize: 44, color: "#e4e6ea" }}>
          <Ico n="clock" s={20} c="#8d929c" />
          Día <span style={{ color: AMBER, minWidth: 60, textAlign: "right" }}>{dia}</span> esperando
        </span>
      </div>
      <div style={{ position: "absolute", top: 1080, left: SAFE.left, width: W, textAlign: "center", opacity: cuenta, translate: `0px ${(1 - cuenta) * 20}px` }}>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 34, color: "#b9bdc6" }}>Con 2 % de inflación por mes, esperando perdés</div>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 64, color: AMBER }}>− {money(PIERDE)}</div>
      </div>
      <Audio name="Reloj" src={staticFile("sfx/mouse-click.wav")} from={30} volume={0.3} />
      <Audio name="Pérdida" src={staticFile("sfx/whip.wav")} from={150} volume={0.5} />
    </Sin>
  );
};

// ── D · Y si se atrasan, ni te enterás ──────────────────────────────
const D_DUR = 150;
const SELLO = 46;
const Atraso: React.FC = () => {
  const f = useCurrentFrame();
  const sello = interpolate(f, [SELLO, SELLO + 6], [2.4, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const deuda = ramp(f, 80, 92);
  return (
    <Sin shake={golpe(f, SELLO + 6, 18)}>
      <Titulo f={f} size={96}>
        Y si se atrasan,
        <br />
        <span style={{ color: AMBER }}>ni te enterás.</span>
      </Titulo>
      {/* remitos de octubre olvidados */}
      {[2, 1, 0].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute", left: 540 - 250 + i * 18, top: 560 + i * 14, width: 500, height: 420, background: i ? "#e2ddd0" : PAPEL, borderRadius: 10, rotate: `${-4 + i * 4}deg`,
            boxShadow: "0 30px 70px rgba(0,0,0,.5)", padding: "28px 32px", opacity: ramp(f, 4 + i * 3, 14 + i * 3),
          }}
        >
          {i === 0 ? (
            <>
              <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 28, letterSpacing: 3, color: INK }}>REMITOS · OCTUBRE</div>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, color: INK, marginTop: 12 }}>Asistencia del Sur</div>
              <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 26, color: "#6b675c" }}>4 remitos firmados</div>
              <div style={{ marginTop: 24, height: 120, background: "repeating-linear-gradient(180deg, transparent 0 28px, #ddd6c6 28px 32px)" }} />
              <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 52, color: INK, textAlign: "right", marginTop: 16 }}>{money(220500)}</div>
            </>
          ) : null}
        </div>
      ))}
      {f >= SELLO ? (
        <div style={{ position: "absolute", left: 540 - 230, top: 690, width: 460, textAlign: "center", fontFamily: display, fontSize: 112, color: AMBER, border: `8px solid ${AMBER}`, borderRadius: 22, rotate: "-12deg", scale: sello, opacity: ramp(f, SELLO, SELLO + 4), background: "rgba(20,22,27,.6)" }}>
          SIN COBRAR
        </div>
      ) : null}
      <div style={{ position: "absolute", top: 1050, left: SAFE.left, width: W, textAlign: "center", opacity: deuda, translate: `0px ${(1 - deuda) * 20}px` }}>
        <div style={{ fontFamily: display, fontSize: 80, color: "#e4e6ea" }}>Venció hace 12 días.</div>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 34, color: "#b9bdc6" }}>Plata que ya laburaste y no entró.</div>
      </div>
      <Audio name="Sello" src={staticFile("sfx/whip.wav")} from={SELLO + 4} volume={0.8} />
    </Sin>
  );
};

// ── E · Con AuxiliOS: te avisa, lo cobrás y ves en qué se te va ──────
const AVISOS: [string, string, string, string][] = [
  ["bad", "Asistencia del Sur te debe $ 220.500", "Venció el 22/11 · hace 12 días", "Vencido"],
  ["info", "Facturale a Auxilio Vial Norte $ 180.000", "Remitos de octubre sin facturar", "Facturar"],
  ["wait", "Renová la VTV de la grúa", "Vence el 07/12 · en 3 días", "Vence"],
];
const TAP_AVISO = 74;
const Avisos: React.FC<{ f: number }> = ({ f }) => (
  <div style={{ position: "absolute", inset: 0 }}>
    <div style={{ position: "absolute", left: 44, top: 26 }}>
      <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: AMBER }}>
        AUXILI<span style={{ color: U.text }}>OS</span>
      </div>
      <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 54, color: U.text, marginTop: 6 }}>Inicio</div>
      <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 30, color: U.muted }}>Para hacer hoy</div>
    </div>
    {AVISOS.map(([k, t, s, pill], i) => {
      const e = ramp(f, 10 + i * 8, 22 + i * 8);
      const hot = i === 0;
      const tap = hot ? interpolate(f, [TAP_AVISO - 4, TAP_AVISO, TAP_AVISO + 6], [1, 0.96, 1], clamp) : 1;
      return (
        <div
          key={t}
          style={{
            position: "absolute", left: 44, right: 44, top: 200 + i * 160, height: 140, borderRadius: 28, background: hot ? "linear-gradient(160deg, rgba(245,166,35,.16), #171b24)" : U.card,
            border: `3px solid ${hot ? AMBER : U.line}`, padding: "18px 26px", opacity: e, translate: `${(1 - e) * 60}px 0px`, scale: tap,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, color: U.text, lineHeight: 1.15 }}>{t}</span>
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 22, padding: "6px 14px", borderRadius: 999, whiteSpace: "nowrap", background: k === "bad" ? AMBER : "transparent", border: `3px solid ${k === "bad" ? AMBER : U.line}`, color: k === "bad" ? INK : U.muted }}>{pill}</span>
          </div>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 26, color: hot ? AMBER : U.muted, marginTop: 8 }}>{s}</div>
        </div>
      );
    })}
  </div>
);

const TAP_COBRADO = 44, TAP_CONFIRMA = 78;
const Cobro: React.FC<{ f: number }> = ({ f }) => {
  const cobrado = f >= TAP_CONFIRMA + 2;
  const confirmar = f >= TAP_COBRADO + 2 && !cobrado;
  const flip = ramp(f, TAP_CONFIRMA + 2, TAP_CONFIRMA + 12);
  const press = (at: number) => interpolate(f, [at - 4, at, at + 6], [1, 0.95, 1], clamp);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", left: 44, top: 26, display: "flex", alignItems: "center", gap: 16, color: U.text }}>
        <Ico n="left" s={18} w={2.6} />
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 48 }}>Cobros</span>
      </div>
      <div
        style={{
          position: "absolute", left: 44, right: 44, top: 130, height: 330, borderRadius: 34, padding: 32, background: cobrado ? "linear-gradient(160deg, rgba(245,166,35,.2), #171b24)" : U.card,
          border: `3px solid ${cobrado ? AMBER : U.line}`, boxShadow: cobrado ? `0 0 ${60 * flip}px rgba(245,166,35,.35)` : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ width: 80, height: 80, borderRadius: "50%", background: AMBER, color: INK, display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 700, fontSize: 30 }}>AS</span>
          <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 40, color: U.text }}>Asistencia del Sur</span>
        </div>
        <div style={{ marginTop: 22, fontFamily: sans, fontSize: 30, color: U.muted }}>{cobrado ? "Cobrado" : "Por cobrar"} · 4 remitos de octubre</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: mono, fontWeight: 700, fontSize: 96, color: AMBER, lineHeight: 1.1, scale: cobrado ? 1 + (1 - flip) * 0.08 : 1, transformOrigin: "0 50%" }}>
          {cobrado ? <Ico n="check" s={28} w={3} /> : null}
          {money(220500)}
        </div>
        <span style={{ display: "inline-block", marginTop: 10, fontFamily: sans, fontWeight: 700, fontSize: 28, padding: "6px 16px", borderRadius: 999, background: cobrado ? AMBER : "transparent", border: `3px solid ${AMBER}`, color: cobrado ? INK : AMBER }}>
          {cobrado ? "Cobrado el 04/12" : "Venció el 22/11 · hace 12 días"}
        </span>
      </div>
      <div
        style={{
          position: "absolute", left: 44, right: 44, top: 490, height: 112, borderRadius: 28, display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
          fontFamily: sans, fontWeight: 700, fontSize: confirmar ? 36 : 42, background: cobrado ? U.card2 : AMBER, color: cobrado ? AMBER : INK,
          scale: confirmar ? press(TAP_CONFIRMA) : press(TAP_COBRADO), boxShadow: cobrado ? "none" : "0 16px 40px rgba(245,166,35,.35)",
        }}
      >
        {cobrado ? <><Ico n="check" s={16} w={3} /> Cobrado</> : confirmar ? `Confirmar 4 remitos · ${money(220500)}` : <><Ico n="cash" s={18} /> Marcar cobrado</>}
      </div>
    </div>
  );
};

const EN_QUE: [string, string, number][] = [
  ["⛽", "Combustible", 712000],
  ["🛡️", "Seguro", 320000],
  ["🔧", "Taller", 180000],
  ["🧾", "Monotributo", 180000],
];
const GASTO_MES = 1790000;
export const Gastos: React.FC<{ f: number }> = ({ f }) => {
  const total = interpolate(f, [8, 40], [0, GASTO_MES], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", left: 44, top: 26, fontFamily: sans, fontWeight: 700, fontSize: 48, color: U.text }}>Gastos</div>
      <div style={{ position: "absolute", left: 44, top: 100, fontFamily: sans, fontWeight: 500, fontSize: 30, color: U.muted }}>Gastaste en noviembre</div>
      <div style={{ position: "absolute", left: 44, top: 140, fontFamily: mono, fontWeight: 700, fontSize: 96, color: U.text, lineHeight: 1 }}>{money(total)}</div>
      <div style={{ position: "absolute", left: 44, right: 44, top: 262, height: 64, borderRadius: 18, background: U.card, border: `3px solid ${U.line}`, display: "flex" }}>
        {["En qué", "Movimientos", "Fijos"].map((l, i) => (
          <span key={l} style={{ flex: 1, display: "grid", placeItems: "center", margin: 4, borderRadius: 14, background: i === 0 ? AMBER : "transparent", fontFamily: sans, fontWeight: 700, fontSize: 26, color: i === 0 ? INK : U.muted }}>{l}</span>
        ))}
      </div>
      {EN_QUE.map(([e, l, v], i) => {
        const k = ramp(f, 30 + i * 7, 42 + i * 7);
        return (
          <div key={l} style={{ position: "absolute", left: 44, right: 44, top: 350 + i * 90, height: 76, borderRadius: 22, background: U.card, border: `3px solid ${i === 0 ? AMBER : U.line}`, display: "flex", alignItems: "center", gap: 18, padding: "0 22px", opacity: k, translate: `${(1 - k) * 50}px 0px` }}>
            <span style={{ fontSize: 34 }}>{e}</span>
            <span style={{ flex: 1, fontFamily: sans, fontWeight: 700, fontSize: 32, color: U.text }}>{l}</span>
            <span style={{ fontFamily: mono, fontWeight: 500, fontSize: 26, color: U.muted }}>{Math.round((v / GASTO_MES) * 100)} %</span>
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 32, color: i === 0 ? AMBER : U.text, minWidth: 200, textAlign: "right" }}>{money(v)}</span>
          </div>
        );
      })}
    </div>
  );
};

const E_AVISOS = 0, E_COBRO = 100, E_GASTOS = 215;
const E_DUR = 330;
const E_TITULOS: [number, string][] = [
  [E_AVISOS, "Te avisa quién te debe"],
  [E_COBRO, "Lo cobrás y lo marcás"],
  [E_GASTOS, "Y ves en qué se te va"],
];
const shots: Shot[] = [
  { from: E_AVISOS, render: (f) => <Avisos f={f} /> },
  { from: E_COBRO, render: (f) => <Cobro f={f} /> },
  { from: E_GASTOS, render: (f) => <Gastos f={f} /> },
];
const ConAuxilios: React.FC = () => {
  const f = useCurrentFrame();
  const cur = E_TITULOS.reduce((k, t, i) => (f >= t[0] ? i : k), 0);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, rgba(245,166,35,0.12), transparent 60%), ${C.bg}`, overflow: "hidden" }}>
      <Stripe />
      <Phone time="09:40">
        <Shots shots={shots} />
        <TapDot f={f} at={E_AVISOS + TAP_AVISO} x={430} y={270} />
        <TapDot f={f} at={E_COBRO + TAP_COBRADO} x={430} y={546} />
        <TapDot f={f} at={E_COBRO + TAP_CONFIRMA} x={430} y={546} />
      </Phone>
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, zIndex: 20, opacity: ramp(f, 0, 8) }}>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 2, padding: "8px 18px", borderRadius: 999, background: AMBER, color: INK }}>CON AUXILIOS</span>
      </div>
      <div style={{ position: "absolute", top: SAFE.top + 56, left: SAFE.left, width: W, height: 100, overflow: "hidden", zIndex: 20 }}>
        {E_TITULOS.map(([from, t], i) => {
          if (i < cur - 1 || i > cur) return null;
          const e = i === 0 ? ramp(f, 4, 16) : ramp(f, from, from + 12);
          const out = i < cur ? ramp(f, E_TITULOS[cur][0], E_TITULOS[cur][0] + 12) : 0;
          return (
            <div key={t} style={{ position: "absolute", inset: 0, fontFamily: display, fontSize: 96, lineHeight: 1.04, color: C.text, translate: `0px ${(1 - e) * 100 - out * 100}px`, opacity: 1 - out }}>
              {t}
            </div>
          );
        })}
      </div>
      {[E_AVISOS + TAP_AVISO, E_COBRO + TAP_COBRADO, E_COBRO + TAP_CONFIRMA].map((t) => (
        <Audio key={t} name="Toque" src={staticFile("sfx/mouse-click.wav")} from={t} volume={0.4} />
      ))}
      <Audio name="Cobrado" src={staticFile("sfx/ding.wav")} from={E_COBRO + TAP_CONFIRMA + 3} volume={0.5} />
      <Audio name="Gastos" src={staticFile("sfx/whoosh.wav")} from={E_GASTOS} volume={0.4} />
    </AbsoluteFill>
  );
};

// ── F · Cierre ──────────────────────────────────────────────────────
const F_DUR = 120;
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
      <div style={{ position: "absolute", top: SAFE.top + 390, left: SAFE.left, width: W, textAlign: "center", fontFamily: display, fontSize: 112, lineHeight: 0.95, color: C.text, opacity: ramp(f, 18, 26), translate: `0px ${(1 - ramp(f, 18, 32)) * 40}px` }}>
        Que tu factura
        <br />
        no se achique
        <br />
        <span style={{ color: AMBER }}>sin que te enteres.</span>
      </div>
      <div style={{ position: "absolute", top: SAFE.top + 790, background: AMBER, color: INK, fontFamily: sans, fontWeight: 700, fontSize: 54, padding: "28px 60px", borderRadius: 999, opacity: ramp(f, 36, 42), scale: interpolate(f, [36, 48, 72, 80, 88], [0.6, 1, 1, 1.06, 1], clamp) }}>
        Tocá «Más información» ↓
      </div>
    </AbsoluteFill>
  );
};

const T = 15;
export const FACTURA_DUR = A_DUR + B_DUR + C_DUR + D_DUR + E_DUR + F_DUR - 5 * T;

export const FacturaAchica: React.FC<{ guia?: boolean }> = ({ guia = false }) => (
  <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence name="Le facturaste" durationInFrames={A_DUR}>
        <Imprime />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="Los cortes" durationInFrames={B_DUR}>
        <Cortes />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="A 60 días" durationInFrames={C_DUR}>
        <Plazo />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="Sin cobrar" durationInFrames={D_DUR}>
        <Atraso />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="Con AuxiliOS" durationInFrames={E_DUR}>
        <ConAuxilios />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="Cierre" durationInFrames={F_DUR}>
        <Cierre />
      </TransitionSeries.Sequence>
    </TransitionSeries>
    {guia ? <ReelsGuide /> : null}
  </AbsoluteFill>
);
