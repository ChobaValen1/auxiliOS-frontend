import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { HookScene } from "./scenes/HookScene";
import { PainScene } from "./scenes/PainScene";
import { PhoneScene } from "./scenes/PhoneScene";
import { FeaturesScene } from "./scenes/FeaturesScene";
import { CtaScene } from "./scenes/CtaScene";

export const TRANSITION = 12;
// 105 + 105 + 165 + 90 + 105 − 4 × 12
export const AD_DURATION = 522;

export const AdVideo: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence name="Gancho" durationInFrames={105}>
      <HookScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: 12 })} />
    <TransitionSeries.Sequence name="Dolor" durationInFrames={105}>
      <PainScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 12 })} />
    <TransitionSeries.Sequence name="Solucion" durationInFrames={165}>
      <PhoneScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
    <TransitionSeries.Sequence name="Funciones" durationInFrames={90}>
      <FeaturesScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
    <TransitionSeries.Sequence name="Cierre" durationInFrames={105}>
      <CtaScene />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
