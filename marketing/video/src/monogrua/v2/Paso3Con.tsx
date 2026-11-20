import { Audio } from "@remotion/media";
import { Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { clamp, mono, sans } from "../../theme";
import { StepFrame } from "../StepFrame";
import { BigButton, Finger, Header, Ico, money, Phone, Pill, pop, ramp, Shot, Shots, U } from "./ui";

export const P3_CON = 255;
const TAP_COBRADO = 56;
const TAP_CONFIRMAR = 92;
const NUMEROS = 136;
const BTN = { x: 430, y: 616 };

const Cobro: React.FC<{ f: number }> = ({ f }) => {
  const cobrado = f >= TAP_CONFIRMAR + 2;
  const confirmar = f >= TAP_COBRADO + 2 && !cobrado;
  const vence = 0.6 + 0.4 * Math.abs(Math.sin(f / 7));
  const flip = ramp(f, TAP_CONFIRMAR + 2, TAP_CONFIRMAR + 12);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Header f={f} title="Cobros" sub="Noviembre" />
      <div
        style={{
          position: "absolute", left: 44, right: 44, top: 196, height: 350, borderRadius: 36, padding: 34,
          background: cobrado ? "linear-gradient(160deg, rgba(39,196,122,.18), #171b24)" : U.card, border: `3px solid ${cobrado ? U.ok : U.line}`,
          opacity: ramp(f, 4, 16), translate: `0px ${(1 - ramp(f, 4, 16)) * 40}px`, boxShadow: cobrado ? `0 0 ${60 * flip}px rgba(39,196,122,.35)` : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span style={{ width: 84, height: 84, borderRadius: "50%", background: U.accent, color: U.accentFg, display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 700, fontSize: 32 }}>AS</span>
          <span style={{ flex: 1, fontFamily: sans, fontWeight: 700, fontSize: 42, color: U.text }}>Asistencia del Sur</span>
        </div>
        <div style={{ marginTop: 26, fontFamily: sans, fontSize: 30, color: U.muted }}>{cobrado ? "Cobrado" : "Por cobrar"} · 4 remitos</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontFamily: mono, fontWeight: 700, fontSize: 96, color: cobrado ? U.ok : U.accent, lineHeight: 1.1, scale: cobrado ? 1 + (1 - flip) * 0.08 : 1, transformOrigin: "0 50%" }}>
          {cobrado ? <Ico n="check" s={30} w={3} /> : null}$ 220.500
        </div>
        <div style={{ marginTop: 14 }}>
          {cobrado ? (
            <Pill color={U.ok} style={{ fontSize: 30 }}>Cobrado el 04/12</Pill>
          ) : (
            <Pill color={U.bad} style={{ fontSize: 30, opacity: vence }}>● Vence hoy · 04/12</Pill>
          )}
        </div>
      </div>
      <div style={{ position: "absolute", left: 44, right: 44, top: 560, opacity: ramp(f, 10, 20) }}>
        {cobrado ? (
          <BigButton f={f} color={U.ok} fg="#06180f">
            <Ico n="check" s={16} w={3} /> Cobrado
          </BigButton>
        ) : confirmar ? (
          <BigButton f={f} tap={TAP_CONFIRMAR} color="#ffb740" style={{ fontSize: 36 }}>
            Confirmar 4 remitos · $ 220.500
          </BigButton>
        ) : (
          <BigButton f={f} tap={TAP_COBRADO}>
            <Ico n="cash" s={18} /> Marcar cobrado
          </BigButton>
        )}
      </div>
    </div>
  );
};

const MESES: [string, number][] = [
  ["Jun", 480000],
  ["Jul", 530000],
  ["Ago", 610000],
  ["Sep", 560000],
  ["Oct", 650000],
  ["Nov", 722000],
];

const Numeros: React.FC<{ f: number }> = ({ f }) => {
  const v = interpolate(f, [8, 40], [0, 722000], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Header f={f} title="Mis números" sub="Noviembre" />
      <div style={{ position: "absolute", left: 44, top: 196, fontFamily: sans, fontWeight: 500, fontSize: 34, color: U.muted }}>Te quedaron</div>
      <div style={{ position: "absolute", left: 44, top: 236, fontFamily: mono, fontWeight: 700, fontSize: 112, color: U.ok, lineHeight: 1 }}>{money(v)}</div>
      <div style={{ position: "absolute", left: 44, right: 44, top: 376, display: "flex", gap: 14 }}>
        {[
          ["Facturé", "$ 1.134.000"],
          ["Gasté", "$ 412.000"],
          ["Por servicio", "$ 40.111"],
        ].map(([l, val], i) => (
          <div key={l} style={{ flex: 1, background: U.card, border: `3px solid ${U.line}`, borderRadius: 24, padding: "16px 18px", opacity: pop(f, 20 + i * 5, 30 + i * 5) }}>
            <div style={{ fontFamily: sans, fontSize: 24, color: U.muted }}>{l}</div>
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, color: i === 2 ? U.ok : U.text, marginTop: 4 }}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 44, right: 44, top: 520, height: 210, display: "flex", alignItems: "flex-end", gap: 18 }}>
        {MESES.map(([m, val], i) => {
          const h = (val / 722000) * 160 * ramp(f, 30 + i * 4, 48 + i * 4);
          const last = i === MESES.length - 1;
          return (
            <div key={m} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ width: "100%", height: h, borderRadius: 14, background: last ? U.accent : "#3a4152", boxShadow: last ? "0 0 30px rgba(245,166,35,.45)" : "none" }} />
              <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 24, color: last ? U.accent : U.muted }}>{m}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const shots: Shot[] = [
  { from: 0, render: (f) => <Cobro f={f} /> },
  { from: NUMEROS, render: (f) => <Numeros f={f} /> },
];

export const Paso3Con: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <StepFrame n={3} mode="con" title="Cobrar el servicio">
      <Phone time="10:12">
        <Shots shots={shots} />
        <Finger f={f} at={TAP_COBRADO} x={BTN.x} y={BTN.y} />
        <Finger f={f} at={TAP_CONFIRMAR} x={BTN.x} y={BTN.y} />
      </Phone>
      {[TAP_COBRADO, TAP_CONFIRMAR].map((t) => (
        <Audio key={t} name="Toque" src={staticFile("sfx/mouse-click.wav")} from={t} volume={0.45} />
      ))}
      <Audio name="Cobrado" src={staticFile("sfx/ding.wav")} from={TAP_CONFIRMAR + 4} volume={0.5} />
    </StepFrame>
  );
};
