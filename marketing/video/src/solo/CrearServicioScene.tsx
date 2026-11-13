import { Audio } from "@remotion/media";
import { AbsoluteFill, interpolate, staticFile } from "remotion";
import { Flow, Step, typed } from "./Flow";
import { A1Servicios, A2ParaQuien, A3QueServicio, A4Precio, A5Remito } from "./Screens";

export const CREAR_DUR = 270;

// Parte A: el gruero carga el servicio en AuxiliOS Solo (después del chat)
const steps: Step[] = [
  { from: 0, tap: 30, render: () => <A1Servicios /> },
  { from: 44, tap: 74, render: () => <A2ParaQuien /> },
  { from: 88, tap: 118, render: () => <A3QueServicio /> },
  {
    from: 132,
    tap: 190,
    render: (f) => {
      const digits = "60000".slice(0, Math.round(interpolate(f, [12, 44], [0, 5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
      return <A4Precio price={digits ? Number(digits).toLocaleString("es-AR").replace(/,/g, ".") : ""} />;
    },
  },
  {
    from: 204,
    tap: 252,
    render: (f) => {
      const v = {
        plate: typed("AB 123 CD", f, 4, 14),
        mm: typed("Chevrolet Vectra", f, 15, 25),
        desde: typed("Luis Guillón", f, 26, 33),
        hasta: typed("Lomas de Zamora", f, 34, 42),
      };
      const focus = f < 15 ? "plate" : f < 26 ? "mm" : f < 34 ? "desde" : f < 44 ? "hasta" : undefined;
      return <A5Remito v={v} focus={focus} toast={interpolate(f, [52, 58], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />;
    },
  },
];

export const CrearServicioScene: React.FC = () => (
  <AbsoluteFill>
    <Flow steps={steps} />
    {steps.map((s) => (s.tap !== undefined ? <Audio key={s.tap} name="Toque" src={staticFile("sfx/mouse-click.wav")} from={s.tap} volume={0.45} /> : null))}
  </AbsoluteFill>
);
