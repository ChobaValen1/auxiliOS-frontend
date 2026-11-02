const ExcelJS=require('exceljs');const {E,rows}=require('./datos');
const AMBER='FFF5A623',DARK='FF14171D',GRAY='FF8A90A0',LIGHT='FFF4F5F7',RED='FFC0392B',MONEY='"$" #,##0;[Red]-"$" #,##0';
(async()=>{const wb=new ExcelJS.Workbook();wb.creator='AuxiliOS';wb.created=new Date();
 const head=(ws,title,cols)=>{ws.mergeCells(1,1,1,cols);const t=ws.getCell(1,1);t.value=title;t.font={bold:true,size:16,color:{argb:DARK}};
  ws.mergeCells(2,1,2,cols);const s=ws.getCell(2,1);s.value=`${E.empresa} · CUIT ${E.cuit} · Período ${E.periodo} · Estado: ${E.estado} (aprobó ${E.aprobo}, ${E.aprobado})`;s.font={size:10,color:{argb:GRAY}};ws.getRow(1).height=24;};
 const th=(row)=>{row.eachCell(c=>{c.font={bold:true,color:{argb:'FF111111'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:AMBER}};c.alignment={vertical:'middle',wrapText:true};c.border={bottom:{style:'thin'}};});row.height=30;};
 const zebra=(ws,from,to,cols)=>{for(let r=from;r<=to;r++)if((r-from)%2)for(let c=1;c<=cols;c++)ws.getCell(r,c).fill={type:'pattern',pattern:'solid',fgColor:{argb:LIGHT}};};
 // 1 · Resumen
 const R=wb.addWorksheet('Resumen',{views:[{state:'frozen',ySplit:4}],properties:{tabColor:{argb:AMBER}},pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
 const rc=[['Chofer',22],['Legajo',8],['Móvil',11],['Días',7],['Km',9],['Servicios',10],['Haberes',15],['Descuentos',14],['Neto a pagar',16],['Firma',18]];
 head(R,'Planilla de sueldos · '+E.periodo,rc.length);R.columns=rc.map(([h,w])=>({width:w}));const hr=R.getRow(4);hr.values=rc.map(c=>c[0]);th(hr);
 rows.forEach((x,i)=>{const r=5+i;R.getRow(r).values=[x.n,x.leg,x.movil,x.dias,x.km,x.serv,{formula:`SUMIFS(Líneas!$G:$G,Líneas!$A:$A,A${r},Líneas!$C:$C,"Haber")`,result:x.hab},{formula:`SUMIFS(Líneas!$G:$G,Líneas!$A:$A,A${r},Líneas!$C:$C,"Descuento")`,result:x.des},{formula:`G${r}-H${r}`,result:x.neto},''];});
 const last=4+rows.length,tr=last+1;zebra(R,5,last,rc.length);
 R.getRow(tr).values=['TOTAL','','',{formula:`SUM(D5:D${last})`},{formula:`SUM(E5:E${last})`},{formula:`SUM(F5:F${last})`},{formula:`SUM(G5:G${last})`},{formula:`SUM(H5:H${last})`},{formula:`SUM(I5:I${last})`}];
 R.getRow(tr).eachCell(c=>{c.font={bold:true};c.border={top:{style:'medium'}};});
 for(let r=5;r<=tr;r++){['E'].forEach(k=>R.getCell(k+r).numFmt='#,##0');['G','H','I'].forEach(k=>R.getCell(k+r).numFmt=MONEY);R.getCell('I'+r).font={bold:true};}
 R.autoFilter={from:'A4',to:'I'+last};R.getCell('A'+(tr+2)).value='Importes calculados por AuxiliOS a partir de jornadas, servicios, rendiciones y novedades. Detalle por concepto en la hoja «Líneas».';R.getCell('A'+(tr+2)).font={italic:true,size:9,color:{argb:GRAY}};
 // 2 · Líneas (formato largo, sirve para tablas dinámicas)
 const L=wb.addWorksheet('Líneas',{views:[{state:'frozen',ySplit:1}]});L.columns=[{header:'Chofer',width:22},{header:'Legajo',width:8},{header:'Tipo',width:11},{header:'Concepto',width:38},{header:'Cantidad',width:10},{header:'Valor unitario',width:14},{header:'Importe',width:15},{header:'Origen',width:12}];th(L.getRow(1));
 rows.forEach(x=>x.lines.forEach(l=>{const r=L.addRow([x.n,x.leg,l[0]==='haber'?'Haber':'Descuento',l[1],l[2],l[3],l[4],l[5]]);r.getCell(6).numFmt=MONEY;r.getCell(7).numFmt=MONEY;r.getCell(5).numFmt='#,##0';if(l[0]==='descuento')r.getCell(7).font={color:{argb:RED}};}));
 L.autoFilter={from:'A1',to:'H'+L.rowCount};
 // 3 · Transferencias
 const T=wb.addWorksheet('Transferencias',{views:[{state:'frozen',ySplit:1}]});T.columns=[{header:'Chofer',width:22},{header:'CUIL',width:16},{header:'CBU / CVU',width:26},{header:'Alias',width:16},{header:'Neto a transferir',width:18},{header:'Referencia',width:22}];th(T.getRow(1));
 rows.forEach(x=>{const r=T.addRow([x.n,x.cuil,x.cbu||'— falta cargar —',x.alias||'',x.neto,'Sueldo '+E.periodo]);r.getCell(5).numFmt=MONEY;if(!x.cbu)r.getCell(3).font={italic:true,color:{argb:RED}};});
 const tt=T.addRow(['TOTAL','','','',{formula:`SUM(E2:E${T.rowCount})`}]);tt.font={bold:true};tt.getCell(5).numFmt=MONEY;
 // 4 · Jornadas y 5 · Servicios (muestra)
 const J=wb.addWorksheet('Jornadas',{views:[{state:'frozen',ySplit:1}]});J.columns=[{header:'Chofer',width:22},{header:'Fecha',width:12},{header:'Móvil',width:11},{header:'Km inicio',width:11},{header:'Km fin',width:11},{header:'Km',width:9},{header:'Servicios',width:10}];th(J.getRow(1));
 let odo=150000;rows.slice(0,2).forEach(x=>{for(let d=3;d<=12;d++){const km=Math.round(x.km/x.dias),r=J.addRow([x.n,new Date(2026,10,d),x.movil,odo,odo+km,{formula:`E${J.rowCount+1}-D${J.rowCount+1}`,result:km},Math.round(x.serv/x.dias)]);r.getCell(2).numFmt='dd/mm/yyyy';[4,5,6].forEach(c=>r.getCell(c).numFmt='#,##0');odo+=km+40;}});
 J.addRow([]);J.addRow(['(muestra: en la exportación real van todas las jornadas del mes)']).font={italic:true,color:{argb:GRAY}};
 const S=wb.addWorksheet('Servicios',{views:[{state:'frozen',ySplit:1}]});S.columns=[{header:'Chofer',width:22},{header:'Fecha',width:12},{header:'N.º servicio',width:13},{header:'Cliente',width:18},{header:'Patente',width:11},{header:'Desde',width:20},{header:'Hasta',width:20},{header:'Km',width:8}];th(S.getRow(1));
 const cl=['Asistencia Ruta','Auxilio Sur','Particular'],pl=['AB 123 CD','AC 456 EF','AD 789 GH','AE 012 IJ'];for(let i=0;i<14;i++){const r=S.addRow([rows[i%2].n,new Date(2026,10,3+i),'AR-55'+(8812+i),cl[i%3],pl[i%4],'Ezeiza','Lanús',18+i*3]);r.getCell(2).numFmt='dd/mm/yyyy';}
 S.addRow([]);S.addRow(['(muestra)']).font={italic:true,color:{argb:GRAY}};
 await wb.xlsx.writeFile(__dirname+'/Sueldos_Noviembre_2026_EJEMPLO.xlsx');console.log('xlsx ok');})();
