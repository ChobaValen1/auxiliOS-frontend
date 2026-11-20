import React from "react";
import { CanvasImage, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { clamp, sans } from "../theme";
import { Firma } from "../solo/Firma";

// Colores del tema oscuro estilo WhatsApp (sin logos)
export const WA = {
  bg: "#0b141a",
  header: "#202c33",
  them: "#202c33",
  me: "#005c4b",
  text: "#e9edef",
  muted: "#8696a0",
  tick: "#53bdeb",
  green: "#25d366",
  chip: "#182229",
};

export type Msg =
  | { from: "me" | "them"; kind: "text"; text: string; at: number; time: string }
  | { from: "them"; kind: "location"; at: number; time: string }
  | { from: "me"; kind: "remito"; at: number; time: string }
  | { from: "system"; kind: "text"; text: string; at: number };

const SIZE = 42;
const PAD = 30;
const MAXW = Math.round((1080 - 2 * PAD) * 0.78);
const GAP = 14;

// Estimación de líneas por palabras (DM Sans 500 ≈ 0,5 em por carácter)
const lines = (t: string) => {
  const per = Math.floor((MAXW - 56) / (SIZE * 0.5));
  let n = 0;
  for (const para of t.split("\n")) {
    let cur = 0;
    n++;
    for (const w of para.split(" ")) {
      const len = [...w].length + 1;
      if (cur + len > per && cur > 0) { n++; cur = len; } else cur += len;
    }
  }
  return n;
};

// Texto con los links en celeste, como en WhatsApp
const Rich: React.FC<{ text: string }> = ({ text }) => (
  <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
    {text.split(/(https:\/\/\S+)/).map((part, i) =>
      part.startsWith("https://") ? (
        <span key={i} style={{ color: "#53bdeb", textDecoration: "underline" }}>{part}</span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      ),
    )}
  </span>
);
const heightOf = (m: Msg) => {
  if (m.from === "system") return 74;
  if (m.kind === "location") return 478;
  if (m.kind === "remito") return 470;
  return lines(m.text) * SIZE * 1.3 + 30 + 34;
};

const Ticks: React.FC = () => <span style={{ color: WA.tick, fontSize: 26, marginLeft: 8, letterSpacing: -6 }}>✓✓</span>;

const Meta: React.FC<{ time: string; mine: boolean }> = ({ time, mine }) => (
  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", fontSize: 24, color: mine ? "#a5c9bf" : WA.muted, marginTop: 4 }}>
    {time}
    {mine ? <Ticks /> : null}
  </div>
);

const LocationBubble: React.FC = () => (
  <div style={{ width: 640, padding: 8 }}>
    <div style={{ position: "relative", width: 624, height: 300, borderRadius: 14, overflow: "hidden" }}>
      {/* recorte del mismo mapa del recorrido, centrado en el Origen (391, 1061) */}
      <CanvasImage
        src={staticFile("mapa-recorrido.png")}
        style={{ position: "absolute", width: 1080 * 1.6, height: 1920 * 1.6, left: 312 - 391 * 1.6, top: 150 - 1061 * 1.6, filter: "brightness(1.9) contrast(1.1)" }}
      />
      <div style={{ position: "absolute", left: 312 - 22, top: 150 - 56, width: 44, height: 56 }}>
        <svg viewBox="0 0 44 56" width={44} height={56}>
          <path d="M22 0C10 0 0 9.5 0 21.5 0 37 22 56 22 56s22-19 22-34.5C44 9.5 34 0 22 0z" fill="#ea4335" />
          <circle cx={22} cy={21} r={8} fill="#7a1a12" />
        </svg>
      </div>
    </div>
    <div style={{ padding: "12px 10px 0", fontSize: 36, fontWeight: 700, color: WA.text }}>Ubicación actual</div>
    <div style={{ padding: "2px 10px 0", fontSize: 28, color: WA.muted }}>Luis Guillón, Buenos Aires</div>
  </div>
);

const RemitoBubble: React.FC = () => (
  <div style={{ width: 640, padding: 8 }}>
    <div style={{ height: 290, borderRadius: 14, background: "#f3f4f7", padding: "22px 26px", position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: sans, fontWeight: 700, fontSize: 30, color: "#14161b" }}>
        <span>Remito N.º 0482</span>
        <span style={{ color: "#1a8f55", fontSize: 26 }}>✓ Firmado</span>
      </div>
      <div style={{ fontSize: 24, color: "#5b6170", marginTop: 4 }}>Remolque · AB 123 CD · 7,9 km</div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        {["frente", "lateral", "odometro"].map((f) => (
          <Img key={f} src={staticFile(`fotos/${f}.jpg`)} style={{ flex: 1, minWidth: 0, height: 96, borderRadius: 10, objectFit: "cover" }} />
        ))}
      </div>
      <div style={{ width: 300, height: 64, marginTop: 8 }}>
        <Firma stroke={11} />
      </div>
    </div>
    <div style={{ padding: "12px 10px 0", fontSize: 36, fontWeight: 700, color: WA.text }}>Remito N.º 0482 · PDF</div>
    <div style={{ padding: "2px 10px 0", fontSize: 28, color: WA.muted }}>Fotos, firma y código de verificación</div>
  </div>
);

// Chat completo: encabezado, mensajes con «escribiendo…» y scroll, barra de escritura
export const WaChat: React.FC<{ messages: Msg[]; contact: string; top?: number; bottom?: number }> = ({ messages, contact, top = 230, bottom = 1520 }) => {
  const f = useCurrentFrame();
  const hs = messages.map(heightOf);
  const ys: number[] = [];
  hs.reduce((y, h, k) => ((ys[k] = y), y + h + GAP), 20);
  const area = bottom - top;
  const need = (k: number) => Math.max(0, ys[k] + hs[k] + 20 - area);
  let scroll = 0;
  messages.forEach((m, k) => {
    const prev = k ? need(k - 1) : 0;
    if (f >= m.at) scroll = interpolate(f, [m.at, m.at + 8], [prev, need(k)], { ...clamp, easing: Easing.out(Easing.cubic) });
  });
  const lastThem = [...messages].reverse().find((m) => m.from === "them" && f >= m.at - 14 && f < m.at);
  const dots = Math.floor(f / 5) % 4;
  return (
    <div style={{ position: "absolute", inset: 0, background: WA.bg, fontFamily: sans }}>
      {/* fondo con textura suave */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.05, backgroundImage: "radial-gradient(#ffffff 2px, transparent 2px)", backgroundSize: "46px 46px" }} />
      {/* encabezado */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 220, background: WA.header, display: "flex", alignItems: "flex-end", padding: "0 30px 26px", gap: 22 }}>
        <div style={{ fontSize: 50, color: WA.text, marginBottom: 14 }}>←</div>
        <div style={{ width: 92, height: 92, borderRadius: "50%", background: "#6a7f8a", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg viewBox="0 0 40 40" width={56} height={56}>
            <circle cx={20} cy={15} r={8} fill="#cfd8dc" />
            <path d="M4 38c2-9 9-13 16-13s14 4 16 13z" fill="#cfd8dc" />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 44, fontWeight: 700, color: WA.text }}>{contact}</div>
          <div style={{ fontSize: 30, color: lastThem ? WA.green : WA.muted }}>{lastThem ? "escribiendo…" : "en línea"}</div>
        </div>
        <div style={{ fontSize: 44, color: WA.text, marginBottom: 16, letterSpacing: 26 }}>⋮</div>
      </div>
      {/* mensajes */}
      <div style={{ position: "absolute", top, left: PAD, right: PAD, height: area, overflow: "hidden" }}>
        <div style={{ position: "relative", translate: `0px ${-scroll}px` }}>
          {messages.map((m, k) => {
            const o = interpolate(f, [m.at, m.at + 6], [0, 1], clamp);
            const s = interpolate(f, [m.at, m.at + 10], [0.85, 1], { ...clamp, easing: Easing.out(Easing.back(1.5)) });
            if (m.from === "system")
              return (
                <div key={k} style={{ position: "absolute", top: ys[k], left: 0, right: 0, display: "flex", justifyContent: "center", opacity: o }}>
                  <div
                    style={
                      m.text.startsWith("✓")
                        ? { background: "#f5a623", color: "#14161b", fontWeight: 700, fontSize: 32, padding: "12px 28px", borderRadius: 16, scale: s }
                        : { background: WA.chip, color: WA.muted, fontWeight: 500, fontSize: 28, padding: "10px 24px", borderRadius: 14 }
                    }
                  >
                    {m.text}
                  </div>
                </div>
              );
            const mine = m.from === "me";
            const typing = !mine && f >= m.at - 14 && f < m.at;
            return (
              <React.Fragment key={k}>
                {typing ? (
                  <div style={{ position: "absolute", top: ys[k], left: 0, background: WA.them, padding: "24px 30px", borderRadius: 22 }}>
                    {[0, 1, 2].map((d) => (
                      <span key={d} style={{ display: "inline-block", width: 16, height: 16, borderRadius: 8, marginRight: d < 2 ? 12 : 0, background: WA.text, opacity: dots > d ? 0.8 : 0.25 }} />
                    ))}
                  </div>
                ) : null}
                <div style={{ position: "absolute", top: ys[k], left: 0, right: 0, display: "flex", justifyContent: mine ? "flex-end" : "flex-start", opacity: o }}>
                  <div
                    style={{
                      maxWidth: MAXW,
                      background: mine ? WA.me : WA.them,
                      color: WA.text,
                      borderRadius: mine ? "22px 6px 22px 22px" : "6px 22px 22px 22px",
                      padding: m.kind === "text" ? "15px 24px 10px" : "0 0 10px",
                      fontSize: SIZE,
                      fontWeight: 500,
                      lineHeight: 1.3,
                      scale: s,
                      transformOrigin: mine ? "100% 0%" : "0% 0%",
                    }}
                  >
                    {m.kind === "text" ? <Rich text={m.text} /> : m.kind === "location" ? <LocationBubble /> : <RemitoBubble />}
                    <div style={{ padding: m.kind === "text" ? 0 : "0 18px" }}>
                      <Meta time={m.time} mine={mine} />
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
      {/* barra de escritura */}
      <div style={{ position: "absolute", top: bottom + 30, left: 24, right: 24, display: "flex", gap: 16, alignItems: "center" }}>
        <div style={{ flex: 1, height: 96, borderRadius: 48, background: WA.header, display: "flex", alignItems: "center", padding: "0 34px", fontSize: 36, color: WA.muted }}>Mensaje</div>
        <div style={{ width: 96, height: 96, borderRadius: "50%", background: "#00a884", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg viewBox="0 0 24 24" width={44} height={44}>
            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12z" fill="#fff" />
          </svg>
        </div>
      </div>
    </div>
  );
};
