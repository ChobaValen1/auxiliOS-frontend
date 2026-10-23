export type Day = { dia: string; facturados: number | null; odometro: number | null; cierres_faltantes: number; servicios_sin_km: number; jornadas: number };
export type Period = { filas: Day[]; facturados: number | null; odometro: number | null; cierres_faltantes: number; servicios_sin_km: number; jornadas: number; remitos_sin_servicio: number };
export type EfficiencyData = { desde: string; hasta: string; hasta_solicitado: string; anterior_desde: string; anterior_hasta: string; actualizado: string; filtrado: boolean; cobertura_incompleta?: boolean; actual: Period | null; anterior: Period | null };
export function reason(data: EfficiencyData, p: Period | null): string {
  if (!p || !p.filas.length) return 'Sin datos para este período.';
  if (data.filtrado) return 'El odómetro corresponde a toda la flota. Quitá los filtros de prestadora, base o concepto para comparar.';
  if (p.remitos_sin_servicio) return `${p.remitos_sin_servicio} remitos todavía no están vinculados a Servicios. La relación no es comparable.`;
  if (p.cierres_faltantes) return `${p.cierres_faltantes} jornadas sin cierre o sin odómetro válido. Los días incompletos aparecen como cortes en la línea.`;
  if (p.servicios_sin_km) return `${p.servicios_sin_km} servicios sin km de facturación válidos.`;
  if (p.odometro == null || p.odometro <= 0) return 'Sin km registrados por odómetro para calcular la relación.';
  if (p.facturados == null) return 'Faltan km de facturación.';
  return '';
}
export function ratio(data: EfficiencyData, p: Period | null): number | null {
  return reason(data,p) ? null : p!.facturados! / p!.odometro! * 100;
}
export function series(rows: Day[], cumulative: boolean): Day[] {
  let f = 0, o = 0, gapF = false, gapO = false;
  return rows.map(row => {
    gapF ||= row.facturados == null; gapO ||= row.odometro == null;
    f += row.facturados ?? 0; o += row.odometro ?? 0;
    return { ...row, facturados: cumulative ? (gapF ? null : f) : row.facturados, odometro: cumulative ? (gapO ? null : o) : row.odometro };
  });
}
export function path(rows: Day[], key: 'facturados' | 'odometro', x: (i: number) => number, y: (v: number) => number): string {
  let gap = true;
  return rows.map((r,i) => { const v=r[key]; if(v==null){gap=true;return '';} const p=`${gap?'M':'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`;gap=false;return p; }).join(' ');
}
export function scaleTop(rows: Day[]): number {
  const max = Math.max(1,...rows.flatMap(r => [r.facturados ?? 0,r.odometro ?? 0]));
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max/magnitude*2)/2*magnitude;
}
