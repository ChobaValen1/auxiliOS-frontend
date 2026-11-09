import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import { clamp, display, mono, sans } from "../theme";
import { SAFE } from "../gastos/common";
import { ReelsGuide } from "../monogrua/StepFrame";
import { Ico } from "../solo/ui";
import { Camara, Grano, Toma } from "../reel/Gancho";
import { Grua } from "./Grua";

// Reel «Hagamos la cuenta», fase 1: el gancho y la bola de nieve. Cinco servicios de $ 70.000
// y, renglón por renglón, cada gasto con su cuenta a la vista: primero los variables (lo que
// gastás cada vez que salís) y, aparte, la parte del día de los fijos del mes. Oscuro, 60 fps.
export const W = SAFE.right - SAFE.left;
export const AMBER = "#f5a623";
export const GRIS = "#9aa3b8";
export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const r = (f: number, a: number, b: number, e = ease) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: e });
export const pop = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
export const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const peso = (n: number) => `$ ${fmt(n)}`;
// golpe de texto: entra grande y cae a su tamaño
export const slam = (f: number, at: number) => interpolate(f, [at, at + 10], [2, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
export const temblor = (f: number, at: number, fuerza = 16) => {
  const t = f - at;
  return t >= 0 && t < 16 ? Math.sin(t * 2.6) * fuerza * (1 - t / 16) : 0;
};

// ── Íconos de los gastos (trazo, estilo lucide) ─────────────────────
export const ICONOS: Record<string, React.ReactNode> = {
  gasoil: (
    <>
      <path d="M3 22h12M4 9h10M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" />
      <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.8a2 2 0 0 0-.6-1.4L18 5" />
    </>
  ),
  peaje: (
    <>
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2M13 11v2M13 17v2" />
    </>
  ),
  comida: <path d="M6 2v2M10 2v2M14 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" />,
  goma: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
    </>
  ),
  llave: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" />,
  escudo: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  cal: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  ruta: (
    <>
      <circle cx="6" cy="19" r="3" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
      <circle cx="18" cy="5" r="3" />
    </>
  ),
  casa: <path d="M3 10.5 12 3l9 7.5V21H3zM9 21v-6h6v6" />,
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  recibo: <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1zM8 8h8M8 12h8M8 16h5" />,
};
export const Icono: React.FC<{ n: string; s: number; c?: string; w?: number }> = ({ n, s, c = "currentColor", w = 2 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
    {ICONOS[n]}
  </svg>
);
// cuadrito negro con el ícono en ámbar
export const Chip: React.FC<{ n: string; s: number; fijo?: boolean }> = ({ n, s, fijo }) => (
  <span
    style={{
      width: s, height: s, borderRadius: s * 0.28, background: fijo ? "rgba(245,166,35,.14)" : "#1c1f28", border: `2px solid ${fijo ? AMBER : "#2e3440"}`,
      display: "inline-grid", placeItems: "center", color: AMBER, flexShrink: 0,
    }}
  >
    <Icono n={n} s={s * 0.56} w={2.2} />
  </span>
);

// ── Los números (todos cierran) ─────────────────────────────────────
export const SERVICIOS = 5;
export const PRECIO = 70000;
export const COBRADO = SERVICIOS * PRECIO; // 350.000
export const KM = 180;
export const KM_POR_LITRO = 10;
export const LITRO = 1500;
export const DESGASTE_KM = 100;
export const FIJOS_MES = 622000;
type Paso = { palabra: string; ico: string; label: string; partes: [string, number][]; monto: number; at: number; res: number; resta: number; fijo?: boolean };
export const PASOS: Paso[] = [
  // 180 km ÷ 10 km/L = 18 L × $ 1.500
  { palabra: "GASOIL", ico: "gasoil", label: "Gasoil", partes: [["180 km", 1146], ["÷ 10 km/L", 1240], ["= 18 L", 1300], ["× $ 1.500", 1345]], monto: (KM / KM_POR_LITRO) * LITRO, at: 1140, res: 1372, resta: 1404 },
  { palabra: "PEAJES", ico: "peaje", label: "Peajes", partes: [["3 × $ 1.400", 1436]], monto: 4200, at: 1430, res: 1460, resta: 1486 },
  { palabra: "COMIDA", ico: "comida", label: "Comida y café", partes: [], monto: 12000, at: 1510, res: 1518, resta: 1546 },
  { palabra: "GOMERÍA", ico: "goma", label: "Gomería · un pinchazo", partes: [], monto: 25000, at: 1570, res: 1580, resta: 1614 },
  // cubiertas, aceite y service: $ 100 por km
  { palabra: "DESGASTE", ico: "llave", label: "Cubiertas y aceite", partes: [["180 km", 1690], ["× $ 100 por km", 1736]], monto: KM * DESGASTE_KM, at: 1645, res: 1786, resta: 1820 },
  // los fijos del mes, la parte de hoy: $ 622.000 ÷ 30
  { palabra: "FIJOS", ico: "cal", label: "Fijos · la parte de hoy", partes: [["$ 622.000 por mes", 2110], ["÷ 30 días", 2160]], monto: 20700, at: 2096, res: 2204, resta: 2240, fijo: true },
];
const VARIABLES = PASOS.filter((p) => !p.fijo);
export const GASTOS = PASOS.reduce((s, p) => s + p.monto, 0); // 106.900
export const QUEDA = COBRADO - GASTOS; // 243.100
export const POR_SERVICIO = QUEDA / SERVICIOS; // 48.620

const VOZ: [string, number][] = [
  ["cta-h1", 24], ["cta-h2", 198],
  ["cta-s1", 340], ["cta-s2", 440], ["cta-s3", 630], ["cta-s4", 846],
  ["cta-v0", 962], ["cta-g1", 1140], ["cta-g2", 1430], ["cta-g3", 1510], ["cta-g4", 1570], ["cta-g5", 1645], ["cta-f1", 1860],
  ["cta-r1", 2306], ["cta-r2", 2460],
];
const CORTE_A = 330;
const CORTE_B = 950;
const FIJOS_CARD = 1860; // el comentario de los fijos
const CORTE_C = 2290;
const TERCIO = 2694;
export const FASE1_DUR = 2850;

// Palabra gigante de fondo, en contorno, que corre más lento que lo de adelante
export const Palabra: React.FC<{ f: number; from: number; to: number; children: string; top?: number }> = ({ f, from, to, children, top = 640 }) => {
  if (f < from - 2 || f > to + 14) return null;
  return (
    <div
      style={{
        position: "absolute", left: -300, right: -300, top, textAlign: "center", fontFamily: display, fontSize: 340, lineHeight: 1, color: "transparent", whiteSpace: "nowrap",
        WebkitTextStroke: "3px rgba(255,255,255,.12)", letterSpacing: 6, translate: `${-(f - from) * 0.7 + 60}px 0px`, opacity: r(f, from, from + 14) * (1 - r(f, to, to + 14)),
      }}
    >
      {children}
    </div>
  );
};
export const Vineta: React.FC = () => <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(0,0,0,.65) 100%)", pointerEvents: "none" }} />;

// ── 0 · Gancho: la grúa arranca y sale ──────────────────────────────
const ARRANCA = 14;
const SALE = 64;
const Gancho: React.FC<{ f: number }> = ({ f }) => {
  // se mueve con aceleración y la cámara la sigue un poco
  const k = interpolate(f, [SALE, CORTE_A + 10], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const dx = k * 620;
  const giro = (dx / 46) * (180 / Math.PI) * (840 / 760);
  const motor = f >= ARRANCA && f < ARRANCA + 30 ? Math.sin((f - ARRANCA) * 3.1) * 4 * (1 - (f - ARRANCA) / 30) : f >= ARRANCA ? Math.sin(f * 2.3) * 0.8 : 0;
  const encendida = f >= ARRANCA + 6;
  const baliza = Math.floor(f / 9) % 2 === 0;
  const t1 = r(f, 24, 40);
  const t2 = r(f, 96, 112);
  const sale = r(f, 192, 204);
  const golpe = slam(f, 200);
  const g2 = slam(f, 236);
  const shake = temblor(f, 210) + temblor(f, 246, 20);
  const x0 = 10;
  return (
    <Camara f={f} zoom={[1.04, 1]} from={0} to={CORTE_A + 10} rot={0.6}>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, #07080c 0%, #10131b 55%, #161a24 70%, #0b0c10 100%)", translate: `${shake}px 0px` }}>
        {/* barrio de noche: casas bajas, postes y una luz de calle */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, translate: `${-dx * 0.15}px 0px` }}>
          {Array.from({ length: 12 }).map((_, i) => {
            const h = 120 + random(`h${i}`) * 140;
            return <div key={i} style={{ position: "absolute", left: -100 + i * 130, top: 960 - h, width: 120, height: h, background: "#0d1017", borderTop: "2px solid #171b25" }} />;
          })}
          {[180, 760].map((x) => (
            <React.Fragment key={x}>
              <div style={{ position: "absolute", left: x, top: 560, width: 8, height: 400, background: "#151922" }} />
              <div style={{ position: "absolute", left: x - 160, top: 520, width: 330, height: 330, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,214,150,.16), transparent 65%)" }} />
            </React.Fragment>
          ))}
        </div>
        {/* calle */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 960, height: 8, background: "#20242e" }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 968, bottom: 0, background: "linear-gradient(180deg, #14171e, #0a0b0e)" }} />
        <div style={{ position: "absolute", left: -200, right: -200, top: 1150, height: 10, background: "repeating-linear-gradient(90deg, rgba(255,255,255,.22) 0 90px, transparent 90px 170px)", translate: `${-dx * 0.2}px 0px` }} />
        {/* humo del escape al arrancar */}
        {Array.from({ length: 7 }).map((_, i) => {
          const at = ARRANCA + 4 + i * 6;
          const p = (f - at) / 60;
          if (p < 0 || p > 1) return null;
          return (
            <div
              key={i}
              style={{
                position: "absolute", left: x0 + dx * (1 - p * 0.3) + 470 - p * 120, top: 740 - p * 200, width: 70 + p * 140, height: 70 + p * 140, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(180,186,200,.35), transparent 70%)", opacity: 1 - p,
              }}
            />
          );
        })}
        {/* polvo atrás de las ruedas cuando acelera */}
        {k > 0.05
          ? Array.from({ length: 10 }).map((_, i) => {
              const p = (f * 0.04 + i / 10) % 1;
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute", left: x0 + dx + 60 - p * 260, top: 1000 - p * 60, width: 50 + p * 90, height: 30 + p * 50, borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(150,140,120,.3), transparent 70%)", opacity: (1 - p) * Math.min(1, k * 4),
                  }}
                />
              );
            })
          : null}
        <div style={{ position: "absolute", left: x0 + dx, top: 690, translate: `0px ${motor}px` }}>
          <Grua giro={giro} encendida={encendida} baliza={baliza} width={760} />
        </div>
      </AbsoluteFill>
      {/* texto */}
      <div style={{ position: "absolute", top: 300, left: SAFE.left, width: W, textAlign: "center", opacity: 1 - sale, filter: sale > 0 ? `blur(${sale * 14}px)` : undefined }}>
        <div style={{ fontFamily: display, fontSize: 132, lineHeight: 1, color: "#f2f3f6", opacity: t1, translate: `0px ${(1 - t1) * 30}px` }}>Si sos chofer de grúa</div>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 58, color: GRIS, marginTop: 18, opacity: t2, translate: `0px ${(1 - t2) * 20}px` }}>y no estás haciendo esto…</div>
      </div>
      {f >= 200 ? (
        <div style={{ position: "absolute", top: 290, left: SAFE.left - 40, width: W + 80, textAlign: "center", translate: `${shake}px 0px` }}>
          <div style={{ fontFamily: display, fontSize: 104, lineHeight: 1, color: "#f2f3f6", scale: golpe, opacity: r(f, 200, 204) }}>podés estar perdiendo</div>
          {f >= 236 ? <div style={{ fontFamily: display, fontSize: 200, lineHeight: 0.95, color: AMBER, scale: g2, opacity: r(f, 236, 240), textShadow: "0 14px 60px rgba(245,166,35,.35)" }}>mucha plata</div> : null}
        </div>
      ) : null}
    </Camara>
  );
};

