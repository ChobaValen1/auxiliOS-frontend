import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import React from "react";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, clamp, display, mono, sans } from "../theme";
import { Logo } from "../scenes/Logo";
import { ReelsGuide } from "../monogrua/StepFrame";
import { money, pop, ramp, SAFE, Stripe } from "./common";

const W = SAFE.right - SAFE.left;
const ORANGE = "#ff8a3d";
const GREEN = "#27c47a";
const RED = "#e2504a";

// Valores de ejemplo para un monogrúa del AMBA en noviembre de 2026 (estimados, redondeados)
const SERVICIOS = 32;
const FACTURADO = 3600000; // $ 120.000 por día
const POR_DIA = FACTURADO / 30;
const VARIABLES: [string, string, number][] = [
  ["⛽", "Gasoil", 712000],
  ["🔧", "Taller y repuestos", 180000],
  ["🛞", "Cubiertas", 120000],
  ["🍔", "Comida en la calle", 92000],
  ["🛣️", "Peajes", 64000],
];
const FIJOS: [string, string, number][] = [
  ["🛡️", "Seguro de la grúa", 320000],
  ["🧾", "Monotributo", 180000],
  ["🚗", "Patente", 70000],
  ["📡", "GPS y celular", 35000],
  ["🔍", "VTV (por mes)", 17000],
];
const VAR_TOTAL = VARIABLES.reduce((s, x) => s + x[2], 0); // 1.168.000
const FIJ_TOTAL = FIJOS.reduce((s, x) => s + x[2], 0); // 622.000
const GASTOS = VAR_TOTAL + FIJ_TOTAL; // 1.790.000
const QUEDA = FACTURADO - GASTOS; // 1.810.000
const PROMEDIO = FACTURADO / SERVICIOS; // 112.500
const DEJA = (FACTURADO - VAR_TOTAL) / SERVICIOS; // 76.000
const DIAS_VAR = Math.round(VAR_TOTAL / POR_DIA); // 10
const DIAS_FIJ = Math.round(GASTOS / POR_DIA) - DIAS_VAR; // 5
const DIAS_GASTOS = DIAS_VAR + DIAS_FIJ; // 15
const SERV_FIJOS = Math.ceil(FIJ_TOTAL / DEJA); // 9

