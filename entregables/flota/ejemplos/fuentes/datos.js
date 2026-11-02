// Datos de ejemplo (inventados) para mostrar el formato.
const E={empresa:'Grúas del Sur S.R.L.',cuit:'30-71234567-8',dom:'Av. Hipólito Yrigoyen 1234, Lanús',periodo:'Noviembre 2026',yyyymm:'2026-11',estado:'Aprobado',aprobo:'Ana Torres',aprobado:'01/12/2026 18:40'};
const D=[
 ['Martín Ruiz','014','20-30111222-3','AE 482 KD',21,3412,58,650000,85,3200,60000,[['Bono · cubrió feriado',19780]],[['Adelanto del 12/11',100000],['Faltante de efectivo (rendición)',20000]],'0000003100012345678901','mruiz.grua'],
 ['Lucas Benítez','009','20-28999111-4','AF 120 TR',23,4020,71,650000,85,3200,60000,[['Horas extra · 12 h',120200]],[],'0000003100098765432101','lbenitez'],
 ['Diego Sosa','021','20-33222111-5','AB 334 KD',20,2950,49,600000,85,3200,60000,[],[['Adelanto del 05/11',85000]],'',''],
 ['Pablo Medina','017','20-31555444-6','AD 901 MM',22,3180,55,600000,85,3200,60000,[],[['Vale de combustible personal',60000]],'0000003100055544433322','pmedina'],
 ['Nicolás Acosta','025','20-35444333-7','AC 417 PP',19,2640,44,600000,85,3200,0,[],[],'',''],
 ['Ezequiel Romero','012','20-29333222-8','AE 255 RS',21,2870,47,600000,85,3200,60000,[],[['Adelanto del 20/11',100000],['Multa de tránsito (descuento acordado)',43400]],'0000003100011122233344','eromero'],
 ['Gustavo Pereyra','030','20-36111000-9','PQR 118',18,2300,39,550000,85,3200,0,[],[['Adelanto del 08/11',120000]],'',''],
 ['Hernán Vega','031','20-37222999-0','AG 044 JK',20,2710,45,300000,85,3200,60000,[],[],'0000003100077766655544','hvega'],
];
const rows=D.map(([n,leg,cuil,movil,dias,km,serv,bas,vkm,vsv,pres,extra,desc,cbu,alias])=>{
  const lines=[['haber','Sueldo básico',null,null,bas,'esquema'],['haber','Kilómetros',km,vkm,km*vkm,'jornadas'],['haber','Servicios',serv,vsv,serv*vsv,'servicios'],...(pres?[['haber','Presentismo',null,null,pres,'esquema']]:[]),
    ...extra.map(([c,v])=>['haber',c,null,null,v,'novedad']),...desc.map(([c,v])=>['descuento',c,null,null,v,c.includes('rendición')?'rendición':'novedad'])];
  const hab=lines.filter(l=>l[0]==='haber').reduce((s,l)=>s+l[4],0),des=lines.filter(l=>l[0]==='descuento').reduce((s,l)=>s+l[4],0);
  return {n,leg,cuil,movil,dias,km,serv,lines,hab,des,neto:hab-des,cbu,alias};});
module.exports={E,rows};
