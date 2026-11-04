import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { wipe } from "@remotion/transitions/wipe";
import React from "react";
import { AbsoluteFill, staticFile } from "remotion";
import { ReelsGuide } from "./StepFrame";

export const PASO_T = 12; // barrido sin → con

// Vista previa de un paso: escena sin → barrido con sonido → escena con
export const PasoPreview: React.FC<{ sin: React.ReactNode; con: React.ReactNode; sinDur: number; conDur: number; guia?: boolean }> = ({ sin, con, sinDur, conDur, guia }) => (
  <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence name="Sin" durationInFrames={sinDur}>
        {sin}
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-left" })} timing={linearTiming({ durationInFrames: PASO_T })} />
      <TransitionSeries.Sequence name="Con" durationInFrames={conDur}>
        {con}
      </TransitionSeries.Sequence>
    </TransitionSeries>
    <Audio name="Barrido" src={staticFile("sfx/whoosh.wav")} from={sinDur - PASO_T} volume={0.6} />
    {guia ? <ReelsGuide /> : null}
  </AbsoluteFill>
);
