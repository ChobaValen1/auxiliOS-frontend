import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, random, Series, staticFile, useCurrentFrame } from "remotion";
import { clamp, display, mono, sans } from "../theme";
import { SAFE } from "../gastos/common";
import { ReelsGuide } from "../monogrua/StepFrame";
import { Grano, Toma } from "../reel/Gancho";
import { Cierre, CIERRE_DUR } from "../reel/Cierre";
import { AMBER, peso, pop, r, slam } from "../cuenta/Fase1";
import { CELESTE, CORAL } from "../cuenta/MapaFijo";

// Reel «Nadie te paga la vuelta»: todo desde adentro de la cabina, de noche.
// Fotos generadas con Higgsfield (public/cabina), con cámara lenta, lluvia, grano y los números
// encima. Los celulares muestran la notificación del pedido y la app, montados en la pantalla.
// Números del traslado de la fase 2: 146 km, $ 38.000 cobrados, $ 42.040 de costo.
const W = SAFE.right - SAFE.left;
const IN_L = SAFE.left + 20;
const IN_W = W - 40;
const INK = "#14161b";

// cada plano: foto, desde/hasta (en cuadros a 60 fps) y hacia dónde se mueve la cámara
const PLANOS = [
  { foto: "1-parabrisas", from: 0, to: 150, z: [1.04, 1.16], dx: 0, dy: -20 },
  { foto: "2-espejo", from: 150, to: 330, z: [1.12, 1.02], dx: -18, dy: 0 },
  { foto: "3-celular-soporte", from: 330, to: 500, z: [1.0, 1.1], dx: 0, dy: 10 },
  { foto: "4-tablero", from: 500, to: 590, z: [1.08, 1.16], dx: 14, dy: 0 },
  { foto: "6-peaje", from: 590, to: 680, z: [1.02, 1.14], dx: 0, dy: -10 },
  { foto: "5-manos", from: 680, to: 820, z: [1.1, 1.02], dx: -10, dy: 0 },
  { foto: "7-casa", from: 820, to: 1100, z: [1.0, 1.08], dx: 0, dy: 0 },
  { foto: "8-celular-mano", from: 1100, to: 1480, z: [1.0, 1.12], dx: 0, dy: -150 },
];
export const ESCENA_DUR = 1480;
export const VUELTA_DUR = ESCENA_DUR + CIERRE_DUR;

// voz: archivo, cuándo arranca, cuánto dura y el texto para los subtítulos
const VOZ: { n: string; at: number; dur: number; t: string }[] = [
  { n: "vta-1", at: 10, dur: 81, t: "Nadie te paga la vuelta." },
  { n: "vta-2", at: 162, dur: 158, t: "Sesenta y cinco kilómetros, con la plancha vacía." },
  { n: "vta-3", at: 342, dur: 144, t: "Y el viaje parecía bueno: treinta y ocho mil." },
  { n: "vta-4", at: 510, dur: 128, t: "Pero entre gasoil, peaje y desgaste…" },
  { n: "vta-5", at: 652, dur: 77, t: "te costó cuarenta y dos." },
  { n: "vta-6", at: 834, dur: 275, t: "La cuenta no termina cuando bajás el auto. Termina cuando llegás a tu casa." },
  { n: "vta-7", at: 1112, dur: 352, t: "AuxiliOS hace esa cuenta por vos: cargás lo que gastás, y ves cuánto te deja cada servicio y cada kilómetro." },
];

