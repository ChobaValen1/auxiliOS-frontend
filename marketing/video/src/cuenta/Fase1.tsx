import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { clamp, display, mono, sans } from "../theme";
import { SAFE } from "../gastos/common";
import { ReelsGuide } from "../monogrua/StepFrame";
import { Ico } from "../solo/ui";
import { Camara, Grano, Toma } from "../reel/Gancho";

// Reel «Hagamos la cuenta», fase 1: la bola de nieve. Cinco servicios de $ 70.000 y,
// renglón por renglón, cada gasto con su cuenta a la vista, hasta lo que de verdad queda.
// Oscuro, como el problema del reel nuevo. 60 fps.
const W = SAFE.right - SAFE.left;
const AMBER = "#f5a623";
const GRIS = "#9aa3b8";
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const r = (f: number, a: number, b: number, e = ease) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: e });
const pop = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const peso = (n: number) => `$ ${fmt(n)}`;

// ── Los números (todos cierran) ─────────────────────────────────────
export const SERVICIOS = 5;
export const PRECIO = 70000;
export const COBRADO = SERVICIOS * PRECIO; // 350.000
export const KM = 180;
type Paso = { palabra: string; label: string; partes: [string, number][]; monto: number; at: number; res: number; resta: number; nota?: string };
export const PASOS: Paso[] = [
  // 180 km ÷ 4 km/L = 45 L × $ 1.500
  { palabra: "GASOIL", label: "Gasoil", partes: [["180 km", 440], ["÷ 4 km/L", 515], ["= 45 L", 590], ["× $ 1.500", 650]], monto: 67500, at: 420, res: 690, resta: 724 },
  { palabra: "PEAJES", label: "Peajes", partes: [["3 × $ 1.400", 770]], monto: 4200, at: 762, res: 792, resta: 818 },
  { palabra: "COMIDA", label: "Comida y café", partes: [], monto: 12000, at: 848, res: 856, resta: 884 },
  { palabra: "GOMERÍA", label: "Gomería · un pinchazo", partes: [], monto: 25000, at: 916, res: 928, resta: 962 },
  // 180 km × $ 250 de cubiertas, aceite y service
  { palabra: "DESGASTE", label: "Cubiertas y aceite", partes: [["180 km", 1036], ["× $ 250 por km", 1076]], monto: 45000, at: 1008, res: 1112, resta: 1146 },
  // 622.000 de fijos por mes ÷ 30 días
  { palabra: "FIJOS", label: "Seguro, cuota, monotributo", partes: [["$ 622.000 por mes", 1206], ["÷ 30 días", 1272]], monto: 20700, at: 1180, res: 1326, resta: 1362, nota: "Corren aunque no labures" },
];
export const GASTOS = PASOS.reduce((s, p) => s + p.monto, 0); // 174.400
export const QUEDA = COBRADO - GASTOS; // 175.600
export const POR_SERVICIO = QUEDA / SERVICIOS; // 35.120

const VOZ: [string, number][] = [
  ["cuenta-01", 20], ["cuenta-02", 122], ["cuenta-03", 272],
  ["cuenta-04", 420], ["cuenta-05", 762], ["cuenta-06", 848], ["cuenta-07", 916], ["cuenta-08", 1008], ["cuenta-09", 1180],
  ["cuenta-10", 1446], ["cuenta-11", 1606],
];
const CORTE_B = 400;
const CORTE_C = 1420;
export const FASE1_DUR = 1830;

// Palabra gigante de fondo, en contorno, que corre más lento que lo de adelante
const Palabra: React.FC<{ f: number; from: number; to: number; children: string; top?: number }> = ({ f, from, to, children, top = 640 }) => {
  if (f < from - 2 || f > to + 14) return null;
  return (
    <div
      style={{
        position: "absolute", left: -200, right: -200, top, textAlign: "center", fontFamily: display, fontSize: 340, lineHeight: 1, color: "transparent", whiteSpace: "nowrap",
        WebkitTextStroke: "3px rgba(255,255,255,.12)", letterSpacing: 6, translate: `${-(f - from) * 0.7 + 60}px 0px`, opacity: r(f, from, from + 14) * (1 - r(f, to, to + 14)),
      }}
    >
      {children}
    </div>
  );
};
const Vineta: React.FC = () => <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(0,0,0,.65) 100%)", pointerEvents: "none" }} />;

