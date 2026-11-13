// Adaptador de tiempo: por el alias de remotion.config.ts, todo `import … from "remotion"` pasa por acá.
// Con escala 1 se comporta igual que Remotion. Dentro de <TimeScale scale={2}>, una composición pensada
// a 30 fps se renderiza a 60 fps reales: cada cuadro se calcula en medio cuadro (useCurrentFrame da
// fracciones) y las secuencias se estiran ×2, así las animaciones se ven el doble de suaves.
// El audio no se toca: esas versiones se renderizan sin sonido y se les pega el audio original.
import React, { createContext, forwardRef, useContext } from "react";
import * as R from "remotion-real";

export * from "remotion-real";

const Escala = createContext(1);

export const TimeScale: React.FC<{ scale: number; children: React.ReactNode }> = ({ scale, children }) => (
  <Escala.Provider value={scale}>{children}</Escala.Provider>
);
export const useTimeScale = () => useContext(Escala);

export const useCurrentFrame: typeof R.useCurrentFrame = () => {
  const s = useContext(Escala);
  const f = R.useCurrentFrame();
  return s === 1 ? f : f / s;
};

export const useVideoConfig: typeof R.useVideoConfig = () => {
  const s = useContext(Escala);
  const c = R.useVideoConfig();
  return s === 1 ? c : { ...c, fps: c.fps / s, durationInFrames: Math.round(c.durationInFrames / s) };
};

type SeqProps = { from?: number; durationInFrames?: number; [k: string]: unknown };
const escalar = (s: number, p: SeqProps): SeqProps => {
  if (s === 1) return p;
  const d = p.durationInFrames;
  return { ...p, from: (p.from ?? 0) * s, durationInFrames: d === undefined || !Number.isFinite(d) ? d : d * s };
};

// Sequence con los tiempos estirados
const RSequence = R.Sequence as unknown as React.ComponentType<SeqProps>;
export const Sequence = forwardRef<HTMLDivElement, SeqProps>((props, ref) => {
  const s = useContext(Escala);
  return <RSequence ref={ref} {...escalar(s, props)} />;
}) as unknown as typeof R.Sequence;

// La que usa @remotion/transitions por dentro
const RSWS = (R.Internals as unknown as { SequenceWithoutSchema: React.ComponentType<SeqProps> }).SequenceWithoutSchema;
const SequenceWithoutSchema = forwardRef<HTMLDivElement, SeqProps>((props, ref) => {
  const s = useContext(Escala);
  return <RSWS ref={ref} {...escalar(s, props)} />;
});
export const Internals = { ...R.Internals, SequenceWithoutSchema } as typeof R.Internals;

// Series propia, armada con la Sequence de arriba (la de Remotion usa la suya interna)
type SerieProps = { durationInFrames: number; offset?: number; children?: React.ReactNode; [k: string]: unknown };
const SerieSequence: React.FC<SerieProps> = ({ children }) => <>{children}</>;
const SeriesImpl: React.FC<{ children?: React.ReactNode }> & { Sequence: React.FC<SerieProps> } = Object.assign(
  ({ children }: { children?: React.ReactNode }) => {
    let desde = 0;
    const items = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<SerieProps>[];
    return (
      <>
        {items.map((el, i) => {
          const { durationInFrames, offset = 0, children: hijos, ...rest } = el.props;
          const inicio = desde + offset;
          desde = inicio + durationInFrames;
          return (
            <Sequence key={el.key ?? i} from={inicio} durationInFrames={durationInFrames} {...rest}>
              {hijos}
            </Sequence>
          );
        })}
      </>
    );
  },
  { Sequence: SerieSequence },
);
export const Series = SeriesImpl as unknown as typeof R.Series;
