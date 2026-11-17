/* AuxiliOS · Exportación Excel · utilidad reutilizable sobre SheetJS */
(()=>{'use strict';
const A=window.AuxiliosExcelExport=window.AuxiliosExcelExport||{};
const xlsx=()=>window.XLSX||null;
const text=v=>v==null?'':String(v);
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const cleanSheetName=v=>text(v||'Datos').replace(/[\\/?*\[\]:]/g,' ').trim().slice(0,31)||'Datos';
const cleanFilePart=v=>text(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^_+|_+$/g,'');
function ensureReady(){if(!xlsx())throw new Error('El exportador Excel todavía no está disponible. Recargá AuxiliOS e intentá nuevamente.');}
/* Columnas con formula(row,ref): ref(id) es la celda de la columna «id» en la misma fila, o null si no se exporta.
   Se guarda la fórmula junto al valor ya calculado, así la celda se ve bien aunque el programa no recalcule. */
function applyFormulas(ws,cols,data){const at=new Map(cols.map((c,i)=>[c.id,i]));if(!cols.some(c=>typeof c.formula==='function'))return;data.forEach((row,rowIndex)=>{const ref=id=>at.has(id)&&id!=null?xlsx().utils.encode_cell({r:rowIndex+1,c:at.get(id)}):null;cols.forEach((column,columnIndex)=>{if(typeof column.formula!=='function')return;const cell=ws[xlsx().utils.encode_cell({r:rowIndex+1,c:columnIndex})];if(!cell||cell.t!=='n')return;const f=column.formula.call(column,row,ref);if(f)cell.f=f;});});}
function worksheet(columns,rows){ensureReady();const cols=Array.isArray(columns)?columns:[],data=Array.isArray(rows)?rows:[];const aoa=[cols.map(c=>c.header),...data.map(row=>cols.map(c=>{const value=typeof c.value==='function'?c.value(row):row?.[c.key];if(c.type==='number'){if(value==null||value==='')return null;/* Un texto (p. ej. «No corresponde: …») se deja como texto, no como 0. */if(typeof value==='string'&&value.trim()&&!Number.isFinite(Number(value)))return value;return num(value);}return value==null?'':text(value);}))];const ws=xlsx().utils.aoa_to_sheet(aoa,{cellDates:false});applyFormulas(ws,cols,data);cols.forEach((column,columnIndex)=>{if(column.type!=='url')return;data.forEach((row,rowIndex)=>{const address=xlsx().utils.encode_cell({r:rowIndex+1,c:columnIndex}),cell=ws[address];if(cell?.v)cell.l={Target:String(cell.v),Tooltip:column.tooltip||'Abrir enlace'};});});ws['!cols']=cols.map(c=>({wch:Math.max(8,Math.min(60,Number(c.width)||16))}));if(cols.length&&data.length)ws['!autofilter']={ref:xlsx().utils.encode_range({s:{r:0,c:0},e:{r:data.length,c:cols.length-1}})};return ws;}
function summary(rows){ensureReady();const aoa=(Array.isArray(rows)?rows:[]).map(item=>[text(item?.label),item?.value==null?'':item.value]);const ws=xlsx().utils.aoa_to_sheet(aoa);ws['!cols']=[{wch:24},{wch:48}];return ws;}
function workbook({summaryRows=[],sheets=[]}={}){ensureReady();const wb=xlsx().utils.book_new();if(summaryRows.length)xlsx().utils.book_append_sheet(wb,summary(summaryRows),'Resumen');for(const sheet of sheets){if(!sheet||!Array.isArray(sheet.columns)||!Array.isArray(sheet.rows))continue;xlsx().utils.book_append_sheet(wb,worksheet(sheet.columns,sheet.rows),cleanSheetName(sheet.name));}if(!wb.SheetNames.length)throw new Error('No hay datos para exportar.');return wb;}
// El navegador no avisa cuando baja un archivo: confirmamos con la misma tilde
// que el resto de AuxiliOS. Centralizado acá para que valga en toda sección.
function confirmDownload(name,detalle){if(typeof window.confirmarDescarga==='function')return window.confirmarDescarga(name,detalle);if(typeof window.operationFeedback==='function')window.operationFeedback('Descarga lista',detalle?`${name} · ${detalle}`:name,'success',2400);}
function download({filename='AuxiliOS.xlsx',summaryRows=[],sheets=[],detalle=''}={}){const wb=workbook({summaryRows,sheets}),safe=cleanFilePart(filename.replace(/\.xlsx$/i,''))||'AuxiliOS';xlsx().writeFile(wb,`${safe}.xlsx`,{bookType:'xlsx',compression:true});confirmDownload(`${safe}.xlsx`,detalle);return{filename:`${safe}.xlsx`,sheetNames:[...wb.SheetNames]};}
// CSV real: UTF-8 con BOM, separador local ';' y protección ante fórmulas
// provenientes de nombres, notas u otros textos ingresados por usuarios.
function csv(columns,rows){
  const quoteCell=value=>'"'+text(value).replace(/"/g,'""')+'"';
  const safeText=value=>/^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(text(value))?"'"+text(value):text(value);
  const cols=Array.isArray(columns)?columns:[];
  const lines=[cols.map(c=>quoteCell(safeText(c.header))).join(';')];
  for(const row of Array.isArray(rows)?rows:[])lines.push(cols.map(c=>{
    const value=typeof c.value==='function'?c.value(row):row?.[c.key];
    if(c.type==='number')return value==null||value===''||!Number.isFinite(Number(value))?'':String(Number(value)).replace('.',',');
    return quoteCell(safeText(value));
  }).join(';'));
  return '\ufeff'+lines.join('\r\n')+'\r\n';
}
function downloadCsv({filename='AuxiliOS',columns=[],rows=[],detalle=''}={}){
  if(!columns.length)throw new Error('Seleccioná al menos una columna para exportar.');
  const name=(cleanFilePart(filename.replace(/\.(csv|xlsx)$/i,''))||'AuxiliOS')+'.csv';
  const url=URL.createObjectURL(new Blob([csv(columns,rows)],{type:'text/csv;charset=utf-8;'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.hidden=true;
  try{document.body.appendChild(link);link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  confirmDownload(name,detalle);return{filename:name};
}
/* ── Excel con formato (ExcelJS, se carga recién al exportar; mismo estilo que el Excel de Sueldos) ──
   Cada hoja: título, subtítulo, franja de grupos (opcional), encabezado ámbar fijo, filas cebra,
   formatos de número por columna (format: money | km | count | int | percent), fila TOTAL con
   SUBTOTAL(109,…) para las columnas con total:true (suma sólo lo filtrado) y las fórmulas de cada columna. */
let excelJsLoading=null;
function loadExcelJs(){if(window.ExcelJS)return Promise.resolve(window.ExcelJS);excelJsLoading=excelJsLoading||new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/vendor/exceljs-4.4.0.min.js';s.onload=()=>window.ExcelJS?resolve(window.ExcelJS):reject(new Error('No se pudo cargar el exportador de Excel. Recargá AuxiliOS e intentá nuevamente.'));s.onerror=()=>{excelJsLoading=null;reject(new Error('No se pudo cargar el exportador de Excel. Revisá la conexión e intentá nuevamente.'))};document.head.appendChild(s)});return excelJsLoading}
const STYLE={amber:'FFF5A623',ink:'FF1A1203',dark:'FF14171D',gray:'FF6B7180',zebra:'FFF7F8FA',line:'FFE3E5EA',band:'FFFFF4E0',total:'FFFDEBC8',dupe:'FFFBE0DE',dupeInk:'FF9B1C1C'};
const NUMFMT={money:'"$" #,##0.00;[Red]-"$" #,##0.00',km:'#,##0.0',count:'#,##0',int:'0',percent:'0.##" %"'};
const fill=argb=>({type:'pattern',pattern:'solid',fgColor:{argb}});
function colLetter(n){let s='';while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s}
/* Mismo criterio que worksheet(): números como número, vacío como vacío, texto como texto. */
function cellValue(c,row){const value=typeof c.value==='function'?c.value(row):row?.[c.key];if(c.type==='number'){if(value==null||value==='')return null;if(typeof value==='string'&&value.trim()&&!Number.isFinite(Number(value)))return value;return num(value);}return value==null?'':text(value);}
function styledSheet(wb,{name,columns,rows,title='',subtitle='',group=null,totalsLabel='registros',freezeFirstColumn=true,totals=true}){
  const cols=Array.isArray(columns)?columns:[],data=Array.isArray(rows)?rows:[],n=cols.length;if(!n)return null;
  const ws=wb.addWorksheet(cleanSheetName(name),{properties:{tabColor:{argb:STYLE.amber}},pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9}});
  ws.columns=cols.map(c=>({width:Math.max(8,Math.min(60,Number(c.width)||16))}));
  ws.mergeCells(1,1,1,n);const t=ws.getCell(1,1);t.value=title||cleanSheetName(name);t.font={bold:true,size:16,color:{argb:STYLE.dark}};ws.getRow(1).height=24;
  ws.mergeCells(2,1,2,n);const sub=ws.getCell(2,1);sub.value=subtitle;sub.font={size:10,color:{argb:STYLE.gray}};sub.alignment={wrapText:true,vertical:'top'};if(String(subtitle).includes('\n'))ws.getRow(2).height=28;
  let headerRow=3;
  if(typeof group==='function'){headerRow=4;let start=0;for(let i=1;i<=n;i++){if(i<n&&group(cols[i])===group(cols[start]))continue;if(i-1>start)ws.mergeCells(3,start+1,3,i);const g=ws.getCell(3,start+1);g.value=group(cols[start])||'';g.font={bold:true,size:10,color:{argb:STYLE.ink}};g.fill=fill(STYLE.band);g.alignment={horizontal:'center',vertical:'middle'};g.border={left:{style:'thin',color:{argb:STYLE.amber}},right:{style:'thin',color:{argb:STYLE.amber}}};start=i}}
  const hr=ws.getRow(headerRow);cols.forEach((c,i)=>{hr.getCell(i+1).value=text(c.header)});hr.height=30;hr.eachCell((c,ci)=>{c.font={bold:true,color:{argb:STYLE.ink}};c.fill=fill(STYLE.amber);c.alignment={vertical:'middle',wrapText:true,horizontal:cols[ci-1]?.format?'right':'left'};c.border={bottom:{style:'thin',color:{argb:STYLE.ink}}}});
  const first=headerRow+1,last=headerRow+data.length,at=new Map(cols.map((c,i)=>[c.id,i]));
  data.forEach((row,i)=>{const rn=first+i,ref=id=>id!=null&&at.has(id)?colLetter(at.get(id)+1)+rn:null,r=ws.getRow(rn);
    cols.forEach((c,ci)=>{const cell=r.getCell(ci+1),v=cellValue(c,row);let value=v;
      if(typeof c.formula==='function'&&typeof v==='number'){const f=c.formula.call(c,row,ref);if(f)value={formula:f,result:v}}
      if(c.type==='url'&&v)value={text:'Abrir',hyperlink:String(v),tooltip:c.tooltip||'Abrir enlace'};
      cell.value=value===''?null:value;
      if(c.format&&NUMFMT[c.format])cell.numFmt=NUMFMT[c.format];
      const font={};if(c.emphasis)font.bold=true;if(c.muted){font.italic=true;font.color={argb:STYLE.gray}}if(c.type==='url'&&v){font.color={argb:'FF1F5FBF'};font.underline=true}if(Object.keys(font).length)cell.font=font;
      if(i%2)cell.fill=fill(STYLE.zebra);cell.border={bottom:{style:'hair',color:{argb:STYLE.line}}};cell.alignment={vertical:'top',wrapText:!!c.wrap}});});
  if(totals&&data.length&&cols.some(c=>c.total)){const tr=ws.getRow(last+1);let labeled=false;
    cols.forEach((c,ci)=>{const cell=tr.getCell(ci+1);if(c.total){const L=colLetter(ci+1),sum=data.reduce((a,row)=>{const v=cellValue(c,row);return a+(typeof v==='number'?v:0)},0);cell.value={formula:`SUBTOTAL(109,${L}${first}:${L}${last})`,result:Math.round(sum*100)/100};if(c.format&&NUMFMT[c.format])cell.numFmt=NUMFMT[c.format]}else if(!labeled){cell.value=`TOTAL · ${data.length} ${totalsLabel}`;labeled=true}
      cell.font={bold:true,color:{argb:STYLE.ink}};cell.fill=fill(STYLE.total);cell.border={top:{style:'medium',color:{argb:STYLE.ink}}}});tr.height=20}
  /* Valores repetidos (dupes:true): fondo rojo claro, como «Resaltar duplicados» de Excel. Con COUNTIF funciona igual en Excel, Google Sheets y LibreOffice. */
  if(data.length)cols.forEach((c,ci)=>{if(!c.dupes)return;const L=colLetter(ci+1);ws.addConditionalFormatting({ref:`${L}${first}:${L}${last}`,rules:[{type:'expression',priority:1,formulae:[`AND(${L}${first}<>"",COUNTIF($${L}$${first}:$${L}$${last},${L}${first})>1)`],style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:STYLE.dupe}},font:{color:{argb:STYLE.dupeInk}}}}]})});
  ws.autoFilter={from:{row:headerRow,column:1},to:{row:Math.max(headerRow,last),column:n}};
  ws.views=[{state:'frozen',ySplit:headerRow,xSplit:freezeFirstColumn?1:0}];
  ws.pageSetup.printTitlesRow=`${headerRow}:${headerRow}`;
  return ws;
}
function styledWorkbook(ExcelJS,{title='',subtitle='',sheets=[]}={}){const wb=new ExcelJS.Workbook();wb.creator='AuxiliOS';wb.created=new Date();wb.calcProperties.fullCalcOnLoad=true;for(const sheet of sheets){if(!sheet||!Array.isArray(sheet.columns)||!Array.isArray(sheet.rows)||!sheet.columns.length)continue;styledSheet(wb,{title,...sheet,subtitle:sheet.subtitle??subtitle})}if(!wb.worksheets.length)throw new Error('No hay datos para exportar.');return wb}
async function downloadStyled({filename='AuxiliOS.xlsx',title='',subtitle='',sheets=[],detalle=''}={}){const ExcelJS=await loadExcelJs(),wb=styledWorkbook(ExcelJS,{title,subtitle,sheets}),buf=await wb.xlsx.writeBuffer(),safe=(cleanFilePart(filename.replace(/\.xlsx$/i,''))||'AuxiliOS')+'.xlsx';const url=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=document.createElement('a');link.href=url;link.download=safe;link.hidden=true;try{document.body.appendChild(link);link.click()}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}confirmDownload(safe,detalle);return{filename:safe,sheetNames:wb.worksheets.map(w=>w.name)}}
Object.assign(A,{ensureReady,loadExcelJs,styledWorkbook,downloadStyled,worksheet,summary,workbook,download,csv,downloadCsv,cleanFilePart,confirmDownload});
})();
