import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { wipe } from "@remotion/transitions/wipe";
import React from "react";
import { AbsoluteFill, staticFile } from "remotion";
import { ReelsGuide } from "./StepFrame";
import { Wrong } from "./Wrong";

export const PASO_T = 18; // barrido sin → con
export const WRONG_LEAD = 30; // la ✕ aparece 1 s antes de que termine la escena sin

// Vista previa de un paso: escena sin → ✕ «esto está mal» → barrido → escena con
export const PasoPreview: React.FC<{ sin: React.ReactNode; con: React.ReactNode; sinDur: number; conDur: number; guia?: boolean }> = ({ sin, con, sinDur, conDur, guia }) => (
  <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence name="Sin" durationInFrames={sinDur}>
        <Wrong at={sinDur - WRONG_LEAD}>{sin}</Wrong>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={linearTiming({ durationInFrames: PASO_T })} />
      <TransitionSeries.Sequence name="Con" durationInFrames={conDur}>
        {con}
      </TransitionSeries.Sequence>
    </TransitionSeries>
    <Audio name="Esto está mal" src={staticFile("sfx/record-scratch.wav")} from={sinDur - WRONG_LEAD} volume={0.7} />
    <Audio name="Barrido" src={staticFile("sfx/whoosh.wav")} from={sinDur - PASO_T} volume={0.6} />
    {guia ? <ReelsGuide /> : null}
  </AbsoluteFill>
);
