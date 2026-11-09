import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, interpolate, Series, staticFile, useCurrentFrame } from "remotion";
import { clamp, display, mono, sans } from "../theme";
import { SAFE } from "../gastos/common";
import { ReelsGuide } from "../monogrua/StepFrame";
import { Logo } from "../scenes/Logo";
import { Camara, Grano, Toma } from "../reel/Gancho";
import { Cierre, CIERRE_DUR } from "../reel/Cierre";
import { AMBER, Chip, FIJOS_MES, Icono, KM, PASOS, peso, pop, r, SERVICIOS, slam, W } from "./Fase1";
import { CELESTE } from "./MapaTraslado";

// Reel «Hagamos la cuenta», fase 3: la solución, solo con lo que la app hace hoy.
// 1) Cargás los gastos variables (con foto del ticket) y los fijos del mes una vez.
// 2) Mis números: ganancia promedio por servicio y por km, y el punto de equilibrio.
// Mundo claro con tarjetas negras, como el reel nuevo. Termina con el cierre del chofer.
const IN_L = SAFE.left + 20;
const IN_W = W - 40;
const INK = "#14161b";
const GRIS_C = "#6b7285";
const CARD = "#14161b";

// ── Números del mes, con los mismos datos del día de la fase 1 ──────
const N = 110; // 22 días × 5 servicios
const PRECIO = 70000;
const VAR_SERV = PASOS.filter((p) => !p.fijo).reduce((s, p) => s + p.monto, 0) / SERVICIOS; // 17.240
const FACTURADO = N * PRECIO; // 7.700.000
const VARIABLES = N * VAR_SERV; // 1.896.400
const QUEDA = FACTURADO - VARIABLES - FIJOS_MES; // 5.181.600
const KM_MES = N * (KM / SERVICIOS); // 3.960
const POR_KM = Math.round(QUEDA / KM_MES); // 1.308
const DEJA_PROM = (FACTURADO - VARIABLES) / N; // 52.760
const NECESITAS = Math.ceil(FIJOS_MES / DEJA_PROM); // 12
const FIJOS: [string, string, number][] = [["escudo", "Seguro", 180000], ["recibo", "Cuota de la grúa", 350000], ["cal", "Monotributo", 92000]];

const VOZ: [string, number][] = [["ctc-s1", 20], ["ctc-s2", 212], ["ctc-s3", 420], ["ctc-s4", 602], ["ctc-s5", 820], ["ctc-s6", 1004]];
const CORTE_B = 200;
const CORTE_C = 590;
export const SOLUCION_DUR = 1190;
export const FASE3_DUR = SOLUCION_DUR + CIERRE_DUR;

const Fondo: React.FC = () => <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 38%, #ffffff 0%, #eef0f4 62%, #e2e5ec 100%)" }} />;
const Paso: React.FC<{ f: number; at: number; n: string; titulo: React.ReactNode }> = ({ f, at, n, titulo }) => (
  <div style={{ position: "absolute", top: 296, left: IN_L, width: IN_W }}>
    <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 28, letterSpacing: 3, color: GRIS_C, opacity: r(f, at, at + 14) }}>{n}</div>
    <div style={{ fontFamily: display, fontSize: 112, lineHeight: 1, color: INK, marginTop: 4, opacity: r(f, at + 4, at + 18), translate: `0px ${(1 - r(f, at + 4, at + 18)) * 30}px` }}>{titulo}</div>
  </div>
);
const cuenta = (f: number, a: number, b: number, v: number) => v * interpolate(f, [a, b], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });

// ── A · La cuenta la hace la app ────────────────────────────────────
const LaApp: React.FC<{ f: number }> = ({ f }) => {
  const logo = pop(f, 10, 34);
  const t = r(f, 40, 56);
  return (
    <Camara f={f} zoom={[1.04, 1]} from={0} to={CORTE_B + 10}>
      <Fondo />
      <div style={{ position: "absolute", left: 0, right: 0, top: 560, display: "flex", justifyContent: "center", scale: 0.6 + logo * 0.4, opacity: Math.min(1, logo * 1.3) }}>
        <Logo size={0.75} ink={INK} />
      </div>
      <div style={{ position: "absolute", top: 820, left: IN_L - 30, width: IN_W + 60, textAlign: "center", fontFamily: display, fontSize: 132, lineHeight: 0.95, color: INK, opacity: t, scale: slam(f, 40) }}>
        La cuenta
        <br />
        la hace <span style={{ color: AMBER }}>la app.</span>
      </div>
    </Camara>
  );
};

