import { useCurrentFrame } from "remotion";
import { C } from "../theme";
import { AMBER } from "./ui";

// Grúa de remolque vista de costado, dibujada en SVG
export const Truck: React.FC<{ solo: boolean; wheelTurn: number }> = ({ solo, wheelTurn }) => {
  const f = useCurrentFrame();
  const body = solo ? "#2b3142" : "#5d6169";
  const detail = solo ? AMBER : "#8a8f98";
  const beacon = solo ? (Math.floor(f / 6) % 2 === 0 ? AMBER : "#7a5a1a") : "#55585e";
  const wheel = (cx: number) => (
    <g transform={`rotate(${wheelTurn} ${cx} 160)`}>
      <circle cx={cx} cy={160} r={30} fill="#111" stroke="#2a2a2a" strokeWidth={4} />
      <circle cx={cx} cy={160} r={12} fill={solo ? "#9aa3b5" : "#777"} />
      <line x1={cx - 22} y1={160} x2={cx + 22} y2={160} stroke="#444" strokeWidth={4} />
      <line x1={cx} y1={138} x2={cx} y2={182} stroke="#444" strokeWidth={4} />
    </g>
  );
  return (
    <svg viewBox="0 0 440 200" width={440} height={200}>
      {/* pluma y cable */}
      <line x1={70} y1={118} x2={170} y2={42} stroke={detail} strokeWidth={12} strokeLinecap="round" />
      <line x1={170} y1={42} x2={30} y2={110} stroke={C.muted} strokeWidth={3} />
      <path d="M30 110 v14 a8 8 0 1 1 -10 6" fill="none" stroke={C.muted} strokeWidth={4} />
      {/* caja */}
      <rect x={40} y={118} width={250} height={34} rx={4} fill={body} />
      <rect x={40} y={118} width={250} height={8} fill={detail} />
      {/* cabina */}
      <path d="M290 152 V78 a14 14 0 0 1 14 -14 h56 l40 46 v42 z" fill={body} />
      <path d="M316 76 h40 l30 34 h-70 z" fill={solo ? "#7fb3ff33" : "#ffffff22"} stroke={solo ? "#9cc4ff" : "#999"} strokeWidth={2} />
      <rect x={290} y={124} width={110} height={6} fill={detail} />
      <rect x={330} y={52} width={30} height={12} rx={4} fill={beacon} />
      {wheel(100)}
      {wheel(345)}
    </svg>
  );
};
