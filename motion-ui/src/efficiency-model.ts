export type Day = { dia: string; facturados: number | null; odometro: number | null; cierres_faltantes: number; servicios_sin_km: number; jornadas: number; remitos_sin_servicio?: number };
export type Period = { filas: Day[]; facturados: number | null; odometro: number | null; cierres_faltantes: number; servicios_sin_km: number; jornadas: number; remitos_sin_servicio: number };
export type EfficiencyData = { desde: string; hasta: string; hasta_solicitado: string; anterior_desde: string; anterior_hasta: string; actualizado: string; filtrado: boolean; cobertura_incompleta?: boolean; actual: Period | null; anterior: Period | null };
export function reason(data: EfficiencyData, p: Period | null): string {
  if (!p || !p.filas.length) return 'Sin datos para este período.';
  if (data.filtrado) return 'El odómetro corresponde a toda la flota. Quitá los filtros de prestadora, base o concepto para comparar.';
  if (p.remitos_sin_servicio) return `${p.remitos_sin_servicio} remitos todavía no están vinculados a Servicios. La relación no es comparable.`;
  if (p.cierres_faltantes) return `${p.cierres_faltantes} jornadas sin cierre o sin odómetro válido. Los días incompletos aparecen como cortes en la línea.`;
  if (p.servicios_sin_km) return `${p.servicios_sin_km} servicios sin km de facturación válidos.`;
  if (p.odometro == null || p.odometro < 0) return 'Sin km registrados por odómetro para calcular la eficiencia.';
  if (p.facturados == null || p.facturados <= 0) return 'Sin km facturados para calcular la eficiencia.';
  return '';
}
export function efficiencyPercent(billed: number|null, travelled: number|null): number|null {
  if(billed==null||travelled==null||!Number.isFinite(billed)||!Number.isFinite(travelled)||billed<=0||travelled<0)return null;
  return (billed-travelled)/billed*100;
}
export function ratio(data: EfficiencyData, p: Period | null): number | null {
  return reason(data,p) ? null : efficiencyPercent(p!.facturados,p!.odometro);
}
export function selectionRatio(data: EfficiencyData, index: number | null, cumulative: boolean): number | null {
  if(index==null)return ratio(data,data.actual);
  const rows=data.actual?.filas||[];
  if(data.filtrado||index<0||index>=rows.length)return null;
  const chosen=cumulative?rows.slice(0,index+1):[rows[index]];
  if(chosen.some(r=>r.facturados==null||r.odometro==null||r.cierres_faltantes>0||r.servicios_sin_km>0||(r.remitos_sin_servicio||0)>0))return null;
  const billed=chosen.reduce((s,r)=>s+r.facturados!,0),odo=chosen.reduce((s,r)=>s+r.odometro!,0);
  return efficiencyPercent(billed,odo);
}
// Operational preview: use the SAME closed/valid dates for numerator and denominator.
// Historical unlinked remitos flag the observed ratio as partial, not unavailable.
function comparableDay(r: Day): boolean {
  return r.facturados!=null&&Number.isFinite(r.facturados)&&r.facturados>=0&&
    r.odometro!=null&&Number.isFinite(r.odometro)&&r.odometro>=0&&
    !(r.cierres_faltantes>0)&&!(r.servicios_sin_km>0)&&
    (r.jornadas>0||r.facturados===0);
}
export function efficiencySummary(data: EfficiencyData, index: number|null, cumulative: boolean) {
  const all=data.actual?.filas||[];
  const chosen=index==null?all:index>=0&&index<all.length?(cumulative?all.slice(0,index+1):[all[index]]):[];
  const valid=chosen.filter(comparableDay),excluded=chosen.length-valid.length;
  const partial=excluded>0||chosen.some(r=>(r.remitos_sin_servicio||0)>0)||(index==null&&(data.actual?.remitos_sin_servicio||0)>0);
  const facturados=valid.length?valid.reduce((sum,r)=>sum+r.facturados!,0):null;
  const odometro=valid.length?valid.reduce((sum,r)=>sum+r.odometro!,0):null;
  if(data.filtrado){
    return {facturados,odometro,
      porcentaje:null,partial:true,excluded,days:valid.length,totalDays:chosen.length,from:valid[0]?.dia,through:valid.at(-1)?.dia};
  }
  return {facturados,odometro,porcentaje:efficiencyPercent(facturados,odometro),
    partial,excluded,days:valid.length,totalDays:chosen.length,from:valid[0]?.dia,through:valid.at(-1)?.dia};
}
export function comparableSeries(rows: Day[], cumulative: boolean): Day[] {
  let billed=0,odo=0;
  return rows.map(r=>{
    if(!comparableDay(r))return {...r,facturados:null,odometro:null};
    billed+=r.facturados!;odo+=r.odometro!;
    return {...r,facturados:cumulative?billed:r.facturados,odometro:cumulative?odo:r.odometro};
  });
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
// Bounded smoothstep geometry; no extra measurements and no bridges across gaps.
export function curveValue(rows: Day[], key: 'facturados' | 'odometro', position: number): number | null {
  if (!rows.length) return null;
  const p=Math.max(0,Math.min(rows.length-1,position)),i=Math.floor(p),t=p-i,a=rows[i][key],b=rows[Math.min(i+1,rows.length-1)][key];
  if(t<.00001)return a;
  return a==null||b==null?null:a+(b-a)*t*t*(3-2*t);
}
export function curvePath(rows: Day[], key: 'facturados' | 'odometro', x:(i:number)=>number,y:(v:number)=>number):string {
  let gap=true;
  return rows.map((r,i)=>{const v=r[key];if(v==null){gap=true;return '';}
    const px=x(i),py=y(v);if(gap){gap=false;return `M${px.toFixed(2)},${py.toFixed(2)}`;}
    const prev=x(i-1),step=(px-prev)/3;
    return `C${(prev+step).toFixed(2)},${y(rows[i-1][key]!).toFixed(2)} ${(px-step).toFixed(2)},${py.toFixed(2)} ${px.toFixed(2)},${py.toFixed(2)}`;
  }).join(' ');
}