// ── B · Cargás lo que gastás ────────────────────────────────────────
const FOTO = 262;
const Gastos: React.FC<{ f: number }> = ({ f }) => {
  const c1 = r(f, CORTE_B + 20, CORTE_B + 40, Easing.out(Easing.back(1.2)));
  const flash = f >= FOTO && f < FOTO + 14 ? 1 - (f - FOTO) / 14 : 0;
  const foto = r(f, FOTO, FOTO + 14);
  const monto = cuenta(f, 300, 350, PASOS[0].monto);
  const ok = pop(f, 372, 390);
  const c2 = r(f, 420, 440, Easing.out(Easing.back(1.2)));
  const tot = pop(f, 512, 532);
  return (
    <Camara f={f} zoom={[1, 1.04]} from={CORTE_B} to={CORTE_C + 10} rot={-0.5}>
      <Fondo />
      <Paso f={f} at={CORTE_B + 6} n="PASO 1" titulo="Cargás lo que gastás" />
      {/* gasto variable con foto del ticket */}
      <div
        style={{
          position: "absolute", top: 470, left: IN_L, width: IN_W, height: 290, borderRadius: 34, background: CARD, padding: 28, display: "flex", gap: 26,
          boxShadow: "0 30px 60px rgba(10,12,18,.28)", opacity: Math.min(1, c1 * 1.4), translate: `0px ${(1 - c1) * 120}px`,
        }}
      >
        <div style={{ position: "relative", width: 168, height: 234, borderRadius: 16, background: "#2a2f3a", overflow: "hidden", flexShrink: 0, display: "grid", placeItems: "center", color: "#6b7285" }}>
          {foto < 1 ? <Icono n="camera" s={64} /> : null}
          {/* el ticket fotografiado */}
          <div style={{ position: "absolute", inset: 12, background: "#f3efe6", borderRadius: 4, padding: 12, opacity: foto, rotate: "-3deg" }}>
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 14, color: "#55524a", letterSpacing: 1 }}>ESTACIÓN</div>
            {[0.9, 0.6, 0.8, 0.5].map((w, i) => <div key={i} style={{ height: 5, width: `${w * 100}%`, background: "#cfc8b8", borderRadius: 3, marginTop: 10 }} />)}
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 16, color: "#2b2a26", marginTop: 18 }}>18 L DIESEL</div>
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 18, color: "#2b2a26", marginTop: 6 }}>$ 27.000</div>
          </div>
          <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 22, letterSpacing: 2, color: INK, background: CELESTE, padding: "5px 12px", borderRadius: 8 }}>VARIABLE</span>
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 26, color: "#9aa3b8" }}>hoy</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Chip n="gasoil" s={64} />
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 42, color: "#eef0f5" }}>Combustible</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontFamily: display, fontSize: 96, lineHeight: 1, color: "#f2f3f6" }}>{peso(Math.round(monto / 100) * 100)}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: sans, fontWeight: 700, fontSize: 26, color: CELESTE, opacity: Math.min(1, ok * 1.4), scale: 0.6 + ok * 0.4 }}>
              <Icono n="check" s={28} w={3} /> Guardado
            </span>
          </div>
        </div>
      </div>
      {/* los fijos del mes, una sola vez */}
      <div
        style={{
          position: "absolute", top: 790, left: IN_L, width: IN_W, borderRadius: 34, background: CARD, padding: "24px 28px", boxShadow: "0 30px 60px rgba(10,12,18,.28)",
          opacity: Math.min(1, c2 * 1.4), translate: `0px ${(1 - c2) * 120}px`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 22, letterSpacing: 2, color: INK, background: AMBER, padding: "5px 12px", borderRadius: 8 }}>FIJO</span>
          <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 26, color: "#9aa3b8" }}>se cargan una vez, se reparten solos por mes</span>
        </div>
        {FIJOS.map(([ico, t, v], i) => {
          const e = r(f, 440 + i * 22, 456 + i * 22);
          return (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 16, height: 66, borderBottom: "2px dashed rgba(255,255,255,.1)", opacity: e, translate: `${(1 - e) * 60}px 0px` }}>
              <Chip n={ico} s={48} fijo />
              <span style={{ flex: 1, fontFamily: sans, fontWeight: 700, fontSize: 32, color: "#eef0f5" }}>{t}</span>
              <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, color: "#dfe3ea" }}>{peso(v)}</span>
              <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 22, color: "#9aa3b8" }}>/ mes</span>
            </div>
          );
        })}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 12, opacity: Math.min(1, tot * 1.4) }}>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 24, letterSpacing: 2, color: "#9aa3b8" }}>FIJOS DEL MES</span>
          <span style={{ fontFamily: display, fontSize: 72, lineHeight: 1, color: AMBER, scale: 0.7 + tot * 0.3, transformOrigin: "100% 50%" }}>{peso(FIJOS_MES)}</span>
        </div>
      </div>
    </Camara>
  );
};

