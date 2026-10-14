/* Company identity for newly generated PDFs. Institutional signature is distinct from customer consent.
   Modal «Empresa y documentos»: datos fiscales, representante autorizado y su firma institucional,
   que se puede dibujar en pantalla o subir como imagen. Muestra cómo se ve en los documentos. */
(()=>{'use strict';
const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const FIELDS=['legal_name','tax_id','address','contact','representative'];
const MAX_CHARS=380000;
const S={data:{},signature:'',origin:'saved',mode:'draw',pad:null,dirty:false,busy:false};
const icon=name=>`<svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#${name}"/></svg>`;
const notify=(message,type='info')=>typeof toast==='function'?toast(message,type):console.log(message);

async function load(){const {data,error}=await _db.from('company_document_settings').select('*').eq('id',true).maybeSingle();if(error)throw error;return data||{};}

async function ask({title,html,confirmLabel='Confirmar',danger=false,fallback=''}){
  const dialog=window.AuxiliosBillingParametersV4?.confirm;
  if(typeof dialog==='function')return dialog({title,html,confirmLabel,danger});
  return window.confirm(fallback||title);
}

function formatCuit(value){const d=String(value||'').replace(/\D/g,'').slice(0,11);return d.length>10?`${d.slice(0,2)}-${d.slice(2,10)}-${d.slice(10)}`:d.length>2?`${d.slice(0,2)}-${d.slice(2)}`:d;}

/* ── Recuadro de firma: trazo suave con puntero (mouse, dedo o lápiz) ── */
function createPad(canvas,onChange){
  const ctx=canvas.getContext('2d');const strokes=[];let current=null;
  const resize=()=>{const r=canvas.getBoundingClientRect();if(!r.width)return;const ratio=Math.max(window.devicePixelRatio||1,1);canvas.width=Math.round(r.width*ratio);canvas.height=Math.round(r.height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);redraw();};
  const point=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top,p:e.pressure&&e.pointerType==='pen'?e.pressure:.5};};
  const drawStroke=s=>{ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#14213d';if(s.length===1){ctx.beginPath();ctx.arc(s[0].x,s[0].y,1.4,0,Math.PI*2);ctx.fillStyle='#14213d';ctx.fill();return;}for(let i=1;i<s.length;i++){const a=s[i-1],b=s[i];ctx.lineWidth=1.6+b.p*2.2;ctx.beginPath();ctx.moveTo(a.x,a.y);const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;ctx.quadraticCurveTo(a.x,a.y,mx,my);ctx.lineTo(b.x,b.y);ctx.stroke();}};
  const redraw=()=>{const r=canvas.getBoundingClientRect();ctx.clearRect(0,0,r.width,r.height);strokes.forEach(drawStroke);};
  canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.setPointerCapture?.(e.pointerId);current=[point(e)];strokes.push(current);redraw();onChange();});
  canvas.addEventListener('pointermove',e=>{if(!current)return;e.preventDefault();current.push(point(e));redraw();});
  const end=()=>{if(!current)return;current=null;onChange();};
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('pointerleave',end);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(canvas);resize();
  return{
    isEmpty:()=>!strokes.length,
    clear:()=>{strokes.length=0;redraw();onChange();},
    undo:()=>{strokes.pop();redraw();onChange();},
    /* Exporta solo lo dibujado (recortado y con margen), en PNG con fondo transparente. */
    toDataURL:()=>{if(!strokes.length)return'';const pts=strokes.flat();const pad=10;const minX=Math.max(Math.min(...pts.map(p=>p.x))-pad,0),minY=Math.max(Math.min(...pts.map(p=>p.y))-pad,0),maxX=Math.max(...pts.map(p=>p.x))+pad,maxY=Math.max(...pts.map(p=>p.y))+pad;const scale=2,w=Math.max(Math.round((maxX-minX)*scale),1),h=Math.max(Math.round((maxY-minY)*scale),1);const out=document.createElement('canvas');out.width=w;out.height=h;const o=out.getContext('2d');o.setTransform(scale,0,0,scale,-minX*scale,-minY*scale);o.lineCap='round';o.lineJoin='round';o.strokeStyle='#14213d';o.fillStyle='#14213d';strokes.forEach(s=>{if(s.length===1){o.beginPath();o.arc(s[0].x,s[0].y,1.4,0,Math.PI*2);o.fill();return;}for(let i=1;i<s.length;i++){const a=s[i-1],b=s[i];o.lineWidth=1.6+b.p*2.2;o.beginPath();o.moveTo(a.x,a.y);o.quadraticCurveTo(a.x,a.y,(a.x+b.x)/2,(a.y+b.y)/2);o.lineTo(b.x,b.y);o.stroke();}});return out.toDataURL('image/png');},
    destroy:()=>observer?.disconnect()
  };
}