// ── pantalla de un celular de la foto: lleva un rectángulo a las cuatro esquinas del vidrio ──
type P2 = [number, number];
const aCuadrilatero = (w: number, h: number, q: [P2, P2, P2, P2]) => {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q; // arriba izq., arriba der., abajo der., abajo izq.
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h2 = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h2 * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + h2 * y3, f = y0;
  return `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${h2 / h},0,0,1,0,${c},${f},0,1)`;
};
const Pantalla: React.FC<{ q: [P2, P2, P2, P2]; w: number; h: number; children: React.ReactNode }> = ({ q, w, h, children }) => (
  <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, transformOrigin: "0 0", transform: aCuadrilatero(w, h, q), overflow: "hidden", borderRadius: 18 }}>{children}</div>
);
// esquinas del vidrio medidas sobre las fotos (1080 × 1920)
const PANT_SOPORTE: [P2, P2, P2, P2] = [[498, 712], [678, 708], [614, 1140], [416, 1120]];
const PANT_MANO: [P2, P2, P2, P2] = [[348, 696], [598, 688], [620, 1328], [360, 1336]];

const Notificacion: React.FC<{ f: number }> = ({ f }) => {
  const e = r(f, 372, 392, Easing.out(Easing.back(1.4)));
  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #2a3242, #12161f)" }}>
      <div style={{ position: "absolute", top: 24, left: 0, right: 0, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 40, color: "#eef0f5" }}>22:47</div>
      <div
        style={{
          position: "absolute", left: 12, right: 12, top: 120, borderRadius: 20, background: "rgba(238,240,245,.95)", padding: "14px 14px 16px",
          translate: `0px ${(1 - e) * -140}px`, opacity: Math.min(1, e * 1.4),
        }}
      >
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 15, color: "#6b7285" }}>Asistencia del Sur · ahora</div>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 22, color: INK, marginTop: 4, lineHeight: 1.15 }}>Traslado a La Plata</div>
        <div style={{ fontFamily: display, fontSize: 46, color: "#b9760f", lineHeight: 1 }}>$ 38.000</div>
      </div>
    </AbsoluteFill>
  );
};
const App: React.FC<{ f: number }> = ({ f }) => {
  const k = r(f, 1200, 1270, Easing.inOut(Easing.cubic));
  const R = 70, C = 2 * Math.PI * R;
  const deja = 47105 / 70000;
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 30%, #ffffff, #eef0f4 70%)", padding: 18, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 24, color: INK, marginTop: 6 }}>
        <span style={{ color: "#ff6b1a" }}>[</span>Auxili<span style={{ color: "#ff6b1a" }}>]</span>
        <span style={{ background: "#ff6b1a", color: "#fff", padding: "0 5px", marginLeft: 3, borderRadius: 4 }}>OS</span>
      </div>
      <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 18, color: "#6b7285", marginTop: 14 }}>Mis números · noviembre</div>
      <div style={{ position: "relative", width: 190, height: 190, marginTop: 16 }}>
        <svg width={190} height={190} viewBox="0 0 190 190" style={{ rotate: "-90deg" }}>
          <circle cx={95} cy={95} r={R} fill="none" stroke="#d9dce3" strokeWidth={30} />
          <circle cx={95} cy={95} r={R} fill="none" stroke={AMBER} strokeWidth={34} strokeDasharray={`${C * deja * k} ${C}`} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 14, color: "#6b7285" }}>te deja</div>
          <div style={{ fontFamily: display, fontSize: 38, lineHeight: 1, color: INK }}>{peso(Math.round((47105 * k) / 5) * 5)}</div>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: "#6b7285" }}>por servicio</div>
        </div>
      </div>
      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22, borderRadius: 16, background: INK, padding: "12px 16px", opacity: r(f, 1290, 1310) }}>
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 16, color: "#9aa3b8" }}>Por km</span>
        <span style={{ fontFamily: display, fontSize: 36, color: CELESTE }}>$ 1.308</span>
      </div>
      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, borderRadius: 16, background: INK, padding: "12px 16px", opacity: r(f, 1330, 1350) }}>
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 16, color: "#9aa3b8" }}>Gasoil · foto del ticket</span>
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 18, color: AMBER }}>✓</span>
      </div>
    </AbsoluteFill>
  );
};

