import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { clamp, display, mono, sans } from "../theme";
import { SAFE } from "../gastos/common";
import { ReelsGuide } from "../monogrua/StepFrame";
import { Logo } from "../scenes/Logo";
import { Ico } from "../solo/ui";
import { Firma } from "../solo/Firma";
import { Billete, Camara, Grano, Toma } from "./Gancho";

// Reel nuevo, parte 2: la transición (de lo oscuro a lo claro) y el desarrollo con la app.
// Fondo claro, tarjetas blancas que flotan, cámara que no para, cortes con desenfoque. 60 fps.
const W = SAFE.right - SAFE.left;
const AMBER = "#f5a623";
const INK = "#14161b";
// Las tarjetas de la app van en negro sobre el fondo claro
const TXT = "#f2f3f6";
const MUTED = "#9aa3b8";
const LINE = "#2a2f3a";
const SOFT = "#1f232c";
const OKBG = "rgba(245,166,35,.16)";
const CARD: React.CSSProperties = { background: "#14161b", borderRadius: 44, boxShadow: "0 40px 90px rgba(10,12,18,.35), 0 6px 18px rgba(10,12,18,.2)", border: "1px solid rgba(255,255,255,.06)" };

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const r = (f: number, a: number, b: number, e = ease) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: e });
const pop = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
const money = (n: number) => "$ " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

// Voz en off (prueba), en cuadros a 60 fps
const VOZ: { src: string; at: number; dur: number; texto: string }[] = [
  { src: "vo/desarrollo-l1.wav", at: 96, dur: 147, texto: "Con AuxiliOS, cada servicio queda en tu celular." },
  { src: "vo/desarrollo-l2.wav", at: 312, dur: 122, texto: "El remito, con fotos y firma, al toque." },
  { src: "vo/desarrollo-l3.wav", at: 576, dur: 60, texto: "Te avisa quién te debe." },
  { src: "vo/desarrollo-l4.wav", at: 756, dur: 110, texto: "Y sabés cuánto te deja cada servicio." },
];
const S0 = 150, S1 = 300, S2 = 560, S3 = 740;
export const DESARROLLO_DUR = 1110;

// Subtítulo palabra por palabra, abajo de las tarjetas
const Subtitulo: React.FC<{ f: number }> = ({ f }) => {
  const v = VOZ.find((x) => f >= x.at - 6 && f < x.at + x.dur + 24);
  if (!v) return null;
  const all = v.texto.split(" ");
  const total = all.reduce((s, w) => s + w.length + 1, 0);
  // cuándo se dice cada palabra y en qué tramo de un renglón va (hasta ~24 letras)
  let acc = 0, tramo = 0, largo = 0;
  const pal = all.map((w) => {
    if (largo + w.length > 24 && largo > 0) { tramo++; largo = 0; }
    largo += w.length + 1;
    const at = v.at + (acc / total) * v.dur;
    acc += w.length + 1;
    return { w, at, tramo };
  });
  const actual = pal.reduce((t, p) => (f >= p.at - 2 ? p.tramo : t), 0);
  const words = pal.filter((p) => p.tramo === actual);
  const e = r(f, v.at - 6, v.at + 4);
  const out = r(f, v.at + v.dur + 12, v.at + v.dur + 24);
  return (
    <div style={{ position: "absolute", top: 1166, left: SAFE.left, width: W, display: "flex", justifyContent: "center", opacity: e * (1 - out), translate: `0px ${(1 - e) * 16}px`, zIndex: 50 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 13px", padding: "10px 22px", borderRadius: 20, background: "rgba(20,22,27,.86)", fontFamily: sans, fontWeight: 700, fontSize: 48, lineHeight: 1.15, maxWidth: W, whiteSpace: "nowrap" }}>
        {words.map(({ w, at }, i) => {
          const on = f >= at;
          return (
            <span key={i} style={{ color: on ? AMBER : "rgba(255,255,255,.92)", display: "inline-block", scale: on ? 1 + Math.max(0, 1 - (f - at) / 8) * 0.08 : 1 }}>
              {w}
            </span>
          );
        })}
      </div>
    </div>
  );
};

// Palabra gigante de fondo, llena y muy suave (como en la referencia)
const Palabra: React.FC<{ f: number; from: number; children: string; top?: number }> = ({ f, from, children, top = 110 }) => (
  <div style={{ position: "absolute", left: -80, right: -80, top, textAlign: "center", fontFamily: display, fontSize: 300, lineHeight: 1, color: "rgba(20,24,35,.06)", letterSpacing: 4, translate: `${-(f - from) * 0.5}px 0px`, opacity: r(f, from, from + 16) }}>
    {children}
  </div>
);
const Fondo: React.FC = () => <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 38%, #ffffff 0%, #eef0f4 62%, #e2e5ec 100%)" }} />;

const Tap: React.FC<{ f: number; at: number; x: number; y: number }> = ({ f, at, x, y }) => {
  if (f < at - 14 || f > at + 24) return null;
  const come = r(f, at - 14, at);
  const out = r(f, at, at + 24);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, zIndex: 60 }}>
      <div style={{ position: "absolute", left: -80, top: -80, width: 160, height: 160, borderRadius: "50%", border: `5px solid ${AMBER}`, opacity: f >= at ? 1 - out : 0, scale: 0.4 + out }} />
      <div style={{ position: "absolute", left: -38, top: -38, width: 76, height: 76, borderRadius: "50%", background: "rgba(20,22,27,.22)", backdropFilter: "blur(2px)", border: "3px solid rgba(255,255,255,.9)", opacity: (f < at ? come : 1 - out) * 0.95, scale: f < at ? 1.3 - come * 0.3 : 0.85 }} />
    </div>
  );
};