function brandHtml(small=false){return`<span class="cd-brand ${small?'sm':''}" aria-label="AuxiliOS"><span class="cd-brand-word"><i>[</i>Auxili<i>]</i></span><span class="cd-brand-os">OS</span></span>`;}

function modalHtml(data){
  const field=(key,label,extra='')=>`<label class="cd-field"><span>${label}</span><input class="form-input" name="${key}" value="${esc(key==='tax_id'?formatCuit(data[key]):data[key])}" ${extra}></label>`;
  return`<div class="modal-box cd-box" role="dialog" aria-modal="true" aria-labelledby="cd-title">
    <div class="cd-stripe" aria-hidden="true"></div>
    <div class="modal-head cd-head"><div class="cd-head-main">${brandHtml()}<div class="cd-head-text"><span class="modal-head-title" id="cd-title">Empresa y documentos</span><small>Datos que se imprimen en los remitos y documentos que emite la app.</small></div></div><button class="modal-close" type="button" data-cd-close aria-label="Cerrar">×</button></div>
    <form id="company-document-form" novalidate><div class="modal-body cd-body">
      <div class="cd-cols">
        <section class="cd-card"><h4 class="cd-card-title">${icon('building-2')}Identidad de la empresa</h4>
          <div class="cd-grid">
            ${field('legal_name','Razón social','maxlength="200" placeholder="Nombre legal de la empresa" autocomplete="organization"')}
            ${field('tax_id','CUIT','inputmode="numeric" maxlength="13" placeholder="30-12345678-9"')}
            <div class="cd-span">${field('address','Domicilio','maxlength="200" placeholder="Calle, número, localidad"')}</div>
            <div class="cd-span">${field('contact','Contacto','maxlength="200" placeholder="Teléfono, email o web"')}</div>
          </div>
        </section>
        <section class="cd-card"><h4 class="cd-card-title">${icon('signature')}Firma institucional</h4>
          ${field('representative','Representante autorizado','maxlength="200" placeholder="Nombre y apellido de quien firma"')}
          <div class="cd-sign" data-cd-sign></div>
          <label class="cd-switch-row"><span class="cd-switch-text"><b>Imprimir la firma en los PDF de remitos</b><small>Aparece abajo a la derecha, debajo del código de verificación, con el nombre del representante.</small></span><span class="ax-switch"><input type="checkbox" name="signature_in_pdf" data-cd-inpdf ${data.signature_in_pdf?'checked':''}></span></label>
          <p class="cd-note">${icon('info')}<span>Es la firma de la empresa en los documentos que emite. No reemplaza la firma de conformidad del cliente.</span></p>
        </section>
      </div>
      <section class="cd-card cd-preview-card"><div class="cd-preview-head"><h4 class="cd-card-title">${icon('eye')}Así se ve en el PDF del remito</h4><button type="button" class="btn sm" data-cd-sample>${icon('file-text')}Ver PDF de ejemplo</button></div><div class="cd-paper" data-cd-preview></div><p class="cd-note">${icon('info')}<span>El ejemplo usa lo que tenés cargado ahora, aunque todavía no lo hayas guardado. Los datos del cliente son ficticios.</span></p></section>
      <div class="modal-error cd-error" role="alert" id="company-document-error"></div>
    </div>
    <div class="modal-footer cd-footer"><button class="btn btn-ghost" type="button" data-cd-close>Cancelar</button><button class="btn btn-primary" type="submit" data-cd-save>Guardar configuración</button></div></form>
  </div>`;
}

