import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import React from "react";
import { AbsoluteFill, Easing, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import { C, clamp, display, mono, sans } from "../theme";
import { Logo } from "../scenes/Logo";
import { ReelsGuide } from "../monogrua/StepFrame";
import { money, pop, ramp, SAFE, Stripe } from "./common";

const W = SAFE.right - SAFE.left;
// Paleta de marca: ámbar para lo que te queda, grises para lo que se va en gastos
const AMBER = "#f5a623";
const INK = "#14161b";
const GRIS_VAR = "#3a4152";
const GRIS_FIJ = "#5b6378";

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
  ["🛡️", "Débito automático · Seguro de la grúa", 320000, "#2c3242"],
  ["⛽", "Compra con débito · Estación de servicio", 95000, "#2c3242"],
  ["🧾", "ARCA · Monotributo", 180000, "#2c3242"],
  ["🛞", "Transferencia · Gomería", 120000, "#2c3242"],
  ["🚗", "ARBA · Patente", 70000, "#2c3242"],
  ["🔧", "Transferencia · Taller", 180000, "#2c3242"],
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
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 36, color: AMBER }}>−{money(amount).slice(2)}</span>
          </div>
        );
      })}
      <div style={{ position: "absolute", top: 1100, left: SAFE.left, width: W, display: "flex", justifyContent: "space-between", alignItems: "baseline", opacity: ramp(f, 10, 20) }}>
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 40, color: C.muted }}>Saldo</span>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 84, color: saldo < 2700000 ? AMBER : C.text }}>{money(saldo)}</span>
      </div>
      <AbsoluteFill style={{ background: "rgba(5,6,9,.78)", opacity: dim }} />
      <div
        style={{
          position: "absolute", top: 560, left: SAFE.left, width: W, textAlign: "center", fontFamily: display, fontSize: 150, lineHeight: 0.9, color: AMBER,
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
    ...VARIABLES.map(([e, n, v]) => [`${e} ${n}`, "− " + money(v / SERVICIOS), "#5c574b"] as [string, string, string]),
  ];
  const done = LINE0 + lines.length * LINE_EVERY;
  const total = pop(f, done + 6, done + 18);
  const fijos = ramp(f, done + 46, done + 58);
  return (
    <AbsoluteFill style={{ background: "repeating-linear-gradient(0deg, #1b1c1f 0 6px, #1d1e21 6px 12px)" }}>
      <Stripe />
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, width: W, fontFamily: display, fontSize: 112, color: C.text, opacity: ramp(f, 0, 10) }}>Hagamos la cuenta</div>
      <div style={{ position: "absolute", top: SAFE.top + 106, left: SAFE.left, width: W, fontFamily: sans, fontWeight: 700, fontSize: 38, color: C.muted, opacity: ramp(f, 6, 16) }}>
        {SERVICIOS} servicios en el mes · {money(FACTURADO)}
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
          <span style={{ position: "relative", fontFamily: mono, fontWeight: 700, fontSize: 60, color: INK, padding: "0 8px" }}>
            {/* resaltador que pasa por encima del total */}
            <span style={{ position: "absolute", left: 0, right: 0, top: "18%", bottom: "8%", background: AMBER, borderRadius: 6, transformOrigin: "0 50%", scale: `${ramp(f, done + 14, done + 26)} 1` }} />
            <span style={{ position: "relative" }}>{money(DEJA)}</span>
          </span>
        </div>
      </div>
      <div style={{ position: "absolute", top: 1150, left: SAFE.left, width: W, fontFamily: sans, fontWeight: 700, fontSize: 40, color: C.text, opacity: fijos, translate: `0px ${(1 - fijos) * 20}px` }}>
        Y faltan los fijos: <span style={{ color: AMBER, fontFamily: mono }}>{money(FIJ_TOTAL)}</span> por mes
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
const iconOf = (d: number) => (d <= DIAS_VAR ? "⛽" : d <= DIAS_GASTOS ? "🧾" : "💰");
const VERDICT = 205;
const Mes: React.FC = () => {
  const f = useCurrentFrame();
  const cell = 136, gap = 10;
  const verdict = ramp(f, VERDICT, VERDICT + 12);
  const legend: [string, string, number, string][] = [
    [GRIS_VAR, `${DIAS_VAR} días`, 24, "gasoil, taller, cubiertas y la calle"],
    [GRIS_FIJ, `${DIAS_FIJ} días`, 90, "seguro, monotributo, patente y VTV"],
    [AMBER, `${30 - DIAS_GASTOS} días`, 150, "para vos"],
  ];
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Stripe />
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, width: W, height: 180 }}>
        <div style={{ position: "absolute", inset: 0, fontFamily: display, fontSize: 104, lineHeight: 0.95, color: C.text, opacity: 1 - verdict }}>
          Tu mes tiene <span style={{ color: AMBER }}>30 días</span>
        </div>
        <div style={{ position: "absolute", inset: 0, fontFamily: display, fontSize: 92, lineHeight: 0.95, color: C.text, opacity: verdict, translate: `0px ${(1 - verdict) * 30}px` }}>
          <span style={{ color: C.muted }}>15 días</span> para pagar gastos.
          <br />
          <span style={{ color: AMBER }}>15 días</span> para vos.
        </div>
      </div>
      <div style={{ position: "absolute", top: 470, left: SAFE.left, display: "grid", gridTemplateColumns: `repeat(6, ${cell}px)`, gap }}>
        {Array.from({ length: 30 }).map((_, k) => {
          const d = k + 1;
          const at = dayAt(d);
          const on = f >= at;
          const mio = d > DIAS_GASTOS;
          const row = Math.floor(k / 6), col = k % 6;
          if (!mio) {
            // día que se come un gasto: se llena de gris y se tacha
            const fill = ramp(f, at, at + 8);
            const strike = ramp(f, at + 4, at + 12);
            return (
              <div key={d} style={{ position: "relative", height: 112, borderRadius: 22, background: "#171b24", border: "3px solid #262b37", overflow: "hidden", opacity: 1 - verdict * 0.45 }}>
                <div style={{ position: "absolute", inset: 0, background: d <= DIAS_VAR ? GRIS_VAR : GRIS_FIJ, transformOrigin: "0 50%", scale: `${fill} 1` }} />
                <span style={{ position: "absolute", left: 14, top: 8, fontFamily: mono, fontWeight: 700, fontSize: 32, color: on ? "#aab2c5" : "#5a6278" }}>{d}</span>
                <div style={{ position: "absolute", left: "-10%", width: "120%", top: "50%", height: 5, background: "rgba(12,14,18,.7)", rotate: "-24deg", transformOrigin: "0 50%", scale: `${strike} 1` }} />
                {on ? <span style={{ position: "absolute", right: 12, bottom: 8, fontSize: 30, opacity: 0.75 * fill }}>{iconOf(d)}</span> : null}
              </div>
            );
          }
          // día para vos: se prende en ámbar con un brillo que lo recorre
          const e = pop(f, at, at + 10);
          const glow = interpolate(f, [at, at + 6, at + 22], [0, 1, 0.35], clamp) + verdict * 0.4;
          const shine = interpolate(f - (row + col) * 2, [VERDICT - 6, VERDICT + 14], [-180, 180], clamp);
          return (
            <div key={d} style={{ position: "relative", height: 112, borderRadius: 22, background: "#171b24", border: `3px solid ${on ? AMBER : "#262b37"}`, scale: 1 + verdict * 0.03, boxShadow: on ? `0 0 ${36 * glow}px rgba(245,166,35,${0.55 * glow})` : "none" }}>
              <div style={{ position: "absolute", inset: 0, background: AMBER, opacity: on ? 1 : 0, scale: 0.3 + e * 0.7, borderRadius: 18, overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, bottom: 0, width: 60, left: "50%", marginLeft: -30, background: "linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent)", translate: `${shine}px 0px`, rotate: "18deg" }} />
              </div>
              <span style={{ position: "absolute", left: 14, top: 8, fontFamily: mono, fontWeight: 700, fontSize: 32, color: on ? INK : "#5a6278" }}>{d}</span>
              {on ? <span style={{ position: "absolute", right: 12, bottom: 8, fontSize: 34, scale: e }}>{iconOf(d)}</span> : null}
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", top: 1100, left: SAFE.left, width: W, height: 150 }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 6, opacity: 1 - ramp(f, 220, 230) }}>
          {legend.map(([col, n, at, t]) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: sans, fontWeight: 700, fontSize: 34, color: C.text, opacity: ramp(f, at, at + 8), translate: `${(1 - ramp(f, at, at + 10)) * -30}px 0px` }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: col }} />
              <span style={{ fontFamily: mono, color: col === AMBER ? AMBER : C.text }}>{n}</span> {t}
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
      <Audio name="Brillo" src={staticFile("sfx/whoosh.wav")} from={VERDICT - 6} volume={0.35} />
    </AbsoluteFill>
  );
};

// ── D · Te lo calcula solo: cargás el gasto y el número se arma solo ─
const D_DUR = 285;
const CHIPS: [string, string, string, string, number][] = [
  ["⛽", "Gasoil · $ 95.000", "📷 Foto del ticket", "✓ Cargado", 24],
  ["🛞", "Gomería · $ 120.000", "📷 Foto del ticket", "✓ Cargado", 40],
  ["🛡️", "Seguro de la grúa", "Vence en 7 días", "🔔 Aviso", 56],
];
const CHIP_TOP = 470, CHIP_H = 112, CHIP_GAP = 20;
const MERGE = 96, BOOM = 110;
const CX = 540, CY = 780;

// Odómetro: cada dígito gira como un contador y frena en su valor
const LH = 140;
const Odometro: React.FC<{ value: number; start: number }> = ({ value, start }) => {
  const f = useCurrentFrame();
  const chars = money(value).split("");
  let j = 0;
  return (
    <div style={{ display: "flex", justifyContent: "center", fontFamily: mono, fontWeight: 700, fontSize: 118, lineHeight: `${LH}px`, height: LH, color: AMBER, textShadow: "0 0 40px rgba(245,166,35,.35)" }}>
      {chars.map((ch, i) => {
        if (!/\d/.test(ch)) return <span key={i} style={{ opacity: ramp(f, start, start + 6) }}>{ch}</span>;
        const k = j++;
        const target = Number(ch);
        const rounds = 2 + (k % 3);
        const a = start + k * 3, b = start + 34 + k * 4;
        const pos = (t: number) => interpolate(t, [a, b], [0, rounds * 10 + target], { ...clamp, easing: Easing.out(Easing.cubic) });
        const p = pos(f);
        const blur = Math.min(5, Math.max(0, (pos(f + 1) - p) * 2.2));
        return (
          <span key={i} style={{ position: "relative", display: "inline-block", height: LH, overflow: "hidden", opacity: ramp(f, a, a + 4) }}>
            <span style={{ display: "flex", flexDirection: "column", translate: `0px ${-p * LH}px`, filter: `blur(${blur}px)` }}>
              {Array.from({ length: rounds * 10 + target + 1 }).map((_, n) => (
                <span key={n} style={{ height: LH }}>{n % 10}</span>
              ))}
            </span>
          </span>
        );
      })}
    </div>
  );
};

const PARTS = Array.from({ length: 30 }).map((_, i) => ({
  ang: random(`ang${i}`) * Math.PI * 2,
  dist: 160 + random(`dist${i}`) * 300,
  size: 8 + random(`size${i}`) * 12,
  amber: random(`col${i}`) > 0.35,
}));

const Calcula: React.FC = () => {
  const f = useCurrentFrame();
  const t = f - BOOM;
  const glow = ramp(f, BOOM, BOOM + 30);
  const under = ramp(f, 152, 168);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 40%, rgba(245,166,35,${glow * 0.16}), transparent 55%), ${C.bg}` }}>
      <Stripe />
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, width: W }}>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 2, padding: "8px 18px", borderRadius: 999, background: AMBER, color: INK, opacity: ramp(f, 0, 8) }}>CON AUXILIOS</span>
        <div style={{ fontFamily: display, fontSize: 104, color: C.text, marginTop: 12, opacity: ramp(f, 4, 14), translate: `0px ${(1 - ramp(f, 4, 18)) * 30}px` }}>Te lo calcula solo</div>
      </div>

      {/* gastos que cargás: entran, se confirman y se juntan en un solo número */}
      {CHIPS.map(([e, title, sub, tag, at], i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const k = ramp(f, at, at + 14, Easing.out(Easing.cubic));
        const ok = pop(f, at + 14, at + 24);
        const m = ramp(f, MERGE + i * 3, BOOM, Easing.in(Easing.cubic));
        const top = CHIP_TOP + i * (CHIP_H + CHIP_GAP);
        const flash = interpolate(f, [at + 4, at + 6, at + 14], [0, 1, 0], clamp);
        if (f < at) return null;
        return (
          <div
            key={title}
            style={{
              position: "absolute", top, left: SAFE.left, width: W, height: CHIP_H, borderRadius: 26, background: "rgba(23,27,36,.97)", border: "3px solid #2c3242",
              display: "flex", alignItems: "center", gap: 18, padding: "0 22px", boxShadow: "0 14px 30px rgba(0,0,0,.4)",
              translate: `${(1 - k) * side * 1000}px ${m * (CY - top - CHIP_H / 2)}px`, scale: 1 - m * 0.85, opacity: 1 - ramp(f, BOOM - 4, BOOM),
            }}
          >
            <span style={{ width: 70, height: 70, borderRadius: 18, background: "#2c3242", display: "grid", placeItems: "center", fontSize: 40 }}>{e}</span>
            <span style={{ flex: 1 }}>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 32, color: C.text }}>{title}</div>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 24, color: C.muted }}>{sub}</div>
            </span>
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 26, padding: "8px 16px", borderRadius: 999, background: tag.startsWith("✓") ? AMBER : "transparent", border: `3px solid ${AMBER}`, color: tag.startsWith("✓") ? INK : AMBER, scale: ok, opacity: ok }}>{tag}</span>
            <AbsoluteFill style={{ borderRadius: 24, background: "#fff", opacity: flash * 0.5 }} />
          </div>
        );
      })}

      {/* ondas y chispas cuando se arma el número */}
      {[0, 8, 16].map((d) => {
        const r = ramp(f, BOOM + d, BOOM + d + 36, Easing.out(Easing.quad));
        if (f < BOOM + d) return null;
        const size = 160 + r * 820;
        return <div key={d} style={{ position: "absolute", left: CX - size / 2, top: CY - size / 2, width: size, height: size, borderRadius: "50%", border: `${6 - r * 4}px solid ${AMBER}`, opacity: (1 - r) * 0.6 }} />;
      })}
      {t >= 0 && t < 44
        ? PARTS.map((p, i) => {
            const d = p.dist * (1 - Math.exp(-t / 8));
            return (
              <div key={i} style={{ position: "absolute", left: CX + Math.cos(p.ang) * d - p.size / 2, top: CY + Math.sin(p.ang) * d - p.size / 2, width: p.size, height: p.size, borderRadius: i % 3 === 0 ? 3 : "50%", background: p.amber ? AMBER : "#fff", opacity: 1 - t / 44, rotate: `${t * 9 + i * 20}deg` }} />
            );
          })
        : null}

      {/* el resultado */}
      <div style={{ position: "absolute", top: 630, left: SAFE.left, width: W, textAlign: "center" }}>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 40, color: C.muted, opacity: ramp(f, BOOM - 2, BOOM + 8), translate: `0px ${(1 - ramp(f, BOOM - 2, BOOM + 12)) * 20}px` }}>Este mes te quedan</div>
        <div style={{ marginTop: 8, scale: interpolate(f, [BOOM, BOOM + 6, BOOM + 14], [0.7, 1.08, 1], clamp) }}>
          <Odometro value={QUEDA} start={BOOM + 2} />
        </div>
        <div style={{ display: "inline-block", position: "relative", marginTop: 26, fontFamily: sans, fontWeight: 700, fontSize: 42, color: C.text, opacity: ramp(f, 148, 158) }}>
          <span style={{ color: AMBER }}>50 %</span> de lo que facturaste
          <div style={{ position: "absolute", left: 0, right: 0, bottom: -12, height: 6, borderRadius: 3, background: AMBER, transformOrigin: "0 50%", scale: `${under} 1` }} />
        </div>
      </div>

      {/* lo que te dice la app */}
      <div style={{ position: "absolute", top: 1010, left: SAFE.left, width: W, display: "flex", gap: 16 }}>
        {[
          ["Cada servicio te deja", money(DEJA), AMBER, 176],
          ["Tus fijos se cubren con", `${SERV_FIJOS} servicios`, C.text, 192],
        ].map(([l, v, col, at]) => {
          const e = pop(f, at as number, (at as number) + 12);
          return (
            <div key={l as string} style={{ position: "relative", flex: 1, background: "#171b24", border: "3px solid #2c3242", borderRadius: 28, padding: "20px 24px 20px 34px", overflow: "hidden", opacity: e, translate: `0px ${(1 - e) * 60}px` }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, background: AMBER, transformOrigin: "50% 0", scale: `1 ${ramp(f, (at as number) + 6, (at as number) + 18)}` }} />
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 28, color: C.muted }}>{l}</div>
              <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 52, color: col as string }}>{v}</div>
            </div>
          );
        })}
      </div>
      <Audio name="Gastos" src={staticFile("sfx/whoosh.wav")} from={22} volume={0.4} />
      {CHIPS.map(([, title, , , at]) => (
        <Audio key={title} name="Gasto cargado" src={staticFile("sfx/shutter.wav")} from={at + 4} volume={0.3} />
      ))}
      <Audio name="Se juntan" src={staticFile("sfx/whip.wav")} from={MERGE + 6} volume={0.6} />
      <Audio name="Resultado" src={staticFile("sfx/ding.wav")} from={BOOM} volume={0.5} />
      <Audio name="Datos" src={staticFile("sfx/mouse-click.wav")} from={176} volume={0.35} />
      <Audio name="Datos 2" src={staticFile("sfx/mouse-click.wav")} from={192} volume={0.35} />
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
        <span style={{ color: AMBER }}>laburás para vos.</span>
      </div>
      <div style={{ position: "absolute", top: SAFE.top + 750, background: AMBER, color: INK, fontFamily: sans, fontWeight: 700, fontSize: 54, padding: "28px 60px", borderRadius: 999, opacity: ramp(f, 36, 42), scale: interpolate(f, [36, 48, 72, 80, 88], [0.6, 1, 1, 1.06, 1], clamp) }}>
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
