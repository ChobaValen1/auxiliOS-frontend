import { Composition, Folder, Still } from "remotion";
import { FirmaPreview } from "./solo/FirmaPreview";
import { Paso1, Paso1Con, Paso1Sin, PASO1_CON, PASO1_DUR, PASO1_SIN } from "./monogrua/Paso1";
import { Paso2, PASO2_DUR } from "./monogrua/Paso2";
import { Paso3, PASO3_DUR } from "./monogrua/Paso3";
import { PrimerosCuatro, PRIMEROS_CUATRO_DUR } from "./gastos/PrimerosCuatro";
import { LaMitad, LA_MITAD_DUR } from "./gastos/LaMitad";
import { UnDia, UN_DIA_DUR } from "./gastos/UnDia";
import { FacturaAchica, FACTURA_DUR } from "./gastos/Factura";
import { Adivina, ADIVINA_DUR } from "./gastos/Adivina";
import { FPS60, Gancho, GANCHO_DUR } from "./reel/Gancho";
import { Desarrollo, DESARROLLO_DUR } from "./reel/Desarrollo";
import { COMPLETO_DUR, ReelCompleto } from "./reel/Completo";
import { Cierre, CIERRE_DUR } from "./reel/Cierre";
import { ChoferPreview } from "./reel/Chofer";
import { a60 } from "./timescale/A60";
import { Fase1, FASE1_DUR } from "./cuenta/Fase1";
import { Fase2, FASE2_DUR } from "./cuenta/Fase2";
import { Fase3, FASE3_DUR } from "./cuenta/Fase3";

