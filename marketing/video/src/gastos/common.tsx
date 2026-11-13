import React from "react";
import { C } from "../theme";

export { SAFE } from "../monogrua/StepFrame";
export { money, pop, ramp, U } from "../monogrua/v2/ui";

// Datos de ejemplo de noviembre, los mismos del segundo creativo
export const FACTURADO = 1134000;
export const VARIABLES = 232000;
export const FIJOS = 180000;
export const SERVICIOS = 18;
export const POR_SERVICIO = Math.round((FACTURADO - VARIABLES) / SERVICIOS); // 50.111 antes de los fijos
export const QUEDA = FACTURADO - VARIABLES - FIJOS; // 722.000

export const FIJOS_ITEMS: [string, string, number][] = [
  ["🛡️", "Seguro", 58000],
  ["🧾", "Monotributo", 42000],
  ["🔧", "VTV (por mes)", 30000],
  ["🚗", "Patente", 28000],
  ["📡", "GPS / celular", 22000],
];

export const Stripe: React.FC<{ bottom?: boolean }> = ({ bottom }) => (
  <div style={{ position: "absolute", [bottom ? "bottom" : "top"]: 0, left: 0, right: 0, height: 26, background: `repeating-linear-gradient(-45deg, ${C.yellow} 0 26px, #111 26px 52px)` }} />
);
