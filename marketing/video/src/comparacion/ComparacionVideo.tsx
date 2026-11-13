import { Series } from "remotion";
import { Intro, INTRO_DUR } from "./Intro";
import { M1Remito, M1_DUR } from "./M1Remito";
import { M2Senal, M2_DUR } from "./M2Senal";
import { M3Gasoil, M3_DUR } from "./M3Gasoil";
import { M4Mes, M4_DUR } from "./M4Mes";
import { Balance, BALANCE_DUR } from "./Balance";
import { CierreSolo, CIERRE_DUR } from "./CierreSolo";

export const COMPARACION_DUR = INTRO_DUR + M1_DUR + M2_DUR + M3_DUR + M4_DUR + BALANCE_DUR + CIERRE_DUR;

export const ComparacionVideo: React.FC = () => (
  <Series>
    <Series.Sequence name="Intro" durationInFrames={90}>
      <Intro />
    </Series.Sequence>
    <Series.Sequence name="El remito" durationInFrames={180}>
      <M1Remito />
    </Series.Sequence>
    <Series.Sequence name="Sin señal" durationInFrames={150}>
      <M2Senal />
    </Series.Sequence>
    <Series.Sequence name="Gasoil" durationInFrames={165}>
      <M3Gasoil />
    </Series.Sequence>
    <Series.Sequence name="Fin de mes" durationInFrames={180}>
      <M4Mes />
    </Series.Sequence>
    <Series.Sequence name="Balance" durationInFrames={105}>
      <Balance />
    </Series.Sequence>
    <Series.Sequence name="Cierre" durationInFrames={105}>
      <CierreSolo />
    </Series.Sequence>
  </Series>
);