const DelChat60 = a60(DelChatAlRemito);
const MonoGrua60 = a60(MonoGruaVideo);
const Factura60 = a60(FacturaAchica);
const Comparacion60 = a60(ComparacionVideo);
import { MG_P1, MG_P2, MG_P3, MGPaso1, MGPaso2, MGPaso3, MONOGRUA_DUR, MonoGruaVideo } from "./monogrua/v2/Video";
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
    <Folder name="Nivel-60fps">
      <Composition id="DelChatAlRemito-60" component={DelChat60} width={W} height={H} fps={60} durationInFrames={DEL_CHAT_DUR * 2} />
      <Composition id="MonoGrua-60" component={MonoGrua60} width={W} height={H} fps={60} durationInFrames={MONOGRUA_DUR * 2} defaultProps={{ guia: false }} />
      <Composition id="Gastos3-Factura-60" component={Factura60} width={W} height={H} fps={60} durationInFrames={FACTURA_DUR * 2} defaultProps={{ guia: false }} />
      <Composition id="ComparacionSolo-60" component={Comparacion60} width={W} height={H} fps={60} durationInFrames={COMPARACION_DUR * 2} />
    </Folder>
    <Folder name="Reel-Cuenta">
      <Composition id="Cuenta-Fase1" component={Fase1} width={W} height={H} fps={FPS60} durationInFrames={FASE1_DUR} defaultProps={{ guia: false }} />
      <Composition id="Cuenta-Fase1-Guia" component={Fase1} width={W} height={H} fps={FPS60} durationInFrames={FASE1_DUR} defaultProps={{ guia: true }} />
      <Composition id="Cuenta-Fase2" component={Fase2} width={W} height={H} fps={FPS60} durationInFrames={FASE2_DUR} defaultProps={{ guia: false }} />
      <Composition id="Cuenta-Fase2-Guia" component={Fase2} width={W} height={H} fps={FPS60} durationInFrames={FASE2_DUR} defaultProps={{ guia: true }} />
      <Composition id="Cuenta-Fase3" component={Fase3} width={W} height={H} fps={FPS60} durationInFrames={FASE3_DUR} defaultProps={{ guia: false }} />
      <Composition id="Cuenta-Fase3-Guia" component={Fase3} width={W} height={H} fps={FPS60} durationInFrames={FASE3_DUR} defaultProps={{ guia: true }} />
    </Folder>
    <Folder name="Reel-AuxiliOS">
      <Composition id="Reel-Gancho" component={Gancho} width={W} height={H} fps={FPS60} durationInFrames={GANCHO_DUR} defaultProps={{ guia: false }} />
      <Composition id="Reel-Gancho-Guia" component={Gancho} width={W} height={H} fps={FPS60} durationInFrames={GANCHO_DUR} defaultProps={{ guia: true }} />
      <Composition id="Reel-Completo" component={ReelCompleto} width={W} height={H} fps={FPS60} durationInFrames={COMPLETO_DUR} defaultProps={{ guia: false }} />
      <Composition id="Reel-Completo-Guia" component={ReelCompleto} width={W} height={H} fps={FPS60} durationInFrames={COMPLETO_DUR} defaultProps={{ guia: true }} />
      <Composition id="Reel-Cierre-Guia" component={Cierre} width={W} height={H} fps={FPS60} durationInFrames={CIERRE_DUR} defaultProps={{ guia: true }} />
      <Still id="Reel-Chofer" component={ChoferPreview} width={1080} height={600} />
      <Composition id="Reel-Desarrollo" component={Desarrollo} width={W} height={H} fps={FPS60} durationInFrames={DESARROLLO_DUR} defaultProps={{ guia: false }} />
      <Composition id="Reel-Desarrollo-Guia" component={Desarrollo} width={W} height={H} fps={FPS60} durationInFrames={DESARROLLO_DUR} defaultProps={{ guia: true }} />
    </Folder>
    <Composition id="Gastos4-Adivina" component={Adivina} width={W} height={H} fps={FPS} durationInFrames={ADIVINA_DUR} defaultProps={{ guia: false }} />
    <Composition id="Gastos4-Adivina-Guia" component={Adivina} width={W} height={H} fps={FPS} durationInFrames={ADIVINA_DUR} defaultProps={{ guia: true }} />
    <Composition id="Gastos3-Factura" component={FacturaAchica} width={W} height={H} fps={FPS} durationInFrames={FACTURA_DUR} defaultProps={{ guia: false }} />
    <Composition id="Gastos3-Factura-Guia" component={FacturaAchica} width={W} height={H} fps={FPS} durationInFrames={FACTURA_DUR} defaultProps={{ guia: true }} />
    <Composition id="Gastos2-UnDia" component={UnDia} width={W} height={H} fps={FPS} durationInFrames={UN_DIA_DUR} defaultProps={{ guia: false }} />
    <Composition id="Gastos2-UnDia-Guia" component={UnDia} width={W} height={H} fps={FPS} durationInFrames={UN_DIA_DUR} defaultProps={{ guia: true }} />
    <Composition id="Gastos1-Dias" component={LaMitad} width={W} height={H} fps={FPS} durationInFrames={LA_MITAD_DUR} defaultProps={{ guia: false }} />
    <Composition id="Gastos1-Dias-Guia" component={LaMitad} width={W} height={H} fps={FPS} durationInFrames={LA_MITAD_DUR} defaultProps={{ guia: true }} />
    <Composition id="Gastos1-PrimerosCuatro" component={PrimerosCuatro} width={W} height={H} fps={FPS} durationInFrames={PRIMEROS_CUATRO_DUR} defaultProps={{ guia: false }} />
    <Composition id="Gastos1-Guia" component={PrimerosCuatro} width={W} height={H} fps={FPS} durationInFrames={PRIMEROS_CUATRO_DUR} defaultProps={{ guia: true }} />
    <Composition id="MonoGrua" component={MonoGruaVideo} width={W} height={H} fps={FPS} durationInFrames={MONOGRUA_DUR} defaultProps={{ guia: false }} />
    <Composition id="MonoGrua-Guia" component={MonoGruaVideo} width={W} height={H} fps={FPS} durationInFrames={MONOGRUA_DUR} defaultProps={{ guia: true }} />
    <Folder name="MonoGrua-v2">
      <Composition id="MG2-Paso1" component={MGPaso1} width={W} height={H} fps={FPS} durationInFrames={MG_P1} defaultProps={{ guia: true }} />
      <Composition id="MG2-Paso2" component={MGPaso2} width={W} height={H} fps={FPS} durationInFrames={MG_P2} defaultProps={{ guia: true }} />
      <Composition id="MG2-Paso3" component={MGPaso3} width={W} height={H} fps={FPS} durationInFrames={MG_P3} defaultProps={{ guia: true }} />
    </Folder>
    <Folder name="MonoGrua-Pasos">
      <Composition id="MG-Paso1" component={Paso1} width={W} height={H} fps={FPS} durationInFrames={PASO1_DUR} defaultProps={{ guia: false }} />
      <Composition id="MG-Paso1-Guia" component={Paso1} width={W} height={H} fps={FPS} durationInFrames={PASO1_DUR} defaultProps={{ guia: true }} />
      <Composition id="MG-Paso2" component={Paso2} width={W} height={H} fps={FPS} durationInFrames={PASO2_DUR} defaultProps={{ guia: false }} />
      <Composition id="MG-Paso2-Guia" component={Paso2} width={W} height={H} fps={FPS} durationInFrames={PASO2_DUR} defaultProps={{ guia: true }} />
      <Composition id="MG-Paso3" component={Paso3} width={W} height={H} fps={FPS} durationInFrames={PASO3_DUR} defaultProps={{ guia: false }} />
      <Composition id="MG-Paso3-Guia" component={Paso3} width={W} height={H} fps={FPS} durationInFrames={PASO3_DUR} defaultProps={{ guia: true }} />
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
