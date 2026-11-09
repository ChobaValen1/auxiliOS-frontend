import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { clamp, display, mono, sans } from "../theme";
import { SAFE } from "../gastos/common";
import { ReelsGuide } from "../monogrua/StepFrame";
import { Camara, Grano, Toma } from "../reel/Gancho";
import { AMBER, Chip, DESGASTE_KM, GRIS, KM, Palabra, PASOS, peso, pop, r, SERVICIOS, slam, temblor, Vineta, W } from "./Fase1";
import { CELESTE, CORAL, KM_REALES, MapaFijo, PEAJE_EN } from "./MapaFijo";

// Reel «Hagamos la cuenta», fase 2: el servicio que te saca plata. Con los números de la fase 1,
// cada km cuesta $ 250. Entra un traslado de $ 38.000 y, mientras la grúa hace los tres tramos,
// el costo sube hasta pasar lo que te pagan: en la vuelta vacía empezás a perder. Oscuro, 60 fps.
const IN_L = SAFE.left + 20;
const IN_W = W - 40;

// ── Los números (salen de la fase 1) ────────────────────────────────
const GASOIL = PASOS[0].monto; // 27.000
const GASOIL_KM = GASOIL / KM; // 150
const POR_KM = GASOIL_KM + DESGASTE_KM; // 250
const FIJOS_DIA = PASOS[5].monto; // 20.700
const FIJOS_SERV = FIJOS_DIA / SERVICIOS; // 4.140
const PAGO = 38000;
const PEAJE = 1400;
// los km son los del recorrido real: Monte Grande → San Vicente → La Plata → Monte Grande
const TRAMOS: { km: number; desde: number; hasta: number; txt: string }[] = [
  { km: KM_REALES[0], desde: 596, hasta: 704, txt: "a buscarlo" },
  { km: KM_REALES[1], desde: 712, hasta: 836, txt: "con el auto arriba" },
  { km: KM_REALES[2], desde: 846, hasta: 1010, txt: "vuelve vacío" },
];
const KM_TOTAL = TRAMOS.reduce((s, t) => s + t.km, 0); // 146
// un peaje: el de la autopista a La Plata, en la vuelta
const PEAJES = [{ tramo: 2, en: PEAJE_EN }];
export const COSTO = KM_TOTAL * POR_KM + PEAJES.length * PEAJE + FIJOS_SERV; // 42.040
export const PIERDE = COSTO - PAGO; // 4.040

const VOZ: [string, number][] = [
  ["ctb-p1", 8], ["ctb-p1b", 222], ["ctb-p2", 356], ["ctb-p3", 596], ["ctb-p4", 712], ["ctb-p5", 846],
  ["ctb-p6", 1100], ["ctb-p7", 1186], ["ctb-p8", 1300], ["ctb-p9", 1460],
];
const CORTE_B = 345;
const CORTE_C = 1030;
const CORTE_D = 1290;
export const FASE2_DUR = 1720;

// ── A · ¿Cuánto te cuesta cada km? ──────────────────────────────────
const PorKm: React.FC<{ f: number }> = ({ f }) => {
  const t0 = r(f, 8, 24);
  const preg = r(f, 96, 110);
  const g = pop(f, 140, 160);
  const d = pop(f, 182, 202);
  const tot = r(f, 230, 236);
  const shake = temblor(f, 240);
  return (
    <Camara f={f} zoom={[1, 1.05]} from={0} to={CORTE_B + 10}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #1a2236, #070a12 75%)", translate: `${shake}px 0px` }} />
      <Palabra f={f} from={0} to={CORTE_B} top={700}>POR KM</Palabra>
      <div style={{ position: "absolute", top: 300, left: IN_L, width: IN_W, textAlign: "center" }}>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, letterSpacing: 3, color: GRIS, opacity: t0 }}>LA CUENTA QUE NADIE HACE</div>
        <div style={{ fontFamily: display, fontSize: 132, lineHeight: 0.95, color: "#f2f3f6", marginTop: 14, opacity: preg, scale: slam(f, 96) }}>
          ¿Cuánto te cuesta
          <br />
          cada km?
        </div>
      </div>
      {/* de dónde sale: los números de recién */}
      <div style={{ position: "absolute", top: 640, left: IN_L, width: IN_W, display: "flex", flexDirection: "column", gap: 18 }}>
        {[
          { k: g, ico: "gasoil", t: "Gasoil", c: `${peso(GASOIL)} ÷ ${KM} km`, v: peso(GASOIL_KM) },
          { k: d, ico: "llave", t: "Desgaste", c: "cubiertas y aceite", v: peso(DESGASTE_KM) },
        ].map((x) => (
          <div
            key={x.t}
            style={{
              display: "flex", alignItems: "center", gap: 20, padding: "18px 24px", borderRadius: 24, background: "#16181f", border: "2px solid #2a2f3a",
              opacity: Math.min(1, x.k * 1.4), translate: `${(1 - x.k) * 120}px 0px`, scale: 0.8 + x.k * 0.2,
            }}
          >
            <Chip n={x.ico} s={72} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 40, color: "#eef0f5" }}>{x.t}</div>
              <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 28, color: GRIS }}>{x.c}</div>
            </div>
            <div style={{ fontFamily: display, fontSize: 84, color: "#f2f3f6" }}>{x.v}</div>
          </div>
        ))}
      </div>
      {f >= 230 ? (
        <div style={{ position: "absolute", top: 940, left: IN_L - 40, width: IN_W + 80, textAlign: "center", fontFamily: display, lineHeight: 1, color: AMBER, opacity: tot, scale: slam(f, 230) }}>
          <span style={{ fontSize: 200 }}>= {peso(POR_KM)}</span> <span style={{ fontSize: 80, color: GRIS }}>por km</span>
        </div>
      ) : null}
    </Camara>
  );
};

