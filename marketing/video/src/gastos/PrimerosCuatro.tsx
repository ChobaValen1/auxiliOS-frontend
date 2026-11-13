import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, clamp, display, mono, sans } from "../theme";
import { Truck } from "../comparacion/Truck";
import { Logo } from "../scenes/Logo";
import { ReelsGuide } from "../monogrua/StepFrame";
import { Header, Phone, Pill } from "../monogrua/v2/ui";
import { FACTURADO, FIJOS, FIJOS_ITEMS, money, POR_SERVICIO, pop, QUEDA, ramp, SAFE, SERVICIOS, Stripe, U, VARIABLES } from "./common";

const W = 1080 - SAFE.left - (1080 - SAFE.right); // ancho útil

// ── A · Gancho ────────────────────────────────────────────
const A_DUR = 105;
const Gancho: React.FC = () => {
  const f = useCurrentFrame();
  const slam = interpolate(f, [34, 42], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const t = f - 42;
  const shake = t >= 0 && t < 12 ? Math.sin(t * 3) * 16 * (1 - t / 12) : 0;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 80%, rgba(245,166,35,.10), transparent 60%), #08090c`, translate: `${shake}px 0px` }}>
      <Stripe />
      <div style={{ position: "absolute", left: 300, top: 1000, opacity: 0.35, translate: `${interpolate(f, [0, A_DUR], [-200, 160])}px 0px` }}>
        <Truck solo wheelTurn={f * 8} />
      </div>
      <div style={{ position: "absolute", top: SAFE.top + 20, left: SAFE.left, width: W, fontFamily: display, fontSize: 150, lineHeight: 0.9, color: C.text }}>
        {["Tus primeros", "4 servicios", "del mes"].map((l, i) => (
          <div key={l} style={{ opacity: ramp(f, i * 8, i * 8 + 8), translate: `0px ${(1 - ramp(f, i * 8, i * 8 + 12)) * 40}px` }}>
            {i === 1 ? <span style={{ color: C.yellow }}>{l}</span> : l}
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute", top: SAFE.top + 470, left: SAFE.left, width: W, fontFamily: display, fontSize: 190, lineHeight: 0.9, color: C.red,
          opacity: slam, scale: 2.2 - slam * 1.2, rotate: `${-3 * slam}deg`, transformOrigin: "0% 50%", textShadow: "0 10px 40px rgba(226,80,74,.35)",
        }}
      >
        no son tuyos.
      </div>
      <Audio name="Golpe" src={staticFile("sfx/whip.wav")} from={41} volume={0.9} />
    </AbsoluteFill>
  );
};

