import React from "react";

// Chofer dibujado de cero en estilo plano de trazo grueso, con los colores de AuxiliOS.
// `pulgar` (0..1) levanta el brazo derecho del volante hasta el pulgar arriba.
const INK = "#14161b";
const AMBER = "#f5a623";
const AMBER_D = "#d98e12";
const PIEL = "#ffd9c4";
const PIEL_D = "#f4bfa3";
const PELO = "#2a2f3a";
const S = 14; // grosor del contorno

export const Chofer: React.FC<{ pulgar: number; size?: number; parpadeo?: boolean }> = ({ pulgar, size = 360, parpadeo = false }) => {
  // el brazo gira sobre el hombro: de apoyado en el volante a levantado
  const ang = 200 - pulgar * 180; // 200°: abajo, hacia el volante · 20°: arriba, al costado de la cabeza
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} style={{ overflow: "hidden" }}>
      {/* asiento */}
      <rect x={104} y={196} width={304} height={300} rx={70} fill="#e2e5ec" stroke={INK} strokeWidth={S} />
      <rect x={124} y={216} width={60} height={240} rx={30} fill="#eef0f4" />
      {/* cuerpo con la remera ámbar */}
      <path d="M58 520 V440 a112 112 0 0 1 112 -112 h172 a112 112 0 0 1 112 112 V520 Z" fill={AMBER} stroke={INK} strokeWidth={S} strokeLinejoin="round" />
      <path d="M380 340 a112 112 0 0 1 74 100 V520 h-60 V430 z" fill={AMBER_D} />
      {/* cuello y cuello de la remera */}
      <path d="M214 286 h84 v40 a42 42 0 0 1 -84 0 z" fill={PIEL_D} stroke={INK} strokeWidth={S} strokeLinejoin="round" />
      <path d="M196 330 q60 52 120 0" fill="none" stroke={INK} strokeWidth={S} strokeLinecap="round" />
      {/* cinturón de seguridad */}
      <path d="M334 334 l58 22 l-150 170 h-70 z" fill={PELO} stroke={INK} strokeWidth={S} strokeLinejoin="round" />
      <path d="M352 350 l14 6 l-136 160 h-18 z" fill="#3a4152" />
      {/* cabeza */}
      <circle cx={150} cy={196} r={28} fill={PIEL} stroke={INK} strokeWidth={S} />
      <circle cx={362} cy={196} r={28} fill={PIEL} stroke={INK} strokeWidth={S} />
      <rect x={150} y={62} width={212} height={240} rx={104} fill={PIEL} stroke={INK} strokeWidth={S} />
      <path d="M322 90 a104 104 0 0 1 40 82 v26 a104 104 0 0 1 -60 94 a120 120 0 0 0 20 -190 z" fill={PIEL_D} />
      {/* pelo */}
      <path d="M150 176 V150 a106 106 0 0 1 212 0 V176 q-34 -26 -96 -38 q-18 26 -116 38 z" fill={PELO} stroke={INK} strokeWidth={S} strokeLinejoin="round" />
      <path d="M300 84 a96 96 0 0 1 48 60" fill="none" stroke="#4a5266" strokeWidth={10} strokeLinecap="round" />
      {/* cara */}
      {parpadeo ? (
        <>
          <path d="M204 196 h22 M286 196 h22" stroke={INK} strokeWidth={S} strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M215 182 v24 M297 182 v24" stroke={INK} strokeWidth={S} strokeLinecap="round" />
        </>
      )}
      <path d="M222 236 q34 30 68 0" fill="none" stroke={INK} strokeWidth={S} strokeLinecap="round" />
      <circle cx={196} cy={232} r={14} fill="#ffb59a" opacity={0.7} />
      <circle cx={316} cy={232} r={14} fill="#ffb59a" opacity={0.7} />
      {/* volante */}
      <circle cx={256} cy={640} r={196} fill="none" stroke={INK} strokeWidth={62} />
      <circle cx={256} cy={640} r={196} fill="none" stroke="#eef0f4" strokeWidth={34} />
      <path d="M140 500 a170 170 0 0 1 60 -38" fill="none" stroke="#ffffff" strokeWidth={10} strokeLinecap="round" />
      {/* mano izquierda en el volante */}
      <rect x={104} y={418} width={74} height={92} rx={32} fill={PIEL} stroke={INK} strokeWidth={S} transform="rotate(-24 141 464)" />
      {/* brazo derecho: del volante al pulgar arriba */}
      <g transform={`rotate(${ang} 392 392)`}>
        <line x1={392} y1={392} x2={392} y2={250} stroke={INK} strokeWidth={84} strokeLinecap="round" />
        <line x1={392} y1={392} x2={392} y2={250} stroke={AMBER} strokeWidth={58} strokeLinecap="round" />
        <g transform={`rotate(${-ang} 392 214)`}>
          {/* puño */}
          <rect x={350} y={186} width={86} height={80} rx={28} fill={PIEL} stroke={INK} strokeWidth={S} />
          <path d="M352 214 h82 M352 238 h82" stroke={PIEL_D} strokeWidth={8} />
          {/* pulgar */}
          <rect x={370} y={130} width={34} height={74} rx={17} fill={PIEL} stroke={INK} strokeWidth={S} opacity={pulgar > 0.55 ? 1 : 0} />
        </g>
      </g>
    </svg>
  );
};

// Vista para revisar el dibujo: con el brazo en el volante y con el pulgar arriba
export const ChoferPreview: React.FC = () => (
  <div style={{ width: 1080, height: 600, background: "#eef0f4", display: "flex", alignItems: "center", justifyContent: "space-around" }}>
    <Chofer pulgar={0} size={460} />
    <Chofer pulgar={1} size={460} />
  </div>
);