// ── A · Hoy hiciste 5 servicios ─────────────────────────────────────
const CHIP0 = 44;
const JUNTA = 160; // los cinco servicios se juntan en la multiplicación
const Servicios: React.FC<{ f: number }> = ({ f }) => {
  const t1 = r(f, 18, 34);
  const n5 = pop(f, 34, 56);
  const junta = r(f, JUNTA, JUNTA + 26, Easing.inOut(Easing.cubic));
  const mult = r(f, JUNTA + 14, JUNTA + 32);
  const igual = pop(f, 214, 238);
  const pregunta = r(f, 268, 284);
  const preg = interpolate(f, [272, 282], [1.9, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const t = f - 282;
  const shake = t >= 0 && t < 14 ? Math.sin(t * 2.6) * 14 * (1 - t / 14) : 0;
  const cuenta = r(f, 318, 334);
  const atenua = 1 - pregunta * 0.8;
  return (
    <Camara f={f} zoom={[1, 1.05]} from={0} to={CORTE_B + 10}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #1f2230, #06070a 75%)", translate: `${shake}px 0px` }} />
      <Palabra f={f} from={0} to={CORTE_B}>HOY</Palabra>
      <div style={{ position: "absolute", inset: 0, opacity: atenua, filter: pregunta > 0.01 ? `blur(${pregunta * 10}px)` : undefined, translate: `${shake}px 0px` }}>
        <div style={{ position: "absolute", top: 330, left: SAFE.left, width: W, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 64, color: "#eef0f5", opacity: t1, translate: `0px ${(1 - t1) * 30}px` }}>
          Hoy hiciste
        </div>
        <div style={{ position: "absolute", top: 400, left: SAFE.left, width: W, textAlign: "center", fontFamily: display, fontSize: 200, lineHeight: 1, color: AMBER, opacity: Math.min(1, n5 * 1.4), scale: 0.6 + n5 * 0.4 }}>
          5 servicios
        </div>
        {/* las cinco tarjetas de servicio: entran de a una y después se juntan en «5 ×» */}
        {Array.from({ length: SERVICIOS }).map((_, i) => {
          const e = pop(f, CHIP0 + i * 9, CHIP0 + i * 9 + 20);
          const x0 = SAFE.left + 14 + i * ((W - 28) / SERVICIOS) + 6;
          const x1 = 540 - 84;
          const x = x0 + (x1 - x0) * junta;
          return (
            <div
              key={i}
              style={{
                position: "absolute", left: x, top: 700, width: (W - 28) / SERVICIOS - 12, height: 210, borderRadius: 26, background: "#181b23", border: "2px solid #2a2f3a",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: AMBER, boxShadow: "0 24px 40px rgba(0,0,0,.5)",
                opacity: Math.min(1, e * 1.5) * (1 - mult), scale: 0.5 + e * 0.5 - junta * 0.2, translate: `0px ${(1 - e) * 80 + junta * 40}px`, rotate: `${(i - 2) * 3 * (1 - junta)}deg`,
              }}
            >
              <Ico n="car" s={56} w={2.2} />
              <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 24, color: "#eef0f5" }}>$ 70.000</div>
            </div>
          );
        })}
        <div style={{ position: "absolute", top: 760, left: SAFE.left, width: W, textAlign: "center", fontFamily: mono, fontWeight: 700, fontSize: 84, color: "#eef0f5", opacity: mult, scale: 0.8 + mult * 0.2 }}>
          5 × $ 70.000
        </div>
        <div style={{ position: "absolute", top: 880, left: SAFE.left, width: W, textAlign: "center", fontFamily: display, fontSize: 210, lineHeight: 1, color: AMBER, opacity: Math.min(1, igual * 1.4), scale: 0.6 + igual * 0.4 }}>
          = {peso(COBRADO)}
        </div>
      </div>
      {f >= 270 ? (
        <div style={{ position: "absolute", top: 560, left: SAFE.left - 30, width: W + 60, textAlign: "center", zIndex: 5 }}>
          <div style={{ fontFamily: display, fontSize: 190, lineHeight: 0.9, color: "#f2f3f6", opacity: pregunta, scale: preg, textShadow: "0 12px 50px rgba(0,0,0,.7)" }}>¿Eso te llevás?</div>
          <div style={{ fontFamily: display, fontSize: 120, lineHeight: 1, color: AMBER, marginTop: 40, opacity: cuenta, translate: `0px ${(1 - cuenta) * 30}px` }}>Hagamos la cuenta.</div>
        </div>
      ) : null}
    </Camara>
  );
};

