import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill } from "remotion";
import { Paso1Sin, PASO1_SIN } from "../Paso1";
import { Paso2Sin, PASO2_SIN } from "../Paso2";
import { Paso3Sin, PASO3_SIN } from "../Paso3";
import { PASO_T, PasoPreview } from "../PasoPreview";
import { ReelsGuide } from "../StepFrame";
import { Cierre, CIERRE_DUR, Gancho, GANCHO_DUR, Tablero, TABLERO_DUR } from "./Extras";
import { Paso1Con, P1_CON } from "./Paso1Con";
import { Paso2Con, P2_CON } from "./Paso2Con";
import { Paso3Con, P3_CON } from "./Paso3Con";

const paso = (sin: number, con: number) => sin + con - PASO_T;
export const MG_P1 = paso(PASO1_SIN, P1_CON);
export const MG_P2 = paso(PASO2_SIN, P2_CON);
export const MG_P3 = paso(PASO3_SIN, P3_CON);
const SWIPE = 15; // entre pasos: deslizamiento hacia arriba, como al pasar de Reel
const FADE = 12;
export const MONOGRUA_DUR = GANCHO_DUR + MG_P1 + MG_P2 + MG_P3 + TABLERO_DUR + CIERRE_DUR - 4 * SWIPE - FADE;

export const MGPaso1: React.FC<{ guia?: boolean }> = ({ guia }) => <PasoPreview sin={<Paso1Sin />} con={<Paso1Con />} sinDur={PASO1_SIN} conDur={P1_CON} guia={guia} />;
export const MGPaso2: React.FC<{ guia?: boolean }> = ({ guia }) => <PasoPreview sin={<Paso2Sin />} con={<Paso2Con />} sinDur={PASO2_SIN} conDur={P2_CON} guia={guia} />;
export const MGPaso3: React.FC<{ guia?: boolean }> = ({ guia }) => <PasoPreview sin={<Paso3Sin />} con={<Paso3Con />} sinDur={PASO3_SIN} conDur={P3_CON} guia={guia} />;

const up = () => <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: SWIPE })} />;

// Segundo creativo: un servicio de asistencia, sin y con AuxiliOS, en 3 pasos
export const MonoGruaVideo: React.FC<{ guia?: boolean }> = ({ guia = false }) => (
  <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence name="Gancho" durationInFrames={GANCHO_DUR}>
        <Gancho />
      </TransitionSeries.Sequence>
      {up()}
      <TransitionSeries.Sequence name="Paso 1" durationInFrames={MG_P1}>
        <MGPaso1 />
      </TransitionSeries.Sequence>
      {up()}
      <TransitionSeries.Sequence name="Paso 2" durationInFrames={MG_P2}>
        <MGPaso2 />
      </TransitionSeries.Sequence>
      {up()}
      <TransitionSeries.Sequence name="Paso 3" durationInFrames={MG_P3}>
        <MGPaso3 />
      </TransitionSeries.Sequence>
      {up()}
      <TransitionSeries.Sequence name="Tablero" durationInFrames={TABLERO_DUR}>
        <Tablero />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: FADE })} />
      <TransitionSeries.Sequence name="Cierre" durationInFrames={CIERRE_DUR}>
        <Cierre />
      </TransitionSeries.Sequence>
    </TransitionSeries>
    {guia ? <ReelsGuide /> : null}
  </AbsoluteFill>
);