// ── B · Los fijos caen sobre la mesa ─────────────────────
const B_DUR = 230;
const DROP0 = 34, DROP_EVERY = 26;
const Fijos: React.FC = () => {
  const f = useCurrentFrame();
  const landed = FIJOS_ITEMS.filter((_, i) => f >= DROP0 + i * DROP_EVERY + 10);
  const sum = landed.reduce((s, x) => s + x[2], 0);
  return (
    <AbsoluteFill style={{ background: "repeating-linear-gradient(0deg, #1b1c1f 0 6px, #1d1e21 6px 12px)" }}>
      <Stripe />
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, width: W, fontFamily: display, fontSize: 110, lineHeight: 0.92, color: C.text, opacity: ramp(f, 0, 10) }}>
        Antes de ganar un peso
      </div>
      <div style={{ position: "absolute", top: SAFE.top + 118, left: SAFE.left, width: W, fontFamily: sans, fontWeight: 700, fontSize: 46, color: C.yellow, opacity: ramp(f, 8, 18) }}>
        pagás esto todos los meses:
      </div>
      {FIJOS_ITEMS.map(([emoji, name, amount], i) => {
        const at = DROP0 + i * DROP_EVERY;
        const d = interpolate(f, [at, at + 10], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
        const bounce = interpolate(f, [at + 10, at + 14, at + 18], [0, -10, 0], clamp);
        const rot = (i % 2 ? 1 : -1) * (2 + i);
        return (
          <div
            key={name}
            style={{
              position: "absolute", left: SAFE.left + 20, width: W - 40, top: 470 + i * 122 + bounce, height: 108, borderRadius: 18, background: "#efe9da",
              display: "flex", alignItems: "center", gap: 22, padding: "0 30px", boxShadow: "0 14px 30px rgba(0,0,0,.45)",
              translate: `0px ${(1 - d) * -900}px`, rotate: `${rot * (1 - d) * 4 + rot * 0.4}deg`, opacity: d > 0 ? 1 : 0, zIndex: i,
            }}
          >
            <span style={{ fontSize: 56 }}>{emoji}</span>
            <span style={{ flex: 1, fontFamily: sans, fontWeight: 700, fontSize: 44, color: "#2c2a25" }}>{name}</span>
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 44, color: "#b3261e" }}>− {money(amount)}</span>
          </div>
        );
      })}
      <div
        style={{
          position: "absolute", top: 1100, left: SAFE.left, width: W, display: "flex", justifyContent: "space-between", alignItems: "baseline",
          fontFamily: display, color: C.text, opacity: ramp(f, DROP0, DROP0 + 8),
        }}
      >
        <span style={{ fontSize: 76 }}>Fijos del mes</span>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 84, color: C.red, scale: landed.length === 5 ? 1 + pop(f, 150, 162) * 0.08 : 1 }}>{money(sum)}</span>
      </div>
      {FIJOS_ITEMS.map((_, i) => (
        <Audio key={i} name="Factura" src={staticFile("sfx/whip.wav")} from={DROP0 + i * DROP_EVERY + 8} volume={0.5} />
      ))}
    </AbsoluteFill>
  );
};

