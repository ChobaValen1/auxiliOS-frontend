import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { ReelsGuide } from "../monogrua/StepFrame";
import { Desarrollo, DESARROLLO_DUR } from "./Desarrollo";
import { Gancho, GANCHO_DUR } from "./Gancho";

// El reel entero, parte por parte: gancho → desarrollo (el cierre viene después)
export const COMPLETO_DUR = GANCHO_DUR + DESARROLLO_DUR;
export const ReelCompleto: React.FC<{ guia?: boolean }> = ({ guia = false }) => (
  <AbsoluteFill>
    <Series>
      <Series.Sequence name="Gancho" durationInFrames={GANCHO_DUR}>
        <Gancho />
      </Series.Sequence>
      <Series.Sequence name="Desarrollo" durationInFrames={DESARROLLO_DUR}>
        <Desarrollo />
      </Series.Sequence>
    </Series>
    {guia ? <ReelsGuide /> : null}
  </AbsoluteFill>
);
