/* AuxiliOS · Jornadas Admin · correcciones, impacto y navegación canónica v3 */
(() => {
  'use strict';

  const state = { current: null, installed: false, originalRender: null, payrollWrapped: false };
  const $ = id => document.getElementById(id);
  const db = () => typeof _db === 'undefined' ? null : _db;
  const role = () => String(typeof PERFIL_USUARIO === 'undefined' ? '' : (PERFIL_USUARIO?.roles?.name || PERFIL_USUARIO?.role || '')).toLowerCase();
  const isAdmin = () => role() === 'administracion';
  const allowed = () => ['administracion', 'supervision'].includes(role());
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate = value => { if (!value) return '—'; const raw=String(value).slice(0,10); const [y,m,d]=raw.split('-'); return y&&m&&d?`${d}/${m}/${y.slice(2)}`:raw; };
  const fmtTime = value => value ? String(value).slice(0,5) : '—';
  const fmtMoney = value => Number(value || 0).toLocaleString('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2});
  const todayAR = () => new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
  const nowTimeAR = () => new Date().toLocaleTimeString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',hour12:false});
  const notify = (message,type='success') => typeof toast==='function' ? toast(message,type) : console[type==='error'?'error':'log'](message);
  const errorText = error => error?.message || error?.details || 'No se pudo completar la operación';

  /* ── Modales de Administración con el sistema visual (ui/components.css + AxUI) ─────────── */
  const ic = (name, cls = '') => `<svg class="ax-icon${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="/ui/icons.svg#${name}"/></svg>`;
  const alertBox = (tone, icon, html) => `<div class="ax-alert${tone ? ' ax-alert-' + tone : ''}">${ic(icon)}<div>${html}</div></div>`;
  const nz = v => Number(v) || 0;
  const fmtKm = v => nz(v).toLocaleString('es-AR');
  const timeVal = value => (fmtTime(value) === '—' ? '' : fmtTime(value));
  function who(det){ const l = det?.log || {}; return [fmtDate(l.log_date), l.chofer?.full_name, l.truck?.plate].filter(Boolean).join(' · '); }

  function closeToolModal(){
    const root = $('jat-modal-root'); if (!root) return;
    root.id = 'jat-modal-old';
    if (window.AxUI?.closeModal) { window.AxUI.closeModal(root); setTimeout(() => root.remove(), 400); } else root.remove();
  }
  /* static: el fondo y Esc no cierran (formularios con algo escrito). */
  function mountModal({title = '', subtitle = '', body = '', footer = '', wide = false, isStatic = false}){
    document.querySelectorAll('.jat-backdrop').forEach(el => el.remove());
    const root = document.createElement('div');
    root.id = 'jat-modal-root'; root.className = 'ax-backdrop jat-backdrop'; root.hidden = true;
    if (isStatic) root.setAttribute('data-static', '');
    root.innerHTML = `<section class="ax-modal jat-modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="jat-title"><header><div><h2 id="jat-title">${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div><button class="ax-btn ax-btn-ghost ax-btn-icon" type="button" data-jat-close aria-label="Cerrar">${ic('x')}</button></header><div class="ax-modal-body jat-body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}</section>`;
    root.addEventListener('click', e => { if (e.target.closest('[data-jat-close]')) closeToolModal(); });
    document.body.appendChild(root);
    if (window.AxUI?.openModal) window.AxUI.openModal(root); else root.hidden = false;
    return root;
  }
  function currentLog(){ return state.current?.log || null; }

  async function refreshCurrent(logId){
    try{ if(typeof window._jadminReload==='function') await window._jadminReload(); }catch(_){}
    if(!logId||typeof window.cargarDetalleJornadaAdmin!=='function')return;
    const det=await window.cargarDetalleJornadaAdmin(logId); if(det&&typeof window._jadminRenderDetalle==='function')window._jadminRenderDetalle(det);
  }

  async function impactFor(logId){
    const {data,error}=await db().rpc('get_daily_log_admin_impact',{p_log_id:logId});
    if(error) throw error; return data||{};
  }
  function impactCopy(impact){
    const liq=impact?.liquidacion;
    if(!liq) return 'No existe una liquidación generada para este período. La corrección actualizará la fuente de datos.';
    if(liq.estado==='pendiente') return 'Impacto: si cambiás kilometraje, la liquidación pendiente se recalculará automáticamente con el nuevo valor.';
    if(liq.estado==='aprobada') return 'Impacto: la liquidación ya está aprobada. No se sobrescribirá; quedará marcada como Requiere revisión y AuxiliOS calculará la diferencia.';
    if(liq.estado==='pagada') return 'Impacto: la liquidación ya está pagada. El pago histórico no se modifica; AuxiliOS registrará la diferencia como ajuste pendiente.';
    return 'AuxiliOS recalculará los derivados afectados por esta corrección.';
  }

  /* Hora en 24 h con los dos puntos solos (el campo "time" del navegador muestra AM/PM según el equipo). */
  const timeField = (label, name, value, {required = false, disabled = false} = {}) =>
    `<label class="ax-field"><span>${label}</span><input class="ax-input" name="${name}" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="hh:mm" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" value="${esc(value)}"${required ? ' required' : ''}${disabled ? ' disabled' : ''}></label>`;
  const kmField = (label, name, value, {required = false, disabled = false} = {}) =>
    `<label class="ax-field"><span>${label}</span><input class="ax-input" name="${name}" type="number" min="0" step="1" inputmode="numeric" value="${esc(value ?? '')}"${required ? ' required' : ''}${disabled ? ' disabled' : ''}></label>`;
  function bindTimeMask(root){
    root.addEventListener('input', e => {
      const t = e.target; if (!(t instanceof HTMLInputElement) || t.getAttribute('placeholder') !== 'hh:mm') return;
      const d = t.value.replace(/\D/g, '').slice(0, 4);
      t.value = d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
    });
  }
  /* Horas de motor: "1.234,5", "1234,5" o "1234.5" → 1234.5. Vacío → null; NaN si no es un número. */
  const parseHs = v => { let t = String(v ?? '').trim().replace(/\s/g, ''); if (!t) return null; if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); const n = Number(t); return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : NaN; };
  const fmtHs = v => Number(v).toLocaleString('es-AR', {maximumFractionDigits: 1});
  const hsVal = v => (v == null || v === '' ? '' : String(Number(v)).replace('.', ','));
  const hsField = (label, name, value, {disabled = false} = {}) =>
    `<label class="ax-field"><span>${label}</span><input class="ax-input" name="${name}" inputmode="decimal" autocomplete="off" placeholder="Ej: 1234,5" value="${esc(value)}"${disabled ? ' disabled' : ''}></label>`;
  const validTime = v => /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(v || ''));
  const minutesOf = v => { const [h, m] = String(v).split(':').map(Number); return h * 60 + m; };

  /* "184 km · 9 h 30 min" y lo que no cierra, mientras se escribe. */
  function tripSummary(kmIni, kmFin, hIni, hFin, exception, motorIni = null, motorFin = null){
    const out = {text: '', problems: []};
    const okKm = kmIni !== '' && kmFin !== '' && Number.isFinite(Number(kmIni)) && Number.isFinite(Number(kmFin));
    const km = okKm ? Number(kmFin) - Number(kmIni) : null;
    let mins = null;
    if (validTime(hIni) && validTime(hFin)) { mins = minutesOf(hFin) - minutesOf(hIni); if (mins < 0) mins += 1440; }
    const parts = [];
    if (km !== null) parts.push(`${fmtKm(km)} km`);
    if (mins !== null) parts.push(`${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min`);
    // Horas de motor (sólo camiones con horómetro): las que usó la jornada.
    const okMotor = Number.isFinite(motorIni) && Number.isFinite(motorFin);
    if (okMotor && motorFin >= motorIni) parts.push(`${fmtHs(Math.round((motorFin - motorIni) * 10) / 10)} h de motor`);
    out.text = parts.join(' · ');
    if (okMotor && motorFin < motorIni) out.problems.push('Las horas de motor finales son menores a las iniciales.');
    if (okMotor && motorFin - motorIni > 24) out.problems.push('Más de 24 h de motor en una jornada: revisá las horas.');
    if (km !== null && km < 0 && !exception) out.problems.push('El KM final es menor al inicial. Si es correcto, activá la excepción.');
    if (km !== null && km > 1500) out.problems.push('Más de 1.500 km en una jornada: revisá el KM final.');
    if (mins !== null && mins > 16 * 60) out.problems.push('Jornada de más de 16 horas: revisá la hora de fin.');
    return out;
  }

  const quickReasons = list => `<div class="jat-quick" role="group" aria-label="Motivos frecuentes">${list.map(t => `<button type="button" class="ax-chip" data-jat-reason="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
  function bindQuickReasons(root, onChange){
    root.addEventListener('click', e => {
      const chip = e.target.closest('[data-jat-reason]'); if (!chip) return;
      const ta = root.querySelector('textarea[name="reason"]'); if (!ta) return;
      ta.value = chip.getAttribute('data-jat-reason'); ta.focus(); ta.dispatchEvent(new Event('input', {bubbles: true}));
      onChange && onChange();
    });
  }
  const showError = (root, id, message) => { const el = root.querySelector(id); if (!el) return; el.querySelector('div').textContent = message; el.hidden = false; };
  const errorBox = id => `<div id="${id}" class="ax-alert ax-alert-danger" role="alert" hidden>${ic('circle-alert')}<div></div></div>`;

  function editModal(){
    if(!isAdmin())return; const det=state.current, log=currentLog(); if(!log)return;
    const isOpen=log.status==='open';
    const finalFields=isOpen
      ? `<div class="jat-span-2">${alertBox('','info','<b>Jornada abierta.</b> KM final y hora fin no son datos editables: se completan únicamente desde <b>Cerrar jornada</b>.')}</div>`
      : `${kmField('KM final','km_final',log.km_final,{required:true})}${timeField('Hora fin','hora_fin',timeVal(log.hora_fin),{required:true})}`;
    // Horas de motor: si la jornada las tiene o el camión las registra.
    const conHoras=log.horas_inicio!=null||log.horas_final!=null||!!log.truck?.registra_horas;
    const horasSection=conHoras?`<section class="jat-section"><h3>Horas de motor</h3><div class="jat-grid">${hsField('Horas al inicio','horas_inicio',hsVal(log.horas_inicio))}${isOpen?'':hsField('Horas al final','horas_final',hsVal(log.horas_final))}</div>
          ${isOpen?'<p class="ax-field-help">Las horas al final se cargan al cerrar la jornada.</p>':''}<div id="jat-horas" class="jat-trip" aria-live="polite"></div></section>`:'';
    const root=mountModal({title:'Corregir jornada',subtitle:who(det),isStatic:true,
      body:`<div id="jat-impact"></div><form id="jat-edit-form" novalidate>
        <section class="jat-section"><h3>Recorrido</h3><div class="jat-grid">${kmField('KM inicial','km_inicio',log.km_inicio,{required:true})}${timeField('Hora inicio','hora_inicio',timeVal(log.hora_inicio),{required:true})}${finalFields}</div>
          <div id="jat-trip" class="jat-trip" aria-live="polite"></div>
          <label class="ax-switch jat-exc" id="jat-exc"${!isOpen && (log.km_excepcion || nz(log.km_final) < nz(log.km_inicio)) ? '' : ' hidden'}><input name="km_excepcion" type="checkbox" ${log.km_excepcion?'checked':''}><span>Permitir que el KM final quede por debajo del inicial (excepción)</span></label></section>
        ${horasSection}
        <section class="jat-section"><h3>Taller</h3><label class="ax-switch"><input name="in_workshop" type="checkbox" ${log.in_workshop?'checked':''}><span>La unidad ingresó a taller durante esta jornada</span></label>
          <label class="ax-field" id="jat-workshop"${log.in_workshop?'':' hidden'}><span>Detalle del taller</span><textarea class="ax-textarea" name="workshop_detail" placeholder="Qué trabajo se hizo">${esc(log.workshop_detail||'')}</textarea></label></section>
        <section class="jat-section"><h3>Notas de la jornada</h3><textarea class="ax-textarea" name="notas" aria-label="Notas de la jornada">${esc(log.notas||'')}</textarea></section>
        <section class="jat-section"><h3>Motivo de la corrección *</h3><textarea class="ax-textarea" name="reason" aria-label="Motivo de la corrección" placeholder="Ej.: el odómetro inicial correcto era 125.040 km"></textarea>
          ${quickReasons(['Error de tipeo del chofer','Odómetro mal leído por la IA','Cargado sin conexión','Dato corregido con el chofer'])}<p class="ax-field-help">Queda en el historial con tu nombre, la fecha y los valores anteriores.</p></section>
        <div id="jat-edit-changes" class="jat-changes" aria-live="polite"></div>
        <div id="jat-confirm"></div>${errorBox('jat-edit-error')}</form>`,
      footer:`<button class="ax-btn" type="button" data-jat-close>Cancelar</button><button class="ax-btn ax-btn-primary" type="submit" form="jat-edit-form" id="jat-edit-save" disabled>Guardar corrección</button>`});
    const form=root.querySelector('#jat-edit-form'), save=root.querySelector('#jat-edit-save');
    bindTimeMask(root);
    let confirmed=false;
    const LABELS={km_inicio:'KM inicial',hora_inicio:'Hora inicio',km_final:'KM final',hora_fin:'Hora fin',km_excepcion:'Excepción de KM',horas_inicio:'Horas de motor al inicio',horas_final:'Horas de motor al final',in_workshop:'Taller',workshop_detail:'Detalle del taller',notas:'Notas'};
    function read(){
      const fd=new FormData(form);
      const patch={km_inicio:fd.get('km_inicio'),hora_inicio:fd.get('hora_inicio'),in_workshop:form.elements.in_workshop.checked,workshop_detail:fd.get('workshop_detail')||'',notas:fd.get('notas')||''};
      if(!isOpen){patch.km_final=fd.get('km_final');patch.hora_fin=fd.get('hora_fin');patch.km_excepcion=form.elements.km_excepcion.checked;}
      if(conHoras){patch.horas_inicio=parseHs(fd.get('horas_inicio'));if(!isOpen)patch.horas_final=parseHs(fd.get('horas_final'));}
      return patch;
    }
    const numOrNull=v=>v==null||v===''?null:Number(v);
    const before={km_inicio:String(log.km_inicio??''),hora_inicio:timeVal(log.hora_inicio),km_final:String(log.km_final??''),hora_fin:timeVal(log.hora_fin),km_excepcion:!!log.km_excepcion,horas_inicio:numOrNull(log.horas_inicio),horas_final:numOrNull(log.horas_final),in_workshop:!!log.in_workshop,workshop_detail:log.workshop_detail||'',notas:log.notas||''};
    function shown(k,x){ if(typeof x==='boolean') return x?'Sí':'No'; if(x===''||x==null) return '—'; if(Number.isNaN(x)) return 'número inválido'; if(k.startsWith('horas_')) return `${fmtHs(x)} h`; return k.startsWith('km_')&&k!=='km_excepcion'?fmtKm(x):String(x); }
    /* Lo que no cierra con las horas de motor: bloquea guardar salvo los avisos. */
    function horasProblemas(v){
      if(!conHoras)return {bloquea:[],avisos:[]};
      const bloquea=[],avisos=[];
      if(Number.isNaN(v.horas_inicio)||Number.isNaN(v.horas_final))bloquea.push('Escribí las horas como número, por ejemplo 1234,5.');
      else if(v.horas_final!=null&&v.horas_inicio==null)bloquea.push('Cargá también las horas al inicio.');
      else if(v.horas_final!=null&&v.horas_final<v.horas_inicio)bloquea.push('Las horas al final no pueden ser menores a las del inicio.');
      if(!isOpen&&v.horas_inicio!=null&&v.horas_final==null&&!bloquea.length)avisos.push('Faltan las horas al final: el camión no actualiza sus horas.');
      return {bloquea,avisos};
    }
    function refresh(){
      const v=read(), reason=String(form.elements.reason.value||'').trim();
      root.querySelector('#jat-workshop').hidden=!v.in_workshop;
      const sum=isOpen?{text:'',problems:[]}:tripSummary(v.km_inicio,v.km_final,v.hora_inicio,v.hora_fin,v.km_excepcion,v.horas_inicio,v.horas_final);
      const hp=horasProblemas(v), horasEl=root.querySelector('#jat-horas');
      if(horasEl)horasEl.innerHTML=[...hp.bloquea,...hp.avisos].map(p=>`<span class="jat-problem">${ic('triangle-alert')} ${esc(p)}</span>`).join('');
      const badTime=!validTime(v.hora_inicio)||(!isOpen&&!validTime(v.hora_fin));
      const trip=root.querySelector('#jat-trip');
      trip.innerHTML=(sum.text?`<b>Recorrido:</b> ${esc(sum.text)}`:'')+sum.problems.map(p=>`<span class="jat-problem">${ic('triangle-alert')} ${esc(p)}</span>`).join('')+(badTime?`<span class="jat-problem">${ic('triangle-alert')} Escribí la hora como hh:mm (24 h).</span>`:'');
      const needExc=!isOpen&&nz(v.km_final)<nz(v.km_inicio);
      root.querySelector('#jat-exc').hidden=!(needExc||v.km_excepcion);
      const changes=Object.keys(before).filter(k=>k in v).filter(k=>String(v[k])!==String(before[k])).map(k=>`<div class="jat-diff"><b>${LABELS[k]}</b><span><s>${esc(shown(k,before[k]))}</s> → ${esc(shown(k,v[k]))}</span></div>`);
      root.querySelector('#jat-edit-changes').innerHTML=changes.length?`<h3>Vas a cambiar</h3>${changes.join('')}`:'';
      const kmBad=sum.problems.some(p=>p.startsWith('El KM final es menor'));
      save.disabled=!(changes.length&&reason.length>=5&&!badTime&&!kmBad&&!hp.bloquea.length&&v.km_inicio!=='');
      confirmed=false; root.querySelector('#jat-confirm').innerHTML=''; save.textContent='Guardar corrección';
    }
    form.addEventListener('input',refresh); form.addEventListener('change',refresh); bindQuickReasons(root,refresh); refresh();
    impactFor(log.log_id).then(i=>{root._impact=i;const liq=i?.liquidacion;const el=root.querySelector('#jat-impact');if(!el)return;
      el.innerHTML=liq&&['aprobada','pagada'].includes(liq.estado)?alertBox('warn','triangle-alert',esc(impactCopy(i))):`<p class="jat-impact-note">${esc(impactCopy(i))}</p>`;
    }).catch(()=>{const el=root.querySelector('#jat-impact');if(el)el.innerHTML='<p class="jat-impact-note">No se pudo anticipar el impacto; la corrección seguirá auditada.</p>';});
    form.addEventListener('submit',async e=>{
      e.preventDefault(); if(save.disabled)return;
      const patch=read(); const reason=String(form.elements.reason.value||'').trim();
      const kmChanged=Number(patch.km_inicio)!==Number(log.km_inicio)||(!isOpen&&Number(patch.km_final)!==Number(log.km_final));
      const status=root._impact?.liquidacion?.estado;
      // Con la liquidación ya aprobada o pagada se pide una segunda confirmación, a la vista y sin salir del modal.
      if(kmChanged&&['aprobada','pagada'].includes(status)&&!confirmed){confirmed=true;root.querySelector('#jat-confirm').innerHTML=alertBox('warn','triangle-alert',`${esc(impactCopy(root._impact))}<br><b>¿Confirmás la corrección?</b>`);save.textContent='Confirmar y guardar';return;}
      save.disabled=true;save.textContent='Guardando…';
      try{const {error}=await db().rpc('update_daily_log_admin',{p_log_id:log.log_id,p_patch:patch,p_reason:reason});if(error)throw error;closeToolModal();notify('Jornada corregida y derivados sincronizados');await refreshCurrent(log.log_id);setTimeout(surfacePayrollReviews,0);}catch(error){showError(root,'#jat-edit-error',errorText(error));save.disabled=false;save.textContent=confirmed?'Confirmar y guardar':'Guardar corrección';}
    });
  }

  function closeJourneyModal(){
    if(!isAdmin())return; const det=state.current,log=det?.log;if(!log)return;
    if(log.status!=='open'){notify('La jornada ya no está abierta','warning');return;}
    const defaultTime=String(log.log_date||'').slice(0,10)===todayAR()?nowTimeAR():'';
    const renditionMessage=det?.rendicion
      ? 'Existe una rendición vinculada. Se conserva su trazabilidad y los derivados se sincronizan con las reglas administrativas actuales.'
      : 'No hay una rendición presentada. El cierre administrativo no inventará una declaración de efectivo: la rendición seguirá pendiente hasta que corresponda registrarla o revisarla.';
    const nTrips=det?.trips?.length||0, nFuel=det?.fuel_records?.length||0, nInc=det?.incidents?.length||0;
    const row=(ok,icon,label,detail)=>`<li class="${ok===null?'':ok?'is-ok':'is-warn'}">${ic(icon)}<div><b>${label}</b>${detail?`<span>${detail}</span>`:''}</div></li>`;
    // Si la jornada abrió con horas de motor, se pueden cargar las del final (opcional).
    const conHoras=log.horas_inicio!=null;
    const horasCierre=conHoras?`<section class="jat-section"><h3>Horas de motor</h3><div class="jat-grid">${hsField('Horas al inicio','horas_inicio_ro',hsVal(log.horas_inicio),{disabled:true})}${hsField('Horas al final','horas_final','')}</div>
          <p class="ax-field-help">Si no las sabés, dejalas vacías: las podés cargar después con Corregir jornada.</p></section>`:'';
    const root=mountModal({title:'Cerrar jornada',subtitle:`${who(det)} · desde Administración`,isStatic:true,
      body:`${alertBox('warn','triangle-alert','<b>Esta acción cambia el estado a Cerrada.</b> KM final y hora fin pasan a ser datos de cierre, se actualiza el odómetro del móvil y se recalculan los derivados correspondientes.')}
        <section class="jat-section"><h3>Antes de cerrar</h3><ul class="jat-checks">
          ${row(nTrips>0?true:null,nTrips>0?'circle-check':'info','Servicios',nTrips>0?`${nTrips} ${nTrips===1?'remito':'remitos'}`:'Sin remitos en la jornada')}
          ${row(det?.tire_check?true:false,det?.tire_check?'circle-check':'triangle-alert','Control de neumáticos y frenos',det?.tire_check?'Cargado':'El chofer no lo cargó')}
          ${row(det?.rendicion?true:false,det?.rendicion?'circle-check':'triangle-alert','Rendición',esc(renditionMessage))}
          ${row(null,'fuel','Combustible',nFuel?`${nFuel} ${nFuel===1?'carga':'cargas'}`:'Sin cargas')}
          ${row(null,'triangle-alert','Incidentes',nInc?`${nInc} registrado${nInc===1?'':'s'}`:'Sin incidentes')}
        </ul></section>
        <form id="jat-close-form" novalidate><section class="jat-section"><h3>Cierre</h3><div class="jat-grid">${kmField('KM inicial','km_inicio_ro',log.km_inicio,{disabled:true})}${timeField('Hora inicio','hora_inicio_ro',timeVal(log.hora_inicio),{disabled:true})}${kmField('KM final *','km_final','',{required:true})}${timeField('Hora fin *','hora_fin',defaultTime,{required:true})}</div>
          <div id="jat-trip" class="jat-trip" aria-live="polite"></div>
          <label class="ax-switch jat-exc" id="jat-exc" hidden><input name="km_excepcion" type="checkbox"><span>Permitir que el KM final quede por debajo del inicial (excepción)</span></label></section>
        ${horasCierre}
        <section class="jat-section"><h3>Taller</h3><label class="ax-switch"><input name="in_workshop" type="checkbox" ${log.in_workshop?'checked':''}><span>La unidad ingresó a taller durante esta jornada</span></label>
          <label class="ax-field" id="jat-workshop"${log.in_workshop?'':' hidden'}><span>Detalle del taller</span><textarea class="ax-textarea" name="workshop_detail">${esc(log.workshop_detail||'')}</textarea></label></section>
        <section class="jat-section"><h3>Notas de la jornada</h3><textarea class="ax-textarea" name="notas" aria-label="Notas de la jornada">${esc(log.notas||'')}</textarea></section>
        <section class="jat-section"><h3>Motivo del cierre *</h3><textarea class="ax-textarea" name="reason" aria-label="Motivo del cierre" placeholder="Ej.: el chofer olvidó cerrar la jornada"></textarea>
          ${quickReasons(['El chofer olvidó cerrar la jornada','Chofer sin conexión','Cierre administrativo del día'])}</section>${errorBox('jat-close-error')}</form>`,
      footer:`<button class="ax-btn" type="button" data-jat-close>Cancelar</button><button class="ax-btn ax-btn-primary" type="submit" form="jat-close-form" id="jat-close-save" disabled>${ic('lock')} Cerrar jornada</button>`});
    const form=root.querySelector('#jat-close-form'), save=root.querySelector('#jat-close-save');
    bindTimeMask(root);
    function refresh(){
      const fd=new FormData(form), reason=String(fd.get('reason')||'').trim(), kmFin=fd.get('km_final'), hFin=fd.get('hora_fin');
      root.querySelector('#jat-workshop').hidden=!form.elements.in_workshop.checked;
      const hsFin=conHoras?parseHs(fd.get('horas_final')):null, hsIni=conHoras?Number(log.horas_inicio):null;
      const exc=form.elements.km_excepcion.checked, sum=tripSummary(log.km_inicio,kmFin,timeVal(log.hora_inicio),hFin,exc,hsIni,hsFin), badTime=!validTime(hFin);
      const hsBad=Number.isNaN(hsFin);
      root.querySelector('#jat-trip').innerHTML=(sum.text?`<b>Recorrido:</b> ${esc(sum.text)}`:'')+sum.problems.map(p=>`<span class="jat-problem">${ic('triangle-alert')} ${esc(p)}</span>`).join('')+(hFin&&badTime?`<span class="jat-problem">${ic('triangle-alert')} Escribí la hora como hh:mm (24 h).</span>`:'')+(hsBad?`<span class="jat-problem">${ic('triangle-alert')} Escribí las horas de motor como número, por ejemplo 1234,5.</span>`:'');
      const needExc=kmFin!==''&&nz(kmFin)<nz(log.km_inicio); root.querySelector('#jat-exc').hidden=!(needExc||exc);
      save.disabled=!(kmFin!==''&&!badTime&&!hsBad&&reason.length>=5&&!sum.problems.some(p=>p.startsWith('El KM final es menor')||p.startsWith('Las horas de motor finales son menores')));
    }
    form.addEventListener('input',refresh); form.addEventListener('change',refresh); bindQuickReasons(root,refresh); refresh();
    form.addEventListener('submit',async e=>{
      e.preventDefault(); if(save.disabled)return; const fd=new FormData(form);
      const reason=String(fd.get('reason')||'').trim();
      const payload={km_final:fd.get('km_final'),hora_fin:fd.get('hora_fin'),km_excepcion:form.elements.km_excepcion.checked,in_workshop:form.elements.in_workshop.checked,workshop_detail:fd.get('workshop_detail'),notas:fd.get('notas')};
      if(conHoras){const hs=parseHs(fd.get('horas_final'));if(hs!=null)payload.horas_final=hs;}
      save.disabled=true;save.textContent='Cerrando…';
      try{const {data,error}=await db().rpc('close_daily_log_admin',{p_log_id:log.log_id,p_payload:payload,p_reason:reason});if(error)throw error;closeToolModal();notify(data?.rendicion_exists?'Jornada cerrada desde Administración':'Jornada cerrada. Rendición pendiente de presentación/revisión.');await refreshCurrent(log.log_id);setTimeout(surfacePayrollReviews,0);}catch(error){showError(root,'#jat-close-error',errorText(error));save.disabled=false;save.innerHTML=`${ic('lock')} Cerrar jornada`;}
    });
  }

  function voidModal(){
    if(!isAdmin())return; const det=state.current,log=det?.log;if(!log)return;
    const linked=[['remito','remitos','file-text',det.trips?.length||0],['carga de combustible','cargas de combustible','fuel',det.fuel_records?.length||0],['rendición','rendiciones','wallet',det.rendicion?1:0],['control de neumáticos','controles de neumáticos','disc',det.tire_check?1:0],['incidente','incidentes','triangle-alert',det.incidents?.length||0]].filter(x=>x[3]>0);
    const root=mountModal({title:'Anular jornada',subtitle:who(det),isStatic:true,
      body:`${alertBox('danger','triangle-alert','<b>La jornada se anulará, no se borrará físicamente.</b> Se preservan remitos, combustible, rendición, checklist, auditoría y trazabilidad, y se puede restaurar desde <b>Jornadas anuladas</b>.')}
        <section class="jat-section"><h3>Registros vinculados</h3>${linked.length?`<ul class="jat-linked">${linked.map(([s,p,icon,n])=>`<li>${ic(icon)}<span>${n} ${n===1?s:p}</span></li>`).join('')}</ul>`:'<p class="jat-impact-note">Sin registros vinculados.</p>'}</section>
        <form id="jat-void-form" novalidate><section class="jat-section"><h3>Motivo de la anulación *</h3><textarea class="ax-textarea" name="reason" aria-label="Motivo de la anulación" placeholder="Ej.: jornada duplicada creada por error"></textarea>
          ${quickReasons(['Jornada duplicada creada por error','Chofer equivocado','Móvil equivocado','Jornada de prueba'])}</section>${errorBox('jat-void-error')}</form>`,
      footer:`<button class="ax-btn" type="button" data-jat-close>Cancelar</button><button class="ax-btn ax-btn-danger" type="submit" form="jat-void-form" id="jat-void-save" disabled>Anular jornada</button>`});
    const form=root.querySelector('#jat-void-form'), save=root.querySelector('#jat-void-save');
    const refresh=()=>{save.disabled=String(form.elements.reason.value||'').trim().length<5;};
    form.addEventListener('input',refresh); bindQuickReasons(root,refresh);
    form.addEventListener('submit',async e=>{e.preventDefault();if(save.disabled)return;const reason=String(form.elements.reason.value||'').trim();save.disabled=true;save.textContent='Anulando…';try{const {error}=await db().rpc('void_daily_log_admin',{p_log_id:log.log_id,p_reason:reason});if(error)throw error;closeToolModal();if(typeof closeModal==='function')closeModal('modal-jornada-detalle');notify('Jornada anulada. La trazabilidad fue preservada.');if(typeof window._jadminReload==='function')await window._jadminReload();setTimeout(surfacePayrollReviews,0);}catch(error){showError(root,'#jat-void-error',errorText(error));save.disabled=false;save.textContent='Anular jornada';}});
  }

  /* Historial de cambios: línea de tiempo con quién, cuándo y valor anterior → nuevo. */
  const HISTORY_LABELS={km_inicio:'KM inicial',km_final:'KM final',hora_inicio:'Hora inicio',hora_fin:'Hora fin',horas_inicio:'Horas de motor al inicio',horas_final:'Horas de motor al final',status:'Estado',in_workshop:'Taller',workshop_detail:'Detalle del taller',notas:'Notas'};
  function historyValue(key,value){
    if(value===null||value===undefined||value==='')return '—';
    if(typeof value==='boolean')return value?'Sí':'No';
    if(key==='km_inicio'||key==='km_final')return fmtKm(value);
    if(key==='hora_inicio'||key==='hora_fin')return fmtTime(value);
    if(key==='horas_inicio'||key==='horas_final')return `${fmtHs(value)} h`;
    if(key==='status')return {open:'Abierta',closed:'Cerrada',voided:'Anulada',void:'Anulada'}[value]||String(value);
    return String(value);
  }
  function changedFields(before={},after={}){
    return Object.keys(HISTORY_LABELS).filter(k=>JSON.stringify(before?.[k])!==JSON.stringify(after?.[k]))
      .map(k=>`<div class="jat-history-change"><b>${esc(HISTORY_LABELS[k])}</b><span><s>${esc(historyValue(k,before?.[k]))}</s> → <em>${esc(historyValue(k,after?.[k]))}</em></span></div>`).join('');
  }
  function operationMeta(op){
    const o=String(op||'').toLowerCase();
    if(/void|anul/.test(o))return {label:'Anulación',icon:'trash-2',tone:'danger'};
    if(/restor/.test(o))return {label:'Restauración',icon:'refresh-cw',tone:'ok'};
    if(/close|cierre/.test(o))return {label:'Cierre',icon:'lock',tone:''};
    if(/insert|create|alta/.test(o))return {label:'Creación',icon:'plus',tone:''};
    return {label:'Corrección',icon:'pencil',tone:''};
  }
  async function historyModal(){
    const log=currentLog();if(!log)return; const root=mountModal({title:'Historial de cambios',subtitle:who(state.current),wide:true,body:'<div id="jat-history-list" class="ax-empty">Cargando historial…</div>',footer:'<button class="ax-btn" type="button" data-jat-close>Cerrar</button>'});
    try{const {data,error}=await db().rpc('get_daily_log_admin_history',{p_log_id:log.log_id});if(error)throw error;const el=root.querySelector('#jat-history-list');
      if(!data?.length){el.innerHTML=`${ic('history')}<b>Todavía no hay cambios auditados</b><span>Cuando alguien corrija, cierre o anule la jornada, queda registrado acá.</span>`;return;}
      el.className='';
      el.innerHTML=`<p class="jat-history-count">${data.length} ${data.length===1?'cambio':'cambios'} · del más nuevo al más viejo</p><ol class="jat-timeline">${data.map(x=>{const m=operationMeta(x.operation);const reason=x.after_data?.correction_reason;return `<li class="jat-history-item ${m.tone?'is-'+m.tone:''}"><span class="jat-history-dot">${ic(m.icon)}</span><div><div class="jat-history-head"><b>${m.label}</b><span>${esc(x.actor_name||'Sistema')} · ${new Date(x.occurred_at).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}</span></div>${changedFields(x.before_data,x.after_data)||'<div class="jat-history-change"><span>Actualización sin cambios operativos visibles.</span></div>'}${reason?`<blockquote class="jat-reason">${esc(reason)}</blockquote>`:''}</div></li>`;}).join('')}</ol>`;
    }catch(error){const el=root.querySelector('#jat-history-list');el.className='';el.innerHTML=alertBox('danger','circle-alert',esc(errorText(error)));}
  }

  async function openRemitoCanonical(trip){
    try{const id=trip?.trip_id;if(!id)throw new Error('Remito sin identificador');if(typeof window.abrirDetalleRemitoAdmin!=='function')throw new Error('La vista administrativa de Remitos no está disponible');if(typeof closeModal==='function')closeModal('modal-jornada-detalle');if(typeof goTo==='function')goTo('remitos');if(typeof cargarRemitos==='function')await cargarRemitos();await window.abrirDetalleRemitoAdmin(id);}catch(error){notify(errorText(error),'error');}
  }
  async function openFleetCanonical(tab,truckId,recordId=null){
    if(!truckId)return notify('La jornada no tiene móvil asociado','error');if(typeof closeModal==='function')closeModal('modal-jornada-detalle');if(typeof goTo==='function')goTo('camion');
    try{if(window.AuxiliosDetalleCamion)await window.AuxiliosDetalleCamion.abrir(truckId,{seccion:tab,carga:recordId});else if(typeof window._abrirCamionDetalleAdmin==='function')await window._abrirCamionDetalleAdmin(truckId);}catch(error){notify(errorText(error),'error');}
  }
  function openRenditionCanonical(rend){
    /* La rendición mensual se abre en el detalle del chofer de Sueldos (ya no hay pestaña Rendiciones). */
    const log=currentLog()||{},date=String(rend?.fecha||log.log_date||'').slice(0,10),driver=log.driver_id||rend?.driver_id;
    if(typeof closeModal==='function')closeModal('modal-jornada-detalle');if(typeof goTo==='function')goTo('sueldos');
    if(!driver||!/^\d{4}-\d{2}/.test(date)||!window.PayrollView?.openCash)return;
    const period=Number(date.slice(0,4))*100+Number(date.slice(5,7));
    setTimeout(()=>{window.PayrollView.openCash(driver,period,log.chofer?.full_name||'').catch(error=>notify(errorText(error),'error'));},120);
  }


  function addHint(el,label='Abrir →'){if(!el||el.querySelector('.jat-open-hint'))return;const hint=document.createElement('span');hint.className='jat-open-hint';hint.textContent=label;(el.querySelector('.lft > div:first-child, h4, .v')||el).appendChild(hint);}
  function makeClickable(el,handler,label){if(!el||el.dataset.jatClickable==='1')return;el.dataset.jatClickable='1';el.classList.add('jat-clickable');el.tabIndex=0;el.setAttribute('role','button');const run=e=>{if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;if(e.target.closest('button,a,input,select,textarea'))return;e.preventDefault();handler();};el.addEventListener('click',run);el.addEventListener('keydown',run);addHint(el,label);}
  function cardByTitle(fragment){return [...document.querySelectorAll('#jd-content .jd-card')].find(c=>(c.querySelector('h4')?.textContent||'').toLowerCase().includes(fragment.toLowerCase()));}

  async function restoreModal(row){
    const root=mountModal({title:'Restaurar jornada',subtitle:`${fmtDate(row.log_date)} · ${row.driver_name||'—'} · ${row.truck_plate||'—'}`,isStatic:true,
      body:`${alertBox('','info','Se restaurará con su estado anterior y se volverán a calcular odómetro y liquidaciones afectadas.')}<form id="jat-restore-form" novalidate><section class="jat-section"><h3>Motivo de la restauración *</h3><textarea class="ax-textarea" name="reason" aria-label="Motivo de la restauración" placeholder="Ej.: se anuló por error"></textarea>${quickReasons(['Se anuló por error','La jornada sí correspondía'])}</section>${errorBox('jat-restore-error')}</form>`,
      footer:'<button class="ax-btn" type="button" data-jat-close>Cancelar</button><button class="ax-btn ax-btn-primary" type="submit" form="jat-restore-form" id="jat-restore-save" disabled>Restaurar jornada</button>'});
    const form=root.querySelector('#jat-restore-form'),save=root.querySelector('#jat-restore-save');
    const refresh=()=>{save.disabled=String(form.elements.reason.value||'').trim().length<5;};
    form.addEventListener('input',refresh);bindQuickReasons(root,refresh);
    form.addEventListener('submit',async e=>{e.preventDefault();if(save.disabled)return;const reason=String(form.elements.reason.value||'').trim();save.disabled=true;save.textContent='Restaurando…';try{const {error}=await db().rpc('restore_daily_log_admin',{p_log_id:row.log_id,p_reason:reason});if(error)throw error;closeToolModal();notify('Jornada restaurada y derivados recalculados');if(typeof window._jadminReload==='function')await window._jadminReload();setTimeout(surfacePayrollReviews,0);}catch(error){showError(root,'#jat-restore-error',errorText(error));save.disabled=false;save.textContent='Restaurar jornada';}});
  }
  async function voidedListModal(){
    if(!isAdmin())return;const root=mountModal({title:'Jornadas anuladas',subtitle:'Se conservan con todos sus registros y se pueden restaurar',wide:true,body:'<div id="jat-voided-list" class="ax-empty">Cargando…</div>',footer:'<button class="ax-btn" type="button" data-jat-close>Cerrar</button>'});
    const el=root.querySelector('#jat-voided-list');
    try{const {data,error}=await db().rpc('list_voided_daily_logs_admin',{p_limit:100});if(error)throw error;
      if(!data?.length){el.innerHTML=`${ic('circle-check')}<b>No hay jornadas anuladas</b>`;return;}
      el.className='';
      el.innerHTML=`<div class="jat-voided-table">${data.map((r,i)=>`<div class="jat-voided-row"><div><b>${fmtDate(r.log_date)} · ${esc(r.driver_name||'—')}</b><span>${esc(r.truck_plate||'—')} · ${Number(r.km_inicio||0).toLocaleString('es-AR')} → ${Number(r.km_final||0).toLocaleString('es-AR')} km · #${r.log_id}</span><small>${esc(r.void_reason||'Sin motivo')}</small></div><button class="ax-btn" type="button" data-restore-index="${i}">${ic('refresh-cw')} Restaurar</button></div>`).join('')}</div>`;
      el.querySelectorAll('[data-restore-index]').forEach(btn=>btn.addEventListener('click',()=>restoreModal(data[Number(btn.dataset.restoreIndex)])));
    }catch(error){el.className='';el.innerHTML=alertBox('danger','circle-alert',esc(errorText(error)));}
  }
  // "Jornadas anuladas" es un acceso rapido mas: va al final de la fila de
  // chips de estado, con el mismo cuerpo. Abre exactamente el mismo modal.
  function installVoidedButton(){
    if(!isAdmin()||$('jat-open-voided'))return;
    const chips=$('jadmin-chips-estado');
    const host=chips||$('jadmin-f-clear')?.parentElement;
    if(!host)return;
    const btn=document.createElement('button');
    btn.id='jat-open-voided';btn.type='button';
    btn.className=chips?'chip':'btn btn-ghost';
    btn.textContent='Jornadas anuladas';
    btn.addEventListener('click',voidedListModal);
    host.appendChild(btn);
  }

  async function surfacePayrollReviews(){
    if(!allowed()||!db())return;
    try{
      const {data,error}=await db().from('payroll_liquidaciones').select('liquidacion_id,estado,review_required,review_reason,proposed_total,adjustment_pending').eq('review_required',true).limit(200);
      if(error)throw error;
      const screen=$('screen-sueldos');
      for(const item of (data||[])){
        const rows=[...(screen?.querySelectorAll('tr[onclick]')||[])];
        const row=rows.find(el=>(el.getAttribute('onclick')||'').includes(item.liquidacion_id));
        if(row){
          const cell=row.querySelector('td');
          cell?.querySelector('.jat-payroll-review')?.remove();
          if(cell){const badge=document.createElement('div');badge.className='jat-payroll-review';const delta=Number(item.adjustment_pending||0);badge.textContent=item.estado==='pagada'?`Ajuste pendiente ${fmtMoney(delta)}`:`Requiere revisión · Δ ${delta>=0?'+':''}${fmtMoney(delta)}`;badge.title=item.review_reason||'Corrección administrativa posterior';cell.appendChild(badge);}
        }
        if(typeof _reciboActual!=='undefined'&&_reciboActual?.liquidacion_id===item.liquidacion_id){
          const estado=$('rec-estado');let warning=$('jat-payroll-receipt-review');if(!warning&&estado?.parentElement){warning=document.createElement('div');warning.id='jat-payroll-receipt-review';warning.className='jat-payroll-receipt-review';estado.parentElement.appendChild(warning);}if(warning){const delta=Number(item.adjustment_pending||0);warning.textContent=item.estado==='pagada'?`Requiere ajuste: ${fmtMoney(delta)}. El pago original se conserva.`:`Requiere revisión. Total propuesto: ${fmtMoney(item.proposed_total)} · diferencia ${delta>=0?'+':''}${fmtMoney(delta)}.`;warning.title=item.review_reason||'';}
        }
      }
    }catch(error){console.warn('[JornadasAdminTools] payroll review surface',error?.message||error);}
  }
  function installPayrollImpactSurface(){
    const nav=$('nav-sueldos');if(nav&&!nav.dataset.jatPayrollHook){nav.dataset.jatPayrollHook='1';nav.addEventListener('click',()=>setTimeout(surfacePayrollReviews,250));}
    if(state.payrollWrapped)return;
    let wrappedAny=false;
    if(typeof window._renderLiquidacionesMes==='function'&&!window._renderLiquidacionesMes.__jatImpactWrapped){const original=window._renderLiquidacionesMes;const wrapped=function(...args){const result=original.apply(this,args);setTimeout(surfacePayrollReviews,0);return result;};wrapped.__jatImpactWrapped=true;window._renderLiquidacionesMes=wrapped;wrappedAny=true;}
    if(typeof window._abrirReciboPayroll==='function'&&!window._abrirReciboPayroll.__jatImpactWrapped){const original=window._abrirReciboPayroll;const wrapped=async function(...args){const result=await original.apply(this,args);setTimeout(surfacePayrollReviews,0);return result;};wrapped.__jatImpactWrapped=true;window._abrirReciboPayroll=wrapped;wrappedAny=true;}
    state.payrollWrapped=wrappedAny||state.payrollWrapped;
  }

  function installFooterActions(){
    const footer=$('modal-jornada-detalle')?.querySelector('.modal-footer');if(!footer)return;footer.querySelector('#jat-jornada-actions')?.remove();const actions=document.createElement('div');actions.id='jat-jornada-actions';actions.className='jat-actions';
    const canClose=isAdmin()&&currentLog()?.status==='open';
    actions.innerHTML=`${isAdmin()?'<button class="ax-btn" type="button" data-jat-edit><svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#pencil"/></svg> Editar jornada</button>':''}${canClose?'<button class="ax-btn ax-btn-primary" type="button" data-jat-close-journey><svg class="ax-icon" aria-hidden="true"><use href="/ui/icons.svg#lock"/></svg> Cerrar jornada</button>':''}<button class="ax-btn" type="button" data-jat-history>Historial</button>${isAdmin()?'<button class="ax-btn jat-btn-danger" type="button" data-jat-void>Anular jornada</button>':''}`;
    actions.querySelector('[data-jat-edit]')?.addEventListener('click',editModal);actions.querySelector('[data-jat-close-journey]')?.addEventListener('click',closeJourneyModal);actions.querySelector('[data-jat-history]')?.addEventListener('click',historyModal);actions.querySelector('[data-jat-void]')?.addEventListener('click',voidModal);footer.prepend(actions);
  }
  function enhanceDetail(det){
    state.current=det;installFooterActions();
    const serviceItems=[...(cardByTitle('servicios')?.querySelectorAll('.jd-item')||[])];serviceItems.forEach((el,i)=>{if(det.trips?.[i])makeClickable(el,()=>openRemitoCanonical(det.trips[i]),'Abrir Remito admin →');});
    const fuelItems=[...(cardByTitle('combustible')?.querySelectorAll('.jd-item')||[])];fuelItems.forEach((el,i)=>{if(det.fuel_records?.[i])makeClickable(el,()=>openFleetCanonical('combustible',det.log?.truck_id,det.fuel_records[i].fuel_id),'Abrir →');});
    const tireCard=cardByTitle('neumáticos');if(det.tire_check&&tireCard)makeClickable(tireCard,()=>openFleetCanonical('neumaticos',det.log?.truck_id),'Abrir Checklist →');
    const rendCard=cardByTitle('rendición');if(det.rendicion&&rendCard)makeClickable(rendCard,()=>openRenditionCanonical(det.rendicion),'Abrir Rendición →');
  }
  function install(){
    if(!allowed())return;installVoidedButton();installPayrollImpactSurface();if(state.installed)return;if(typeof window._jadminRenderDetalle!=='function')return;state.originalRender=window._jadminRenderDetalle;if(state.originalRender.__jatWrapped){state.installed=true;return;}const wrapped=function(det,...args){const result=state.originalRender.call(this,det,...args);try{enhanceDetail(det);}catch(error){console.error('[JornadasAdminTools] enhanceDetail',error);}return result;};wrapped.__jatWrapped=true;window._jadminRenderDetalle=wrapped;state.installed=true;
  }
  let attempts=0;const timer=setInterval(()=>{attempts++;install();if((state.installed&&state.payrollWrapped&&$('jat-open-voided'))||attempts>160)clearInterval(timer);},75);window.addEventListener('auxilios:features-ready',install);
  window.JornadasAdminToolsV1={edit:editModal,closeJourney:closeJourneyModal,voidJourney:voidModal,history:historyModal,voided:voidedListModal,enhance:enhanceDetail,surfacePayrollReviews};
})();
