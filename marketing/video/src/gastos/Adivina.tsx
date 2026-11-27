import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import React from "react";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, clamp, display, mono, sans } from "../theme";
import { Logo } from "../scenes/Logo";
import { ReelsGuide } from "../monogrua/StepFrame";
import { money, Phone, pop, ramp, Shot, Shots, U } from "../monogrua/v2/ui";
import { SAFE, Stripe } from "./common";
import { golpe, Sin, Titulo } from "./Problema";
import { Gastos } from "./Factura";

// Creativo de gastos 4: «¿En qué se te va la plata?», en formato de adivinanza con cuenta regresiva.
// Mismos datos de noviembre que los otros reels de gastos: $ 3.600.000 facturados, $ 1.790.000 de gastos, 1.216 km.
const W = SAFE.right - SAFE.left;
const AMBER = "#f5a623";
const INK = "#14161b";

const FACT = 3600000;
const GASTOS = 1790000;
const KM = 1216;
const POR_KM_FACT = Math.floor(FACT / KM); // 2.960 (redondeado para que 2.960 − 1.472 = 1.488)
const POR_KM_COSTO = Math.round(GASTOS / KM); // 1.472
const POR_KM_DEJA = Math.round((FACT - GASTOS) / KM); // 1.488
// Por km, redondeado para que la suma dé 1.472: gasoil 712.000, desgaste 300.000, comida y peajes 156.000, fijos 622.000
const COSTO_KM: [string, string, number][] = [
  ["⛽", "Gasoil", 585],
  ["🛞", "Cubiertas, taller y repuestos", 247],
  ["🍔", "Comida y peajes", 128],
  ["🛡️", "Fijos: seguro, monotributo, patente…", 512],
];

// ── Pregunta con cuatro opciones, cuenta regresiva y respuesta ───────
type Opcion = { l: string; e?: string; v?: string };
const OPT_TOP = 560, OPT_H = 170, OPT_G = 20, OPT_W = (W - OPT_G) / 2;
const COUNT0 = 34, COUNT1 = COUNT0 + 90, REVEAL = COUNT1 + 2;
const Opciones: React.FC<{ f: number; ops: Opcion[]; ok: number; fuera?: number }> = ({ f, ops, ok, fuera = 0 }) => {
  const rev = f >= REVEAL;
  return (
    <>
      {ops.map((o, i) => {
        const e = pop(f, 12 + i * 4, 24 + i * 4);
        const x = SAFE.left + (i % 2) * (OPT_W + OPT_G);
        const y = OPT_TOP + Math.floor(i / 2) * (OPT_H + OPT_G);
        const bien = rev && i === ok;
        const mal = rev && i !== ok;
        const shake = mal ? golpe(f, REVEAL, 8) : 0;
        const sale = ramp(f, fuera, fuera + 12);
        return (
          <div
            key={o.l}
            style={{
              position: "absolute", left: x, top: y, width: OPT_W, height: OPT_H, borderRadius: 30, padding: "18px 24px", boxSizing: "border-box",
              background: bien ? AMBER : "rgba(28,30,36,.96)", border: `4px solid ${bien ? AMBER : "#3a3d45"}`, color: bien ? INK : "#e4e6ea",
              opacity: e * (mal ? 0.35 : 1) * (fuera ? 1 - sale : 1), scale: bien ? 1 + (1 - pop(f, REVEAL, REVEAL + 12)) * 0.15 : 0.9 + e * 0.1,
              translate: `${shake}px ${fuera ? sale * 40 : 0}px`, display: "flex", flexDirection: "column", justifyContent: "space-between",
              boxShadow: bien ? "0 0 60px rgba(245,166,35,.45)" : "0 20px 40px rgba(0,0,0,.35)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ width: 52, height: 52, borderRadius: 14, display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 700, fontSize: 30, background: bien ? INK : "#3a3d45", color: bien ? AMBER : "#e4e6ea" }}>
                {"ABCD"[i]}
              </span>
              {o.e ? <span style={{ fontSize: 44 }}>{o.e}</span> : null}
            </div>
            <div style={{ fontFamily: o.e ? sans : mono, fontWeight: 700, fontSize: o.e ? 34 : 56, lineHeight: 1.1 }}>{o.l}</div>
            {rev && o.v ? <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 28, opacity: ramp(f, REVEAL + 6 + i * 4, REVEAL + 14 + i * 4) }}>{o.v}</div> : null}
          </div>
        );
      })}
    </>
  );
};