// ── lluvia y luz de baliza ──────────────────────────────────────────
const Lluvia: React.FC<{ f: number; fuerza?: number }> = ({ f, fuerza = 1 }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    {Array.from({ length: 70 }).map((_, i) => {
      const x = random(`lx${i}`) * 1080;
      const v = 18 + random(`lv${i}`) * 22;
      const y = ((random(`ly${i}`) * 2200 + f * v) % 2200) - 200;
      return <div key={i} style={{ position: "absolute", left: x, top: y, width: 2, height: 40 + random(`ll${i}`) * 50, background: "linear-gradient(180deg, transparent, rgba(210,225,255,.35))", rotate: "8deg", opacity: fuerza }} />;
    })}
  </AbsoluteFill>
);
const Baliza: React.FC<{ f: number; fuerza?: number }> = ({ f, fuerza = 1 }) => {
  const p = Math.max(0, Math.sin(f / 7)) ** 3;
  return <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,150,40,.4), transparent 60%)", opacity: p * 0.6 * fuerza, mixBlendMode: "screen", pointerEvents: "none" }} />;
};

// ── texto grande y subtítulos ───────────────────────────────────────
const Sombra = "0 6px 30px rgba(0,0,0,.85), 0 2px 6px rgba(0,0,0,.9)";
// subtítulos de a una línea: la frase se parte en pedazos cortos que van pasando con la voz
const trozos = (t: string, max = 24) => {
  const out: string[] = [];
  let cur = "";
  for (const w of t.split(" ")) {
    if (cur && (cur + " " + w).length > max) {
      out.push(cur);
      cur = w;
    } else cur = cur ? cur + " " + w : w;
  }
  if (cur) out.push(cur);
  return out;
};
const Subtitulo: React.FC<{ f: number }> = ({ f }) => {
  const v = VOZ.find((x) => f >= x.at - 4 && f < x.at + x.dur + 14);
  if (!v) return null;
  const partes = trozos(v.t);
  const total = partes.reduce((s, x) => s + x.length, 0);
  let acc = 0;
  const idx = partes.findIndex((x) => {
    acc += x.length;
    return f < v.at + (acc / total) * v.dur;
  });
  const i = idx < 0 ? partes.length - 1 : idx;
  const inicio = v.at + (partes.slice(0, i).reduce((s, x) => s + x.length, 0) / total) * v.dur;
  const e = r(f, inicio - 2, inicio + 6, Easing.out(Easing.back(1.6)));
  const out = r(f, v.at + v.dur + 6, v.at + v.dur + 14);
  // con el celular de la app en pantalla, los subtítulos van arriba
  const arriba = f >= 1100;
  return (
    <div style={{ position: "absolute", top: arriba ? 330 : 1110, left: IN_L - 10, width: IN_W + 20, display: "flex", justifyContent: "center", opacity: 1 - out, zIndex: 40 }}>
      <div style={{ padding: "10px 22px", borderRadius: 18, background: "rgba(8,9,12,.66)", fontFamily: sans, fontWeight: 700, fontSize: 50, lineHeight: 1.15, color: "#f4f5f8", scale: 0.85 + e * 0.15, whiteSpace: "nowrap" }}>
        {partes[i]}
      </div>
    </div>
  );
};