// ── Transición: lo que queda de la plata se va y se hace la luz ─────
const CX = 540, CY = 900, LOGO_Y = 760;
const ICONOS: [string, string][] = [ // ícono y para qué es
  ["file", "Remito"],
  ["cash", "Cobros"],
  ["gauge", "Números"],
  ["route", "Servicios"],
];
const Transicion: React.FC<{ f: number }> = ({ f }) => {
  const chupa = r(f, 24, 58, Easing.in(Easing.cubic));
  const tiembla = f < 30 ? Math.sin(f * 1.7) * 4 : 0;
  const luz = r(f, 44, 84, Easing.inOut(Easing.cubic));
  const logo = pop(f, 72, 100);
  // el logo sube a la parte de arriba cuando aparecen los servicios
  const sube = r(f, S0, S0 + 36);
  const orbitaOut = r(f, S0, S0 + 26);
  return (
    <>
      {/* lo oscuro: dos billetes que tiemblan y se los chupa el centro */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #1d2029, #050608 72%)" }}>
        <div style={{ position: "absolute", left: CX - 280, top: 860, width: 560, height: 260, translate: `${tiembla}px 0px`, scale: 1 - chupa * 0.95, rotate: `${chupa * 140}deg`, opacity: 1 - chupa, filter: chupa > 0 ? `blur(${chupa * 14}px)` : undefined }}>
          <Billete style={{ left: 0, top: 0 }} />
          <Billete style={{ left: 0, top: -11 }} />
        </div>
      </AbsoluteFill>
      {/* la luz: un círculo que abre lo claro desde el centro */}
      <AbsoluteFill style={{ clipPath: `circle(${luz * 1300}px at ${CX}px ${CY}px)` }}>
        <Fondo />
        <div style={{ position: "absolute", left: 0, right: 0, top: interpolate(sube, [0, 1], [LOGO_Y - 85, 250]), display: "flex", justifyContent: "center", scale: (0.45 + logo * 0.25) * (1 - sube * 0.18), opacity: Math.min(1, logo * 1.3) }}>
          <Logo size={0.95} ink={INK} />
        </div>
        {ICONOS.map(([n], i) => {
          const e = pop(f, 84 + i * 6, 104 + i * 6);
          const a = (i / ICONOS.length) * Math.PI * 2 - Math.PI / 4 + f * 0.01;
          const rad = 1 - orbitaOut;
          return (
            <div
              key={n}
              style={{
                position: "absolute", left: CX + Math.cos(a) * 370 * rad - 66, top: LOGO_Y + Math.sin(a) * 330 * rad - 66, width: 132, height: 132, borderRadius: 40, ...CARD,
                display: "grid", placeItems: "center", color: AMBER, opacity: e * (1 - orbitaOut), scale: 0.5 + e * 0.5,
              }}
            >
              <Ico n={n} s={30} w={2.4} />
            </div>
          );
        })}
      </AbsoluteFill>
      {/* el borde de la luz brilla mientras abre */}
      {luz > 0 && luz < 1 ? <div style={{ position: "absolute", left: CX - luz * 1300, top: CY - luz * 1300, width: luz * 2600, height: luz * 2600, borderRadius: "50%", boxShadow: `0 0 120px 40px rgba(245,166,35,${0.45 * (1 - luz)})`, pointerEvents: "none" }} /> : null}
    </>
  );
};

// ── 0 · Cada servicio queda en tu celular ───────────────────────────
const SERVICIOS: [string, string, string, string, boolean][] = [
  ["08:10", "Martín Gómez · particular", "Monte Grande → Lomas", "$ 60.000", true],
  ["11:40", "Asistencia del Sur", "Adrogué → Banfield", "$ 48.000", true],
  ["15:20", "Auxilio Vial Norte", "Lanús → Avellaneda", "En curso", false],
];
const Servicios: React.FC<{ f: number }> = ({ f }) => {
  const e = r(f, S0 + 24, S0 + 46);
  return (
    <div style={{ position: "absolute", left: SAFE.left, width: W, top: 470, height: 640, ...CARD, padding: "36px 40px", opacity: e, translate: `0px ${(1 - e) * 80}px` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 44, color: TXT }}>Hoy</span>
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 28, color: MUTED }}>jueves 5 · 3 servicios</span>
      </div>
      {SERVICIOS.map(([h, quien, ruta, monto, ok], i) => {
        const k = r(f, S0 + 44 + i * 14, S0 + 64 + i * 14);
        return (
          <div key={h} style={{ display: "flex", alignItems: "center", gap: 22, height: 164, borderTop: i ? `2px solid ${LINE}` : "none", marginTop: i ? 0 : 18, opacity: k, translate: `${(1 - k) * 60}px 0px` }}>
            <span style={{ width: 84, height: 84, borderRadius: 26, background: ok ? OKBG : AMBER, color: ok ? AMBER : INK, display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Ico n={ok ? "check" : "route"} s={20} w={2.8} />
            </span>
            <span style={{ flex: 1 }}>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 34, color: TXT }}>{quien}</div>
              <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 27, color: MUTED }}>{h} · {ruta}</div>
            </span>
            <span style={{ fontFamily: ok ? mono : sans, fontWeight: 700, fontSize: ok ? 32 : 26, color: ok ? TXT : AMBER, padding: ok ? 0 : "8px 16px", borderRadius: 999, border: ok ? "none" : `3px solid ${AMBER}`, opacity: ok ? 1 : 0.6 + 0.4 * Math.abs(Math.sin(f / 14)) }}>{monto}</span>
          </div>
        );
      })}
    </div>
  );
};