// ── A · Gancho: le llueven los débitos y el saldo se va ──────────────
const A_DUR = 135;
const DEBITOS: [string, string, number, string][] = [
  ["🛡️", "Débito automático · Seguro de la grúa", 320000, "#3d6fd1"],
  ["⛽", "Compra con débito · Estación de servicio", 95000, "#d9822b"],
  ["🧾", "ARCA · Monotributo", 180000, "#6a4fd1"],
  ["🛞", "Transferencia · Gomería", 120000, "#3d8f5a"],
  ["🚗", "ARBA · Patente", 70000, "#b3261e"],
  ["🔧", "Transferencia · Taller", 180000, "#7a7f8c"],
];
const NOTI0 = 16, NOTI_EVERY = 10;
const Gancho: React.FC = () => {
  const f = useCurrentFrame();
  const llegaron = DEBITOS.filter((_, i) => f >= NOTI0 + i * NOTI_EVERY).length;
  const saldo = FACTURADO - DEBITOS.slice(0, llegaron).reduce((s, x) => s + x[2], 0);
  const dim = ramp(f, 82, 92);
  const slam = interpolate(f, [86, 94], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const t = f - 94;
  const shake = t >= 0 && t < 12 ? Math.sin(t * 3) * 16 * (1 - t / 12) : 0;
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 30%, #1a2233, #07080b 70%)", translate: `${shake}px 0px` }}>
      <Stripe />
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, width: W, fontFamily: display, fontSize: 112, lineHeight: 0.92, color: C.text, opacity: ramp(f, 0, 10) }}>
        Laburaste
        <br />
        todo el mes.
      </div>
      {DEBITOS.map(([emoji, title, amount, col], i) => {
        const at = NOTI0 + i * NOTI_EVERY;
        if (f < at) return null;
        const e = ramp(f, at, at + 8);
        const pos = llegaron - 1 - i; // la más nueva arriba
        const buzz = f - at < 6 ? Math.sin((f - at) * 8) * 6 : 0;
        return (
          <div
            key={title}
            style={{
              position: "absolute", left: SAFE.left, width: W, top: 500 + pos * 118, height: 104, borderRadius: 30, background: "rgba(38,44,56,.92)",
              display: "flex", alignItems: "center", gap: 20, padding: "0 26px", boxShadow: "0 12px 30px rgba(0,0,0,.45)",
              translate: `${buzz}px ${(1 - e) * -120}px`, opacity: e * (pos > 4 ? 0 : 1 - pos * 0.12), scale: 1 - pos * 0.02,
            }}
          >
            <span style={{ width: 70, height: 70, borderRadius: 18, background: col, display: "grid", placeItems: "center", fontSize: 38 }}>{emoji}</span>
            <span style={{ flex: 1, fontFamily: sans, fontWeight: 700, fontSize: 30, color: "#dfe4ee", lineHeight: 1.2 }}>{title}</span>
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 36, color: "#ff8a85" }}>−{money(amount).slice(2)}</span>
          </div>
        );
      })}
      <div style={{ position: "absolute", top: 1100, left: SAFE.left, width: W, display: "flex", justifyContent: "space-between", alignItems: "baseline", opacity: ramp(f, 10, 20) }}>
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 40, color: C.muted }}>Saldo</span>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 84, color: saldo < 2700000 ? RED : C.text }}>{money(saldo)}</span>
      </div>
      <AbsoluteFill style={{ background: "rgba(5,6,9,.78)", opacity: dim }} />
      <div
        style={{
          position: "absolute", top: 560, left: SAFE.left, width: W, textAlign: "center", fontFamily: display, fontSize: 150, lineHeight: 0.9, color: "#f5a623",
          opacity: slam, scale: 2 - slam, textShadow: "0 10px 40px rgba(0,0,0,.6)",
        }}
      >
        ¿Cuántos días
        <br />
        fueron para vos?
      </div>
      {DEBITOS.map((_, i) => (
        <Audio key={i} name="Notificación" src={staticFile("sfx/ding.wav")} from={NOTI0 + i * NOTI_EVERY} volume={0.18} />
      ))}
      <Audio name="Golpe" src={staticFile("sfx/whip.wav")} from={93} volume={0.9} />
    </AbsoluteFill>
  );
};

// ── B · La cuenta de cada servicio, impresa como un ticket ──────────
const B_DUR = 240;
const LINE0 = 22, LINE_EVERY = 13;
const Cuenta: React.FC = () => {
  const f = useCurrentFrame();
  const lines: [string, string, string][] = [
    ["Cobrás por servicio (promedio)", money(PROMEDIO), "#1e2430"],
    ...VARIABLES.map(([e, n, v]) => [`${e} ${n}`, "− " + money(v / SERVICIOS), "#9a2a22"] as [string, string, string]),
  ];
  const done = LINE0 + lines.length * LINE_EVERY;
  const total = pop(f, done + 6, done + 18);
  const fijos = ramp(f, done + 46, done + 58);
  return (
    <AbsoluteFill style={{ background: "repeating-linear-gradient(0deg, #1b1c1f 0 6px, #1d1e21 6px 12px)" }}>
      <Stripe />
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, width: W, fontFamily: display, fontSize: 112, color: C.text, opacity: ramp(f, 0, 10) }}>Hagamos la cuenta</div>
      <div style={{ position: "absolute", top: SAFE.top + 106, left: SAFE.left, width: W, fontFamily: sans, fontWeight: 700, fontSize: 38, color: C.muted, opacity: ramp(f, 6, 16) }}>
        Un mes de {SERVICIOS} servicios · {money(FACTURADO)} facturados
      </div>
      {/* ticket */}
      <div
        style={{
          position: "absolute", left: SAFE.left + 10, width: W - 20, top: 470, background: "#f4f1ea", borderRadius: "10px 10px 0 0", padding: "26px 34px 30px",
          boxShadow: "0 20px 50px rgba(0,0,0,.5)", clipPath: `inset(0 0 ${100 - ramp(f, 10, done + 20, Easing.linear) * 100}% 0)`,
        }}
      >
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 3, color: "#6b675c", textAlign: "center", marginBottom: 12 }}>CADA SERVICIO, EN PROMEDIO</div>
        {lines.map(([l, v, col], i) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontWeight: 700, fontSize: i === 0 ? 34 : 30, lineHeight: "62px", color: col, opacity: ramp(f, LINE0 + i * LINE_EVERY, LINE0 + i * LINE_EVERY + 4) }}>
            <span style={{ fontFamily: sans }}>{l}</span>
            <span>{v}</span>
          </div>
        ))}
        <div style={{ borderTop: "4px dashed #b9b3a4", margin: "12px 0 8px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", opacity: total, scale: 0.9 + total * 0.1, transformOrigin: "0 50%" }}>
          <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 40, color: "#14161b" }}>Te deja cada servicio</span>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 60, color: "#1a8f55" }}>{money(DEJA)}</span>
        </div>
      </div>
      <div style={{ position: "absolute", top: 1150, left: SAFE.left, width: W, fontFamily: sans, fontWeight: 700, fontSize: 40, color: C.text, opacity: fijos, translate: `0px ${(1 - fijos) * 20}px` }}>
        Y faltan los fijos: <span style={{ color: RED, fontFamily: mono }}>{money(FIJ_TOTAL)}</span> por mes
      </div>
      {lines.map((_, i) => (
        <Audio key={i} name="Impresora" src={staticFile("sfx/mouse-click.wav")} from={LINE0 + i * LINE_EVERY} volume={0.3} />
      ))}
      <Audio name="Total" src={staticFile("sfx/ding.wav")} from={done + 6} volume={0.4} />
    </AbsoluteFill>
  );
};