// ── B · El traslado de $ 38.000 y la carrera ────────────────────────
const avance = (f: number, i: number) => interpolate(f, [TRAMOS[i].desde, TRAMOS[i].hasta], [0, 1], { ...clamp, easing: i === 2 ? Easing.inOut(Easing.quad) : Easing.inOut(Easing.cubic) });
const kmEn = (f: number) => TRAMOS.reduce((s, t, i) => s + t.km * avance(f, i), 0);
const FIJOS_AT = 572;
const costoEn = (f: number) => {
  const peajes = PEAJES.filter((p) => avance(f, p.tramo) >= p.en).length * PEAJE;
  return FIJOS_SERV * r(f, FIJOS_AT, FIJOS_AT + 14) + kmEn(f) * POR_KM + peajes;
};
// cuadro en el que el costo pasa lo que te pagan
const CRUCE = (() => {
  for (let f = TRAMOS[0].desde; f < 1100; f++) if (costoEn(f) >= PAGO) return f;
  return 1100;
})();
const ESCALA = 46000;

const Carrera: React.FC<{ f: number }> = ({ f }) => {
  const notif = r(f, CORTE_B + 8, CORTE_B + 24, Easing.out(Easing.back(1.3)));
  const buzz = f - (CORTE_B + 12) < 10 && f > CORTE_B + 12 ? Math.sin((f - CORTE_B - 12) * 2.4) * 7 : 0;
  const bueno = pop(f, 520, 540);
  const pasa = r(f, 556, 580, Easing.inOut(Easing.cubic)); // la notificación se vuelve el marcador
  const costo = costoEn(f);
  const cruzo = f >= CRUCE;
  const flash = cruzo ? 1 - r(f, CRUCE, CRUCE + 22) : 0;
  const shake = temblor(f, CRUCE, 20);
  const mapa = r(f, 572, 592);
  const km = kmEn(f);
  return (
    <Camara f={f} zoom={[1, 1.02]} from={CORTE_B} to={CORTE_C + 10} rot={0.4}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #1a2236, #070a12 75%)", translate: `${shake}px 0px` }} />
      {/* el mapa real, con el recorrido de los tres tramos */}
      {f >= 560 ? (
        <AbsoluteFill style={{ opacity: mapa, translate: `${shake}px 0px` }}>
          <MapaFijo avance={[avance(f, 0), avance(f, 1), avance(f, 2)]} f={f} />
          <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(7,10,18,.96) 0%, rgba(7,10,18,.9) 27%, rgba(7,10,18,0) 31%, rgba(7,10,18,0) 54%, rgba(7,10,18,.94) 57%, rgba(7,10,18,.98) 100%)" }} />
          <div style={{ position: "absolute", right: 1080 - IN_L - IN_W, top: 1050, fontFamily: sans, fontWeight: 500, fontSize: 18, color: "rgba(255,255,255,.6)" }}>© OpenFreeMap © OpenMapTiles © OpenStreetMap</div>
        </AbsoluteFill>
      ) : null}
      {/* la notificación del pedido */}
      {pasa < 1 ? (
        <div
          style={{
            position: "absolute", left: IN_L, width: IN_W, top: 340, height: 170, borderRadius: 36, background: "rgba(40,45,58,.95)", border: "1px solid rgba(255,255,255,.08)",
            display: "flex", alignItems: "center", gap: 22, padding: "0 28px", boxShadow: "0 30px 60px rgba(0,0,0,.55)",
            translate: `${buzz}px ${(1 - notif) * -260 - pasa * 40}px`, opacity: Math.min(1, notif * 1.5) * (1 - pasa), scale: 1 - pasa * 0.2,
          }}
        >
          <span style={{ width: 92, height: 92, borderRadius: 26, background: "#5b6378", display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 700, fontSize: 34, color: "#e9ecf2", flexShrink: 0 }}>AS</span>
          <span style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: sans, fontWeight: 700, fontSize: 28, color: GRIS }}>
              <span>Asistencia del Sur</span>
              <span>ahora</span>
            </div>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 40, color: "#eef0f5", marginTop: 4 }}>
              Traslado · te pagamos <span style={{ color: AMBER }}>{peso(PAGO)}</span>
            </div>
          </span>
        </div>
      ) : null}
      {/* lo que te pagan, grande */}
      {f >= 420 && pasa < 1 ? (
        <div style={{ position: "absolute", top: 600, left: 0, right: 0, textAlign: "center", opacity: Math.min(1, pop(f, 420, 444) * 1.4) * (1 - pasa), scale: (0.6 + pop(f, 420, 444) * 0.4) * (1 - pasa * 0.3) }}>
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, letterSpacing: 3, color: GRIS }}>TE PAGAN</div>
          <div style={{ fontFamily: display, fontSize: 240, lineHeight: 1, color: AMBER }}>{peso(PAGO)}</div>
        </div>
      ) : null}
      {f >= 520 && pasa < 1 ? (
        <div style={{ position: "absolute", top: 920, left: 0, right: 0, textAlign: "center", fontFamily: display, fontSize: 110, color: "#f2f3f6", opacity: Math.min(1, bueno * 1.4) * (1 - pasa), scale: 0.6 + bueno * 0.4 }}>
          Parece bueno.
        </div>
      ) : null}
      {/* arriba: lo que te pagan contra lo que te cuesta */}
      <div style={{ position: "absolute", top: 310, left: IN_L, width: IN_W, opacity: pasa, translate: `0px ${(1 - pasa) * 30}px` }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 3, color: GRIS }}>TE PAGAN</div>
            <div style={{ fontFamily: display, fontSize: 110, lineHeight: 1, color: AMBER }}>{peso(PAGO)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, letterSpacing: 3, color: cruzo ? CORAL : GRIS }}>TE CUESTA</div>
            <div style={{ fontFamily: display, fontSize: 110, lineHeight: 1, color: cruzo ? CORAL : "#f2f3f6", scale: 1 + flash * 0.12, transformOrigin: "100% 50%" }}>{peso(Math.round(costo / 10) * 10)}</div>
          </div>
        </div>
        <div style={{ position: "relative", height: 34, borderRadius: 10, background: "#20242e", marginTop: 14, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(Math.min(costo, PAGO) / ESCALA) * 100}%`, background: `repeating-linear-gradient(135deg, ${CELESTE}99 0 12px, ${CELESTE}55 12px 24px)` }} />
          {cruzo ? <div style={{ position: "absolute", left: `${(PAGO / ESCALA) * 100}%`, top: 0, bottom: 0, width: `${((costo - PAGO) / ESCALA) * 100}%`, background: `repeating-linear-gradient(135deg, ${CORAL} 0 12px, #c4544a 12px 24px)` }} /> : null}
          <div style={{ position: "absolute", left: `${(PAGO / ESCALA) * 100}%`, top: -2, bottom: -2, width: 5, background: AMBER, boxShadow: `0 0 12px ${AMBER}` }} />
        </div>
        <div style={{ position: "relative", height: 34, marginTop: 6 }}>
          <span style={{ position: "absolute", left: `${(PAGO / ESCALA) * 100}%`, translate: "-50% 0", fontFamily: mono, fontWeight: 700, fontSize: 22, color: AMBER, whiteSpace: "nowrap" }}>lo que te pagan</span>
        </div>
      </div>
      {/* fijos del servicio, al arrancar */}
      {f >= FIJOS_AT ? (
        <div style={{ position: "absolute", top: 1100, left: IN_L, width: IN_W, display: "flex", justifyContent: "space-between", fontFamily: mono, fontWeight: 700, fontSize: 28, color: "#c9cfdc", opacity: r(f, FIJOS_AT, FIJOS_AT + 14) }}>
          <span>KM {Math.round(km)} / {KM_TOTAL} · × {peso(POR_KM)}</span>
          <span style={{ color: CELESTE }}>+ fijos {peso(FIJOS_SERV)}</span>
        </div>
      ) : null}
      {/* el momento en que empezás a perder */}
      {cruzo ? (
        <div style={{ position: "absolute", top: 1150, left: IN_L - 30, width: IN_W + 60, textAlign: "center", fontFamily: display, fontSize: 90, lineHeight: 1, color: CORAL, scale: slam(f, CRUCE), opacity: r(f, CRUCE, CRUCE + 4) }}>
          Acá empezás a perder
        </div>
      ) : null}
      <AbsoluteFill style={{ background: CORAL, opacity: flash * 0.2, pointerEvents: "none" }} />
    </Camara>
  );
};