// ── B · La cuenta, renglón por renglón ──────────────────────────────
// cuánto se restó hasta el cuadro f (cada gasto baja el número en 22 cuadros)
const restado = (f: number) => PASOS.reduce((s, p) => s + p.monto * r(f, p.resta, p.resta + 22, Easing.out(Easing.cubic)), 0);
const FOCO_Y = 690;
const FILA_Y = 975;
const FILA_H = 42;
// margen extra para que el zoom de cámara no saque nada de la zona segura
const IN_L = SAFE.left + 20;
const IN_W = W - 40;
const Cuenta: React.FC<{ f: number }> = ({ f }) => {
  const head = r(f, CORTE_B, CORTE_B + 20);
  const queda = COBRADO - restado(f);
  const gastos = COBRADO - queda;
  // golpe en el número cada vez que se resta
  const golpe = PASOS.reduce((g, p) => {
    const k = f - p.resta - 4;
    return k >= 0 && k < 16 ? Math.max(g, 1 - k / 16) : g;
  }, 0);
  const actual = [...PASOS].reverse().find((p) => f >= p.at - 4);
  return (
    <Camara f={f} zoom={[1, 1.05]} from={CORTE_B} to={CORTE_C + 10} rot={-0.6}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 38%, #1d2029, #050608 75%)" }} />
      {PASOS.map((p, i) => (
        <Palabra key={p.palabra} f={f} from={p.at} to={i < PASOS.length - 1 ? PASOS[i + 1].at : CORTE_C} top={700}>
          {p.palabra}
        </Palabra>
      ))}
      {/* arriba: lo que te queda, que baja con cada gasto */}
      <div style={{ position: "absolute", top: 300, left: IN_L, width: IN_W, opacity: head, translate: `0px ${(1 - head) * -30}px` }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontWeight: 700, fontSize: 28, letterSpacing: 3, color: GRIS }}>
          <span>TE QUEDA</span>
          <span>COBRASTE {peso(COBRADO)}</span>
        </div>
        <div style={{ fontFamily: display, fontSize: 180, lineHeight: 1, color: AMBER, marginTop: 6, whiteSpace: "nowrap", scale: 1 + golpe * 0.05, transformOrigin: "0% 50%", translate: `${Math.sin(golpe * 9) * 6 * golpe}px 0px` }}>
          {peso(Math.round(queda / 100) * 100)}
        </div>
        {/* la barra: ámbar lo que queda, gris lo que se comen los gastos */}
        <div style={{ position: "relative", height: 36, borderRadius: 10, background: AMBER, marginTop: 16, overflow: "hidden" }}>
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${(gastos / COBRADO) * 100}%`, background: "repeating-linear-gradient(135deg, #3a4050 0 12px, #2c313d 12px 24px)", borderLeft: gastos > 0 ? "4px solid #050608" : undefined }} />
          <div style={{ position: "absolute", left: "50%", top: -4, bottom: -4, width: 0, borderLeft: "3px dashed rgba(5,6,8,.55)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", fontFamily: mono, fontWeight: 700, fontSize: 28, color: "#c9cfdc", marginTop: 10, opacity: gastos > 0 ? 1 : 0 }}>
          Gastos {peso(Math.round(gastos / 100) * 100)}
        </div>
      </div>
      {/* al centro: la cuenta del gasto que se está diciendo */}
      {actual
        ? PASOS.map((p) => {
            if (p !== actual && !(f < p.resta + 24 && f >= p.at)) return null;
            const e = r(f, p.at - 4, p.at + 12);
            const vuela = r(f, p.resta, p.resta + 20, Easing.in(Easing.cubic));
            const res = pop(f, p.res, p.res + 18);
            const sale = p === actual ? 0 : 1;
            return (
              <div key={p.label} style={{ position: "absolute", top: FOCO_Y, left: SAFE.left, width: W, textAlign: "center", opacity: e * (1 - sale) }}>
                <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 50, color: "#eef0f5", opacity: 1 - vuela * 0.6, translate: `0px ${(1 - e) * 24}px` }}>{p.label}</div>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 22px", marginTop: 14, minHeight: 64, opacity: 1 - vuela * 0.6 }}>
                  {p.partes.map(([txt, at]) => {
                    const k = pop(f, at, at + 14);
                    return (
                      <span key={txt} style={{ fontFamily: mono, fontWeight: 700, fontSize: txt.length > 12 ? 44 : 52, color: txt.startsWith("=") ? AMBER : "#c9cfdc", opacity: Math.min(1, k * 1.4), scale: 0.7 + k * 0.3, display: "inline-block" }}>
                        {txt}
                      </span>
                    );
                  })}
                </div>
                {p.nota ? (
                  <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, letterSpacing: 2, color: AMBER, marginTop: 6, opacity: r(f, 1340, 1354) * (1 - vuela) }}>
                    {p.nota.toUpperCase()}
                  </div>
                ) : null}
                {/* el resultado sube y se resta del número de arriba */}
                <div
                  style={{
                    fontFamily: display, fontSize: 150, lineHeight: 1, color: "#f2f3f6", marginTop: p.nota ? 0 : 10, whiteSpace: "nowrap",
                    opacity: Math.min(1, res * 1.4) * (1 - vuela), scale: (0.6 + res * 0.4) * (1 - vuela * 0.6), translate: `0px ${-vuela * 380}px`,
                  }}
                >
                  − {peso(p.monto)}
                </div>
              </div>
            );
          })
        : null}
      {/* abajo: los renglones que ya se restaron, como en la servilleta */}
      {PASOS.map((p, i) => {
        const e = r(f, p.resta + 10, p.resta + 26);
        if (e <= 0) return null;
        return (
          <div
            key={p.label}
            style={{
              position: "absolute", top: FILA_Y + i * FILA_H, left: IN_L, width: IN_W, height: FILA_H, display: "flex", justifyContent: "space-between", alignItems: "center",
              borderBottom: "2px dashed rgba(255,255,255,.12)", fontFamily: mono, fontWeight: 700, fontSize: 28, color: "#c9cfdc", opacity: e, translate: `${(1 - e) * 40}px 0px`,
            }}
          >
            <span>{p.label}</span>
            <span>− {peso(p.monto)}</span>
          </div>
        );
      })}
    </Camara>
  );
};

// ── C · Lo que queda de verdad ──────────────────────────────────────
const Resultado: React.FC<{ f: number }> = ({ f }) => {
  const t1 = r(f, CORTE_C + 16, CORTE_C + 32);
  const num = pop(f, CORTE_C + 26, CORTE_C + 50);
  const div = r(f, 1612, 1628);
  const ps = pop(f, 1650, 1674);
  const barra = r(f, 1672, 1712, Easing.inOut(Easing.cubic));
  const mitad = interpolate(f, [1716, 1726], [2.2, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const t = f - 1726;
  const shake = t >= 0 && t < 16 ? Math.sin(t * 2.6) * 16 * (1 - t / 16) : 0;
  return (
    <Camara f={f} zoom={[1.06, 1]} from={CORTE_C} to={FASE1_DUR}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #1f2230, #050608 72%)", translate: `${shake}px 0px` }}>
        <Palabra f={f} from={CORTE_C} to={FASE1_DUR} top={640}>LA MITAD</Palabra>
        <div style={{ position: "absolute", top: 300, left: SAFE.left, width: W, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 60, color: "#eef0f5", opacity: t1 }}>Te quedan</div>
        <div style={{ position: "absolute", top: 370, left: SAFE.left - 40, width: W + 80, textAlign: "center", fontFamily: display, fontSize: 230, lineHeight: 1, color: AMBER, opacity: Math.min(1, num * 1.4), scale: 0.6 + num * 0.4 }}>
          {peso(QUEDA)}
        </div>
        <div style={{ position: "absolute", top: 640, left: SAFE.left, width: W, textAlign: "center", fontFamily: mono, fontWeight: 700, fontSize: 50, color: "#c9cfdc", opacity: div, translate: `0px ${(1 - div) * 20}px` }}>
          {peso(QUEDA)} ÷ 5 servicios
        </div>
        <div style={{ position: "absolute", top: 710, left: SAFE.left - 20, width: W + 40, textAlign: "center", fontFamily: display, fontSize: 120, lineHeight: 1, color: "#f2f3f6", opacity: Math.min(1, ps * 1.4), scale: 0.7 + ps * 0.3 }}>
          = {peso(POR_SERVICIO)} <span style={{ fontSize: 64, color: GRIS }}>por servicio</span>
        </div>
        {/* un servicio de $ 70.000, partido: lo que te deja y lo que se va en gastos */}
        <div style={{ position: "absolute", top: 880, left: SAFE.left, width: W, opacity: r(f, 1664, 1680) }}>
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 28, letterSpacing: 3, color: GRIS, marginBottom: 12 }}>UN SERVICIO DE $ 70.000</div>
          <div style={{ position: "relative", height: 70, borderRadius: 14, background: AMBER, overflow: "hidden" }}>
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${barra * (1 - POR_SERVICIO / PRECIO) * 100}%`, background: "repeating-linear-gradient(135deg, #3a4050 0 14px, #2c313d 14px 28px)", borderLeft: "5px solid #050608" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontWeight: 700, fontSize: 30, marginTop: 12, opacity: barra }}>
            <span style={{ color: AMBER }}>Te deja {peso(POR_SERVICIO)}</span>
            <span style={{ color: "#c9cfdc" }}>Gastos {peso(PRECIO - POR_SERVICIO)}</span>
          </div>
        </div>
        {f >= 1716 ? (
          <div style={{ position: "absolute", top: 1040, left: SAFE.left - 40, width: W + 80, textAlign: "center", fontFamily: display, fontSize: 200, lineHeight: 1, color: "#f2f3f6", scale: mitad, opacity: r(f, 1716, 1720), textShadow: "0 12px 50px rgba(0,0,0,.7)" }}>
            La <span style={{ color: AMBER }}>mitad.</span>
          </div>
        ) : null}
      </AbsoluteFill>
    </Camara>
  );
};