// ── C · El mes de 30 días: cuántos son para gastos y cuántos para vos ─
const C_DUR = 300;
const dayAt = (d: number) => (d <= DIAS_VAR ? 24 + (d - 1) * 5 : d <= DIAS_GASTOS ? 90 + (d - DIAS_VAR - 1) * 7 : 150 + (d - DIAS_GASTOS - 1) * 3);
const colorOf = (d: number) => (d <= DIAS_VAR ? ORANGE : d <= DIAS_GASTOS ? RED : GREEN);
const Mes: React.FC = () => {
  const f = useCurrentFrame();
  const cell = 136, gap = 10;
  const verdict = ramp(f, 205, 217);
  const legend: [string, string, number, string][] = [
    [ORANGE, `${DIAS_VAR} días`, 24, "gasoil, taller, cubiertas y la calle"],
    [RED, `${DIAS_FIJ} días`, 90, "seguro, monotributo, patente y VTV"],
    [GREEN, `${30 - DIAS_GASTOS} días`, 150, "para vos"],
  ];
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Stripe />
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, width: W, height: 180 }}>
        <div style={{ position: "absolute", inset: 0, fontFamily: display, fontSize: 104, lineHeight: 0.95, color: C.text, opacity: 1 - verdict }}>
          Tu mes tiene <span style={{ color: "#f5a623" }}>30 días</span>
        </div>
        <div style={{ position: "absolute", inset: 0, fontFamily: display, fontSize: 92, lineHeight: 0.95, color: C.text, opacity: verdict, translate: `0px ${(1 - verdict) * 30}px` }}>
          <span style={{ color: RED }}>15 días</span> para pagar gastos.
          <br />
          <span style={{ color: GREEN }}>15 días</span> para vos.
        </div>
      </div>
      <div style={{ position: "absolute", top: 470, left: SAFE.left, display: "grid", gridTemplateColumns: `repeat(6, ${cell}px)`, gap }}>
        {Array.from({ length: 30 }).map((_, k) => {
          const d = k + 1;
          const at = dayAt(d);
          const on = f >= at;
          const e = pop(f, at, at + 10);
          const col = colorOf(d);
          return (
            <div key={d} style={{ position: "relative", height: 112, borderRadius: 22, background: "#171b24", border: `3px solid ${on ? col : "#262b37"}`, overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: col, opacity: on ? 0.85 : 0, scale: 0.3 + e * 0.7, borderRadius: 18 }} />
              <span style={{ position: "absolute", left: 14, top: 8, fontFamily: mono, fontWeight: 700, fontSize: 32, color: on ? "#0c0e12" : "#5a6278" }}>{d}</span>
              {on ? <span style={{ position: "absolute", right: 12, bottom: 8, fontSize: 34 }}>{d <= DIAS_VAR ? "⛽" : d <= DIAS_GASTOS ? "🧾" : "💰"}</span> : null}
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", top: 1100, left: SAFE.left, width: W, height: 150 }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 6, opacity: 1 - ramp(f, 220, 230) }}>
          {legend.map(([col, n, at, t]) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: sans, fontWeight: 700, fontSize: 34, color: C.text, opacity: ramp(f, at, at + 8) }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: col }} />
              <span style={{ fontFamily: mono, color: col }}>{n}</span> {t}
            </div>
          ))}
        </div>
        <div style={{ position: "absolute", inset: 0, fontFamily: mono, fontWeight: 700, fontSize: 32, lineHeight: 1.4, color: C.muted, opacity: ramp(f, 228, 240) }}>
          Gastos {money(GASTOS)} ÷ {money(POR_DIA)} que facturás por día
          <br />
          <span style={{ color: C.text }}>= {DIAS_GASTOS} días de laburo solo para gastos</span>
        </div>
      </div>
      <Audio name="Gastos del día" src={staticFile("sfx/mouse-click.wav")} from={24} volume={0.3} />
      <Audio name="Fijos" src={staticFile("sfx/whip.wav")} from={90} volume={0.5} />
      <Audio name="Para vos" src={staticFile("sfx/ding.wav")} from={150} volume={0.45} />
    </AbsoluteFill>
  );
};