// ── C · La cuenta del traslado ──────────────────────────────────────
const Cuentita: React.FC<{ f: number }> = ({ f }) => {
  const filas: { ico: string; t: string; c: string; v: number; at: number }[] = [
    { ico: "ruta", t: "Kilómetros", c: `${KM_TOTAL} km × ${peso(POR_KM)}`, v: KM_TOTAL * POR_KM, at: 1040 },
    { ico: "peaje", t: "Peaje", c: `${PEAJES.length} × ${peso(PEAJE)} · autopista`, v: PEAJES.length * PEAJE, at: 1058 },
    { ico: "cal", t: "Fijos del servicio", c: `${peso(FIJOS_DIA)} ÷ ${SERVICIOS}`, v: FIJOS_SERV, at: 1076 },
  ];
  const tot = pop(f, 1100, 1120);
  const pag = r(f, 1124, 1140);
  const perdiste = 1188;
  const shake = temblor(f, perdiste + 10, 20);
  return (
    <Camara f={f} zoom={[1.04, 1]} from={CORTE_C} to={CORTE_D + 10}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #1a2236, #070a12 72%)", translate: `${shake}px 0px` }} />
      <Palabra f={f} from={perdiste} to={CORTE_D} top={700}>PERDISTE</Palabra>
      <div style={{ position: "absolute", top: 300, left: IN_L, width: IN_W, translate: `${shake}px 0px` }}>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 28, letterSpacing: 3, color: GRIS, opacity: r(f, CORTE_C, CORTE_C + 14) }}>LA CUENTA DEL TRASLADO</div>
        {filas.map((x) => {
          const e = r(f, x.at, x.at + 16);
          return (
            <div key={x.t} style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 16, paddingBottom: 14, borderBottom: "2px dashed rgba(255,255,255,.12)", opacity: e, translate: `${(1 - e) * 60}px 0px` }}>
              <Chip n={x.ico} s={64} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 36, color: "#eef0f5" }}>{x.t}</div>
                <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 26, color: GRIS }}>{x.c}</div>
              </div>
              <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 40, color: "#eef0f5" }}>{peso(x.v)}</div>
            </div>
          );
        })}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 22, opacity: Math.min(1, tot * 1.4) }}>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, letterSpacing: 3, color: GRIS }}>TE COSTÓ</span>
          <span style={{ fontFamily: display, fontSize: 120, lineHeight: 1, color: "#f2f3f6", scale: 0.7 + tot * 0.3, transformOrigin: "100% 50%" }}>{peso(COSTO)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", opacity: pag }}>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, letterSpacing: 3, color: GRIS }}>TE PAGARON</span>
          <span style={{ fontFamily: display, fontSize: 96, lineHeight: 1, color: AMBER }}>{peso(PAGO)}</span>
        </div>
      </div>
      {f >= perdiste ? (
        <div style={{ position: "absolute", top: 1010, left: IN_L - 40, width: IN_W + 80, textAlign: "center", fontFamily: display, lineHeight: 0.95, scale: slam(f, perdiste), opacity: r(f, perdiste, perdiste + 4), textShadow: "0 12px 50px rgba(0,0,0,.7)" }}>
          <div style={{ fontSize: 110, color: "#f2f3f6" }}>Perdiste</div>
          <div style={{ fontSize: 140, color: CORAL }}>− {peso(PIERDE)}</div>
        </div>
      ) : null}
    </Camara>
  );
};