// lo que se dice grande, arriba, en cada plano
const Arriba: React.FC<{ f: number }> = ({ f }) => {
  const km = Math.round(interpolate(f, [170, 310], [0, 65], { ...clamp, easing: Easing.out(Easing.quad) }));
  const costos: [string, number, number][] = [
    ["Gasoil", 21900, 516],
    ["Peaje", 1400, 600],
    ["Desgaste", 14600, 690],
    ["Fijos", 4140, 712],
  ];
  return (
    <>
      {/* 1 · el gancho */}
      {f < 160 ? (
        <div style={{ position: "absolute", top: 330, left: IN_L - 30, width: IN_W + 60, textAlign: "center", fontFamily: display, fontSize: 168, lineHeight: 0.9, color: "#f4f5f8", textShadow: Sombra, scale: slam(f, 14), opacity: r(f, 14, 18) * (1 - r(f, 140, 156)) }}>
          Nadie te paga
          <br />
          <span style={{ color: AMBER }}>la vuelta.</span>
        </div>
      ) : null}
      {/* 2 · los km vacíos */}
      {f >= 160 && f < 336 ? (
        <div style={{ position: "absolute", top: 320, left: IN_L, width: IN_W, textAlign: "center", opacity: r(f, 166, 180) * (1 - r(f, 318, 334)) }}>
          <div style={{ fontFamily: display, fontSize: 210, lineHeight: 1, color: "#f4f5f8", textShadow: Sombra }}>{km} km</div>
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 34, letterSpacing: 3, color: CORAL, textShadow: Sombra }}>CON LA PLANCHA VACÍA</div>
        </div>
      ) : null}
      {/* 3 · parecía bueno */}
      {f >= 400 && f < 506 ? (
        <div style={{ position: "absolute", top: 300, left: IN_L, width: IN_W, textAlign: "center", opacity: r(f, 400, 414) * (1 - r(f, 490, 504)) }}>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 46, color: "#eef0f5", textShadow: Sombra }}>Parecía bueno:</div>
          <div style={{ fontFamily: display, fontSize: 190, lineHeight: 1, color: AMBER, textShadow: Sombra, scale: slam(f, 420) }}>{f >= 420 ? peso(38000) : ""}</div>
        </div>
      ) : null}
      {/* 4 · cada costo aparece en su plano y se va sumando */}
      {f >= 510 && f < 826 ? (
        <div style={{ position: "absolute", top: 300, left: IN_L + 30, width: IN_W - 60, opacity: 1 - r(f, 808, 824) }}>
          {costos.map(([t, v, at]) => {
            const k = pop(f, at, at + 18);
            if (k <= 0) return null;
            return (
              <div key={t} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "8px 18px", marginBottom: 8, borderRadius: 14, background: "rgba(8,9,12,.62)", opacity: Math.min(1, k * 1.4), translate: `${(1 - k) * 80}px 0px` }}>
                <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 36, color: "#eef0f5" }}>{t}</span>
                <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 38, color: CORAL }}>− {peso(v)}</span>
              </div>
            );
          })}
          {f >= 700 ? (
            <div style={{ marginTop: 18, textAlign: "center", scale: slam(f, 700), opacity: r(f, 700, 704) }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: display, fontSize: 64, lineHeight: 1.05, color: "#eef0f5", textShadow: Sombra }}>
                <span>Te pagaron</span>
                <span style={{ color: AMBER }}>{peso(38000)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: display, fontSize: 64, lineHeight: 1.05, color: "#eef0f5", textShadow: Sombra }}>
                <span>Te costó</span>
                <span style={{ color: CORAL }}>{peso(42040)}</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {/* 5 · la cuenta termina en tu casa */}
      {f >= 900 && f < 1104 ? (
        <div style={{ position: "absolute", top: 320, left: IN_L - 20, width: IN_W + 40, textAlign: "center", fontFamily: display, fontSize: 112, lineHeight: 0.95, color: "#f4f5f8", textShadow: Sombra, opacity: r(f, 900, 916) * (1 - r(f, 1088, 1102)) }}>
          La cuenta termina
          <br />
          <span style={{ color: AMBER }}>en tu casa.</span>
        </div>
      ) : null}
    </>
  );
};