// ── D · Te lo calcula solo: el mes en un anillo, sin hacer cuentas ───
const D_DUR = 285;
const Arc: React.FC<{ from: number; to: number; color: string; r: number; sw: number }> = ({ from, to, color, r, sw }) => {
  const c = 2 * Math.PI * r;
  if (to <= from) return null;
  return <circle cx={0} cy={0} r={r} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={`${(to - from) * c} ${c}`} strokeDashoffset={-from * c} transform="rotate(-90)" strokeLinecap="butt" />;
};
const CHIPS: [string, string, string, number, number][] = [
  ["⛽", "Gasoil · $ 95.000", "📷 con foto", -1, 40],
  ["🛞", "Gomería · $ 120.000", "📷 con foto", 1, 52],
  ["🛡️", "Seguro", "vence en 7 días", -1, 64],
];
const Calcula: React.FC = () => {
  const f = useCurrentFrame();
  const draw = ramp(f, 14, 70, Easing.inOut(Easing.cubic));
  const a1 = (DIAS_VAR / 30) * draw, a2 = (DIAS_GASTOS / 30) * draw, a3 = draw;
  const queda = interpolate(f, [30, 80], [0, QUEDA], { ...clamp, easing: Easing.out(Easing.cubic) });
  const spin = interpolate(f, [0, D_DUR], [-8, 8]);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 46%, rgba(39,196,122,${0.06 + draw * 0.14}), transparent 55%), ${C.bg}` }}>
      <Stripe />
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, width: W }}>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 2, padding: "8px 18px", borderRadius: 999, background: "#f5a623", color: "#14161b", opacity: ramp(f, 0, 8) }}>CON AUXILIOS</span>
        <div style={{ fontFamily: display, fontSize: 104, color: C.text, marginTop: 12, opacity: ramp(f, 4, 14) }}>Te lo calcula solo</div>
      </div>
      {/* anillo del mes */}
      <svg width={540} height={540} viewBox="-270 -270 540 540" style={{ position: "absolute", left: 270, top: 450, rotate: `${spin}deg`, filter: "drop-shadow(0 20px 50px rgba(0,0,0,.5))" }}>
        <circle r={210} fill="none" stroke="#1f2430" strokeWidth={70} />
        <Arc from={0} to={a1} color={ORANGE} r={210} sw={70} />
        <Arc from={a1 + 0.004} to={a2} color={RED} r={210} sw={70} />
        <Arc from={a2 + 0.004} to={a3} color={GREEN} r={210} sw={70} />
      </svg>
      <div style={{ position: "absolute", left: 270, top: 450, width: 540, height: 540, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 32, color: C.muted, opacity: ramp(f, 20, 30) }}>Este mes te quedan</span>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 66, color: GREEN, opacity: ramp(f, 26, 34) }}>{money(queda)}</span>
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, color: C.text, opacity: ramp(f, 70, 80) }}>50 % de lo que facturaste</span>
      </div>
      {/* gastos que entran al anillo */}
      {CHIPS.map(([e, t, s, side, at]) => {
        const k = ramp(f, at, at + 16);
        const gone = ramp(f, at + 40, at + 52);
        return (
          <div
            key={t}
            style={{
              position: "absolute", top: 520 + CHIPS.findIndex((c) => c[1] === t) * 150, [side < 0 ? "left" : "right"]: 1080 - SAFE.right + 10,
              background: "rgba(23,27,36,.96)", border: "3px solid #2c3242", borderRadius: 24, padding: "14px 20px", display: "flex", alignItems: "center", gap: 14,
              translate: `${(1 - k) * side * 520 + gone * -side * 160}px 0px`, opacity: k * (1 - gone), scale: 1 - gone * 0.4, boxShadow: "0 14px 30px rgba(0,0,0,.4)",
            }}
          >
            <span style={{ fontSize: 44 }}>{e}</span>
            <span>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 32, color: C.text }}>{t}</div>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 24, color: s.startsWith("vence") ? "#f5a623" : GREEN }}>{s}</div>
            </span>
          </div>
        );
      })}
      {/* lo que te dice la app */}
      <div style={{ position: "absolute", top: 1030, left: SAFE.left, width: W, display: "flex", gap: 16 }}>
        {[
          ["Cada servicio te deja", money(DEJA), GREEN, 110],
          ["Tus fijos se cubren con", `${SERV_FIJOS} servicios`, "#f5a623", 124],
        ].map(([l, v, col, at]) => (
          <div key={l as string} style={{ flex: 1, background: "#171b24", border: `3px solid ${col}`, borderRadius: 28, padding: "20px 24px", opacity: pop(f, at as number, (at as number) + 12), scale: 0.8 + pop(f, at as number, (at as number) + 12) * 0.2 }}>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 28, color: C.muted }}>{l}</div>
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 52, color: col as string }}>{v}</div>
          </div>
        ))}
      </div>
      <Audio name="Anillo" src={staticFile("sfx/whoosh.wav")} from={14} volume={0.5} />
      {CHIPS.map(([, t, , , at]) => (
        <Audio key={t} name="Gasto cargado" src={staticFile("sfx/shutter.wav")} from={at + 4} volume={0.3} />
      ))}
      <Audio name="Resultado" src={staticFile("sfx/ding.wav")} from={110} volume={0.45} />
    </AbsoluteFill>
  );
};

// ── E · Cierre ───────────────────────────────────────────────────────
const E_DUR = 110;
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
      <div style={{ position: "absolute", top: SAFE.top + 390, left: SAFE.left, width: W, textAlign: "center", fontFamily: display, fontSize: 130, lineHeight: 0.95, color: C.text, opacity: ramp(f, 18, 26), translate: `0px ${(1 - ramp(f, 18, 32)) * 40}px` }}>
        Sabé cuántos días
        <br />
        <span style={{ color: "#f5a623" }}>laburás para vos.</span>
      </div>
      <div style={{ position: "absolute", top: SAFE.top + 750, background: "#f5a623", color: "#14161b", fontFamily: sans, fontWeight: 700, fontSize: 54, padding: "28px 60px", borderRadius: 999, opacity: ramp(f, 36, 42), scale: interpolate(f, [36, 48, 72, 80, 88], [0.6, 1, 1, 1.06, 1], clamp) }}>
        Tocá «Más información» ↓
      </div>
    </AbsoluteFill>
  );
};

const T = 15;
export const LA_MITAD_DUR = A_DUR + B_DUR + C_DUR + D_DUR + E_DUR - 4 * T;

// Creativo de gastos 1 (v2): «¿Cuántos días del mes laburás para vos?»
export const LaMitad: React.FC<{ guia?: boolean }> = ({ guia = false }) => (
  <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence name="Gancho" durationInFrames={A_DUR}>
        <Gancho />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="La cuenta" durationInFrames={B_DUR}>
        <Cuenta />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="30 días" durationInFrames={C_DUR}>
        <Mes />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="Te lo calcula solo" durationInFrames={D_DUR}>
        <Calcula />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="Cierre" durationInFrames={E_DUR}>
        <Cierre />
      </TransitionSeries.Sequence>
    </TransitionSeries>
    {guia ? <ReelsGuide /> : null}
  </AbsoluteFill>
);