// ── D · Esto es lo que no estás haciendo: la cuenta ─────────────────
const LA_CUENTA = 1404;
const Remate: React.FC<{ f: number }> = ({ f }) => {
  const t1 = r(f, CORTE_D + 12, CORTE_D + 28);
  const shake = temblor(f, LA_CUENTA + 10, 22);
  const sub = r(f, 1462, 1480);
  return (
    <Camara f={f} zoom={[1.06, 1]} from={CORTE_D} to={FASE2_DUR}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 42%, #1d2740, #070a12 72%)", translate: `${shake}px 0px` }} />
      <Palabra f={f} from={LA_CUENTA} to={FASE2_DUR} top={700}>LA CUENTA</Palabra>
      <div style={{ position: "absolute", top: 360, left: IN_L, width: IN_W, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 62, lineHeight: 1.15, color: "#eef0f5", opacity: t1, translate: `0px ${(1 - t1) * 30}px` }}>
          Esto es lo que
          <br />
          no estás haciendo:
      </div>
      {f >= LA_CUENTA ? (
        <div style={{ position: "absolute", top: 540, left: IN_L - 60, width: IN_W + 120, textAlign: "center", fontFamily: display, fontSize: 210, lineHeight: 1, color: AMBER, scale: slam(f, LA_CUENTA), opacity: r(f, LA_CUENTA, LA_CUENTA + 4), translate: `${shake}px 0px`, textShadow: "0 16px 70px rgba(245,166,35,.3)" }}>
          la cuenta.
        </div>
      ) : null}
      <div style={{ position: "absolute", top: 860, left: IN_L, width: IN_W, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 48, lineHeight: 1.25, color: "#c9cfdc", opacity: sub, translate: `0px ${(1 - sub) * 24}px` }}>
        Si no la hacés, capaz estás
        <br />
        perdiendo plata <span style={{ color: AMBER }}>y no te enterás.</span>
      </div>
    </Camara>
  );
};

