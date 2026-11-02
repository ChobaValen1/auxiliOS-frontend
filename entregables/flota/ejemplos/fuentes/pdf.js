const {chromium}=require('playwright');const fs=require('fs');const {E,rows}=require('./datos');
const m=v=>'$ '+Math.round(v).toLocaleString('es-AR');
// Número en letras (pesos), para el «Son pesos…» del detalle.
function letras(n){const u=['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve'];
 const d=['','','','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'],c=['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
 const n99=x=>x<30?u[x]:d[Math.floor(x/10)]+(x%10?' y '+u[x%10]:''),n999=x=>x===100?'cien':(c[Math.floor(x/100)]+(x%100?' '+n99(x%100):'')).trim();
 const mil=x=>x<1000?n999(x):(Math.floor(x/1000)===1?'mil':n999(Math.floor(x/1000)).replace(/uno$/,'un')+' mil')+(x%1000?' '+n999(x%1000):'');
 if(n<1e6)return mil(n);const mm=Math.floor(n/1e6);return (mm===1?'un millón':mil(mm).replace(/uno$/,'un')+' millones')+(n%1e6?' '+mil(n%1e6):'');}
const css=`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&family=Bebas+Neue&display=swap"><style>
*{box-sizing:border-box;margin:0}body{font:10.5pt/1.4 'DM Sans';color:#16181d}@page{size:A4;margin:14mm 14mm 16mm}
.hd{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:3px solid #f5a623}.emp b{font-size:14pt;display:block}.emp small{color:#666;display:block}
.doc{text-align:right}.doc .k{font:600 8pt 'DM Sans';letter-spacing:.12em;color:#c27c00;text-transform:uppercase}.doc .t{font:700 16pt 'DM Sans'}.doc small{color:#666}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px 14px;margin:14px 0;padding:12px 14px;background:#f5f6f8;border-radius:8px}.grid small{display:block;color:#777;font-size:7.5pt;letter-spacing:.08em;text-transform:uppercase}.grid b{font-weight:600}
h3{font:700 8pt 'DM Sans';letter-spacing:.12em;text-transform:uppercase;color:#c27c00;margin:14px 0 6px}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:7.5pt;letter-spacing:.08em;text-transform:uppercase;color:#777;border-bottom:1px solid #ccc;padding:5px 6px}td{padding:6px;border-bottom:1px solid #eee}td.n,th.n{text-align:right;font-family:'DM Mono'}
.sub td{font-weight:700;border-top:1.5px solid #333}.neg{color:#b02a2a}
.net{display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding:12px 16px;border:2px solid #f5a623;border-radius:10px;background:#fff8ea}.net b{font:500 20pt 'DM Mono'}.net small{display:block;color:#555;font-size:9pt;margin-top:2px}
.foot{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:40px}.sig{border-top:1px solid #333;padding-top:6px;font-size:9pt;color:#444}
.meta{margin-top:18px;font-size:8pt;color:#777;display:flex;justify-content:space-between}.tag{font-size:7pt;color:#888;border:1px solid #ccc;border-radius:4px;padding:0 4px;margin-left:6px}
.note{margin-top:10px;font-size:8pt;color:#777}</style>`;
const header=(title,sub)=>`<div class="hd"><div class="emp"><b>${E.empresa}</b><small>CUIT ${E.cuit} · ${E.dom}</small></div><div class="doc"><div class="k">${title}</div><div class="t">${E.periodo}</div><small>${sub}</small></div></div>`;
function recibo(x){const H=x.lines.filter(l=>l[0]==='haber'),Dd=x.lines.filter(l=>l[0]==='descuento');
 const tr=l=>`<tr><td>${l[1]}${l[5]!=='esquema'?`<span class="tag">${l[5]}</span>`:''}</td><td class="n">${l[2]!=null?l[2].toLocaleString('es-AR')+' × '+m(l[3]):''}</td><td class="n ${l[0]==='descuento'?'neg':''}">${l[0]==='descuento'?'− ':''}${m(l[4])}</td></tr>`;
 return css+header('Detalle de liquidación',`Estado: ${E.estado} · ${E.aprobado}`)+`
 <div class="grid"><div><small>Chofer</small><b>${x.n}</b></div><div><small>Legajo</small><b>${x.leg}</b></div><div><small>CUIL</small><b>${x.cuil}</b></div><div><small>Móvil habitual</small><b>${x.movil}</b></div>
 <div><small>Días trabajados</small><b>${x.dias}</b></div><div><small>Km de jornadas</small><b>${x.km.toLocaleString('es-AR')}</b></div><div><small>Servicios</small><b>${x.serv}</b></div><div><small>Forma de pago</small><b>${x.cbu?'Transferencia':'Efectivo'}</b></div></div>
 <h3>Haberes</h3><table><thead><tr><th>Concepto</th><th class="n">Cálculo</th><th class="n">Importe</th></tr></thead><tbody>${H.map(tr).join('')}<tr class="sub"><td>Total haberes</td><td></td><td class="n">${m(x.hab)}</td></tr></tbody></table>
 ${Dd.length?`<h3>Descuentos</h3><table><thead><tr><th>Concepto</th><th class="n"></th><th class="n">Importe</th></tr></thead><tbody>${Dd.map(tr).join('')}<tr class="sub"><td>Total descuentos</td><td></td><td class="n neg">− ${m(x.des)}</td></tr></tbody></table>`:''}
 <div class="net"><div>Neto a pagar<small>Son pesos ${letras(x.neto)}.</small></div><b>${m(x.neto)}</b></div>
 <p class="note">Detalle interno de lo liquidado por AuxiliOS a partir de jornadas, servicios, rendiciones y novedades del mes. El detalle de jornadas y servicios va en la página siguiente.</p>
 <div class="foot"><div class="sig">Firma del chofer · Recibí conforme</div><div class="sig">Aclaración y DNI</div></div>
 <div class="meta"><span>Aprobó: ${E.aprobo} · ${E.aprobado}</span><span>Generado con AuxiliOS</span></div>
 <div style="page-break-before:always"></div>${header('Anexo · jornadas y servicios',x.n)}
 <h3>Jornadas (muestra)</h3><table><thead><tr><th>Fecha</th><th>Móvil</th><th class="n">Km inicio</th><th class="n">Km fin</th><th class="n">Km</th><th class="n">Servicios</th></tr></thead><tbody>${[3,4,5,6,7,10,11,12].map((d,i)=>{const km=Math.round(x.km/x.dias),o=150000+i*(km+40);return `<tr><td>${String(d).padStart(2,'0')}/11/2026</td><td>${x.movil}</td><td class="n">${o.toLocaleString('es-AR')}</td><td class="n">${(o+km).toLocaleString('es-AR')}</td><td class="n">${km}</td><td class="n">${Math.round(x.serv/x.dias)}</td></tr>`;}).join('')}</tbody></table>
 <p class="note">(Ejemplo: en el documento real van todas las jornadas y todos los servicios del mes.)</p>`;}
function planilla(){return css.replace('@page{size:A4;','@page{size:A4 landscape;')+header('Planilla de sueldos',`Estado: ${E.estado} · aprobó ${E.aprobo}`)+`
 <table style="margin-top:14px"><thead><tr><th>Chofer</th><th>Legajo</th><th>Móvil</th><th class="n">Días</th><th class="n">Km</th><th class="n">Serv.</th><th class="n">Haberes</th><th class="n">Descuentos</th><th class="n">Neto</th><th>Pago</th><th style="width:110px">Firma</th></tr></thead><tbody>
 ${rows.map(x=>`<tr><td><b>${x.n}</b></td><td>${x.leg}</td><td>${x.movil}</td><td class="n">${x.dias}</td><td class="n">${x.km.toLocaleString('es-AR')}</td><td class="n">${x.serv}</td><td class="n">${m(x.hab)}</td><td class="n neg">${x.des?'− '+m(x.des):'—'}</td><td class="n"><b>${m(x.neto)}</b></td><td>${x.cbu?'Transf.':'Efectivo'}</td><td></td></tr>`).join('')}
 <tr class="sub"><td>Total · ${rows.length} choferes</td><td></td><td></td><td class="n">${rows.reduce((s,x)=>s+x.dias,0)}</td><td class="n">${rows.reduce((s,x)=>s+x.km,0).toLocaleString('es-AR')}</td><td class="n">${rows.reduce((s,x)=>s+x.serv,0)}</td><td class="n">${m(rows.reduce((s,x)=>s+x.hab,0))}</td><td class="n neg">− ${m(rows.reduce((s,x)=>s+x.des,0))}</td><td class="n">${m(rows.reduce((s,x)=>s+x.neto,0))}</td><td></td><td></td></tr></tbody></table>
 <div class="meta" style="margin-top:22px"><span>Transferencias: ${m(rows.filter(x=>x.cbu).reduce((s,x)=>s+x.neto,0))} · Efectivo: ${m(rows.filter(x=>!x.cbu).reduce((s,x)=>s+x.neto,0))}</span><span>Generado con AuxiliOS · datos de ejemplo</span></div>`;}
(async()=>{const b=await chromium.launch();const p=await b.newPage();
 for(const [name,html,land] of [['Detalle_Martin_Ruiz_Noviembre_2026_EJEMPLO',recibo(rows[0]),false],['Planilla_Sueldos_Noviembre_2026_EJEMPLO',planilla(),true]]){
  await p.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body>'+html+'</body></html>',{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);
  await p.pdf({path:__dirname+'/'+name+'.pdf',format:'A4',landscape:land,printBackground:true,preferCSSPageSize:true});console.log('pdf',name);}
 await b.close();})();
