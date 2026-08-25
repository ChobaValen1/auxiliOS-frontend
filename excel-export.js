/* AuxiliOS · Exportación Excel · utilidad reutilizable sobre SheetJS */
(()=>{'use strict';
const A=window.AuxiliosExcelExport=window.AuxiliosExcelExport||{};
const xlsx=()=>window.XLSX||null;
const text=v=>v==null?'':String(v);
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const cleanSheetName=v=>text(v||'Datos').replace(/[\\/?*\[\]:]/g,' ').trim().slice(0,31)||'Datos';
const cleanFilePart=v=>text(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^_+|_+$/g,'');
function ensureReady(){if(!xlsx())throw new Error('El exportador Excel todavía no está disponible. Recargá AuxiliOS e intentá nuevamente.');}
function worksheet(columns,rows){ensureReady();const cols=Array.isArray(columns)?columns:[],data=Array.isArray(rows)?rows:[];const aoa=[cols.map(c=>c.header),...data.map(row=>cols.map(c=>{const value=typeof c.value==='function'?c.value(row):row?.[c.key];if(c.type==='number')return value==null||value===''?null:num(value);return value==null?'':text(value);}))];const ws=xlsx().utils.aoa_to_sheet(aoa,{cellDates:false});ws['!cols']=cols.map(c=>({wch:Math.max(8,Math.min(60,Number(c.width)||16))}));if(cols.length&&data.length)ws['!autofilter']={ref:xlsx().utils.encode_range({s:{r:0,c:0},e:{r:data.length,c:cols.length-1}})};return ws;}
function summary(rows){ensureReady();const aoa=(Array.isArray(rows)?rows:[]).map(item=>[text(item?.label),item?.value==null?'':item.value]);const ws=xlsx().utils.aoa_to_sheet(aoa);ws['!cols']=[{wch:24},{wch:48}];return ws;}
function workbook({summaryRows=[],sheets=[]}={}){ensureReady();const wb=xlsx().utils.book_new();if(summaryRows.length)xlsx().utils.book_append_sheet(wb,summary(summaryRows),'Resumen');for(const sheet of sheets){if(!sheet||!Array.isArray(sheet.columns)||!Array.isArray(sheet.rows))continue;xlsx().utils.book_append_sheet(wb,worksheet(sheet.columns,sheet.rows),cleanSheetName(sheet.name));}if(!wb.SheetNames.length)throw new Error('No hay datos para exportar.');return wb;}
function download({filename='AuxiliOS.xlsx',summaryRows=[],sheets=[]}={}){const wb=workbook({summaryRows,sheets}),safe=cleanFilePart(filename.replace(/\.xlsx$/i,''))||'AuxiliOS';xlsx().writeFile(wb,`${safe}.xlsx`,{bookType:'xlsx',compression:true});return{filename:`${safe}.xlsx`,sheetNames:[...wb.SheetNames]};}
Object.assign(A,{ensureReady,worksheet,summary,workbook,download,cleanFilePart});
})();