// ── Armado ──────────────────────────────────────────────────────────
export const Fase1: React.FC<{ guia?: boolean }> = ({ guia = false }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#050608", overflow: "hidden" }}>
      <Toma f={f} from={0} to={CORTE_B}>
        <Servicios f={f} />
      </Toma>
      <Toma f={f} from={CORTE_B} to={CORTE_C}>
        <Cuenta f={f} />
      </Toma>
      <Toma f={f} from={CORTE_C} to={FASE1_DUR + 20}>
        <Resultado f={f} />
      </Toma>
      <Vineta />
      <Grano f={f} />
      {VOZ.map(([n, at]) => (
        <Audio key={n} name={n} src={staticFile(`vo/${n}.wav`)} from={at} volume={1} />
      ))}
      {Array.from({ length: SERVICIOS }).map((_, i) => (
        <Audio key={`c${i}`} name="Servicio" src={staticFile("sfx/mouse-click.wav")} from={CHIP0 + i * 9} volume={0.35} />
      ))}
      <Audio name="Total" src={staticFile("sfx/ding.wav")} from={216} volume={0.4} />
      <Audio name="Pregunta" src={staticFile("sfx/whip.wav")} from={274} volume={0.7} />
      {[CORTE_B, CORTE_C].map((c) => (
        <Audio key={`w${c}`} name="Corte" src={staticFile("sfx/whoosh.wav")} from={c - 6} volume={0.45} />
      ))}
      {PASOS.map((p) => (
        <React.Fragment key={p.label}>
          {p.partes.map(([t, at]) => (
            <Audio key={t} name="Cuenta" src={staticFile("sfx/mouse-click.wav")} from={at} volume={0.25} />
          ))}
          <Audio name="Resultado" src={staticFile("sfx/page-turn.wav")} from={p.res} volume={0.3} />
          <Audio name="Resta" src={staticFile("sfx/whoosh.wav")} from={p.resta} volume={0.3} />
        </React.Fragment>
      ))}
      <Audio name="Te quedan" src={staticFile("sfx/ding.wav")} from={CORTE_C + 28} volume={0.4} />
      <Audio name="La mitad" src={staticFile("sfx/whip.wav")} from={1718} volume={0.8} />
      {guia ? <ReelsGuide /> : null}
    </AbsoluteFill>
  );
};
