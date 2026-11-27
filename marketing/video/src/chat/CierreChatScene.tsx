import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, clamp, display, mono } from "../theme";
import { Msg, WaChat } from "./WaChat";

export const CIERRE_CHAT_DUR = 150;

// Mismo texto que arma sendSheet() en solo/solo-ops.js (links acortados: no se inventa un dominio)
const messages: Msg[] = [
  { from: "them", kind: "text", at: -100, time: "17:42", text: "AB 123 CD. ¡Gracias, genio!" },
  {
    from: "me",
    kind: "text",
    at: 14,
    time: "18:33",
    text: "Hola Martín, te envío el remito N.º 0482 del servicio del 04/11 (patente AB 123 CD). Grúas Pérez.\n\nDescargalo acá: https://…/remito-0482.pdf\nPodés verificar que es original en: https://…/v/7K3Q92",
  },
  { from: "them", kind: "text", at: 58, time: "18:34", text: "Joya, ya lo tengo. ¡Mil gracias, crack! 🙌" },
];

// El remito firmado vuelve al mismo chat
export const CierreChatScene: React.FC = () => {
  const f = useCurrentFrame();
  const stamp = interpolate(f, [92, 104], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
  return (
    <AbsoluteFill>
      <WaChat messages={messages} contact="+54 9 11 5555-0182" />
      <Audio name="Respuesta del cliente" src={staticFile("sfx/ding.wav")} from={58} volume={0.3} />
      <AbsoluteFill style={{ background: "rgba(5,7,10,0.55)", opacity: interpolate(f, [88, 98], [0, 1], clamp) }} />
      <div
        style={{
          position: "absolute",
          top: 700,
          left: 70,
          right: 70,
          background: C.bg,
          border: `4px solid #f5a623`,
          borderRadius: 32,
          padding: "40px 44px",
          textAlign: "center",
          opacity: interpolate(f, [92, 98], [0, 1], clamp),
          scale: stamp,
        }}
      >
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, letterSpacing: 3, color: "#f5a623" }}>DESDE AUXILIOS</div>
        <div style={{ fontFamily: display, fontSize: 104, lineHeight: 0.95, color: C.text, marginTop: 14 }}>
          El remito le llega al cliente por WhatsApp
        </div>
      </div>
    </AbsoluteFill>
  );
};