// ── C · Almanaque: los primeros 4 pagan los fijos ─────────
const C_DUR = 285;
const DIAS = [2, 3, 4, 6, 9, 10, 11, 13, 16, 17, 18, 20, 23, 24, 25, 26, 27, 30];
const OFFSET = 6; // el 1 de noviembre de 2026 es domingo (semana de lunes a domingo)
const markAt = (i: number) => (i < 4 ? 40 + i * 22 : 150 + (i - 4) * 5);
const Almanaque: React.FC = () => {
  const f = useCurrentFrame();
  const pagados = DIAS.filter((_, i) => f >= markAt(i) && i < 4).length;
  const fill = Math.min(1, (pagados * POR_SERVICIO) / FIJOS);
  const tuyos = DIAS.filter((_, i) => i >= 4 && f >= markAt(i)).length;
  const exacto = (FACTURADO - VARIABLES) / SERVICIOS; // sin redondear, para que el total cierre en $ 722.000
  const ganado = Math.max(0, Math.round(tuyos * exacto + (pagados === 4 ? 4 * exacto - FIJOS : 0)));
  const cell = 118, gap = 7;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Stripe />
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, width: W, fontFamily: display, fontSize: 88, lineHeight: 0.95, color: C.text, opacity: ramp(f, 0, 10) }}>
        Cada servicio te deja <span style={{ color: C.yellow }}>{money(POR_SERVICIO)}</span>
      </div>
      {/* barra de fijos */}
      <div style={{ position: "absolute", top: SAFE.top + 190, left: SAFE.left, width: W, opacity: ramp(f, 10, 20) }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: sans, fontWeight: 700, fontSize: 32, color: fill >= 1 ? C.green : C.muted }}>
          <span>{fill >= 1 ? "✓ Fijos cubiertos" : "Pagando los fijos…"}</span>
          <span style={{ fontFamily: mono }}>{money(Math.min(FIJOS, pagados * POR_SERVICIO))} / {money(FIJOS)}</span>
        </div>
        <div style={{ marginTop: 10, height: 26, borderRadius: 99, background: "#2a2f3c", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${fill * 100}%`, borderRadius: 99, background: fill >= 1 ? C.green : C.red }} />
        </div>
      </div>
      {/* almanaque */}
      <div style={{ position: "absolute", top: 540, left: SAFE.left, width: W }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(7, ${cell}px)`, gap, fontFamily: mono, fontWeight: 700, fontSize: 24, color: C.muted, textAlign: "center", marginBottom: 8 }}>
          {["LU", "MA", "MI", "JU", "VI", "SÁ", "DO"].map((d) => <span key={d}>{d}</span>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(7, ${cell}px)`, gap }}>
          {Array.from({ length: OFFSET + 30 }).map((_, k) => {
            const day = k - OFFSET + 1;
            if (day < 1) return <span key={k} />;
            const i = DIAS.indexOf(day);
            const on = i >= 0 && f >= markAt(i);
            const red = i >= 0 && i < 4;
            const e = i >= 0 ? pop(f, markAt(i), markAt(i) + 10) : 0;
            return (
              <div key={k} style={{ position: "relative", height: 86, borderRadius: 16, background: "#171b24", border: `2px solid ${on ? (red ? C.red : C.green) : "#262b37"}`, overflow: "hidden" }}>
                <span style={{ position: "absolute", left: 10, top: 6, fontFamily: mono, fontWeight: 700, fontSize: 24, color: on ? "#fff" : "#5a6278", zIndex: 2 }}>{day}</span>
                {i >= 0 ? (
                  <div style={{ position: "absolute", inset: 0, background: red ? "rgba(226,80,74,.55)" : "rgba(39,196,122,.5)", opacity: on ? 1 : 0, scale: 0.4 + e * 0.6, display: "grid", placeItems: "center", fontSize: 34 }}>
                    <span style={{ marginTop: 18 }}>{red ? "🧾" : "💰"}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {/* remate */}
      <div style={{ position: "absolute", top: 1150, left: SAFE.left, width: W, display: "flex", justifyContent: "space-between", alignItems: "baseline", opacity: ramp(f, 150, 160) }}>
        <span style={{ fontFamily: display, fontSize: 64, color: C.green }}>Desde el 5.º, para vos</span>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 64, color: C.green }}>{money(Math.min(QUEDA, ganado))}</span>
      </div>
      {DIAS.slice(0, 4).map((_, i) => (
        <Audio key={i} name="Servicio que paga fijos" src={staticFile("sfx/mouse-click.wav")} from={markAt(i)} volume={0.5} />
      ))}
      <Audio name="Fijos cubiertos" src={staticFile("sfx/ding.wav")} from={markAt(3) + 2} volume={0.5} />
    </AbsoluteFill>
  );
};

// ── D · Con AuxiliOS: el punto de equilibrio ─────────────
const D_DUR = 240;
const Equilibrio: React.FC = () => {
  const f = useCurrentFrame();
  const llevas = Math.round(interpolate(f, [40, 100], [0, SERVICIOS], { ...clamp, easing: Easing.out(Easing.cubic) }));
  const cubierto = llevas >= 4;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, rgba(245,166,35,0.14), transparent 60%), ${C.bg}` }}>
      <Stripe />
      <div style={{ position: "absolute", top: SAFE.top, left: SAFE.left, width: W, zIndex: 20 }}>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 2, padding: "8px 18px", borderRadius: 999, background: "#f5a623", color: "#14161b", opacity: ramp(f, 0, 8) }}>CON AUXILIOS</span>
        <div style={{ fontFamily: display, fontSize: 98, lineHeight: 0.95, color: C.text, marginTop: 14, opacity: ramp(f, 4, 14) }}>Te lo calcula solo</div>
      </div>
      <Phone time="21:30">
        <Header f={f} title="Mis números" sub="Noviembre" />
        <div style={{ position: "absolute", left: 44, right: 44, top: 196, borderRadius: 36, padding: 34, background: cubierto ? "linear-gradient(160deg, rgba(39,196,122,.18), #171b24)" : U.card, border: `3px solid ${cubierto ? U.ok : U.line}`, opacity: ramp(f, 12, 24) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 42, color: U.text }}>Punto de equilibrio</span>
            <Pill color={cubierto ? U.ok : U.accent} style={{ fontSize: 30 }}>{cubierto ? "Cubierto" : `Faltan ${4 - llevas}`}</Pill>
          </div>
          <div style={{ marginTop: 20, fontFamily: sans, fontSize: 36, color: U.muted, lineHeight: 1.3 }}>
            Necesitás <b style={{ color: U.text }}>4 servicios</b> por mes para cubrir <b style={{ color: U.text }}>{money(FIJOS)}</b> de fijos.
          </div>
          <div style={{ position: "relative", marginTop: 28, height: 34, borderRadius: 99, background: "#2a2f3c" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(llevas / SERVICIOS) * 100}%`, borderRadius: 99, background: cubierto ? U.ok : U.accent }} />
            <div style={{ position: "absolute", left: `${(4 / SERVICIOS) * 100}%`, top: -12, bottom: -12, width: 4, background: U.text, borderRadius: 2 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontFamily: sans, fontWeight: 700, fontSize: 30, color: U.muted }}>
            <span style={{ marginLeft: `${(4 / SERVICIOS) * 100 - 6}%` }}>4 → fijos</span>
            <span style={{ fontFamily: mono, color: cubierto ? U.ok : U.accent }}>Llevás {llevas}</span>
          </div>
        </div>
        <div style={{ position: "absolute", left: 44, right: 44, top: 590, display: "flex", gap: 16, opacity: pop(f, 110, 124) }}>
          <div style={{ flex: 1, background: U.card, border: `3px solid ${U.line}`, borderRadius: 26, padding: "18px 22px" }}>
            <div style={{ fontFamily: sans, fontSize: 26, color: U.muted }}>Este mes te quedan</div>
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 46, color: U.ok }}>{money(QUEDA)}</div>
          </div>
          <div style={{ flex: 1, background: U.card, border: `3px solid ${U.accent}`, borderRadius: 26, padding: "18px 22px" }}>
            <div style={{ fontFamily: sans, fontSize: 26, color: U.muted }}>Aviso</div>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 32, color: U.accent, lineHeight: 1.15 }}>Renová el seguro · en 7 días</div>
          </div>
        </div>
      </Phone>
      <Audio name="Cubierto" src={staticFile("sfx/ding.wav")} from={56} volume={0.45} />
    </AbsoluteFill>
  );
};

// ── E · Cierre ───────────────────────────────────────────
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
      <div style={{ position: "absolute", top: SAFE.top + 390, left: SAFE.left, width: W, textAlign: "center", fontFamily: display, fontSize: 124, lineHeight: 0.95, color: C.text, opacity: ramp(f, 18, 26), translate: `0px ${(1 - ramp(f, 18, 32)) * 40}px` }}>
        Sabé desde qué servicio
        <br />
        <span style={{ color: "#f5a623" }}>empezás a ganar.</span>
      </div>
      <div style={{ position: "absolute", top: SAFE.top + 750, background: "#f5a623", color: "#14161b", fontFamily: sans, fontWeight: 700, fontSize: 54, padding: "28px 60px", borderRadius: 999, opacity: ramp(f, 36, 42), scale: interpolate(f, [36, 48, 72, 80, 88], [0.6, 1, 1, 1.06, 1], clamp) }}>
        Tocá «Más información» ↓
      </div>
    </AbsoluteFill>
  );
};

const T = 15;
export const PRIMEROS_CUATRO_DUR = A_DUR + B_DUR + C_DUR + D_DUR + E_DUR - 4 * T;

// Creativo de gastos 1: «Tus primeros 4 servicios del mes no son tuyos»
export const PrimerosCuatro: React.FC<{ guia?: boolean }> = ({ guia = false }) => (
  <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence name="Gancho" durationInFrames={A_DUR}>
        <Gancho />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="Los fijos" durationInFrames={B_DUR}>
        <Fijos />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="Almanaque" durationInFrames={C_DUR}>
        <Almanaque />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="Con AuxiliOS" durationInFrames={D_DUR}>
        <Equilibrio />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence name="Cierre" durationInFrames={E_DUR}>
        <Cierre />
      </TransitionSeries.Sequence>
    </TransitionSeries>
    {guia ? <ReelsGuide /> : null}
  </AbsoluteFill>
);
