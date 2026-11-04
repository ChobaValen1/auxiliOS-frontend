import { Composition, Folder, Still } from "remotion";
import { FirmaPreview } from "./solo/FirmaPreview";
import { Paso1, Paso1Con, Paso1Sin, PASO1_CON, PASO1_DUR, PASO1_SIN } from "./monogrua/Paso1";
import * as SoloRef from "./solo/Screens";
import { AdVideo, AD_DURATION } from "./AdVideo";
import { HookScene } from "./scenes/HookScene";
import { PainScene } from "./scenes/PainScene";
import { PhoneScene } from "./scenes/PhoneScene";
import { FeaturesScene } from "./scenes/FeaturesScene";
import { CtaScene } from "./scenes/CtaScene";
import { FPS, H, W } from "./theme";
import { ComparacionVideo, COMPARACION_DUR } from "./comparacion/ComparacionVideo";
import { Intro } from "./comparacion/Intro";
import { M1Remito } from "./comparacion/M1Remito";
import { M2Senal } from "./comparacion/M2Senal";
import { M3Gasoil } from "./comparacion/M3Gasoil";
import { M4Mes } from "./comparacion/M4Mes";
import { Balance } from "./comparacion/Balance";
import { CierreSolo } from "./comparacion/CierreSolo";
import { RecorridoScene, RECORRIDO_DUR } from "./mapa/RecorridoScene";
import { PedidoScene, PEDIDO_DUR } from "./chat/PedidoScene";
import { CierreChatScene, CIERRE_CHAT_DUR } from "./chat/CierreChatScene";
import { DelChatAlRemito, DEL_CHAT_DUR } from "./chat/DelChatAlRemito";
import { CrearServicioScene, CREAR_DUR } from "./solo/CrearServicioScene";
import { RemitoDestinoScene, DESTINO_DUR } from "./solo/RemitoDestinoScene";

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Escenas">
      <Composition id="Gancho" component={HookScene} width={W} height={H} fps={FPS} durationInFrames={105} />
      <Composition id="Dolor" component={PainScene} width={W} height={H} fps={FPS} durationInFrames={105} />
      <Composition id="Solucion" component={PhoneScene} width={W} height={H} fps={FPS} durationInFrames={165} />
      <Composition id="Funciones" component={FeaturesScene} width={W} height={H} fps={FPS} durationInFrames={90} />
      <Composition id="Cierre" component={CtaScene} width={W} height={H} fps={FPS} durationInFrames={105} />
    </Folder>
    <Folder name="Comparacion-Escenas">
      <Composition id="C-Intro" component={Intro} width={W} height={H} fps={FPS} durationInFrames={90} />
      <Composition id="C-Remito" component={M1Remito} width={W} height={H} fps={FPS} durationInFrames={180} />
      <Composition id="C-SinSenal" component={M2Senal} width={W} height={H} fps={FPS} durationInFrames={150} />
      <Composition id="C-Gasoil" component={M3Gasoil} width={W} height={H} fps={FPS} durationInFrames={165} />
      <Composition id="C-FinDeMes" component={M4Mes} width={W} height={H} fps={FPS} durationInFrames={180} />
      <Composition id="C-Balance" component={Balance} width={W} height={H} fps={FPS} durationInFrames={105} />
      <Composition id="C-Cierre" component={CierreSolo} width={W} height={H} fps={FPS} durationInFrames={105} />
    </Folder>
    <Composition id="ComparacionSolo" component={ComparacionVideo} width={W} height={H} fps={FPS} durationInFrames={COMPARACION_DUR} />
    <Composition id="MapaRecorrido" component={RecorridoScene} width={W} height={H} fps={FPS} durationInFrames={RECORRIDO_DUR} />
    <Folder name="DelChat-Escenas">
      <Composition id="Chat-Pedido" component={PedidoScene} width={W} height={H} fps={FPS} durationInFrames={PEDIDO_DUR} />
      <Composition id="Solo-Crear" component={CrearServicioScene} width={W} height={H} fps={FPS} durationInFrames={CREAR_DUR} />
      <Composition id="Solo-Destino" component={RemitoDestinoScene} width={W} height={H} fps={FPS} durationInFrames={DESTINO_DUR} />
      <Composition id="Chat-Cierre" component={CierreChatScene} width={W} height={H} fps={FPS} durationInFrames={CIERRE_CHAT_DUR} />
    </Folder>
    <Composition id="DelChatAlRemito" component={DelChatAlRemito} width={W} height={H} fps={FPS} durationInFrames={DEL_CHAT_DUR} />
    <Folder name="MonoGrua-Pasos">
      <Composition id="MG-Paso1" component={Paso1} width={W} height={H} fps={FPS} durationInFrames={PASO1_DUR} defaultProps={{ guia: false }} />
      <Composition id="MG-Paso1-Guia" component={Paso1} width={W} height={H} fps={FPS} durationInFrames={PASO1_DUR} defaultProps={{ guia: true }} />
      <Composition id="MG-Paso1-Sin" component={Paso1Sin} width={W} height={H} fps={FPS} durationInFrames={PASO1_SIN} />
      <Composition id="MG-Paso1-Con" component={Paso1Con} width={W} height={H} fps={FPS} durationInFrames={PASO1_CON} />
    </Folder>
    <Composition id="FirmaPreview" component={FirmaPreview} width={1080} height={1080} fps={30} durationInFrames={75} />
    <Folder name="Solo-Referencias">
      <Still id="Ref-A1Servicios" component={SoloRef.A1Servicios} width={W} height={H} />
      <Still id="Ref-A2ParaQuien" component={SoloRef.A2ParaQuien} width={W} height={H} />
      <Still id="Ref-A3QueServicio" component={SoloRef.A3QueServicio} width={W} height={H} />
      <Still id="Ref-A4Precio" component={SoloRef.A4Precio} width={W} height={H} />
      <Still id="Ref-A5Remito" component={SoloRef.A5Remito} width={W} height={H} />
      <Still id="Ref-B1Socio" component={SoloRef.B1Socio} width={W} height={H} />
      <Still id="Ref-B2Adicionales" component={SoloRef.B2Adicionales} width={W} height={H} />
      <Still id="Ref-B3Evidencia" component={SoloRef.B3Evidencia} width={W} height={H} />
      <Still id="Ref-B4Firma" component={SoloRef.B4Firma} width={W} height={H} />
      <Still id="Ref-B5Enviar" component={SoloRef.B5Enviar} width={W} height={H} />
    </Folder>
    <Composition id="AnuncioRemito" component={AdVideo} width={W} height={H} fps={FPS} durationInFrames={AD_DURATION} />
  </>
);
