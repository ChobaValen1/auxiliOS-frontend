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
const POR_SERVICIO = Math.round(QUEDA / N); // 47.105
const KM_MES = N * (KM / SERVICIOS); // 3.960
const POR_KM = Math.round(QUEDA / KM_MES); // 1.308
const DEJA_PROM = (FACTURADO - VARIABLES) / N; // 52.760
const NECESITAS = Math.ceil(FIJOS_MES / DEJA_PROM); // 12
const FIJOS: [string, string, number][] = [["escudo", "Seguro", 180000], ["recibo", "Cuota de la grúa", 350000], ["cal", "Monotributo", 92000]];

const VOZ: [string, number][] = [["ctc-s1", 20], ["ctc-s2", 212], ["ctc-s3", 420], ["ctc-s4", 602], ["ctc-s5", 820], ["ctc-s6", 1000]];
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
// No copia la pantalla: muestra en grande lo mismo que calcula la app (lo que te deja cada
// servicio y cada km, y cuántos servicios cubren los fijos) para que se entienda de un golpe.
const A_IN = 616; // cada servicio
const B_IN = 724; // cada km
const GRID0 = 836; // los servicios del mes, uno por uno
const GRID_CADA = 1.05;
const TUYA = 996; // «del servicio 13 en adelante, es plata tuya»
const COLS = 11;
const CELDA = 58;
const DOT = 48;
const GX = 540 - (COLS * CELDA) / 2;
const GY = 560;
const Numeros: React.FC<{ f: number }> = ({ f }) => {
  // 1 · cada servicio: la barra de $ 70.000 se achica hasta lo que te queda
  const a = r(f, A_IN, A_IN + 18, Easing.out(Easing.back(1.2)));
  const corte = r(f, A_IN + 30, A_IN + 80, Easing.inOut(Easing.cubic));
  const deja = PRECIO - (PRECIO - POR_SERVICIO) * corte;
  // 2 · cada km: la ruta corre y el número sube
  const b = r(f, B_IN, B_IN + 18, Easing.out(Easing.back(1.2)));
  const km = cuenta(f, B_IN + 10, B_IN + 70, POR_KM);
  const sale = r(f, GRID0 - 24, GRID0 - 4, Easing.in(Easing.cubic));
  // 3 · los 110 servicios del mes: los primeros 12 pagan los fijos, el resto es tuyo
  const g = r(f, GRID0 - 6, GRID0 + 10);
  const hechos = Math.max(0, Math.min(N, Math.floor((f - GRID0) / GRID_CADA)));
  const marco = r(f, GRID0 + NECESITAS * GRID_CADA + 4, GRID0 + NECESITAS * GRID_CADA + 20);
  const tuya = f >= TUYA;
  const t = f - TUYA - 10;
  const shake = t >= 0 && t < 16 ? Math.sin(t * 2.6) * 14 * (1 - t / 16) : 0;
  return (
    <Camara f={f} zoom={[1, 1.03]} from={CORTE_C} to={SOLUCION_DUR} rot={0.4}>
      <Fondo />
      <Paso f={f} at={CORTE_C + 6} n="PASO 2" titulo="Mirás tus números" />
      {/* 1 y 2: tarjetas grandes */}
      <div style={{ position: "absolute", inset: 0, opacity: 1 - sale, filter: sale > 0 ? `blur(${sale * 16}px)` : undefined, scale: 1 - sale * 0.06 }}>
        <div
          style={{
            position: "absolute", top: 470, left: IN_L, width: IN_W, borderRadius: 36, background: CARD, padding: "26px 30px 30px", boxShadow: "0 30px 60px rgba(10,12,18,.28)",
            opacity: Math.min(1, a * 1.4), translate: `0px ${(1 - a) * 140}px`,
          }}
        >
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 3, color: "#9aa3b8" }}>CADA SERVICIO TE DEJA</div>
          <div style={{ fontFamily: display, fontSize: 170, lineHeight: 1, color: AMBER, marginTop: 6 }}>{peso(Math.round(deja / 5) * 5)}</div>
          <div style={{ position: "relative", height: 40, borderRadius: 12, background: AMBER, marginTop: 10, overflow: "hidden" }}>
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${corte * (1 - POR_SERVICIO / PRECIO) * 100}%`, background: "repeating-linear-gradient(135deg, #3a4050 0 12px, #2c313d 12px 24px)", borderLeft: corte > 0 ? "4px solid #14161b" : undefined }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: sans, fontWeight: 700, fontSize: 24, color: "#9aa3b8", marginTop: 10 }}>
            <span>de cada {peso(PRECIO)} que cobrás</span>
            <span style={{ opacity: corte }}>gastos y fijos {peso(PRECIO - POR_SERVICIO)}</span>
          </div>
        </div>
        <div
          style={{
            position: "absolute", top: 830, left: IN_L, width: IN_W, height: 250, borderRadius: 36, background: CARD, padding: "26px 30px", overflow: "hidden", boxShadow: "0 30px 60px rgba(10,12,18,.28)",
            opacity: Math.min(1, b * 1.4), translate: `0px ${(1 - b) * 140}px`,
          }}
        >
          {/* la ruta que corre abajo */}
          <div style={{ position: "absolute", left: -100, right: -100, bottom: 34, height: 8, background: `repeating-linear-gradient(90deg, ${CELESTE} 0 60px, transparent 60px 110px)`, opacity: 0.55, translate: `${-((f * 9) % 110)}px 0px` }} />
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 3, color: "#9aa3b8" }}>CADA KM TE DEJA</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
            <span style={{ fontFamily: display, fontSize: 150, lineHeight: 1.05, color: CELESTE }}>{peso(Math.round(km))}</span>
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 28, color: "#9aa3b8" }}>ya con todo descontado</span>
          </div>
        </div>
      </div>
      {/* 3: los servicios del mes */}
      {f >= GRID0 - 6 ? (
        <div style={{ position: "absolute", inset: 0, opacity: g, translate: `${shake}px 0px` }}>
          <div style={{ position: "absolute", top: 470, left: IN_L, width: IN_W, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, color: INK }}>Tus servicios de noviembre</span>
            <span style={{ fontFamily: display, fontSize: 64, lineHeight: 1, color: INK }}>{hechos}</span>
          </div>
          {Array.from({ length: N }).map((_, i) => {
            const on = i < hechos;
            const k = on ? pop(f, GRID0 + i * GRID_CADA, GRID0 + i * GRID_CADA + 12) : 0;
            const fijo = i < NECESITAS;
            return (
              <div
                key={i}
                style={{
                  position: "absolute", left: GX + (i % COLS) * CELDA + (CELDA - DOT) / 2, top: GY + Math.floor(i / COLS) * CELDA + (CELDA - DOT) / 2, width: DOT, height: DOT, borderRadius: 14,
                  background: on ? (fijo ? "#3a4050" : AMBER) : "rgba(20,22,27,.07)", color: on ? (fijo ? "#c9cfdc" : INK) : "transparent",
                  display: "grid", placeItems: "center", scale: on ? 0.5 + k * 0.5 : 1, boxShadow: on && !fijo ? "0 6px 14px rgba(245,166,35,.35)" : undefined,
                }}
              >
                <Icono n="ruta" s={24} w={2.4} />
              </div>
            );
          })}
          {/* los primeros 12: los que pagan los fijos */}
          {[
            { x: 0, y: 0, w: COLS },
            { x: 0, y: 1, w: NECESITAS - COLS },
          ].map((m, j) => (
            <div key={j} style={{ position: "absolute", left: GX + m.x * CELDA - 4, top: GY + m.y * CELDA - 4, width: m.w * CELDA + 8, height: CELDA + 8, borderRadius: 18, border: "4px dashed #14161b", opacity: marco }} />
          ))}
          <div
            style={{
              position: "absolute", left: 0, right: 0, top: 1170, display: "flex", justifyContent: "center", opacity: marco * (1 - r(f, TUYA - 8, TUYA)),
              translate: `0px ${(1 - marco) * 20}px`,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 12, background: INK, color: "#f2f3f6", padding: "12px 22px", borderRadius: 16, fontFamily: sans, fontWeight: 700, fontSize: 30 }}>
              <Icono n="cal" s={30} w={2.4} /> Los primeros {NECESITAS} pagan los fijos del mes
            </span>
          </div>
          {tuya ? (
            <div style={{ position: "absolute", top: 1156, left: IN_L - 40, width: IN_W + 80, textAlign: "center", fontFamily: display, lineHeight: 1, color: INK, scale: slam(f, TUYA), opacity: r(f, TUYA, TUYA + 4) }}>
              <span style={{ fontSize: 96 }}>Del 13 en adelante, </span>
              <span style={{ fontSize: 96, color: AMBER }}>es plata tuya.</span>
            </div>
          ) : null}
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
      <Audio name="Cada servicio" src={staticFile("sfx/whoosh.wav")} from={A_IN + 30} volume={0.35} />
      <Audio name="Cada km" src={staticFile("sfx/mouse-click.wav")} from={B_IN} volume={0.35} />
      {Array.from({ length: 12 }).map((_, i) => (
        <Audio key={`g${i}`} name="Servicios" src={staticFile("sfx/mouse-click.wav")} from={GRID0 + Math.round(i * 9 * GRID_CADA)} volume={0.18} />
      ))}
      <Audio name="Fijos cubiertos" src={staticFile("sfx/ding.wav")} from={GRID0 + Math.round(NECESITAS * GRID_CADA) + 6} volume={0.45} />
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