function signHtml(){
  const has=Boolean(S.signature);
  if(S.mode==='saved'&&has)return`<div class="cd-current"><div class="cd-current-img"><img src="${esc(S.signature)}" alt="Firma actual"></div><div class="cd-current-meta"><b>${S.origin==='saved'?'Firma guardada':'Firma nueva, sin guardar'}</b><small>${S.origin==='saved'?'Es la que se usa hoy en los documentos.':'Se guarda al tocar «Guardar configuración».'}</small><div class="cd-row-actions"><button type="button" class="btn sm" data-cd-mode="draw">${icon('pencil')}Firmar de nuevo</button><button type="button" class="btn sm" data-cd-mode="upload">${icon('upload')}Subir imagen</button><button type="button" class="btn sm danger" data-cd-remove>${icon('trash-2')}Quitar firma</button></div></div></div>`;
  const seg=`<div class="ax-seg cd-seg" role="group" aria-label="Cómo cargar la firma"><button type="button" aria-pressed="${S.mode==='draw'}" data-cd-mode="draw">${icon('pencil')}Firmar en pantalla</button><button type="button" aria-pressed="${S.mode==='upload'}" data-cd-mode="upload">${icon('upload')}Subir imagen</button></div>`;
  const back=has?`<button type="button" class="btn btn-ghost sm cd-back" data-cd-mode="saved">${icon('arrow-left')}Volver a la firma ${S.origin==='saved'?'guardada':'cargada'}</button>`:'';
  if(S.mode==='upload')return`${seg}<label class="cd-drop" data-cd-drop><input type="file" name="signature" accept="image/png,image/jpeg">${icon('upload')}<b>Elegí una imagen de la firma</b><small>PNG o JPG, hasta 280 KB. Mejor con fondo blanco o transparente.</small></label>${back}`;
  return`${seg}<div class="cd-pad-wrap"><canvas class="cd-pad" data-cd-pad aria-label="Recuadro para firmar"></canvas><div class="cd-pad-hint" data-cd-hint>Firmá aquí con el mouse, el dedo o un lápiz</div><div class="cd-pad-line" aria-hidden="true"><span>✕</span></div></div><div class="cd-pad-actions"><button type="button" class="btn sm" data-cd-undo disabled>${icon('rotate-ccw')}Deshacer</button><button type="button" class="btn sm" data-cd-clear disabled>${icon('x')}Borrar</button><button type="button" class="btn btn-primary sm" data-cd-use disabled>${icon('check')}Usar esta firma</button></div>${back}`;
}

function previewHtml(form){
  const v=k=>String(form?.elements?.[k]?.value||'').trim();
  const legal=v('legal_name'),cuit=v('tax_id'),address=v('address'),contact=v('contact'),rep=v('representative');
  const datos=[cuit&&`CUIT ${cuit}`,address,contact].filter(Boolean).join(' · ');
  const inPdf=Boolean(S.inPdf&&S.signature);
  const company=inPdf?`<div class="cd-pp-esign"><img src="${esc(S.signature)}" alt=""><span class="cd-paper-rule"></span><b>${esc(rep||'Representante autorizado')}</b><small>Firma institucional · ${esc(legal||'Empresa')}</small></div>`:`<div class="cd-pp-esign off"><small>${S.signature?'La firma de la empresa no se imprime (opción apagada).':'Sin firma institucional cargada.'}</small></div>`;
  return`<div class="cd-pp-head"><div class="cd-pp-co"><b>${esc(legal||'Empresa sin configurar')}</b><small>${esc(datos||'CUIT · domicilio · contacto')}</small></div><div class="cd-pp-doc"><small>N° DE SERVICIO</small><b>SRV-1042</b><small>Remito 0001-00001234 · ${new Date().toLocaleDateString('es-AR')}</small></div></div>
    <span class="cd-pp-brandline" aria-hidden="true"></span>
    <div class="cd-pp-cols"><div><em>CLIENTE</em><i></i><i class="s"></i></div><div><em>VEHÍCULO</em><i></i><i class="s"></i></div><div><em>SERVICIO</em><i></i><i class="s"></i></div></div>
    <div class="cd-paper-lines" aria-hidden="true"><i></i><i style="width:70%"></i></div>
    <div class="cd-pp-sign"><div class="cd-pp-client"><em>FIRMA DEL CLIENTE</em><div class="cd-pp-box"><span>Firma del cliente</span></div><small>Aclaración: Juan Pérez · DNI 30.123.456</small></div><div class="cd-pp-verif"><em>VERIFICACIÓN</em><div class="cd-pp-qr"><span class="cd-pp-qrbox" aria-hidden="true"></span><small>Código<br><b>A1B2-C3D4-E5F6-7890</b></small></div>${company}</div></div>
    <div class="cd-pp-foot"><small>${esc([legal||'Empresa',address,contact].filter(Boolean).join(' · '))}</small><small>Página 1</small></div>`;
}

function sampleRemito(){const now=new Date();return{nro:'0001-00001234',srvOrden:'SRV-1042',fecha:now.toLocaleDateString('es-AR'),cliente:'Juan Pérez',cuit:'30.123.456',telefono:'11 5555-0000',patente:'AB123CD',marca:'Toyota Corolla',tipoReal:'Liviano',chofer:'Chofer de ejemplo',km:'48',origen:'Av. Libertador 1200, Vicente López',destino:'Taller Mecánico Sur, Av. Mitre 450, Avellaneda',createdAt:new Date(now-90*60000).toISOString(),firmadoAt:now.toISOString(),estado:'firmado',peaje:2400,excedente:0,otros:0,pago:'Efectivo',conformidades:{servicio:true,cargos:true,danos:true},foto_urls:[]};}