// ── C · Mirás tus números ───────────────────────────────────────────
// Un servicio de $ 70.000 por dentro, como torta: lo que te queda en ámbar y con brillo;
// los gastos del día y los fijos en gris, para que el ojo vaya a la ganancia.
const VAR_S = VAR_SERV; // 17.240
const FIJO_S = Math.round(FIJOS_MES / N); // 5.655
const QUEDA_S = PRECIO - VAR_S - FIJO_S; // 47.105
const G_VAR = "#3d4352";
const G_FIJO = "#565e70";
const T_VAR = 650; // los gastos del día se comen su parte
const T_FIJO = 704; // después los fijos
const T_BRILLO = 752; // lo que queda se enciende
const T_KM = 772;
const T_EQ = 850;
const TUYA = 1004;
const R_T = 150;
const C_T = 2 * Math.PI * R_T;
const Numeros: React.FC<{ f: number }> = ({ f }) => {
  const card = r(f, CORTE_C + 14, CORTE_C + 34, Easing.out(Easing.back(1.1)));
  const aro = r(f, CORTE_C + 20, CORTE_C + 56, Easing.inOut(Easing.cubic)); // el aro se dibuja entero en ámbar
  const pv = r(f, T_VAR, T_VAR + 34, Easing.inOut(Easing.cubic));
  const pf = r(f, T_FIJO, T_FIJO + 30, Easing.inOut(Easing.cubic));
  const lenV = (VAR_S / PRECIO) * C_T * pv;
  const lenF = (FIJO_S / PRECIO) * C_T * pf;
  const lenQ = C_T * aro - lenV - lenF;
  const centro = PRECIO - VAR_S * pv - FIJO_S * pf;
  const brillo = r(f, T_BRILLO, T_BRILLO + 16);
  const pulso = f > T_BRILLO ? 1 + 0.035 * Math.max(0, Math.sin((f - T_BRILLO) / 7)) * (1 - r(f, T_BRILLO + 40, T_BRILLO + 90)) : 1;
  const km = pop(f, T_KM, T_KM + 20);
  const eq = pop(f, T_EQ, T_EQ + 20);
  const tuya = f >= TUYA;
  const sale = r(f, TUYA - 8, TUYA + 2);
  const t = f - TUYA - 10;
  const shake = t >= 0 && t < 16 ? Math.sin(t * 2.6) * 14 * (1 - t / 16) : 0;
  const leyenda: [string, number, string, string, number][] = [
    ["Te queda", QUEDA_S, AMBER, "check", brillo],
    ["Gastos del día", VAR_S, G_VAR, "gasoil", pv],
    ["Fijos del mes", FIJO_S, G_FIJO, "cal", pf],
  ];
  return (
    <Camara f={f} zoom={[1, 1.03]} from={CORTE_C} to={SOLUCION_DUR} rot={0.4}>
      <Fondo />
      <Paso f={f} at={CORTE_C + 6} n="PASO 2" titulo="Mirás tus números" />
      <div
        style={{
          position: "absolute", top: 466, left: IN_L, width: IN_W, height: 650, borderRadius: 36, background: CARD, padding: "24px 30px", boxShadow: "0 30px 60px rgba(10,12,18,.28)",
          opacity: Math.min(1, card * 1.4), translate: `${shake}px ${(1 - card) * 140}px`,
        }}
      >
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: "#9aa3b8" }}>UN SERVICIO DE {peso(PRECIO)}, POR DENTRO</div>
        <div style={{ position: "relative", width: 400, height: 400, margin: "10px auto 0" }}>
          <svg width={400} height={400} viewBox="15 15 400 400" style={{ rotate: "-90deg", overflow: "visible" }}>
            <circle cx={215} cy={215} r={R_T} fill="none" stroke="#1d212b" strokeWidth={62} />
            {/* lo que queda, con brillo */}
            <circle
              cx={215} cy={215} r={R_T} fill="none" stroke={AMBER} strokeWidth={74 + brillo * 10} strokeDasharray={`${Math.max(0, lenQ - (pv > 0 ? 6 : 0))} ${C_T}`}
              style={{ filter: brillo > 0 ? `drop-shadow(0 0 ${brillo * 22}px rgba(245,166,35,.75))` : undefined }}
            />
            {pv > 0 ? <circle cx={215} cy={215} r={R_T} fill="none" stroke={G_VAR} strokeWidth={50} strokeDasharray={`${Math.max(0, lenV - 6)} ${C_T}`} strokeDashoffset={-lenQ} /> : null}
            {pf > 0 ? <circle cx={215} cy={215} r={R_T} fill="none" stroke={G_FIJO} strokeWidth={50} strokeDasharray={`${Math.max(0, lenF - 6)} ${C_T}`} strokeDashoffset={-(lenQ + lenV)} /> : null}
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 24, color: "#9aa3b8" }}>{pv > 0 ? "te quedan" : "cobrás"}</div>
            <div style={{ fontFamily: display, fontSize: 80, lineHeight: 1, color: pv > 0 ? AMBER : "#f2f3f6", scale: pulso, textShadow: brillo > 0 ? `0 0 ${brillo * 30}px rgba(245,166,35,.5)` : undefined }}>
              {peso(Math.round(centro / 5) * 5)}
            </div>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 24, color: "#9aa3b8", opacity: brillo }}>el {Math.round((QUEDA_S / PRECIO) * 100)} %</div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          {leyenda.map(([n, v, c, ico, k], i) => (
            <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 250, opacity: i === 0 ? 0.5 + k * 0.5 : k, scale: i === 0 ? 1 + k * 0.08 : 1 }}>
              <span style={{ width: 50, height: 50, borderRadius: 15, background: c, color: i === 0 ? INK : "#c9cfdc", display: "grid", placeItems: "center", boxShadow: i === 0 && k > 0 ? `0 0 ${k * 22}px rgba(245,166,35,.6)` : undefined }}>
                <Icono n={ico} s={26} w={2.4} />
              </span>
              <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 24, color: i === 0 ? "#f2f3f6" : "#8a92a5" }}>{n}</span>
              <span style={{ fontFamily: i === 0 ? display : mono, fontWeight: 700, fontSize: i === 0 ? 46 : 26, lineHeight: 1, color: i === 0 ? AMBER : "#8a92a5" }}>{peso(v)}</span>
            </div>
          ))}
        </div>
      </div>
      {/* por km y punto de equilibrio */}
      <div style={{ position: "absolute", top: 1134, left: IN_L, width: IN_W, display: "flex", gap: 16, opacity: 1 - sale }}>
        {[
          { k: km, l: "Cada km te deja", v: peso(POR_KM), c: AMBER },
          { k: eq, l: "Cubrís los fijos con", v: `${NECESITAS} servicios`, c: INK },
        ].map((x) => (
          <div key={x.l} style={{ flex: 1, borderRadius: 26, background: CARD, padding: "14px 20px", opacity: Math.min(1, x.k * 1.4), scale: 0.7 + x.k * 0.3, boxShadow: "0 20px 40px rgba(10,12,18,.22)" }}>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 24, color: "#9aa3b8" }}>{x.l}</div>
            <div style={{ fontFamily: display, fontSize: 56, lineHeight: 1.05, color: x.c === INK ? "#f2f3f6" : x.c, whiteSpace: "nowrap" }}>{x.v}</div>
          </div>
        ))}
      </div>
      {tuya ? (
        <div style={{ position: "absolute", top: 1124, left: IN_L - 40, width: IN_W + 80, textAlign: "center", fontFamily: display, lineHeight: 0.95, color: INK, scale: slam(f, TUYA), opacity: r(f, TUYA, TUYA + 4), translate: `${shake}px 0px` }}>
          <div style={{ fontSize: 64 }}>Del servicio 13 en adelante,</div>
          <div style={{ fontSize: 66, color: AMBER, textShadow: "0 10px 40px rgba(245,166,35,.35)" }}>es plata tuya.</div>
        </div>
      ) : null}
    </Camara>
  );
};

