import { useEffect, useId, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion, type MotionValue } from 'motion/react';
import { type Day, type EfficiencyData, reason, ratio, series, scaleTop, curvePath, curveValue } from './efficiency-model';
import './efficiency.css';
export { reason, ratio, series, path, scaleTop, curveValue, curvePath } from './efficiency-model';

const number=(v:number|null)=>v==null?'—':new Intl.NumberFormat('es-AR',{maximumFractionDigits:1}).format(v);
const date=(s:string)=>new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'short'});
type Metric='facturados'|'odometro';
type Geometry={rows:Day[];x:(i:number)=>number;y:(v:number)=>number};
function Glow({position,geometry,metric,id}:{position:MotionValue<number>;geometry:Geometry;metric:Metric;id:string}) {
  const {rows,x,y}=geometry;
  const cx=useTransform(position,p=>x(Math.max(0,Math.min(rows.length-1,p))));
  const cy=useTransform(position,p=>{const v=curveValue(rows,metric,p);return v==null?-100:y(v);});
  const opacity=useTransform(position,p=>curveValue(rows,metric,p)==null?0:1);
  const style=metric==='facturados'?'ax-eff-billed':'ax-eff-odo';
  return <motion.g style={{opacity}} className="ax-eff-glow" aria-hidden="true">
    <defs><clipPath id={id+metric}><motion.circle cx={cx} cy={cy} r="24"/></clipPath></defs>
    <motion.circle cx={cx} cy={cy} r="22" fill={`url(#${id+metric+'halo'})`}/>
    <path d={curvePath(rows,metric,x,y)} className={style+' ax-eff-lit'} clipPath={`url(#${id+metric})`} fill="none" strokeWidth="5" filter={`url(#${id}blur)`}/>
    <motion.circle cx={cx} cy={cy} r="4" className={style+' ax-eff-dot'}/>
  </motion.g>;
}
function Efficiency({data,error}:{data:EfficiencyData|null;error?:string}) {
  const [cumulative,setCumulative]=useState(false),[active,setActive]=useState<number|null>(null),[details,setDetails]=useState(false);
  const host=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const dragging=useRef<number|null>(null),startTouch=useRef<{x:number;y:number}|null>(null);
  const [width,setWidth]=useState(640),reduced=useReducedMotion(),id=useId().replace(/:/g,'');
  const target=useMotionValue(0),spring=useSpring(target,{stiffness:420,damping:38,mass:.5}),position=reduced?target:spring;
  useEffect(()=>{const n=host.current;if(!n)return;const o=new ResizeObserver(([e])=>setWidth(Math.max(200,Math.round(e.contentRect.width))));o.observe(n);return()=>o.disconnect();},[]);
  useEffect(()=>{setActive(null);dragging.current=null;startTouch.current=null;setDetails(false);},[data,cumulative]);
  const rows=series(data?.actual?.filas||[],cumulative),selected=active==null?null:rows[active];
  const left=8,right=16,height=width<600?284:318,bottom=height-30,top=scaleTop(rows),plotW=Math.max(1,width-left-right);
  const x=(i:number)=>left+(rows.length<2?plotW/2:i*plotW/(rows.length-1)),y=(v:number)=>bottom-v/top*(bottom-24);
  const cursorX=useTransform(position,p=>x(Math.max(0,Math.min(rows.length-1,p))));
  const value=data?ratio(data,data.actual):null,previous=data?ratio(data,data.anterior):null,warning=data?reason(data,data.actual):'';
  const billed=selected?selected.facturados:data?.actual?.facturados??null,odometer=selected?selected.odometro:data?.actual?.odometro??null;
  const indices=Array.from(new Set([0,Math.round((rows.length-1)/2),rows.length-1])).filter(i=>i>=0);
  function inspect(index:number){const i=Math.max(0,Math.min(rows.length-1,index));if(active==null){target.set(i);spring.jump(i);}else target.set(i);setActive(i);}
  function select(clientX:number,rect:DOMRect){inspect(Math.round((clientX-rect.left-left)/plotW*(rows.length-1)));}
  function reset(){setActive(null);dragging.current=null;startTouch.current=null;}
  function close(){dialog.current?.close();trigger.current?.focus();}
  return <div className="ax-eff" ref={host}>
    <header className="ax-eff-head"><div><h3>Eficiencia operativa</h3><span className="ax-eff-eyebrow">Flota propia</span></div><button ref={trigger} type="button" className="ax-eff-link" disabled={!rows.length} onClick={()=>dialog.current?.showModal()}>Ver desglose <span aria-hidden="true">↗</span></button></header>
    {error?<p role="alert" className="ax-eff-notice">{error}</p>:!data?<p role="status" className="ax-eff-notice">Cargando kilometrajes…</p>:<>
      <div className={'ax-eff-summary'+(selected?' is-scrubbing':'')} aria-live="polite" aria-atomic="true">
        <div className="ax-eff-total is-billed"><span><i/>Km facturados</span><strong data-metric="facturados">{number(billed)}<em>km</em></strong></div>
        <div className="ax-eff-total is-odo"><span><i/>Km recorridos <small>· odómetro</small></span><strong data-metric="odometro">{number(odometer)}<em>km</em></strong></div>
      </div>
      <div className="ax-eff-context ax-eff-inspect"><span>{selected?`${date(selected.dia)} · ${cumulative?'acumulado hasta este día':'valores del día'}`:`${date(data.desde)} — ${date(data.hasta)} · totales del período`}</span><span className="ax-eff-ratio">{value==null?'Relación del período no disponible':`Período: ${number(value)}% facturados / recorridos`}{value!=null&&previous!=null&&<b> · {value-previous>=0?'+':''}{number(value-previous)} p.p.</b>}</span></div>
      {rows.length?<svg className={'ax-eff-plot'+(active!=null?' is-active':'')} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="group" tabIndex={0} aria-label="Km facturados y recorridos en la misma escala. Mové el cursor, deslizá horizontalmente o usá las flechas para consultar un día."
        onFocus={()=>{if(dragging.current==null)inspect(rows.length-1);}} onBlur={reset}
        onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End','Escape'].includes(e.key)){e.preventDefault();if(e.key==='Escape')reset();else inspect(e.key==='Home'?0:e.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,(active??rows.length-1)+(e.key==='ArrowLeft'?-1:1))));}}}
        onPointerDown={e=>{dragging.current=e.pointerId;startTouch.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);select(e.clientX,e.currentTarget.getBoundingClientRect());}}
        onPointerMove={e=>{if(e.pointerType==='mouse'||dragging.current===e.pointerId){if(e.pointerType!=='mouse'&&startTouch.current&&Math.abs(e.clientY-startTouch.current.y)>Math.abs(e.clientX-startTouch.current.x)+8){reset();return;}select(e.clientX,e.currentTarget.getBoundingClientRect());}}}
        onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);reset();}} onPointerCancel={reset} onLostPointerCapture={reset} onPointerLeave={()=>{if(dragging.current==null)reset();}}>
        <title>Km facturados y recorridos · {cumulative?'acumulado':'diario'} · escala común de 0 a {number(top)} km</title>
        <defs><filter id={id+'blur'} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3"/></filter>
          {(['facturados','odometro'] as const).map(metric=><radialGradient key={metric} id={id+metric+'halo'}><stop offset="0" stopColor={metric==='facturados'?'#f5a623':'#94adc9'} stopOpacity=".42"/><stop offset="1" stopColor={metric==='facturados'?'#f5a623':'#94adc9'} stopOpacity="0"/></radialGradient>)}
          <clipPath id={id+'reveal'}><motion.rect key={cumulative+'-'+data.actualizado} x="0" y="0" height={height} initial={{width:reduced?width:0}} whileInView={{width}} viewport={{once:true}} transition={{duration:reduced?0:.8,ease:[.22,1,.36,1]}}/></clipPath></defs>
        <text x={width-right} y="14" textAnchor="end" className="ax-eff-scale">{number(top)} km</text><text x={width-right} y={bottom-7} textAnchor="end" className="ax-eff-scale">0 km</text>
        <line x1={left} x2={width-right} y1={bottom+.5} y2={bottom+.5} className="ax-eff-baseline"/>
        <g clipPath={`url(#${id}reveal)`}>{(['odometro','facturados'] as const).map(metric=><g key={metric}>
          <path d={curvePath(rows,metric,x,y)} className={(metric==='facturados'?'ax-eff-billed':'ax-eff-odo')+' ax-eff-curve'} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
          {rows.map((r,i)=>r[metric]!=null&&((i===0||rows[i-1][metric]==null)&&(i===rows.length-1||rows[i+1][metric]==null))?<circle key={i} cx={x(i)} cy={y(r[metric]!)} r="3" className={metric==='facturados'?'ax-eff-billed':'ax-eff-odo'}/>:null)}
        </g>)}</g>
        {active!=null&&<><motion.line x1={cursorX} x2={cursorX} y1="22" y2={bottom} className="ax-eff-cursor" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:reduced?0:.12}}/>{(['facturados','odometro'] as const).map(metric=><Glow key={metric} metric={metric} id={id} position={position} geometry={{rows,x,y}}/>)}</>}
        {indices.map(i=><text key={i} x={x(i)} y={height-8} textAnchor={i===0?'start':i===rows.length-1?'end':'middle'}>{date(rows[i].dia)}</text>)}
      </svg>:<p className="ax-eff-notice">Sin días transcurridos en el período seleccionado.</p>}
      <div className="ax-eff-controls"><span className="ax-eff-hint">Deslizá para explorar <span aria-hidden="true">↔</span></span><div className="ax-eff-switch" aria-label="Modo del gráfico">{[false,true].map(c=><button type="button" key={String(c)} aria-pressed={cumulative===c} onClick={()=>setCumulative(c)}>{c?'Acumulado':'Diario'}{cumulative===c&&<motion.span layoutId={id+'mode'} transition={reduced?{duration:0}:{type:'spring',stiffness:420,damping:38}}/>}</button>)}</div></div>
      <footer className="ax-eff-foot"><span>Km calculados para facturación · odómetro de jornadas registradas.</span>{warning?<div><button type="button" className="ax-eff-quality" aria-expanded={details} aria-controls={id+'quality'} onClick={()=>setDetails(!details)}>Datos incompletos <span aria-hidden="true">{details?'−':'+'}</span></button>{details&&<p id={id+'quality'} className="ax-eff-quality-detail">{warning}{data.actual?.cierres_faltantes?` ${data.actual.cierres_faltantes} jornadas sin cierre válido.`:''} Los cortes indican datos faltantes; no se interpolan.</p>}</div>:<span className="ax-eff-quality-ok">Datos disponibles</span>}</footer>
      <dialog ref={dialog} className="ax-eff-dialog" aria-labelledby={id+'detail'} onCancel={close} onClick={e=>{if(e.target===e.currentTarget)close();}} onClose={()=>trigger.current?.focus()}><header><h3 id={id+'detail'}>Desglose diario · flota propia</h3><button type="button" onClick={close} aria-label="Cerrar desglose">✕</button></header><p>Valores diarios, no acumulados. — indica un dato incompleto. Servicios por fecha programada; jornadas por fecha de inicio. No mide rentabilidad.</p>{warning&&<p>{warning}</p>}<div className="ax-eff-table"><table><caption>{date(data.desde)} — {date(data.hasta)}</caption><thead><tr><th scope="col">Fecha</th><th scope="col">Facturados (km)</th><th scope="col">Odómetro (km)</th><th scope="col">Jornadas</th></tr></thead><tbody>{data.actual?.filas.map(r=><tr key={r.dia}><th scope="row">{date(r.dia)}</th><td>{number(r.facturados)}</td><td>{number(r.odometro)}</td><td>{r.jornadas}{r.cierres_faltantes?` · ${r.cierres_faltantes} incompletas`:''}</td></tr>)}</tbody></table></div></dialog>
    </>}
  </div>;
}
const roots=new WeakMap<HTMLElement,Root>();
export function render(node:HTMLElement,data:EfficiencyData|null,error?:string){let root=roots.get(node);if(!root){root=createRoot(node);roots.set(node,root);}root.render(<Efficiency data={data} error={error}/>);}
export function unmount(node:HTMLElement){roots.get(node)?.unmount();roots.delete(node);}