async function openSample(){
  const form=document.getElementById('company-document-form');if(!form)return;
  const button=document.querySelector('#company-document-modal [data-cd-sample]');
  if(!window.RemitoPdf?.blob)return notify('El generador de PDF todavía no cargó. Probá de nuevo en unos segundos.','warning');
  const win=window.open('','_blank');
  if(button){button.disabled=true;}
  try{
    const empresa=Object.fromEntries(FIELDS.map(k=>[k,form.elements[k].value.trim()]));
    empresa.signature_image=S.signature||'';empresa.signature_in_pdf=Boolean(S.inPdf);
    const blob=await window.RemitoPdf.blob(sampleRemito(),{empresa});
    const url=URL.createObjectURL(blob);
    if(win){win.location.href=url;}else{const a=document.createElement('a');a.href=url;a.download='Remito_de_ejemplo.pdf';document.body.appendChild(a);a.click();a.remove();}
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(error){win?.close();notify(error.message||'No se pudo generar el PDF de ejemplo.','error');}
  finally{if(button)button.disabled=false;}
}

function setError(message=''){const el=document.getElementById('company-document-error');if(!el)return;el.textContent=message;el.style.display=message?'block':'none';}
function markDirty(){S.dirty=true;}
function refreshPreview(){const box=document.querySelector('#company-document-modal [data-cd-preview]');const form=document.getElementById('company-document-form');if(box&&form)box.innerHTML=previewHtml(form);}

function renderSign(){
  const box=document.querySelector('#company-document-modal [data-cd-sign]');if(!box)return;
  S.pad?.destroy?.();S.pad=null;
  box.innerHTML=signHtml();
  box.querySelectorAll('[data-cd-mode]').forEach(b=>b.addEventListener('click',()=>{S.mode=b.dataset.cdMode;renderSign();}));
  box.querySelector('[data-cd-remove]')?.addEventListener('click',async()=>{
    const ok=await ask({title:'Quitar la firma institucional',html:'<p class="bp4-confirm-text">Los documentos nuevos van a salir <b>sin la firma de la empresa</b> hasta que cargues otra. Se aplica al guardar.</p>',confirmLabel:'Sí, quitar',danger:true,fallback:'¿Quitar la firma institucional?'});
    if(!ok)return;S.signature='';S.origin='removed';S.mode='draw';markDirty();renderSign();refreshPreview();
  });
  const canvas=box.querySelector('[data-cd-pad]');
  if(canvas){
    const hint=box.querySelector('[data-cd-hint]'),undo=box.querySelector('[data-cd-undo]'),clear=box.querySelector('[data-cd-clear]'),use=box.querySelector('[data-cd-use]');
    const sync=()=>{const empty=S.pad?S.pad.isEmpty():true;if(hint)hint.hidden=!empty;[undo,clear,use].forEach(b=>{if(b)b.disabled=empty;});if(!empty)markDirty();};
    S.pad=createPad(canvas,sync);
    undo?.addEventListener('click',()=>S.pad.undo());
    clear?.addEventListener('click',()=>S.pad.clear());
    use?.addEventListener('click',()=>{const url=S.pad.toDataURL();if(!url)return;if(url.length>MAX_CHARS)return setError('La firma quedó muy pesada. Borrala y hacela un poco más chica.');setError('');S.signature=url;S.origin='drawn';S.mode='saved';markDirty();renderSign();refreshPreview();});
  }
  const input=box.querySelector('input[name="signature"]');
  input?.addEventListener('change',async()=>{
    const file=input.files[0];if(!file)return;
    if(!['image/png','image/jpeg'].includes(file.type)||file.size>280000){input.value='';return setError('Usá PNG o JPG de hasta 280 KB.');}
    setError('');
    S.file=file;S.signature=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
    S.origin='uploaded';S.mode='saved';markDirty();renderSign();refreshPreview();
  });
}

async function requestClose(){
  if(S.busy)return;
  const box=document.getElementById('company-document-modal');if(!box?.classList.contains('open'))return;
  const drawing=S.pad&&!S.pad.isEmpty();
  if(S.dirty||drawing){
    const ok=await ask({title:'¿Salir sin guardar?',html:'<p class="bp4-confirm-text">Tenés <b>cambios sin guardar</b> en los datos de la empresa o en la firma. Si salís, se pierden.</p>',confirmLabel:'Sí, descartar y salir',danger:true,fallback:'¿Salir sin guardar los cambios?'});
    if(!ok)return;
  }
  close();
}
function close(){S.pad?.destroy?.();S.pad=null;S.dirty=false;S.file=null;typeof closeModal==='function'?closeModal('company-document-modal'):document.getElementById('company-document-modal')?.classList.remove('open');}

async function save(form){
  if(S.busy)return;
  const button=form.querySelector('[data-cd-save]');
  try{
    const values=Object.fromEntries(FIELDS.map(k=>[k,form.elements[k].value.trim()]));
    values.tax_id=values.tax_id.replace(/\D/g,'')?formatCuit(values.tax_id):'';
    if(values.tax_id&&values.tax_id.replace(/\D/g,'').length!==11)throw Error('El CUIT debe tener 11 dígitos.');
    if(S.pad&&!S.pad.isEmpty()&&S.mode==='draw'){const url=S.pad.toDataURL();if(url.length>MAX_CHARS)throw Error('La firma quedó muy pesada. Borrala y hacela un poco más chica.');S.signature=url;S.origin='drawn';}
    const signature=S.signature||'';
    if(signature&&!values.representative)throw Error('Indicá el representante autorizado.');
    if(S.inPdf&&!signature)throw Error('Para imprimir la firma en los PDF, primero cargala (o apagá la opción).');
    if(signature.length>MAX_CHARS)throw Error('La firma es demasiado pesada.');
    S.busy=true;if(button){button.disabled=true;button.textContent='Guardando…';}
    const {error}=await _db.from('company_document_settings').upsert({id:true,...values,signature_image:signature,signature_in_pdf:Boolean(S.inPdf&&signature),updated_at:new Date().toISOString(),updated_by:USUARIO_ACTUAL.id});
    if(error)throw error;
    const file=S.origin==='uploaded'?S.file:null,drawn=S.origin==='drawn';
    S.busy=false;close();
    if(file&&typeof window.confirmarSubida==='function')window.confirmarSubida(file.name,'Firma institucional guardada');
    else notify(drawn?'Firma institucional guardada':'Datos de empresa guardados','success');
  }catch(error){setError(error.message||'No se pudo guardar.');}
  finally{S.busy=false;if(button){button.disabled=false;button.textContent='Guardar configuración';}}
}

async function open(){
  if(PERFIL_USUARIO?.roles?.name!=='administracion')return;
  let box=document.getElementById('company-document-modal');
  if(!box){
    box=document.createElement('div');box.id='company-document-modal';box.className='modal-backdrop';document.body.appendChild(box);
    box.addEventListener('click',event=>{if(event.target===box)requestClose();});
    window.addEventListener('keydown',event=>{if(event.key!=='Escape'||!box.classList.contains('open'))return;if(document.getElementById('modal-bp4-confirm')?.classList.contains('open'))return;event.stopImmediatePropagation();event.preventDefault();requestClose();},true);
  }
  box.innerHTML='<div class="modal-box cd-box"><div class="cd-stripe" aria-hidden="true"></div><div class="modal-body cd-loading">Cargando datos de empresa…</div></div>';
  box.classList.add('open');
  try{
    const data=await load();
    Object.assign(S,{data,inPdf:Boolean(data.signature_in_pdf),signature:data.signature_image||'',origin:'saved',mode:data.signature_image?'saved':'draw',dirty:false,busy:false,file:null});
    box.innerHTML=modalHtml(data);
    const form=box.querySelector('form');
    box.querySelectorAll('[data-cd-close]').forEach(b=>b.addEventListener('click',requestClose));
    form.addEventListener('input',e=>{if(e.target.name==='tax_id'){e.target.value=formatCuit(e.target.value);}if(FIELDS.includes(e.target.name)){markDirty();refreshPreview();}});
    form.onsubmit=e=>{e.preventDefault();save(form);};
    box.querySelector('[data-cd-inpdf]')?.addEventListener('change',e=>{S.inPdf=e.target.checked;markDirty();refreshPreview();});
    box.querySelector('[data-cd-sample]')?.addEventListener('click',openSample);
    renderSign();refreshPreview();setError('');
  }catch(error){box.innerHTML='<div class="modal-box cd-box"><div class="cd-stripe" aria-hidden="true"></div><div class="modal-body">'+esc(error.message)+'</div><div class="modal-footer"><button class="btn" type="button" onclick="closeModal(\'company-document-modal\')">Cerrar</button></div></div>';}
}
window.CompanyDocuments={load,open,esc};
})();
