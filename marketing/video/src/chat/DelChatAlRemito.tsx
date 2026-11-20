import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { PedidoScene, PEDIDO_DUR } from "./PedidoScene";
import { CierreChatScene, CIERRE_CHAT_DUR } from "./CierreChatScene";
import { RecorridoScene, RECORRIDO_DUR } from "../mapa/RecorridoScene";
import { CrearServicioScene, CREAR_DUR } from "../solo/CrearServicioScene";
import { RemitoDestinoScene, DESTINO_DUR } from "../solo/RemitoDestinoScene";
import { CtaScene } from "../scenes/CtaScene";

const CTA_DUR = 105;
const MAPA_DUR = 240; // el recorrido de 14 s, acelerado ×1,75
const T = 12;
export const DEL_CHAT_DUR = PEDIDO_DUR + CREAR_DUR + MAPA_DUR + DESTINO_DUR + CIERRE_CHAT_DUR + CTA_DUR - 5 * T;

export const DelChatAlRemito: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence name="Pedido por chat" durationInFrames={245}>
      <PedidoScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 12 })} />
    <TransitionSeries.Sequence name="Cargar el servicio" durationInFrames={270}>
      <CrearServicioScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
    <TransitionSeries.Sequence name="Recorrido" durationInFrames={240}>
      <RecorridoScene speed={RECORRIDO_DUR / MAPA_DUR} />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
    <TransitionSeries.Sequence name="Remito en el destino" durationInFrames={245}>
      <RemitoDestinoScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 12 })} />
    <TransitionSeries.Sequence name="Remito al chat" durationInFrames={150}>
      <CierreChatScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
    <TransitionSeries.Sequence name="Cierre" durationInFrames={105}>
      <CtaScene bajada="Para el gruero que trabaja solo." linea1="Dejá el talonario." linea2="Llevá la cuenta." />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
