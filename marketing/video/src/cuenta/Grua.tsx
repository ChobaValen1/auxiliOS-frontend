import React from "react";

// Grúa con plancha vista de costado, mirando a la derecha: blanca con detalles ámbar,
// baliza en el techo y sin marcas. `giro` rota las ruedas (en grados), `encendida` prende
// baliza y faro, `baliza` alterna la luz.
const AMBER = "#f5a623";
const INK = "#14161b";

const Rueda: React.FC<{ cx: number; giro: number }> = ({ cx, giro }) => (
  <g transform={`rotate(${giro} ${cx} 262)`}>
    <circle cx={cx} cy={262} r={46} fill="#0d0e11" />
    <circle cx={cx} cy={262} r={40} fill="none" stroke="#1d2027" strokeWidth={6} strokeDasharray="10 8" />
    <circle cx={cx} cy={262} r={25} fill="#aab2c2" />
    <circle cx={cx} cy={262} r={9} fill="#3a4050" />
    {[0, 72, 144, 216, 288].map((a) => (
      <circle key={a} cx={cx + Math.cos((a * Math.PI) / 180) * 16} cy={262 + Math.sin((a * Math.PI) / 180) * 16} r={3.5} fill="#3a4050" />
    ))}
  </g>
);

export const Grua: React.FC<{ giro: number; encendida: boolean; baliza: boolean; width?: number }> = ({ giro, encendida, baliza, width = 760 }) => (
  <svg viewBox="0 0 840 340" width={width} height={(width * 340) / 840} style={{ overflow: "visible" }}>
    {/* haz del faro */}
    {encendida ? <path d="M808 210 L1180 150 L1180 300 Z" fill="url(#haz)" /> : null}
    <defs>
      <linearGradient id="haz" x1="0" x2="1">
        <stop offset="0" stopColor="#fff3cf" stopOpacity={0.45} />
        <stop offset="1" stopColor="#fff3cf" stopOpacity={0} />
      </linearGradient>
      <radialGradient id="brillo">
        <stop offset="0" stopColor={AMBER} stopOpacity={0.8} />
        <stop offset="1" stopColor={AMBER} stopOpacity={0} />
      </radialGradient>
    </defs>
    <ellipse cx={420} cy={312} rx={410} ry={14} fill="rgba(0,0,0,.55)" />
    {/* chasis */}
    <rect x={40} y={236} width={740} height={22} rx={4} fill="#1b1e25" />
    {/* plancha */}
    <path d="M14 232 L30 196 H548 V236 H14 Z" fill="#e6e9ef" stroke="#aeb6c4" strokeWidth={3} strokeLinejoin="round" />
    <rect x={26} y={220} width={522} height={8} fill={AMBER} />
    {[90, 190, 290, 390, 490].map((x) => (
      <rect key={x} x={x} y={200} width={4} height={18} fill="#c3c9d4" />
    ))}
    <rect x={10} y={204} width={10} height={16} rx={2} fill={encendida ? "#ff8a3d" : "#8a5a3a"} />
    {/* malacate */}
    <rect x={516} y={166} width={30} height={30} rx={4} fill="#3a4050" />
    <circle cx={531} cy={181} r={9} fill="#252a35" />
    {/* caño de escape */}
    <rect x={552} y={92} width={10} height={146} rx={3} fill="#2a2f3a" />
    {/* cabina */}
    <path d="M566 252 V122 a24 24 0 0 1 24 -24 h116 a20 20 0 0 1 16 8 l62 84 a32 32 0 0 1 6 19 V252 Z" fill="#f4f5f8" stroke="#c4cad6" strokeWidth={3} strokeLinejoin="round" />
    <path d="M606 114 h96 a10 10 0 0 1 8 4 l48 66 h-152 z" fill="#22324a" />
    <path d="M620 122 l30 0 l-26 50 h-10 z" fill="rgba(255,255,255,.18)" />
    <rect x={566} y={200} width={224} height={12} fill={AMBER} />
    <path d="M598 188 V248" stroke="#c4cad6" strokeWidth={3} />
    <rect x={654} y={218} width={28} height={6} rx={3} fill="#9aa3b8" />
    <rect x={746} y={118} width={8} height={36} rx={3} fill={INK} />
    {/* paragolpes y faro */}
    <rect x={772} y={226} width={40} height={28} rx={7} fill="#2a2f3a" />
    <rect x={794} y={202} width={16} height={15} rx={4} fill={encendida ? "#fff6d8" : "#9aa3b8"} />
    {/* baliza */}
    <rect x={626} y={84} width={52} height={16} rx={7} fill={encendida && baliza ? AMBER : "#7a5a1a"} />
    {encendida && baliza ? <circle cx={652} cy={90} r={70} fill="url(#brillo)" /> : null}
    {/* guardabarros */}
    <path d="M640 252 a56 56 0 0 1 112 0" fill="none" stroke="#1b1e25" strokeWidth={10} />
    <Rueda cx={150} giro={giro} />
    <Rueda cx={258} giro={giro} />
    <Rueda cx={696} giro={giro} />
  </svg>
);