// ── A · Hoy hiciste 5 servicios. ¿En realidad eso te llevás? ─────────
const A0 = CORTE_A;
const CHIP0 = A0 + 26;
const JUNTA = 474;
const IGUAL = 556;
const PERO = 632;
const PREG = 690;
const MEJOR = 848;
const Servicios: React.FC<{ f: number }> = ({ f }) => {
  const t1 = r(f, A0 + 10, A0 + 26);
  const n5 = pop(f, A0 + 24, A0 + 46);
  const junta = r(f, JUNTA, JUNTA + 26, Easing.inOut(Easing.cubic));
  const mult = r(f, JUNTA + 14, JUNTA + 32);
  const igual = pop(f, IGUAL, IGUAL + 24);
  // la duda: todo se apaga, la cámara se acerca despacio y el número tiembla
  const duda = r(f, PERO - 4, PERO + 40);
  const pero = r(f, PERO, PERO + 14);
  const preg = r(f, PREG, PREG + 14);
  const pregS = slam(f, PREG);
  const tiembla = f > PREG + 20 && f < MEJOR ? Math.sin(f * 1.9) * 2.5 * r(f, PREG + 20, MEJOR - 20) : 0;
  const parpadeo = f > 760 && f < MEJOR ? (Math.floor(f / 5) % 3 === 0 ? 0.55 : 1) : 1;
  const mejor = r(f, MEJOR, MEJOR + 16);
  const empuje = interpolate(f, [PERO, MEJOR], [1, 1.12], { ...clamp, easing: Easing.inOut(Easing.quad) });
  return (
    <Camara f={f} zoom={[1, 1.03]} from={A0} to={CORTE_B + 10}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #1f2230, #06070a 75%)" }} />
      <AbsoluteFill style={{ background: "#000", opacity: duda * 0.55 }} />
      <Palabra f={f} from={A0} to={PERO}>HOY</Palabra>
      <AbsoluteFill style={{ scale: empuje }}>
        <div style={{ position: "absolute", inset: 0, opacity: (1 - duda * 0.85) * (1 - mejor), filter: duda > 0.01 ? `blur(${duda * 6}px)` : undefined }}>
          <div style={{ position: "absolute", top: 330, left: SAFE.left, width: W, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 64, color: "#eef0f5", opacity: t1, translate: `0px ${(1 - t1) * 30}px` }}>
            Hoy hiciste
          </div>
          <div style={{ position: "absolute", top: 400, left: SAFE.left, width: W, textAlign: "center", fontFamily: display, fontSize: 200, lineHeight: 1, color: AMBER, opacity: Math.min(1, n5 * 1.4), scale: 0.6 + n5 * 0.4 }}>
            5 servicios
          </div>
          {Array.from({ length: SERVICIOS }).map((_, i) => {
            const e = pop(f, CHIP0 + i * 9, CHIP0 + i * 9 + 20);
            const cw = (W - 28) / SERVICIOS;
            const x0 = SAFE.left + 14 + i * cw + 6;
            const x = x0 + (540 - cw / 2 - x0) * junta;
            return (
              <div
                key={i}
                style={{
                  position: "absolute", left: x, top: 700, width: cw - 12, height: 210, borderRadius: 26, background: "#181b23", border: "2px solid #2a2f3a",
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
        </div>
        {/* el total queda solo en el medio de la duda */}
        <div
          style={{
            position: "absolute", left: SAFE.left - 40, width: W + 80, textAlign: "center", fontFamily: display, fontSize: 210, lineHeight: 1, color: AMBER, whiteSpace: "nowrap",
            top: 880 + duda * 60, opacity: Math.min(1, igual * 1.4) * parpadeo * (1 - mejor), scale: (0.6 + igual * 0.4) * (1 + duda * 0.1), translate: `${tiembla}px 0px`,
          }}
        >
          {duda > 0.5 ? "" : "= "}
          {peso(COBRADO)}
        </div>
      </AbsoluteFill>
      {/* la pregunta, con una pausa larga */}
      {f >= PERO ? (
        <div style={{ position: "absolute", top: 320, left: SAFE.left - 30, width: W + 60, textAlign: "center", opacity: 1 - mejor }}>
          <div style={{ fontFamily: sans, fontWeight: 700, fontStyle: "italic", fontSize: 60, color: GRIS, opacity: pero }}>Pero…</div>
          {f >= PREG ? (
            <div style={{ fontFamily: display, fontSize: 120, lineHeight: 0.92, color: "#f2f3f6", marginTop: 16, opacity: preg, scale: pregS, textShadow: "0 12px 50px rgba(0,0,0,.7)" }}>
              ¿en realidad eso
              <br />
              es lo que <span style={{ color: AMBER }}>te llevás?</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {f >= MEJOR ? (
        <div style={{ position: "absolute", top: 560, left: SAFE.left - 30, width: W + 60, textAlign: "center" }}>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 64, color: "#eef0f5", opacity: mejor, translate: `0px ${(1 - mejor) * 30}px` }}>Mejor,</div>
          <div style={{ fontFamily: display, fontSize: 170, lineHeight: 1, color: AMBER, marginTop: 6, opacity: r(f, MEJOR + 18, MEJOR + 32), scale: slam(f, MEJOR + 18) }}>hagamos la cuenta.</div>
        </div>
      ) : null}
    </Camara>
  );
};

// ── B · La cuenta, renglón por renglón ──────────────────────────────
// cuánto se restó hasta el cuadro f (cada gasto baja el número en 22 cuadros)
const restado = (f: number) => PASOS.reduce((s, p) => s + p.monto * r(f, p.resta, p.resta + 22, Easing.out(Easing.cubic)), 0);
const FOCO_Y = 610;
const FILA_Y = 975;
const FILA_H = 42;
// margen extra para que el zoom de cámara no saque nada de la zona segura
const IN_L = SAFE.left + 20;
const IN_W = W - 40;
const INTRO_V = 962; // «Gastos variables: lo que gastás cada vez que salís»

// el comentario de los gastos fijos: entra de costado como una nota aparte
const NotaFijos: React.FC<{ f: number }> = ({ f }) => {
  const e = r(f, FIJOS_CARD, FIJOS_CARD + 20, Easing.out(Easing.back(1.2)));
  const sale = r(f, PASOS[5].at - 10, PASOS[5].at + 10, Easing.in(Easing.cubic));
  if (e <= 0 || sale >= 1) return null;
  const items: [string, string, number][] = [["escudo", "Seguro", 1950], ["recibo", "Cuota de la grúa", 1980], ["cal", "Monotributo", 2010]];
  return (
    <div
      style={{
        position: "absolute", top: FOCO_Y - 10, left: IN_L + 20, width: IN_W - 40, padding: "26px 32px 28px", borderRadius: 30, background: "#16181f", border: `3px solid ${AMBER}`,
        boxShadow: "0 30px 60px rgba(0,0,0,.6)", rotate: `${-2 + (1 - e) * 8}deg`, translate: `${(1 - e) * 700 - sale * 700}px 0px`, opacity: Math.min(1, e * 1.5) * (1 - sale),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ background: AMBER, color: "#14161b", fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 2, padding: "6px 14px", borderRadius: 10 }}>OJO</span>
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 40, color: "#f2f3f6" }}>Aparte, los gastos fijos</span>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 22 }}>
        {items.map(([ico, txt, at]) => {
          const k = pop(f, at, at + 16);
          return (
            <div key={txt} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, opacity: Math.min(1, k * 1.4), scale: 0.6 + k * 0.4 }}>
              <Chip n={ico} s={74} fijo />
              <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 26, color: "#dfe3ea", textAlign: "center" }}>{txt}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 28, color: AMBER, marginTop: 20, textAlign: "center", opacity: r(f, 2050, 2064) }}>TODOS LOS MESES, LABURES O NO</div>
    </div>
  );
};

const Cuenta: React.FC<{ f: number }> = ({ f }) => {
  const head = r(f, CORTE_B, CORTE_B + 20);
  const queda = COBRADO - restado(f);
  const gastos = COBRADO - queda;
  const golpe = PASOS.reduce((g, p) => {
    const k = f - p.resta - 4;
    return k >= 0 && k < 16 ? Math.max(g, 1 - k / 16) : g;
  }, 0);
  const actual = [...PASOS].reverse().find((p) => f >= p.at - 4);
  // presentación de los variables: título y los cinco íconos
  const intro = r(f, INTRO_V, INTRO_V + 16) * (1 - r(f, PASOS[0].at - 12, PASOS[0].at + 4));
  return (
    <Camara f={f} zoom={[1, 1.05]} from={CORTE_B} to={CORTE_C + 10} rot={-0.6}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 38%, #1d2029, #050608 75%)" }} />
      <Palabra f={f} from={INTRO_V} to={PASOS[0].at} top={700}>VARIABLES</Palabra>
      {PASOS.map((p, i) => (
        <Palabra key={p.palabra} f={f} from={p.fijo ? FIJOS_CARD : p.at} to={i < PASOS.length - 1 ? PASOS[i + 1].at : CORTE_C} top={700}>
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
        <div style={{ position: "relative", height: 36, borderRadius: 10, background: AMBER, marginTop: 16, overflow: "hidden" }}>
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${(gastos / COBRADO) * 100}%`, background: "repeating-linear-gradient(135deg, #3a4050 0 12px, #2c313d 12px 24px)", borderLeft: gastos > 0 ? "4px solid #050608" : undefined }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", fontFamily: mono, fontWeight: 700, fontSize: 28, color: "#c9cfdc", marginTop: 10, opacity: gastos > 0 ? 1 : 0 }}>
          Gastos {peso(Math.round(gastos / 100) * 100)}
        </div>
      </div>
      {/* presentación: qué son los gastos variables */}
      {intro > 0 ? (
        <div style={{ position: "absolute", top: FOCO_Y + 10, left: IN_L, width: IN_W, textAlign: "center", opacity: intro }}>
          <div style={{ fontFamily: display, fontSize: 130, lineHeight: 1, color: "#f2f3f6", scale: slam(f, INTRO_V) }}>Gastos variables</div>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 42, color: GRIS, marginTop: 10, opacity: r(f, INTRO_V + 40, INTRO_V + 56) }}>Lo que gastás cada vez que salís</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 30 }}>
            {VARIABLES.map((p, i) => {
              const k = pop(f, INTRO_V + 70 + i * 8, INTRO_V + 88 + i * 8);
              return (
                <span key={p.ico} style={{ opacity: Math.min(1, k * 1.4), scale: 0.5 + k * 0.5, translate: `0px ${(1 - k) * 40}px`, display: "inline-block" }}>
                  <Chip n={p.ico} s={104} />
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
      <NotaFijos f={f} />
      {/* al centro: la cuenta del gasto que se está diciendo */}
      {actual
        ? PASOS.map((p) => {
            if (p !== actual && !(f < p.resta + 24 && f >= p.at)) return null;
            // mientras está la nota de los fijos, el centro queda para ella
            if (!p.fijo && f >= FIJOS_CARD - 6) return null;
            const e = r(f, p.at - 4, p.at + 12);
            const vuela = r(f, p.resta, p.resta + 20, Easing.in(Easing.cubic));
            const res = pop(f, p.res, p.res + 18);
            const sale = p === actual ? 0 : 1;
            const ic = pop(f, p.at - 2, p.at + 18);
            return (
              <div key={p.label} style={{ position: "absolute", top: FOCO_Y, left: IN_L, width: IN_W, textAlign: "center", opacity: e * (1 - sale) }}>
                <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 3, color: AMBER, opacity: 1 - vuela * 0.6 }}>{p.fijo ? "GASTO FIJO" : "GASTO VARIABLE"}</div>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 20, marginTop: 10, opacity: 1 - vuela * 0.6, translate: `0px ${(1 - e) * 24}px` }}>
                  <span style={{ scale: 0.5 + ic * 0.5, rotate: `${(1 - ic) * -40}deg`, display: "inline-block" }}>
                    <Chip n={p.ico} s={76} fijo={p.fijo} />
                  </span>
                  <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 50, color: "#eef0f5" }}>{p.label}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 22px", marginTop: 12, minHeight: 60, opacity: 1 - vuela * 0.6 }}>
                  {p.partes.map(([txt, at]) => {
                    const k = pop(f, at, at + 14);
                    return (
                      <span key={txt} style={{ fontFamily: mono, fontWeight: 700, fontSize: txt.length > 12 ? 44 : 52, color: txt.startsWith("=") ? AMBER : "#c9cfdc", opacity: Math.min(1, k * 1.4), scale: 0.7 + k * 0.3, display: "inline-block" }}>
                        {txt}
                      </span>
                    );
                  })}
                </div>
                {/* el resultado sube y se resta del número de arriba */}
                <div
                  style={{
                    fontFamily: display, fontSize: 140, lineHeight: 1, color: "#f2f3f6", marginTop: 6, whiteSpace: "nowrap",
                    opacity: Math.min(1, res * 1.4) * (1 - vuela), scale: (0.6 + res * 0.4) * (1 - vuela * 0.6), translate: `0px ${-vuela * 400}px`,
                  }}
                >
                  − {peso(p.monto)}
                </div>
              </div>
            );
          })
        : null}
      {/* abajo: los renglones que ya se restaron, cada uno con su ícono */}
      {PASOS.map((p, i) => {
        const e = r(f, p.resta + 10, p.resta + 26);
        if (e <= 0) return null;
        return (
          <div
            key={p.label}
            style={{
              position: "absolute", top: FILA_Y + i * FILA_H, left: IN_L, width: IN_W, height: FILA_H, display: "flex", alignItems: "center", gap: 12,
              borderBottom: p.fijo ? undefined : "2px dashed rgba(255,255,255,.12)", borderTop: p.fijo ? `2px solid ${AMBER}` : undefined,
              fontFamily: mono, fontWeight: 700, fontSize: 27, color: p.fijo ? AMBER : "#c9cfdc", opacity: e, translate: `${(1 - e) * 40}px 0px`,
            }}
          >
            <span style={{ color: AMBER, display: "inline-grid", placeItems: "center" }}>
              <Icono n={p.ico} s={26} w={2.2} />
            </span>
            <span style={{ flex: 1 }}>{p.label}</span>
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
  const div = r(f, 2470, 2486);
  const ps = pop(f, 2566, 2590);
  const barra = r(f, 2590, 2640, Easing.inOut(Easing.cubic));
  const shake = temblor(f, TERCIO + 10);
  return (
    <Camara f={f} zoom={[1.06, 1]} from={CORTE_C} to={FASE1_DUR}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #1f2230, #050608 72%)", translate: `${shake}px 0px` }}>
        <Palabra f={f} from={CORTE_C} to={FASE1_DUR} top={640}>UN TERCIO</Palabra>
        <div style={{ position: "absolute", top: 300, left: SAFE.left, width: W, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 60, color: "#eef0f5", opacity: t1 }}>Te quedan</div>
        <div style={{ position: "absolute", top: 370, left: SAFE.left - 40, width: W + 80, textAlign: "center", fontFamily: display, fontSize: 230, lineHeight: 1, color: AMBER, opacity: Math.min(1, num * 1.4), scale: 0.6 + num * 0.4 }}>
          {peso(QUEDA)}
        </div>
        <div style={{ position: "absolute", top: 630, left: SAFE.left, width: W, textAlign: "center", fontFamily: mono, fontWeight: 700, fontSize: 48, color: "#c9cfdc", opacity: div, translate: `0px ${(1 - div) * 20}px` }}>
          {peso(QUEDA)} ÷ 5 servicios
        </div>
        <div style={{ position: "absolute", top: 696, left: SAFE.left - 20, width: W + 40, textAlign: "center", fontFamily: display, fontSize: 116, lineHeight: 1, color: "#f2f3f6", opacity: Math.min(1, ps * 1.4), scale: 0.7 + ps * 0.3 }}>
          = {peso(POR_SERVICIO)} <span style={{ fontSize: 62, color: GRIS }}>por servicio</span>
        </div>
        <div style={{ position: "absolute", top: 856, left: IN_L, width: IN_W, opacity: r(f, 2580, 2596) }}>
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 28, letterSpacing: 3, color: GRIS, marginBottom: 12 }}>UN SERVICIO DE $ 70.000</div>
          <div style={{ position: "relative", height: 70, borderRadius: 14, background: AMBER, overflow: "hidden" }}>
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${barra * (1 - POR_SERVICIO / PRECIO) * 100}%`, background: "repeating-linear-gradient(135deg, #3a4050 0 14px, #2c313d 14px 28px)", borderLeft: "5px solid #050608" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontWeight: 700, fontSize: 30, marginTop: 12, opacity: barra }}>
            <span style={{ color: AMBER }}>Te deja {peso(POR_SERVICIO)}</span>
            <span style={{ color: "#c9cfdc" }}>Gastos {peso(PRECIO - POR_SERVICIO)}</span>
          </div>
        </div>
        {f >= TERCIO ? (
          <div style={{ position: "absolute", top: 1036, left: SAFE.left - 40, width: W + 80, textAlign: "center", fontFamily: display, lineHeight: 0.95, scale: slam(f, TERCIO), opacity: r(f, TERCIO, TERCIO + 4), textShadow: "0 12px 50px rgba(0,0,0,.7)" }}>
            <div style={{ fontSize: 120, color: "#f2f3f6" }}>Casi un tercio</div>
            <div style={{ fontSize: 96, color: AMBER }}>se fue en gastos.</div>
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
      <Toma f={f} from={0} to={CORTE_A}>
        <Gancho f={f} />
      </Toma>
      <Toma f={f} from={CORTE_A} to={CORTE_B}>
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
      {/* sonido */}
      <Audio name="Sale" src={staticFile("sfx/whoosh.wav")} from={SALE + 40} volume={0.35} />
      <Audio name="Podés estar perdiendo" src={staticFile("sfx/whip.wav")} from={202} volume={0.6} />
      <Audio name="Mucha plata" src={staticFile("sfx/whip.wav")} from={238} volume={0.8} />
      {Array.from({ length: SERVICIOS }).map((_, i) => (
        <Audio key={`c${i}`} name="Servicio" src={staticFile("sfx/mouse-click.wav")} from={CHIP0 + i * 9} volume={0.35} />
      ))}
      <Audio name="Total" src={staticFile("sfx/ding.wav")} from={IGUAL + 2} volume={0.4} />
      <Audio name="Pregunta" src={staticFile("sfx/whip.wav")} from={PREG + 2} volume={0.7} />
      <Audio name="Hagamos la cuenta" src={staticFile("sfx/whip.wav")} from={MEJOR + 20} volume={0.6} />
      {[CORTE_A, CORTE_B, CORTE_C].map((c) => (
        <Audio key={`w${c}`} name="Corte" src={staticFile("sfx/whoosh.wav")} from={c - 6} volume={0.45} />
      ))}
      <Audio name="Variables" src={staticFile("sfx/whip.wav")} from={INTRO_V + 2} volume={0.45} />
      <Audio name="Nota fijos" src={staticFile("sfx/page-turn.wav")} from={FIJOS_CARD} volume={0.4} />
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
      <Audio name="Un tercio" src={staticFile("sfx/whip.wav")} from={TERCIO + 2} volume={0.8} />
      {guia ? <ReelsGuide /> : null}
    </AbsoluteFill>
  );
};
