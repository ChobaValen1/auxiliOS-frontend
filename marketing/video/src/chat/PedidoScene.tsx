import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, Interactive, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, clamp, display, sans } from "../theme";
import { Msg, WA, WaChat } from "./WaChat";

export const PEDIDO_DUR = 245;
const CONTACT = "+54 9 11 5555-0182";

const messages: Msg[] = [
  { from: "them", kind: "text", at: 62, time: "17:40", text: "Hola, ¿hacés auxilio? Se me quedó el auto en Luis Guillón, cerca de la estación 😩" },
  { from: "them", kind: "location", at: 98, time: "17:40" },
  { from: "them", kind: "text", at: 130, time: "17:41", text: "No arranca ni a palos. Lo tengo que llevar a un taller en Lomas" },
  { from: "me", kind: "text", at: 164, time: "17:41", text: "Sí, tranqui. Salgo ya, en 15 estoy ahí 👍" },
  { from: "me", kind: "text", at: 186, time: "17:41", text: "Pasame la patente así te cargo el servicio" },
  { from: "them", kind: "text", at: 214, time: "17:42", text: "AB 123 CD. ¡Gracias, genio!" },
];

// 0–1,6 s pantalla bloqueada con la notificación; después, el chat
export const PedidoScene: React.FC = () => {
  const f = useCurrentFrame();
  const open = interpolate(f, [38, 50], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const tap = interpolate(f, [30, 42], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Sonidos: notificación al bajar el aviso, toque, y mensajes entrantes más suaves */}
      <Audio name="Notificacion" src={staticFile("sfx/ding.wav")} from={14} volume={1} />
      <Audio name="Toque" src={staticFile("sfx/mouse-click.wav")} from={32} volume={0.5} />
      {messages
        .filter((m) => m.from === "them")
        .map((m) => (
          <Audio key={m.at} name="Mensaje entrante" src={staticFile("sfx/ding.wav")} from={m.at} volume={0.3} />
        ))}
      {/* Chat */}
      <AbsoluteFill style={{ opacity: open, scale: interpolate(open, [0, 1], [0.94, 1]) }}>
        <WaChat messages={messages} contact={CONTACT} />
      </AbsoluteFill>

      {/* Pantalla bloqueada */}
      <AbsoluteFill style={{ opacity: 1 - open, background: "radial-gradient(ellipse at 50% 20%, #1b2433, #05070a 70%)", alignItems: "center" }}>
        <div style={{ position: "absolute", top: 300, fontFamily: sans, fontWeight: 500, fontSize: 40, color: "#cfd6e2", opacity: interpolate(f, [0, 8], [0, 1], clamp) }}>
          martes 4 de noviembre
        </div>
        <div style={{ position: "absolute", top: 350, fontFamily: sans, fontWeight: 700, fontSize: 230, lineHeight: 1, color: "#eef2f8", letterSpacing: -6, opacity: interpolate(f, [0, 8], [0, 1], clamp) }}>
          17:40
        </div>
        <Interactive.Div
          name="Gancho"
          style={{
            position: "absolute",
            top: 640,
            fontFamily: display,
            fontSize: 96,
            color: C.yellow,
            opacity: interpolate(f, [6, 14], [0, 1], { ...clamp }),
          }}
        >
          Te escriben para un auxilio.
        </Interactive.Div>
        {/* Notificación */}
        <div
          style={{
            position: "absolute",
            top: 820,
            left: 50,
            right: 50,
            background: "rgba(38,44,54,0.92)",
            borderRadius: 40,
            padding: "30px 34px",
            display: "flex",
            gap: 26,
            alignItems: "center",
            translate: interpolate(f, [12, 26], ["0px -140px", "0px 0px"], { ...clamp, easing: Easing.out(Easing.back(1.3)) }),
            opacity: interpolate(f, [12, 18], [0, 1], clamp),
            scale: interpolate(f, [30, 34, 38], [1, 0.96, 1], clamp),
          }}
        >
          <div style={{ width: 96, height: 96, borderRadius: 24, background: WA.green, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg viewBox="0 0 24 24" width={56} height={56}>
              <path d="M4 5h16v11H8l-4 4z" fill="#fff" />
            </svg>
          </div>
          <div style={{ flex: 1, fontFamily: sans }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: "#b9c2cf" }}>
              <span>WhatsApp</span>
              <span>ahora</span>
            </div>
            <div style={{ fontSize: 38, fontWeight: 700, color: "#fff", marginTop: 4 }}>{CONTACT}</div>
            <div style={{ fontSize: 34, color: "#dfe5ee", marginTop: 2 }}>Hola, ¿hacés auxilio? Se me quedó el auto…</div>
          </div>
          {/* toque */}
          <div style={{ position: "absolute", left: "50%", top: "50%", width: 140, height: 140, marginLeft: -70, marginTop: -70, borderRadius: "50%", background: "rgba(255,255,255,0.35)", opacity: tap > 0 && tap < 1 ? 1 - tap : 0, scale: 0.3 + tap }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
