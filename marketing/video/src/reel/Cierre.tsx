import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { clamp, display, mono, sans } from "../theme";
import { SAFE } from "../gastos/common";
import { ReelsGuide } from "../monogrua/StepFrame";
import { Logo } from "../scenes/Logo";
import { Ico } from "../solo/ui";
import { Grano } from "./Gancho";

// Reel nuevo, parte 3: el cierre. Fondo claro, el logo con los íconos que se juntan,
// la frase y el botón. 60 fps.
const W = SAFE.right - SAFE.left;
const AMBER = "#f5a623";
const INK = "#14161b";
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const r = (f: number, a: number, b: number, e = ease) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: e });
const pop = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) });

export const CIERRE_DUR = 300;
const VOZ_AT = 14;
const ICONOS = ["file", "cash", "gauge", "route"];
const LOGO_Y = 760;
const PULGAR = 74;
// el chofer (ilustración en public/chofer-pulgar.png, 960 × 1021) y dónde queda su pulgar
const CH_W = 340;
const CH_H = Math.round((CH_W * 1021) / 960);
const CH_TOP = 280;
const PULGAR_X = 540 - CH_W / 2 + CH_W * 0.82;
const PULGAR_Y = CH_TOP + CH_H * 0.3;

export const Cierre: React.FC<{ guia?: boolean; voz?: string }> = ({ guia = false, voz = "vo/cierre-l1.wav" }) => {
  const f = useCurrentFrame();
  // entra desenfocado, como los otros cortes
  const inn = r(f, 0, 16);
  const logo = pop(f, 6, 30);
  const junta = r(f, 10, 40, Easing.in(Easing.cubic));
  const chofer = pop(f, 30, 56);
  // el pulgar «empuja»: un golpe de escala y un balanceo que se apaga
  const t = f - PULGAR;
  const empuje = t >= 0 && t < 30 ? Math.sin((t / 30) * Math.PI) * (1 - t / 30) : 0;
  const balanceo = t >= 0 && t < 40 ? Math.sin(t * 0.45) * 4 * (1 - t / 40) : 0;
  const sub = r(f, 60, 74);
  const l1 = r(f, 78, 92);
  const l2 = r(f, 90, 104);
  const cta = pop(f, 120, 140);
  const pulso = f > 150 ? 1 + 0.04 * Math.max(0, Math.sin((f - 150) / 9)) : 1;
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 38%, #ffffff 0%, #eef0f4 62%, #e2e5ec 100%)", overflow: "hidden" }}>
      <AbsoluteFill style={{ filter: inn < 1 ? `blur(${(1 - inn) * 26}px)` : undefined, scale: 1 + (1 - inn) * 0.15, opacity: Math.min(1, inn * 1.5) }}>
        {/* los íconos de la app vuelven al logo */}
        {ICONOS.map((n, i) => {
          const a = (i / ICONOS.length) * Math.PI * 2 - Math.PI / 4 + f * 0.01;
          const rad = 1 - junta;
          return (
            <div
              key={n}
              style={{
                position: "absolute", left: 540 + Math.cos(a) * 380 * rad - 60, top: LOGO_Y + Math.sin(a) * 200 * rad - 60, width: 120, height: 120, borderRadius: 36,
                background: INK, color: AMBER, display: "grid", placeItems: "center", opacity: 1 - junta, scale: 1 - junta * 0.6, boxShadow: "0 24px 50px rgba(10,12,18,.3)",
              }}
            >
              <Ico n={n} s={26} w={2.4} />
            </div>
          );
        })}
        {/* el chofer que levanta el pulgar */}
        <div
          style={{
            position: "absolute", left: 540 - CH_W / 2, top: CH_TOP, width: CH_W, height: CH_H, opacity: Math.min(1, chofer * 1.4),
            scale: (0.7 + chofer * 0.3) * (1 + empuje * 0.08), rotate: `${balanceo}deg`, translate: `0px ${(1 - chofer) * 80}px`, transformOrigin: "50% 100%",
          }}
        >
          <Img src={staticFile("chofer-pulgar.png")} style={{ width: CH_W, height: CH_H }} />
        </div>
        {/* chispas del pulgar */}
        {f >= PULGAR + 12 && f < PULGAR + 40
          ? Array.from({ length: 8 }).map((_, i) => {
              const a = (i / 8) * Math.PI * 2;
              const d = 30 + r(f, PULGAR + 12, PULGAR + 40) * 70;
              return <div key={i} style={{ position: "absolute", left: PULGAR_X + Math.cos(a) * d, top: PULGAR_Y + Math.sin(a) * d, width: 12, height: 12, borderRadius: 3, background: i % 2 ? AMBER : INK, rotate: "45deg", opacity: 1 - r(f, PULGAR + 12, PULGAR + 40) }} />;
            })
          : null}
        <div style={{ position: "absolute", left: 0, right: 0, top: LOGO_Y - 60, display: "flex", justifyContent: "center", scale: 0.6 + logo * 0.4, opacity: Math.min(1, logo * 1.3) }}>
          <Logo size={0.62} ink={INK} />
        </div>
        {/* onda cuando se juntan */}
        {f >= 38 && f < 70 ? (
          <div style={{ position: "absolute", left: 540 - 300 * r(f, 38, 70), top: LOGO_Y - 300 * r(f, 38, 70), width: 600 * r(f, 38, 70), height: 600 * r(f, 38, 70), borderRadius: "50%", border: `5px solid ${AMBER}`, opacity: 1 - r(f, 38, 70) }} />
        ) : null}
        <div style={{ position: "absolute", top: 860, left: SAFE.left, width: W, textAlign: "center", fontFamily: mono, fontWeight: 700, fontSize: 34, letterSpacing: 1, color: "#6b7285", opacity: sub, translate: `0px ${(1 - sub) * 16}px` }}>
          Para el gruero independiente.
        </div>
        <div style={{ position: "absolute", top: 912, left: SAFE.left, width: W, textAlign: "center", fontFamily: display, fontSize: 104, lineHeight: 0.95, color: INK }}>
          <div style={{ opacity: l1, translate: `0px ${(1 - l1) * 40}px` }}>Laburá tranquilo.</div>
          <div style={{ color: AMBER, opacity: l2, translate: `0px ${(1 - l2) * 40}px` }}>Sabé cuánto ganás.</div>
        </div>
        <div style={{ position: "absolute", top: 1124, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <div style={{ background: AMBER, color: INK, fontFamily: sans, fontWeight: 700, fontSize: 46, padding: "22px 50px", borderRadius: 999, opacity: Math.min(1, cta * 1.4), scale: (0.7 + cta * 0.3) * pulso, boxShadow: "0 22px 50px rgba(245,166,35,.45)" }}>
            Tocá «Más información» ↓
          </div>
        </div>
      </AbsoluteFill>
      <Grano f={f} />
      <Audio name="Auxilios. Para el gruero independiente." src={staticFile(voz)} from={VOZ_AT} volume={1} />
      <Audio name="Corte" src={staticFile("sfx/whoosh.wav")} from={0} volume={0.4} />
      <Audio name="Logo" src={staticFile("sfx/ding.wav")} from={40} volume={0.5} />
      <Audio name="Pulgar" src={staticFile("sfx/whoosh.wav")} from={PULGAR} volume={0.35} />
      <Audio name="Pulgar arriba" src={staticFile("sfx/ding.wav")} from={PULGAR + 14} volume={0.45} />
      <Audio name="Botón" src={staticFile("sfx/mouse-click.wav")} from={122} volume={0.35} />
      {guia ? <ReelsGuide /> : null}
    </AbsoluteFill>
  );
};
