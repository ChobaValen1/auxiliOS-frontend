/* AuxiliOS · PDF del remito v2
   Documento de texto real (jsPDF), no una captura: se lee nítido, se puede
   buscar/copiar y pesa poco.

   · Datos de la empresa: Configuración → Empresa y documentos
     (company_document_settings), en el encabezado y en el pie.
   · Protagonista: el N° de servicio; el N° de remito queda como referencia.
   · Tipo de servicio real (del Servicio) cuando se conoce.
   · Cargos: solo las líneas con importe, total, medio de pago y, si
     Administración ajustó los cargos, el importe aprobado.
   · Verificación: mismo código y QR que la versión anterior (hashRemito),
     así los PDF ya entregados siguen verificando igual.

   API: RemitoPdf.build(d) → jsPDF · RemitoPdf.blob(d) → Blob ·
        RemitoPdf.download(d) · RemitoPdf.fileName(d)
   `d` es la fila mapeada de _mapRemitoRow (+ srvOrden/tipoReal si se conocen). */
(()=>{'use strict';
if(window.RemitoPdf)return;

const PAGE={w:210,h:297,m:16};
const INK=[28,30,34],MUTED=[110,114,122],LINE=[222,224,228],SOFT=[246,247,249],BRAND=[245,166,35],RED=[200,52,46];
const GENERICOS=new Set(['','—','A definir por Operaciones','Servicio de grúa','Otro']);
const money=n=>'$ '+(Number(n)||0).toLocaleString('es-AR',{minimumFractionDigits:0,maximumFractionDigits:2});
const clean=v=>String(v??'').replace(/[→➜]/g,'>').replace(/[✓✔]/g,'Sí').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF–—‘’“”•…€]/g,'').trim();
const pad=n=>String(n).padStart(2,'0');
function fechaHora(iso){if(!iso)return'—';const d=new Date(iso);if(isNaN(d))return'—';return`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`}
const tipoDe=d=>d.tipoReal||(GENERICOS.has(String(d.tipo||'').trim())?'':d.tipo);
const srvDe=d=>d.srvOrden||d.nroSrv||'';

/* Código de verificación del remito: mismo cálculo que la versión anterior
   (sigma.js), así los PDF ya entregados siguen verificando. No cambiar. */
async function hashRemito(d){
  try{
    const payload=[d.nro,d.patente,d.createdAt||'',d.firmadoAt||'',d.km||'',String(d.peaje||0),String(d.excedente||0),String(d.otros||0)].join('|');
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16).toUpperCase();
  }catch(_){return''}
}
function qrDataURL(text){try{if(typeof qrcode!=='function')return'';const qr=qrcode(0,'M');qr.addData(text);qr.make();return qr.createDataURL(4,2)}catch(_){return''}}

function ctor(){const C=window.jspdf?.jsPDF||window.jsPDF;if(!C)throw new Error('No se cargó la librería de PDF. Recargá la página e intentá de nuevo.');return C}

/* Carga una imagen (URL o data URL) y la devuelve como JPEG/PNG apto para jsPDF,
   con sus proporciones. Si falla (CORS, 404) devuelve null y el PDF sigue. */
function imagen(src,{png=false,max=900}={}){
  return new Promise(res=>{
    if(!src)return res(null);
    const img=new Image();img.crossOrigin='anonymous';
    const t=setTimeout(()=>res(null),8000);
    img.onload=()=>{clearTimeout(t);try{const k=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*k));c.height=Math.max(1,Math.round(img.naturalHeight*k));const x=c.getContext('2d');if(!png){x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height)}x.drawImage(img,0,0,c.width,c.height);res({data:c.toDataURL(png?'image/png':'image/jpeg',.88),w:c.width,h:c.height,fmt:png?'PNG':'JPEG'})}catch(_){res(null)}};
    img.onerror=()=>{clearTimeout(t);res(null)};
    img.src=src;
  });
}
const urlDe=u=>{if(!u)return'';try{if(typeof ENV!=='undefined'&&ENV.API_BASE_URL&&!/^(https?:|data:)/.test(u))return ENV.API_BASE_URL+u}catch(_){}return u};
function encajar(im,w,h){const r=Math.min(w/im.w,h/im.h);return{w:im.w*r,h:im.h*r}}