const Solucion: React.FC<{ guia?: boolean }> = ({ guia = false }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#eef0f4", overflow: "hidden" }}>
      <Toma f={f} from={0} to={CORTE_B}>
        <LaApp f={f} />
      </Toma>
      <Toma f={f} from={CORTE_B} to={CORTE_C}>
        <Gastos f={f} />
      </Toma>
      <Toma f={f} from={CORTE_C} to={SOLUCION_DUR + 20}>
        <Numeros f={f} />
      </Toma>
      <Grano f={f} />
      {VOZ.map(([n, at]) => (
        <Audio key={n} name={n} src={staticFile(`vo/${n}.wav`)} from={at} volume={1} />
      ))}
      <Audio name="Entra" src={staticFile("sfx/whoosh.wav")} from={0} volume={0.45} />
      <Audio name="Logo" src={staticFile("sfx/ding.wav")} from={14} volume={0.45} />
      {[CORTE_B, CORTE_C].map((c) => (
        <Audio key={c} name="Corte" src={staticFile("sfx/whoosh.wav")} from={c - 6} volume={0.4} />
      ))}
      <Audio name="Foto del ticket" src={staticFile("sfx/shutter.wav")} from={FOTO} volume={0.6} />
      <Audio name="Guardado" src={staticFile("sfx/ding.wav")} from={374} volume={0.4} />
      {FIJOS.map((x, i) => (
        <Audio key={x[1]} name="Fijo" src={staticFile("sfx/mouse-click.wav")} from={440 + i * 22} volume={0.3} />
      ))}
      <Audio name="Gastos del día" src={staticFile("sfx/whoosh.wav")} from={T_VAR} volume={0.3} />
      <Audio name="Fijos" src={staticFile("sfx/whoosh.wav")} from={T_FIJO} volume={0.3} />
      <Audio name="Te queda" src={staticFile("sfx/ding.wav")} from={T_BRILLO} volume={0.5} />
      <Audio name="Por km" src={staticFile("sfx/mouse-click.wav")} from={T_KM} volume={0.35} />
      <Audio name="Equilibrio" src={staticFile("sfx/mouse-click.wav")} from={T_EQ} volume={0.35} />
      <Audio name="Plata tuya" src={staticFile("sfx/whip.wav")} from={TUYA + 2} volume={0.8} />
      {guia ? <ReelsGuide /> : null}
    </AbsoluteFill>
  );
};

export const Fase3: React.FC<{ guia?: boolean }> = ({ guia = false }) => (
  <AbsoluteFill>
    <Series>
      <Series.Sequence name="Solución" durationInFrames={SOLUCION_DUR}>
        <Solucion />
      </Series.Sequence>
      <Series.Sequence name="Cierre" durationInFrames={CIERRE_DUR}>
        <Cierre voz="vo/ctc-c1.wav" />
      </Series.Sequence>
    </Series>
    {guia ? <ReelsGuide /> : null}
  </AbsoluteFill>
);