// Barra que se vacía y el número 3, 2, 1
const Cuenta: React.FC<{ f: number }> = ({ f }) => {
  if (f < COUNT0 - 6 || f > REVEAL + 8) return null;
  const k = interpolate(f, [COUNT0, COUNT1], [1, 0], clamp);
  const n = Math.max(1, Math.ceil(k * 3));
  const beat = (f - COUNT0) % 30;
  const top = OPT_TOP + 2 * OPT_H + OPT_G + 40;
  return (
    <div style={{ position: "absolute", top, left: SAFE.left, width: W, opacity: ramp(f, COUNT0 - 6, COUNT0) * (1 - ramp(f, REVEAL, REVEAL + 8)) }}>
      <div style={{ height: 16, borderRadius: 8, background: "#2c2f36", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${k * 100}%`, background: AMBER, borderRadius: 8 }} />
      </div>
      <div style={{ textAlign: "center", fontFamily: display, fontSize: 150, color: AMBER, lineHeight: 1.1, scale: f >= COUNT0 ? 1 + Math.max(0, 1 - beat / 8) * 0.25 : 1 }}>{n}</div>
    </div>
  );
};
const Tic: React.FC = () => (
  <>
    {[0, 30, 60].map((t) => (
      <Audio key={t} name="Tic" src={staticFile("sfx/mouse-click.wav")} from={COUNT0 + t} volume={0.45} />
    ))}
    <Audio name="Respuesta" src={staticFile("sfx/ding.wav")} from={REVEAL} volume={0.55} />
  </>
);

// ── A · Adiviná ─────────────────────────────────────────────────────
const A_DUR = 90;
const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const s = interpolate(f, [4, 12], [1.8, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  return (
    <Sin shake={golpe(f, 12, 16)}>
      <div style={{ position: "absolute", top: 560, left: SAFE.left, width: W, textAlign: "center", fontFamily: display, fontSize: 220, lineHeight: 0.9, color: AMBER, scale: s, opacity: ramp(f, 4, 10) }}>
        Adiviná.
      </div>
      <div style={{ position: "absolute", top: 820, left: SAFE.left, width: W, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 46, color: "#e4e6ea", opacity: ramp(f, 30, 40) }}>
        Dos preguntas sobre tu plata.
        <br />
        <span style={{ color: "#8d929c" }}>Tenés 3 segundos cada una.</span>
      </div>
      <Audio name="Golpe" src={staticFile("sfx/whip.wav")} from={10} volume={0.7} />
    </Sin>
  );
};

// ── B · ¿En qué se te va más plata? ─────────────────────────────────
const B_DUR = 220;
const P1: Opcion[] = [
  { e: "⛽", l: "Gasoil", v: money(712000) },
  { e: "🛡️", l: "Seguro de la grúa", v: money(320000) },
  { e: "🔧", l: "Taller y repuestos", v: money(180000) },
  { e: "🍔", l: "Comida en la calle", v: money(92000) },
];
const Pregunta1: React.FC = () => {
  const f = useCurrentFrame();
  const r = ramp(f, REVEAL + 30, REVEAL + 42);
  return (
    <Sin>
      <Titulo f={f} size={96}>
        ¿En qué se te va
        <br />
        <span style={{ color: AMBER }}>más plata por mes?</span>
      </Titulo>
      <Opciones f={f} ops={P1} ok={0} />
      <Cuenta f={f} />
      <div style={{ position: "absolute", top: 1000, left: SAFE.left, width: W, textAlign: "center", opacity: r, translate: `0px ${(1 - r) * 20}px` }}>
        <div style={{ fontFamily: display, fontSize: 92, color: "#e4e6ea", lineHeight: 1 }}>
          El gasoil: <span style={{ color: AMBER }}>40 %</span>
        </div>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 34, color: "#8d929c" }}>de todo lo que gastás en el mes</div>
      </div>
      <Tic />
    </Sin>
  );
};

// ── C · ¿Cuánto te cuesta cada km? ──────────────────────────────────
const C_DUR = 340;
const P2: Opcion[] = [{ l: "$ 300" }, { l: "$ 600" }, { l: "$ 900" }, { l: "$ 1.500" }];
const ROWS0 = REVEAL + 40;
const Pregunta2: React.FC = () => {
  const f = useCurrentFrame();
  const total = pop(f, ROWS0 + COSTO_KM.length * 14 + 10, ROWS0 + COSTO_KM.length * 14 + 22);
  return (
    <Sin>
      <Titulo f={f} size={96}>
        ¿Cuánto te cuesta
        <br />
        <span style={{ color: AMBER }}>cada km que hacés?</span>
      </Titulo>
      <Opciones f={f} ops={P2} ok={3} fuera={ROWS0 - 14} />
      <Cuenta f={f} />
      {/* la cuenta: todo lo que gastás, repartido por km */}
      {f >= ROWS0 - 4 ? (
        <div style={{ position: "absolute", top: 560, left: SAFE.left, width: W, background: "rgba(23,25,30,.96)", border: "3px solid #34373e", borderRadius: 32, padding: "24px 32px", opacity: ramp(f, ROWS0 - 4, ROWS0 + 6) }}>
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: "#8d929c" }}>CADA KM · {money(GASTOS)} ÷ {money(KM).slice(2)} KM</div>
          {COSTO_KM.map(([e, l, v], i) => {
            const k = ramp(f, ROWS0 + i * 14, ROWS0 + i * 14 + 10);
            return (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 70, fontFamily: sans, fontWeight: 700, fontSize: 32, color: "#d4d7de", opacity: k, translate: `${(1 - k) * 40}px 0px` }}>
                <span>{e} {l}</span>
                <span style={{ fontFamily: mono }}>{money(v)}</span>
              </div>
            );
          })}
          <div style={{ borderTop: "4px dashed #3c4048", margin: "12px 0 10px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", opacity: total, scale: 0.9 + total * 0.1, transformOrigin: "0 50%" }}>
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 38, color: "#e4e6ea" }}>Cada km te cuesta</span>
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 70, color: INK, background: AMBER, borderRadius: 12, padding: "0 14px" }}>{money(POR_KM_COSTO)}</span>
          </div>
        </div>
      ) : null}
      <div style={{ position: "absolute", top: 1120, left: SAFE.left, width: W, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 36, color: "#b9bdc6", opacity: ramp(f, 290, 302) }}>
        No es solo el gasoil.
      </div>
      <Tic />
      {COSTO_KM.map((c, i) => (
        <Audio key={c[1]} name="Renglón" src={staticFile("sfx/mouse-click.wav")} from={ROWS0 + i * 14} volume={0.3} />
      ))}
      <Audio name="Total" src={staticFile("sfx/whip.wav")} from={ROWS0 + COSTO_KM.length * 14 + 10} volume={0.6} />
    </Sin>
  );
};

// ── D · La cuenta del km ────────────────────────────────────────────
const D_DUR = 150;
const Km: React.FC = () => {
  const f = useCurrentFrame();
  const lineas: [string, number, string, number][] = [
    ["Facturás", POR_KM_FACT, "#e4e6ea", 6],
    ["Te cuesta", POR_KM_COSTO, "#8d929c", 30],
    ["Te deja", POR_KM_DEJA, AMBER, 54],
  ];
  const q = ramp(f, 96, 108);
  return (
    <Sin>
      <Titulo f={f} size={96}>Cada km que hacés:</Titulo>
      {lineas.map(([l, v, col, at], i) => {
        const e = ramp(f, at, at + 12, Easing.out(Easing.cubic));
        const val = interpolate(f, [at, at + 22], [0, v], { ...clamp, easing: Easing.out(Easing.cubic) });
        return (
          <div key={l} style={{ position: "absolute", top: 500 + i * 150, left: SAFE.left, width: W, display: "flex", justifyContent: "space-between", alignItems: "baseline", opacity: e, translate: `${(1 - e) * -60}px 0px` }}>
            <span style={{ fontFamily: display, fontSize: 96, color: col }}>{l}</span>
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 92, color: col }}>{money(val)}</span>
          </div>
        );
      })}
      <div style={{ position: "absolute", top: 980, left: SAFE.left, width: W, textAlign: "center", opacity: q, translate: `0px ${(1 - q) * 24}px` }}>
        <div style={{ fontFamily: display, fontSize: 88, color: "#e4e6ea" }}>¿Le pegaste a las dos?</div>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 34, color: "#8d929c" }}>Con tus números reales, no hace falta adivinar.</div>
      </div>
      {lineas.map(([l, , , at]) => (
        <Audio key={l} name="Número" src={staticFile("sfx/whoosh.wav")} from={at} volume={0.35} />
      ))}
    </Sin>
  );
};

// ── E · Con AuxiliOS: en qué se te va y cuánto te deja cada km ───────
const NUM0 = 140;
const E_DUR = 290;
const MisNumeros: React.FC<{ f: number }> = ({ f }) => {
  const kpi: [string, string][] = [
    ["Por servicio", money((FACT - GASTOS) / 32)],
    ["Por km", money(POR_KM_DEJA)],
    ["Servicios", "32"],
  ];
  const v = interpolate(f, [8, 40], [0, FACT - GASTOS], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", left: 44, top: 26 }}>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: AMBER }}>
          AUXILI<span style={{ color: U.text }}>OS</span>
        </div>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 54, color: U.text, marginTop: 6 }}>Mis números</div>
        <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 30, color: U.muted }}>Noviembre</div>
      </div>
      <div style={{ position: "absolute", left: 44, right: 44, top: 210, display: "flex", gap: 14 }}>
        {kpi.map(([l, val], i) => {
          const e = pop(f, 10 + i * 6, 22 + i * 6);
          const hot = i === 1;
          return (
            <div key={l} style={{ flex: 1, background: hot ? "linear-gradient(160deg, rgba(245,166,35,.2), #171b24)" : U.card, border: `3px solid ${hot ? AMBER : U.line}`, borderRadius: 24, padding: "16px 18px", opacity: e, scale: hot ? 1 + (1 - pop(f, 40, 52)) * 0.12 : 1 }}>
              <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 24, color: U.muted }}>{l}</div>
              <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 38, color: hot ? AMBER : U.text, marginTop: 4 }}>{val}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 44, right: 44, top: 380, opacity: ramp(f, 30, 40) }}>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 32, color: U.muted }}>Este mes te quedaron</div>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 104, color: U.text, lineHeight: 1.1 }}>{money(v)}</div>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 28, color: U.muted, marginTop: 8 }}>
          Facturé {money(FACT)} · gasté {money(GASTOS)}
        </div>
      </div>
    </div>
  );
};
const shots: Shot[] = [
  { from: 0, render: (f) => <Gastos f={f} /> },
  { from: NUM0, render: (f) => <MisNumeros f={f} /> },
];
const E_TITULOS: [number, string][] = [
  [0, "Ves en qué se te va"],
  [NUM0, "Y cuánto te deja cada km"],
];
const ConAuxilios: React.FC = () => {
  const f = useCurrentFrame();
  const cur = E_TITULOS.reduce((k, t, i) => (f >= t[0] ? i : k), 0);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, rgba(245,166,35,0.12), transparent 60%), ${C.bg}`, overflow: "hidden" }}>
      <Stripe />
      <Phone time="21:00">
        <Shots shots={shots} />
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
            <div key={t} style={{ position: "absolute", inset: 0, fontFamily: display, fontSize: 92, lineHeight: 1.04, color: C.text, translate: `0px ${(1 - e) * 100 - out * 100}px`, opacity: 1 - out }}>
              {t}
            </div>
          );
        })}
      </div>
      <Audio name="Gastos" src={staticFile("sfx/whoosh.wav")} from={0} volume={0.4} />
      <Audio name="Números" src={staticFile("sfx/whoosh.wav")} from={NUM0} volume={0.4} />
      <Audio name="Por km" src={staticFile("sfx/ding.wav")} from={NUM0 + 40} volume={0.5} />
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
      <div style={{ position: "absolute", top: SAFE.top + 390, left: SAFE.left, width: W, textAlign: "center", fontFamily: display, fontSize: 120, lineHeight: 0.95, color: C.text, opacity: ramp(f, 18, 26), translate: `0px ${(1 - ramp(f, 18, 32)) * 40}px` }}>
        Dejá de adivinar.
        <br />
        <span style={{ color: AMBER }}>Sabé en qué</span>
        <br />
        <span style={{ color: AMBER }}>se te va.</span>
      </div>
      <div style={{ position: "absolute", top: SAFE.top + 790, background: AMBER, color: INK, fontFamily: sans, fontWeight: 700, fontSize: 54, padding: "28px 60px", borderRadius: 999, opacity: ramp(f, 36, 42), scale: interpolate(f, [36, 48, 72, 80, 88], [0.6, 1, 1, 1.06, 1], clamp) }}>
        Tocá «Más información» ↓
      </div>
    </AbsoluteFill>
  );
};

const T = 15;
export const ADIVINA_DUR = A_DUR + B_DUR + C_DUR + D_DUR + E_DUR + F_DUR - 5 * T;

export const Adivina: React.FC<{ guia?: boolean }> = ({ guia = false }) => (
  <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence name="Adiviná" durationInFrames={A_DUR}>
        <Intro />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="Pregunta 1" durationInFrames={B_DUR}>
        <Pregunta1 />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="Pregunta 2" durationInFrames={C_DUR}>
        <Pregunta2 />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="Cada km" durationInFrames={D_DUR}>
        <Km />
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