// ── 1 · El remito con fotos y firma ─────────────────────────────────
const FOTOS = ["frente", "lateral", "trasera", "odometro"];
const FOTO0 = S1 + 22, FOTO_CADA = 14;
const FIRMA0 = S1 + 92, FIRMA_LENTO = 1.25;
const ENVIA = S1 + 196;
const Remito: React.FC<{ f: number }> = ({ f }) => {
  const e = r(f, S1, S1 + 18);
  const firmaMs = Math.max(0, ((f - FIRMA0) / 60) * 1000) / FIRMA_LENTO;
  const enviado = f >= ENVIA + 2;
  const press = interpolate(f, [ENVIA - 5, ENVIA, ENVIA + 8], [1, 0.95, 1], clamp);
  return (
    <div style={{ position: "absolute", left: SAFE.left, width: W, top: 330, height: 820, ...CARD, padding: "34px 38px", opacity: e, scale: 0.94 + e * 0.06 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: MUTED }}>REMITO N.º 0483</div>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 38, color: TXT, marginTop: 4 }}>Chevrolet Vectra · Martín Gómez</div>
        </span>
      </div>
      {/* fotos del vehículo */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 22 }}>
        {FOTOS.map((n, i) => {
          const at = FOTO0 + i * FOTO_CADA;
          const k = pop(f, at, at + 14);
          const flash = interpolate(f, [at, at + 2, at + 12], [0, 1, 0], clamp);
          return (
            <div key={n} style={{ position: "relative", height: 168, borderRadius: 24, overflow: "hidden", background: SOFT, border: `2px dashed ${f >= at ? "transparent" : LINE}` }}>
              {f >= at ? <Img src={staticFile(`fotos/${n}.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover", scale: 0.85 + k * 0.15, opacity: Math.min(1, k * 1.2) }} /> : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#5a6278" }}><Ico n="camera" s={22} /></div>}
              <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash * 0.9 }} />
            </div>
          );
        })}
      </div>
      {/* firma */}
      <div style={{ position: "relative", marginTop: 22, height: 168, borderRadius: 24, background: "#f6f7f9", border: "2px solid #2a2f3a", overflow: "hidden" }}>
        <span style={{ position: "absolute", left: 22, top: 14, fontFamily: sans, fontWeight: 700, fontSize: 24, color: "#6b7285" }}>Firma del cliente</span>
        <div style={{ position: "absolute", left: "10%", right: "10%", bottom: 34, borderTop: "2px dashed #d5d9e1" }} />
        <div style={{ position: "absolute", inset: "16px 60px 10px" }}>{f >= FIRMA0 ? <Firma ms={firmaMs} color="#1b2a6b" stroke={10} /> : null}</div>
      </div>
      {/* enviar */}
      <div
        style={{
          marginTop: 22, height: 104, borderRadius: 30, display: "flex", alignItems: "center", justifyContent: "center", gap: 14, fontFamily: sans, fontWeight: 700, fontSize: 38,
          background: enviado ? OKBG : AMBER, color: enviado ? AMBER : INK, scale: press, boxShadow: enviado ? "none" : "0 18px 40px rgba(245,166,35,.4)",
        }}
      >
        {enviado ? <><Ico n="check" s={18} w={3} /> Enviado al cliente</> : <><Ico n="msg" s={18} w={2.4} /> Enviar por WhatsApp</>}
      </div>
    </div>
  );
};

// ── 2 · Te avisa quién te debe ──────────────────────────────────────
const COBRA = S2 + 120;
const Cobro: React.FC<{ f: number }> = ({ f }) => {
  const aviso = r(f, S2 + 6, S2 + 24, Easing.out(Easing.back(1.4)));
  const buzz = f - S2 - 18 >= 0 && f - S2 - 18 < 12 ? Math.sin((f - S2 - 18) * 2.6) * 7 : 0;
  const tarjeta = r(f, S2 + 34, S2 + 54);
  const cobrado = f >= COBRA + 2;
  const flip = r(f, COBRA + 2, COBRA + 16);
  const press = interpolate(f, [COBRA - 5, COBRA, COBRA + 8], [1, 0.95, 1], clamp);
  return (
    <>
      <div
        style={{
          position: "absolute", left: SAFE.left, width: W, top: 360, ...CARD, borderRadius: 36, padding: "24px 30px", display: "flex", gap: 22, alignItems: "center",
          translate: `${buzz}px ${(1 - aviso) * -200}px`, opacity: aviso,
        }}
      >
        <span style={{ width: 82, height: 82, borderRadius: 24, background: AMBER, color: INK, display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 700, fontSize: 28, flexShrink: 0 }}>OS</span>
        <span style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: sans, fontWeight: 700, fontSize: 24, color: MUTED }}>
            <span>AuxiliOS</span>
            <span>ahora</span>
          </div>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 34, color: TXT }}>{cobrado ? "Asistencia del Sur te pagó" : "Asistencia del Sur te debe $ 220.500"}</div>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 27, color: cobrado ? AMBER : MUTED }}>{cobrado ? "Cobrado el 05/12 ✓" : "Venció el 22/11 · hace 12 días"}</div>
        </span>
      </div>
      <div style={{ position: "absolute", left: SAFE.left, width: W, top: 590, height: 470, ...CARD, padding: "34px 40px", opacity: tarjeta, translate: `0px ${(1 - tarjeta) * 80}px`, boxShadow: cobrado ? `0 0 ${80 * flip}px rgba(245,166,35,.35), ${CARD.boxShadow}` : CARD.boxShadow }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ width: 80, height: 80, borderRadius: "50%", background: "#2a2f3a", color: TXT, display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 700, fontSize: 28 }}>AS</span>
          <span>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 38, color: TXT }}>Asistencia del Sur</div>
            <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 27, color: MUTED }}>{cobrado ? "Cobrado" : "Por cobrar"} · 4 remitos de octubre</div>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 26, fontFamily: mono, fontWeight: 700, fontSize: 104, color: TXT, lineHeight: 1, scale: cobrado ? 1 + (1 - flip) * 0.08 : 1, transformOrigin: "0 50%" }}>
          {cobrado ? <span style={{ color: AMBER }}><Ico n="check" s={30} w={3.2} /></span> : null}
          {money(220500)}
        </div>
        <div
          style={{
            marginTop: 34, height: 104, borderRadius: 30, display: "flex", alignItems: "center", justifyContent: "center", gap: 14, fontFamily: sans, fontWeight: 700, fontSize: 38,
            background: cobrado ? OKBG : AMBER, color: cobrado ? AMBER : INK, scale: press, boxShadow: cobrado ? "none" : "0 18px 40px rgba(245,166,35,.4)",
          }}
        >
          {cobrado ? <><Ico n="check" s={18} w={3} /> Cobrado</> : <><Ico n="cash" s={18} w={2.4} /> Marcar cobrado</>}
        </div>
      </div>
    </>
  );
};

// ── 3 · Sabés cuánto te deja cada servicio: el tramo y la suma de los gastos ─
const COBRO = 112500;
const KM = 22;
// Cada gasto entra cuando la grúa pasa por su punto del tramo (fracción del recorrido)
const PARADAS: [string, string, number, number][] = [
  ["⛽", "Gasoil", 22250, 0.2],
  ["🛞", "Desgaste (cubiertas, taller)", 9375, 0.42],
  ["🍔", "Comida y peajes", 4875, 0.62],
  ["🛡️", "Fijos (seguro, monotributo…)", 19437, 0.84],
];
const GASTOS = PARADAS.reduce((s, x) => s + x[2], 0); // 55.937
const DEJA = COBRO - GASTOS; // 56.563
const VIAJE0 = S3 + 30, VIAJE1 = S3 + 250;
const llegaA = (k: number) => Math.round(VIAJE0 + k * (VIAJE1 - VIAJE0));
const FINAL = VIAJE1 + 14;
// Puntos del tramo real: base → origen (4,1 km) → destino (+7,9 km) → base (+10 km)
const HITOS: [string, number][] = [
  ["Base", 0],
  ["Monte Grande", 4.1 / KM],
  ["Lomas", 12 / KM],
  ["Base", 1],
];
const LX0 = 40, LW = 790;
const Numeros: React.FC<{ f: number }> = ({ f }) => {
  const e = r(f, S3, S3 + 18);
  const e2 = r(f, S3 + 8, S3 + 26);
  const k = interpolate(f, [VIAJE0, VIAJE1], [0, 1], clamp);
  // subtotal de gastos que va sumando
  const sumado = PARADAS.reduce((s, [, , v, at]) => s + v * r(f, llegaA(at), llegaA(at) + 14), 0);
  const golpe = PARADAS.reduce((g, [, , , at]) => {
    const t = f - llegaA(at);
    return t >= 0 && t < 12 ? Math.sin(t * 2.6) * 8 * (1 - t / 12) : g;
  }, 0);
  const fin = pop(f, FINAL, FINAL + 18);
  const deja = interpolate(f, [FINAL, FINAL + 30], [0, DEJA], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <>
      {/* el tramo */}
      <div style={{ position: "absolute", left: SAFE.left, width: W, top: 330, height: 200, ...CARD, padding: "24px 0", opacity: e, translate: `0px ${(1 - e) * -40}px` }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 34px" }}>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 22, letterSpacing: 3, color: AMBER }}>UN SERVICIO · PARTICULAR</span>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 28, color: TXT }}>
            {(k * KM).toFixed(1).replace(".", ",")} <span style={{ color: MUTED, fontSize: 22 }}>km</span>
          </span>
        </div>
        <div style={{ position: "absolute", left: LX0, width: LW, top: 98, height: 10, borderRadius: 5, background: "#2a2f3a" }}>
          <div style={{ width: `${k * 100}%`, height: "100%", borderRadius: 5, background: AMBER }} />
        </div>
        {HITOS.map(([l, at], i) => (
          <div key={i} style={{ position: "absolute", left: LX0 + at * LW, top: 103, width: 0, height: 0 }}>
            <div style={{ position: "absolute", left: -11, top: -11, width: 22, height: 22, borderRadius: "50%", background: k >= at ? AMBER : "#2a2f3a", border: "4px solid #14161b" }} />
            <div style={{ position: "absolute", top: 22, left: i === 0 ? -10 : i === HITOS.length - 1 ? undefined : 0, right: i === HITOS.length - 1 ? -10 : undefined, translate: i === 0 || i === HITOS.length - 1 ? undefined : "-50% 0", fontFamily: sans, fontWeight: 700, fontSize: 22, color: k >= at ? TXT : MUTED, whiteSpace: "nowrap" }}>{l}</div>
          </div>
        ))}
        {/* cada gasto, marcado arriba de la línea cuando la grúa pasa */}
        {PARADAS.map(([em, l, , at]) => (
          <div key={l} style={{ position: "absolute", left: LX0 + at * LW - 20, top: 46, width: 40, height: 40, borderRadius: 12, background: SOFT, display: "grid", placeItems: "center", fontSize: 22, opacity: pop(f, llegaA(at), llegaA(at) + 12), scale: 0.6 + pop(f, llegaA(at), llegaA(at) + 12) * 0.4 }}>{em}</div>
        ))}
        {/* la grúa */}
        <div style={{ position: "absolute", left: LX0 + k * LW, top: 103, width: 0, height: 0 }}>
          <div style={{ position: "absolute", left: -30, top: -30, width: 60, height: 60, borderRadius: "50%", background: "rgba(245,166,35,.25)", scale: 1 + 0.2 * Math.sin(f / 6) }} />
          <div style={{ position: "absolute", left: -18, top: -18, width: 36, height: 36, borderRadius: "50%", background: AMBER, border: "5px solid #fff", display: "grid", placeItems: "center", color: INK }}>
            <Ico n="route" s={10} w={3} />
          </div>
        </div>
      </div>
      {/* el taxímetro: la cuenta del servicio */}
      <div style={{ position: "absolute", left: SAFE.left, width: W, top: 552, height: 596, ...CARD, padding: "26px 36px", opacity: e2, translate: `${golpe}px ${(1 - e2) * 60}px`, boxShadow: fin > 0 ? `0 0 ${90 * Math.min(1, fin)}px rgba(245,166,35,.4), ${CARD.boxShadow}` : CARD.boxShadow }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", height: 64 }}>
          <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 34, color: TXT }}>Cobrás</span>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 42, color: TXT }}>{money(COBRO)}</span>
        </div>
        <div style={{ borderTop: `2px solid ${LINE}`, margin: "4px 0 6px" }} />
        {PARADAS.map(([em, l, v, at]) => {
          const t = llegaA(at);
          const kk = r(f, t, t + 12);
          return (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 62, opacity: kk, translate: `${(1 - kk) * 60}px 0px` }}>
              <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 28, color: "#d6d9e2" }}>{em} {l}</span>
              <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 32, color: "#d6d9e2" }}>− {money(v)}</span>
            </div>
          );
        })}
        {/* subtotal de gastos */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 66, marginTop: 6, padding: "0 18px", borderRadius: 18, background: SOFT, opacity: r(f, llegaA(PARADAS[0][3]), llegaA(PARADAS[0][3]) + 10) }}>
          <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, color: MUTED }}>Gastos de este servicio</span>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 36, color: TXT }}>− {money(sumado)}</span>
        </div>
        {/* lo que te deja */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, paddingTop: 16, borderTop: `3px dashed ${LINE}`, opacity: Math.min(1, fin), scale: 0.94 + Math.min(1, fin) * 0.06, transformOrigin: "50% 0" }}>
          <span style={{ fontFamily: display, fontSize: 64, color: AMBER, lineHeight: 1 }}>Te deja</span>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 84, color: AMBER, lineHeight: 1, textShadow: "0 0 24px rgba(245,166,35,.45)" }}>{money(deja)}</span>
        </div>
      </div>
    </>
  );
};

// ── Armado ──────────────────────────────────────────────────────────
export const Desarrollo: React.FC<{ guia?: boolean }> = ({ guia = false }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#050608", overflow: "hidden" }}>
      {/* transición y servicios comparten la toma: el logo sube y entra la lista */}
      <Toma f={f} from={0} to={S1}>
        <Transicion f={f} />
        {f >= S0 ? (
          <Camara f={f} zoom={[1, 1.05]} from={S0} to={S1}>
            <Palabra f={f} from={S0} top={1180}>SERVICIOS</Palabra>
            <Servicios f={f} />
          </Camara>
        ) : null}
      </Toma>
      <Toma f={f} from={S1} to={S2}>
        <Camara f={f} zoom={[1.02, 1.08]} from={S1} to={S2}>
          <Fondo />
          <Palabra f={f} from={S1}>REMITO</Palabra>
          <Remito f={f} />
          <Tap f={f} at={ENVIA} x={540} y={1082} />
        </Camara>
      </Toma>
      <Toma f={f} from={S2} to={S3}>
        <Camara f={f} zoom={[1.03, 1]} from={S2} to={S3} rot={-1}>
          <Fondo />
          <Palabra f={f} from={S2} top={1110}>COBROS</Palabra>
          <Cobro f={f} />
          <Tap f={f} at={COBRA} x={540} y={932} />
        </Camara>
      </Toma>
      <Toma f={f} from={S3} to={DESARROLLO_DUR + 20}>
        <Camara f={f} zoom={[1.06, 1]} from={S3} to={DESARROLLO_DUR}>
          <Fondo />
          <Palabra f={f} from={S3}>SERVICIO</Palabra>
          <Numeros f={f} />
        </Camara>
      </Toma>
      <Grano f={f} />
      <Subtitulo f={f} />
      {VOZ.map((v) => (
        <Audio key={v.src} name={v.texto} src={staticFile(v.src)} from={v.at} volume={1} />
      ))}
      <Audio name="Se la chupa" src={staticFile("sfx/whoosh.wav")} from={22} volume={0.6} />
      <Audio name="Luz" src={staticFile("sfx/whip.wav")} from={50} volume={0.6} />
      <Audio name="Logo" src={staticFile("sfx/ding.wav")} from={76} volume={0.45} />
      {[S1, S2, S3].map((c) => (
        <Audio key={c} name="Corte" src={staticFile("sfx/whoosh.wav")} from={c - 6} volume={0.4} />
      ))}
      {FOTOS.map((n, i) => (
        <Audio key={n} name="Foto" src={staticFile("sfx/shutter.wav")} from={FOTO0 + i * FOTO_CADA} volume={0.35} />
      ))}
      <Audio name="Enviar" src={staticFile("sfx/mouse-click.wav")} from={ENVIA} volume={0.5} />
      <Audio name="Enviado" src={staticFile("sfx/ding.wav")} from={ENVIA + 4} volume={0.4} />
      <Audio name="Aviso" src={staticFile("sfx/ding.wav")} from={S2 + 14} volume={0.4} />
      <Audio name="Cobrar" src={staticFile("sfx/mouse-click.wav")} from={COBRA} volume={0.5} />
      <Audio name="Cobrado" src={staticFile("sfx/ding.wav")} from={COBRA + 4} volume={0.5} />
      {PARADAS.map(([, l, , at]) => (
        <Audio key={l} name="Gasto" src={staticFile("sfx/mouse-click.wav")} from={llegaA(at)} volume={0.5} />
      ))}
      <Audio name="Te deja" src={staticFile("sfx/ding.wav")} from={FINAL} volume={0.6} />
      {guia ? <ReelsGuide /> : null}
    </AbsoluteFill>
  );
};