export const Fase2: React.FC<{ guia?: boolean }> = ({ guia = false }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#050608", overflow: "hidden" }}>
      <Toma f={f} from={0} to={CORTE_B}>
        <PorKm f={f} />
      </Toma>
      <Toma f={f} from={CORTE_B} to={CORTE_C}>
        <Carrera f={f} />
      </Toma>
      <Toma f={f} from={CORTE_C} to={CORTE_D}>
        <Cuentita f={f} />
      </Toma>
      <Toma f={f} from={CORTE_D} to={FASE2_DUR + 20}>
        <Remate f={f} />
      </Toma>
      <Vineta />
      <Grano f={f} />
      {VOZ.map(([n, at]) => (
        <Audio key={n} name={n} src={staticFile(`vo/${n}.wav`)} from={at} volume={1} />
      ))}
      <Audio name="Pregunta" src={staticFile("sfx/whip.wav")} from={98} volume={0.5} />
      <Audio name="Gasoil" src={staticFile("sfx/mouse-click.wav")} from={140} volume={0.35} />
      <Audio name="Desgaste" src={staticFile("sfx/mouse-click.wav")} from={182} volume={0.35} />
      <Audio name="Por km" src={staticFile("sfx/whip.wav")} from={232} volume={0.7} />
      {[CORTE_B, CORTE_C, CORTE_D].map((c) => (
        <Audio key={`w${c}`} name="Corte" src={staticFile("sfx/whoosh.wav")} from={c - 6} volume={0.45} />
      ))}
      <Audio name="Pedido" src={staticFile("sfx/ding.wav")} from={CORTE_B + 12} volume={0.5} />
      {TRAMOS.map((t) => (
        <Audio key={t.txt} name="Tramo" src={staticFile("sfx/whoosh.wav")} from={t.desde} volume={0.25} />
      ))}
      <Audio name="Acá empezás a perder" src={staticFile("sfx/record-scratch.wav")} from={CRUCE} volume={0.5} />
      {[1040, 1058, 1076].map((at) => (
        <Audio key={at} name="Fila" src={staticFile("sfx/page-turn.wav")} from={at} volume={0.3} />
      ))}
      <Audio name="Perdiste" src={staticFile("sfx/whip.wav")} from={1190} volume={0.8} />
      <Audio name="La cuenta" src={staticFile("sfx/whip.wav")} from={LA_CUENTA + 2} volume={0.9} />
      {guia ? <ReelsGuide /> : null}
    </AbsoluteFill>
  );
};