const Escena: React.FC<{ guia?: boolean }> = ({ guia = false }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#050608", overflow: "hidden" }}>
      {PLANOS.map((p, i) => {
        const k = interpolate(f, [p.from, p.to], [0, 1], clamp);
        const z = p.z[0] + (p.z[1] - p.z[0]) * k;
        return (
          <Toma key={p.foto} f={f} from={p.from} to={i === PLANOS.length - 1 ? ESCENA_DUR + 20 : p.to}>
            <AbsoluteFill style={{ scale: z, translate: `${p.dx * k}px ${p.dy * k}px` }}>
              <Img src={staticFile(`cabina/${p.foto}.jpg`)} style={{ width: 1080, height: 1920 }} />
              {p.foto === "3-celular-soporte" ? (
                <Pantalla q={PANT_SOPORTE} w={200} h={440}>
                  <Notificacion f={f} />
                </Pantalla>
              ) : null}
              {p.foto === "8-celular-mano" ? (
                <Pantalla q={PANT_MANO} w={260} h={640}>
                  <App f={f} />
                </Pantalla>
              ) : null}
              {/* el tablero y el peaje tienen números y carteles inventados: se desenfocan */}
              {p.foto === "4-tablero" ? <div style={{ position: "absolute", left: 0, right: 0, top: 640, height: 900, backdropFilter: "blur(10px)", WebkitMaskImage: "radial-gradient(ellipse at 60% 45%, #000 50%, transparent 75%)" }} /> : null}
              {p.foto === "6-peaje" ? <div style={{ position: "absolute", left: 0, right: 0, top: 680, height: 380, backdropFilter: "blur(9px)" }} /> : null}
            </AbsoluteFill>
          </Toma>
        );
      })}
      {/* la lluvia y la baliza en los planos de ruta */}
      {f < 830 ? <Lluvia f={f} fuerza={f < 500 ? 1 : 0.6} /> : null}
      {f < 830 ? <Baliza f={f} fuerza={f >= 680 ? 1 : 0.6} /> : null}
      {/* oscurecer arriba y abajo para que se lean los textos */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 32%, rgba(0,0,0,0) 52%, rgba(0,0,0,.55) 72%, rgba(0,0,0,.7) 100%)", pointerEvents: "none" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 50%, rgba(0,0,0,.6) 100%)", pointerEvents: "none" }} />
      <Arriba f={f} />
      <Subtitulo f={f} />
      <Grano f={f} />
      {VOZ.map((v) => (
        <Audio key={v.n} name={v.t} src={staticFile(`vo/${v.n}.wav`)} from={v.at} volume={1} />
      ))}
      <Audio name="Gancho" src={staticFile("sfx/whip.wav")} from={16} volume={0.7} />
      {PLANOS.slice(1).map((p) => (
        <Audio key={p.foto} name="Corte" src={staticFile("sfx/whoosh.wav")} from={p.from - 6} volume={0.35} />
      ))}
      <Audio name="Notificación" src={staticFile("sfx/ding.wav")} from={374} volume={0.5} />
      <Audio name="$ 38.000" src={staticFile("sfx/whip.wav")} from={422} volume={0.6} />
      {[516, 600, 690, 712].map((at) => (
        <Audio key={at} name="Costo" src={staticFile("sfx/mouse-click.wav")} from={at} volume={0.35} />
      ))}
      <Audio name="Te costó" src={staticFile("sfx/whip.wav")} from={702} volume={0.8} />
      <Audio name="La app" src={staticFile("sfx/ding.wav")} from={1200} volume={0.45} />
      {guia ? <ReelsGuide /> : null}
    </AbsoluteFill>
  );
};

export const Vuelta: React.FC<{ guia?: boolean }> = ({ guia = false }) => (
  <AbsoluteFill>
    <Series>
      <Series.Sequence name="Cabina" durationInFrames={ESCENA_DUR}>
        <Escena />
      </Series.Sequence>
      <Series.Sequence name="Cierre" durationInFrames={CIERRE_DUR}>
        <Cierre voz="vo/vta-8.wav" />
      </Series.Sequence>
    </Series>
    {guia ? <ReelsGuide /> : null}
  </AbsoluteFill>
);