async function build(d){
  if(!d)throw new Error('No hay datos para el PDF');
  const J=ctor(),doc=new J({unit:'mm',format:'a4',orientation:'portrait',compress:true});
  let empresa={};try{empresa=await window.CompanyDocuments?.load?.()||{}}catch(_){}
  const hash=await hashRemito(d);
  const codigo=hash?`${hash.slice(0,4)}-${hash.slice(4,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}`:'';
  const qrSrc=hash?qrDataURL(`SIGMA-REMITO|${d.nro}|${d.patente}|${d.firmadoAt||''}|${hash}`):'';
  const fotosSrc=(d.foto_urls||d.fotos||[]).slice(0,4).map(urlDe);
  const [qr,firma,...fotos]=await Promise.all([imagen(qrSrc,{png:true,max:400}),imagen(urlDe(d.firma_imagen_url||d.firmaUrl),{png:true}),...fotosSrc.map(u=>imagen(u,{max:520}))]);

  const {w:W,m:M}=PAGE,CW=W-M*2;
  let y=M;
  const color=(c)=>doc.setTextColor(...c);
  const font=(size,style='normal',c=INK)=>{doc.setFont('helvetica',style);doc.setFontSize(size);color(c)};
  const lineas=(txt,w)=>doc.splitTextToSize(clean(txt)||'—',w);
  const nuevaPagina=(alto)=>{if(y+alto<=PAGE.h-M-8)return;pie();doc.addPage();y=M};
  const rotulo=(txt,x,yy)=>{font(7,'bold',MUTED);doc.text(clean(txt).toUpperCase(),x,yy,{charSpace:.35})};
  const separador=()=>{doc.setDrawColor(...LINE);doc.setLineWidth(.25);doc.line(M,y,W-M,y)};

  /* Encabezado */
  const nombre=clean(empresa.legal_name)||'Empresa sin configurar';
  const datosEmpresa=[empresa.tax_id&&`CUIT ${empresa.tax_id}`,empresa.address,empresa.contact].filter(Boolean).map(clean).join(' · ');
  font(15,'bold');doc.text(nombre,M,y+5);
  if(datosEmpresa){font(8,'normal',MUTED);doc.text(lineas(datosEmpresa,CW*.58),M,y+10)}
  const srv=srvDe(d);
  font(7.5,'bold',MUTED);doc.text(srv?'N° DE SERVICIO':'REMITO',W-M,y+1.5,{align:'right'});
  font(17,'bold');doc.text(clean(srv||d.nro||'—'),W-M,y+8,{align:'right'});
  font(8,'normal',MUTED);doc.text(clean([srv&&`Remito ${d.nro}`,d.fecha].filter(Boolean).join(' · ')),W-M,y+13,{align:'right'});
  y+=18;doc.setDrawColor(...BRAND);doc.setLineWidth(.8);doc.line(M,y,W-M,y);y+=7;

  if(d.estado==='anulado'){
    doc.setDrawColor(...RED);doc.setLineWidth(.6);doc.roundedRect(M,y,CW,10,1.5,1.5);
    font(12,'bold',RED);doc.text('REMITO ANULADO',W/2,y+6.6,{align:'center',charSpace:1.5});y+=15;
  }

  /* Cliente · Vehículo · Servicio (3 columnas) */
  const col=CW/3,cols=[
    ['Cliente',[['Razón social',d.cliente],['CUIT / DNI',d.cuit],['Teléfono',d.telefono]]],
    ['Vehículo',[['Patente',d.patente],['Marca / modelo',d.marca]]],
    ['Servicio',[['Tipo',tipoDe(d)||'Sin clasificar'],['Chofer',d.chofer],['Km',d.km&&d.km!=='—'?`${d.km} km`:'']]],
  ];
  let alto=0;
  cols.forEach(([titulo,filas],i)=>{
    const x=M+i*col;let yy=y;rotulo(titulo,x,yy);yy+=5;
    filas.forEach(([k,v])=>{font(7.5,'normal',MUTED);doc.text(k,x,yy);yy+=3.6;font(9.5,'bold');const t=lineas(v,col-6);doc.text(t,x,yy);yy+=t.length*4.1+1.4});
    alto=Math.max(alto,yy-y);
  });
  y+=alto;separador();y+=5;

  /* Recorrido */
  rotulo('Recorrido',M,y);y+=5;
  const unaDireccion=d.origen&&d.destino&&clean(d.origen)===clean(d.destino);
  const tramo=(k,v)=>{font(7.5,'normal',MUTED);doc.text(k,M,y);font(9.5,'normal');const t=lineas(v,CW-22);doc.text(t,M+22,y);y+=t.length*4.2+1.6};
  tramo(unaDireccion?'Dirección':'Origen',d.origen);if(!unaDireccion)tramo('Destino',d.destino);
  font(7.5,'normal',MUTED);doc.text(clean(`Inicio ${fechaHora(d.createdAt)}   ·   Firma ${fechaHora(d.firmadoAt)}`),M,y+1);y+=5;separador();y+=5;

  /* Cargos */
  const peaje=Number(d.peaje)||0,exc=Number(d.excedente)||0,otros=Number(d.otros)||0,total=peaje+exc+otros;
  const cargos=[['Peajes y gastos de ruta',peaje],['Excedente (km, carritos u horas fuera de plan)',exc],['Otros cargos',otros]].filter(([,v])=>v>0);
  rotulo('Cargos cobrados en el lugar',M,y);y+=5;
  if(!cargos.length){font(9.5,'normal',MUTED);doc.text('Sin cargos adicionales.',M,y);y+=6}
  else{
    cargos.forEach(([k,v])=>{font(9.5,'normal');doc.text(k,M,y);doc.text(money(v),W-M,y,{align:'right'});y+=5.2});
    doc.setDrawColor(...LINE);doc.line(M,y-2.6,W-M,y-2.6);
    font(10.5,'bold');doc.text('Total',M,y+1.4);doc.text(money(total),W-M,y+1.4,{align:'right'});y+=7;
    const aprobado=d.acceptedTotal!=null&&Number(d.acceptedTotal)!==total;
    if(aprobado){font(8.5,'normal',MUTED);doc.text('Aprobado por Administración',M,y);font(9.5,'bold');doc.text(money(d.acceptedTotal),W-M,y,{align:'right'});y+=5.5}
  }
  font(8.5,'normal',MUTED);doc.text('Medio de pago',M,y);font(9.5,'bold');doc.text(clean(d.pago&&d.pago!=='—'?d.pago:'No informado'),W-M,y,{align:'right'});y+=5;
  separador();y+=5;

  /* Conformidades */
  const c=d.conformidades||{};
  const confs=[['Servicio conforme',c.servicio],['Cargos conformes',c.cargos],['Sin daños',c.danos]];
  const hayConf=confs.some(([,v])=>v!=null);
  if(hayConf||(Array.isArray(d.confirmaciones)&&d.confirmaciones.length)){
    rotulo('Conformidades del cliente',M,y);y+=5;
    if(hayConf){const w=CW/3;confs.forEach(([k,v],i)=>{font(9,'normal');doc.text(k,M+i*w,y);font(9,'bold',v===false?RED:INK);doc.text(v===true?'Sí':v===false?'No':'—',M+i*w+doc.getTextWidth(k)+2.5,y)});y+=6}
    else{font(9,'normal');doc.text(lineas(d.confirmaciones.join(' · '),CW),M,y);y+=6}
    const arrastre=c.arrastre===true||(Array.isArray(d.confirmaciones)&&d.confirmaciones.includes('Conformidad de Arrastre'));
    if(arrastre){
      const legal='El cliente autoriza a realizar maniobras de arrastre sobre el vehículo y asume la responsabilidad por posibles daños mecánicos o estéticos derivados de esa maniobra.';
      const t=lineas(legal,CW-8);nuevaPagina(t.length*3.6+10);
      doc.setFillColor(...SOFT);doc.roundedRect(M,y-1,CW,t.length*3.6+8,1.5,1.5,'F');
      font(8,'bold');doc.text('Conformidad de arrastre',M+4,y+3.4);font(7.8,'normal',MUTED);doc.text(t,M+4,y+7.4);y+=t.length*3.6+11;
    }
    separador();y+=5;
  }

  /* Fotos */
  const fotosOk=fotos.filter(Boolean);
  if(fotosOk.length){
    nuevaPagina(30);rotulo(`Fotos (${fotosOk.length})`,M,y);y+=3;
    const gap=4,fw=(CW-gap*3)/4,fh=22;
    fotosOk.forEach((f,i)=>{const x=M+i*(fw+gap);doc.setFillColor(...SOFT);doc.rect(x,y,fw,fh,'F');const s=encajar(f,fw,fh);doc.addImage(f.data,f.fmt,x+(fw-s.w)/2,y+(fh-s.h)/2,s.w,s.h)});
    y+=fh+6;
  }

  /* Firma + verificación */
  nuevaPagina(44);
  const fw=CW*.6,fh=27;
  rotulo('Firma del cliente',M,y);rotulo('Verificación',M+fw+10,y);y+=3;
  doc.setDrawColor(...LINE);doc.setLineWidth(.3);doc.roundedRect(M,y,fw,fh,1.5,1.5);
  if(firma){const s=encajar(firma,fw-8,fh-6);doc.addImage(firma.data,firma.fmt,M+(fw-s.w)/2,y+(fh-s.h)/2,s.w,s.h)}
  else{font(9,'normal',MUTED);doc.text(d.estado==='pendiente'?'Pendiente de firma':'Sin firma',M+fw/2,y+fh/2+1,{align:'center'})}
  const vx=M+fw+10;
  const tx=vx+(qr?25:0);
  if(qr)doc.addImage(qr.data,'PNG',vx,y,22,22);
  font(7.5,'normal',MUTED);doc.text('Código',tx,y+4);
  doc.setFont('courier','bold');doc.setFontSize(8);color(INK);doc.text(codigo||'N/D',tx,y+8.5);
  font(7,'normal',MUTED);doc.text(doc.splitTextToSize('Identifica este remito y sus datos firmados.',W-M-tx),tx,y+13);
  y+=fh+5;
  font(8,'normal',MUTED);
  doc.text(clean(`Aclaración: ${d.cliente||'—'}`),M,y);doc.text(clean(`DNI / CUIT: ${d.cuit||'—'}`),M+fw*.55,y);y+=4.2;
  doc.text(clean(`Firmado el ${fechaHora(d.firmadoAt)}`),M,y);

  pie();
  return doc;

  function pie(){
    const py=PAGE.h-M+2;doc.setDrawColor(...LINE);doc.setLineWidth(.25);doc.line(M,py-5,W-M,py-5);
    font(7,'normal',MUTED);doc.text(clean([nombre,empresa.address,empresa.contact].filter(Boolean).join(' · ')),M,py);
    doc.text(`Página ${doc.getNumberOfPages()}`,W-M,py,{align:'right'});
  }
}

function fileName(d){const base=clean(srvDe(d)||d.nro||'remito').replace(/[^\w.-]+/g,'_');return`Remito_${base}${d.patente?'_'+clean(d.patente).replace(/\W+/g,''):''}.pdf`}
async function blob(d){return(await build(d)).output('blob')}
async function download(d){const doc=await build(d);doc.save(fileName(d));return true}

window.RemitoPdf={build,blob,download,fileName,hash:hashRemito,_clean:clean};
})();
