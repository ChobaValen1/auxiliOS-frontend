// Variable global: jornada activa del chofer (persiste en localStorage entre reinicios)
let _jornadaActivaLocal = null;

function _validarPatente(val) {
  const el = document.getElementById('warn-patente');
  if (!el) return;
  const n = val.length;
  if (n === 0 || n >= 6) {
    el.textContent = '';
    el.className = 'rem-warn-patente';
  } else if (n <= 3) {
    el.textContent = '⚠️ La patente parece muy corta. Verificá que esté completa.';
    el.className = 'rem-warn-patente warn-strong';
  } else {
    el.textContent = 'La patente tiene menos de 6 caracteres. Formato: ABC123 o AB123CD';
    el.className = 'rem-warn-patente warn-soft';
  }
}

// ── REPARACIÓN DE ESTRUCTURA DOM ──────────────────────────────
// El browser anidó elementos incorrectamente por tags mal cerrados.
// Este bloque los reubica antes de que el usuario interactúe.
// ── FUNCIÓN DEL AUDITOR (Va afuera del DOMContentLoaded, flotando libre) ──
function auditarPagosActivos() {
  const totalStr = document.getElementById('imp-total')?.textContent || '$0';
  const totalVal = parseFloat(totalStr.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
  const opcionesPago = document.querySelectorAll('#rem-pago-opts > div, #rem-pago-opts2 > div');

  if (totalVal === 0) {
    opcionesPago.forEach(btn => {
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.4';
      btn.style.borderColor = 'var(--border)'; 
    });
    const m1 = document.getElementById('pago1-monto'); if (m1) m1.value = '';
    const m2 = document.getElementById('pago2-monto'); if (m2) m2.value = '';
  } else {
    opcionesPago.forEach(btn => {
      btn.style.pointerEvents = 'auto';
      btn.style.opacity = '1';
    });
  }
}

// ── UX PROACTIVA: TACHADO CRUZADO DE PAGOS ──────────────────

function actualizarPagosCruzados() {
  const opts1 = document.querySelectorAll('#rem-pago-opts > div');
  const opts2 = document.querySelectorAll('#rem-pago-opts2 > div');

  // 1. Limpiamos cualquier tachadura previa
  opts1.forEach(btn => btn.classList.remove('pago-tachado'));
  opts2.forEach(btn => btn.classList.remove('pago-tachado'));

  // 2. Función helper para obtener el nombre del medio seleccionado
  const getNombreSeleccionado = (grupoId) => {
    const seleccionado = document.querySelector(`${grupoId} > div[style*="var(--amber)"]`);
    return seleccionado ? seleccionado.querySelector('div:last-child')?.textContent?.trim() : null;
  };

  const medio1 = getNombreSeleccionado('#rem-pago-opts');
  const medio2 = getNombreSeleccionado('#rem-pago-opts2');

  // 3. Cruzamos los bloqueos (Tachamos en el Grupo 2 lo que está en el Grupo 1)
  if (medio1) {
    opts2.forEach(btn => {
      if (btn.querySelector('div:last-child')?.textContent?.trim() === medio1) {
        btn.classList.add('pago-tachado');
      }
    });
  }

  // 4. Tachamos en el Grupo 1 lo que está en el Grupo 2
  if (medio2) {
    opts1.forEach(btn => {
      if (btn.querySelector('div:last-child')?.textContent?.trim() === medio2) {
        btn.classList.add('pago-tachado');
      }
    });
  }
}

// ── INICIALIZACIÓN PRINCIPAL DE LA APP ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const screenRemitos = document.getElementById('screen-remitos');

  // 1. remitos-firma y remitos-nuevo → hijos directos de screen-remitos
  ['remitos-firma', 'remitos-nuevo', 'remitos-detalle'].forEach(id => {
    const el = document.getElementById(id);
    if (el && screenRemitos && el.parentElement.id !== 'screen-remitos') {
      screenRemitos.appendChild(el);
    }
  });

  // 2. Modales → hijos directos de body (¡FIX DE LLAVES ACÁ!)
  ['modal-ver-remito', 'modal-anular-remito', 'modal-nueva-jornada', 'modal-cerrar-jornada', 'modal-taller-pregunta', 'modal-rendicion-cierre'].forEach(id => {
    const modal = document.getElementById(id);
    if (modal && modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
  }); // <-- ACÁ CIERRA EL FOREACH CORRECTAMENTE

  // 3. Boton Configuración (Global)
  const btnSettings = document.getElementById('btn-admin-settings');
  if (btnSettings) {
    btnSettings.style.display = 'flex'; 
  }

  // 4. INICIALIZACIÓN: AUDITOR DE PAGOS 
  auditarPagosActivos(); // Ejecuta una vez al inicio por si el total arranca en $0

  // 4A. Escuchar cambios al tipear importes (Acá audita que no sea $0)
  ['imp-peaje', 'imp-excedente', 'imp-otros'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', () => {
        setTimeout(() => {
            auditarPagosActivos();
            // Limpiamos los tachados si el chofer borró los montos y volvió a $0
            if (typeof actualizarPagosCruzados === 'function') actualizarPagosCruzados(); 
        }, 50); 
      });
    }
  });

  // 4B. Escuchar clicks en los medios de pago (ACÁ VA EL TACHADO)
  document.querySelectorAll('#rem-pago-opts > div, #rem-pago-opts2 > div').forEach(btn => {
    btn.addEventListener('click', function(e) {
      const totalStr = document.getElementById('imp-total')?.textContent || '$0';
      const totalVal = parseFloat(totalStr.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;

      // Si es 0, rebota y no hace nada
      if (totalVal === 0) {
         toast('Primero ingresá los montos extras antes de elegir el medio', 'warning');
         e.stopPropagation();
         return;
      }

      // Validación Cruzada (No mismo medio)
      const esGrupo1 = this.closest('#rem-pago-opts') !== null;
      const nombreMedio = this.querySelector('div:last-child')?.textContent?.trim();
      const otroGrupoId = esGrupo1 ? '#rem-pago-opts2' : '#rem-pago-opts';
      const seleccionadoOtro = document.querySelector(`${otroGrupoId} [style*="border-color: var(--amber)"], ${otroGrupoId} [style*="border-color:var(--amber)"]`);
      const nombreOtro = seleccionadoOtro?.querySelector('div:last-child')?.textContent?.trim();

      if (nombreMedio === nombreOtro && nombreMedio !== undefined) {
         toast(`El medio "${nombreMedio}" ya está seleccionado. Elegí uno distinto.`, 'error');
         setTimeout(() => { this.style.borderColor = 'var(--border)'; }, 10);
      }

      // 🚨 MAGIA VISUAL: Ejecutamos la función de tachar medio de pago
      setTimeout(actualizarPagosCruzados, 15);
    });
  });

  // 4B. Escuchar clicks en los medios de pago (Anti-Duplicados y Anti-$0)
  document.querySelectorAll('#rem-pago-opts > div, #rem-pago-opts2 > div').forEach(btn => {
    btn.addEventListener('click', function(e) {
      const totalStr = document.getElementById('imp-total')?.textContent || '$0';
      const totalVal = parseFloat(totalStr.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;

      // Si es 0, rebota
      if (totalVal === 0) {
         toast('Primero ingresá los montos extras antes de elegir el medio', 'warning');
         e.stopPropagation();
         return;
      }

      // Validación Cruzada (No mismo medio)
      const esGrupo1 = this.closest('#rem-pago-opts') !== null;
      const nombreMedio = this.querySelector('div:last-child')?.textContent?.trim();
      const otroGrupoId = esGrupo1 ? '#rem-pago-opts2' : '#rem-pago-opts';
      const seleccionadoOtro = document.querySelector(`${otroGrupoId} [style*="border-color: var(--amber)"], ${otroGrupoId} [style*="border-color:var(--amber)"]`);
      const nombreOtro = seleccionadoOtro?.querySelector('div:last-child')?.textContent?.trim();

      if (nombreMedio === nombreOtro && nombreMedio !== undefined) {
         toast(`El medio "${nombreMedio}" ya está seleccionado. Elegí uno distinto.`, 'error');
         setTimeout(() => { this.style.borderColor = 'var(--border)'; }, 10);
      }
    });
  });

});
// ── SCREENS ──────────────────────────────────
const SCREENS = {
  dashboard:  { title:'PANEL PRINCIPAL',    sub:'Resumen por Chofer' }, 
  registro:   { title:'REGISTRO DIARIO',    sub:'Módulo 1 · Carga de kilómetros' },
  camion:     { title:'CONTROL DEL CAMIÓN', sub:'Módulo 2 · Revisión y Carga' },
  documentos: { title:'DOCUMENTACIÓN',      sub:'Módulo 3 · Vencimientos y archivos' },
  remitos:    { title:'REMITOS VIRTUALES',  sub:'Módulo 4 · Firma digital y archivo' },
};

function goTo(name) {
  if (name !== 'chofer') _resetJornadasMobile();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('nav-' + name).classList.add('active');
  document.getElementById('topbar-title').textContent = SCREENS[name].title;
  document.getElementById('topbar-sub').textContent   = SCREENS[name].sub;
  if (name === 'dashboard') cargarDashboard();
  if (name === 'registro') actualizarPantallaJornadas();
  if (name === 'camion') cargarScreenCamion();
  if (name === 'documentos') cargarDocumentos();
  if (name === 'remitos') {
    showRemitosView('lista');
    cargarRemitos();
  }
}

function toggleWorkshop(row) {
  const toggle = row.querySelector('.toggle');
  const detail = document.getElementById('workshop-detail');
  toggle.classList.toggle('on');
  detail.style.display = toggle.classList.contains('on') ? 'block' : 'none';
}

// filter tabs behaviour
document.querySelectorAll('.filter-tabs').forEach(group => {
  group.querySelectorAll('.ftab').forEach(tab => {
    tab.addEventListener('click', () => {
      group.querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
});


// ── MODALS ───────────────────────────────────

function openFuelModal() {
  if (!_truckActual?.truck_id) { toast('No hay un camión activo para esta jornada', 'error'); return; }
  const info = document.getElementById('cb-camion-info');
  if (info) info.textContent = `${_truckActual.plate || '—'} · ${_truckActual.brand || ''} ${_truckActual.model || ''}`;
  const fecha = document.getElementById('cb-fecha');
  if (fecha) fecha.value = new Date().toISOString().slice(0, 10);
  ['cb-litros','cb-precio','cb-km','cb-estacion'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const scanStatus = document.getElementById('cb-scan-status'); if (scanStatus) scanStatus.style.display = 'none';
  const total = document.getElementById('cb-total'); if (total) total.textContent = '$0';
  const appSel = document.getElementById('cb-app-select'); if (appSel) appSel.style.display = 'none';
  document.querySelectorAll('[id^="cb-efectivo"],[id^="cb-transferencia"],[id^="cb-app"]').forEach(el => { el.style.borderColor = 'var(--border)'; el.style.background = 'var(--bg)'; });
  selectedPayMethod = ''; selectedApp = '';
  _modalError('cb-error', '');
  openModal('modal-combustible');
}
async function openPlanModal() {
  // 1. Verificamos que ya haya un camión seleccionado en la jornada
  if (!_truckActual?.truck_id) { 
    toast('Seleccioná un camión de la flota primero', 'error'); 
    return; 
  }

  // 2. Escribimos la info del camión en el modal
  const info = document.getElementById('ap-camion-info');
  if (info) {
    const nombre = `${_truckActual.brand || ''} ${_truckActual.model || ''}`.trim();
    info.textContent = `${nombre} · ${_truckActual.plate || ''}`.trim().replace(/^·\s*/, '') || '—';
  }

  // 3. Abrimos el modal y preparamos el selector
  const select = document.getElementById('ap-plan-select');
  if (select) select.innerHTML = '<option value="">⏳ Cargando catálogo...</option>';
  
  // OJO AQUÍ: Asegúrate de que el ID coincida con tu HTML
  openModal('modal-asignar-plan'); 

  // 4. Buscamos los planes maestros en la base de datos
  const catalogo = await cargarCatalogoPlanes();

  // 5. Poblamos la lista
  if (select) {
    if (catalogo.length === 0) {
      select.innerHTML = '<option value="">⚠️ No hay planes globales creados</option>';
      return;
    }

    select.innerHTML = '<option value="">— Seleccioná un plan del catálogo —</option>';
    catalogo.forEach(plan => {
      const opt = document.createElement('option');
      opt.value = plan.id;
      
      const cadencia = plan.interval_km ? `${plan.interval_km.toLocaleString('es-AR')} km` : `${plan.interval_hours} hs`;
      opt.textContent = `${plan.name} (Cada ${cadencia})`;
      
      select.appendChild(opt);
    });
  }
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) { console.warn('⚠️ Modal no encontrado:', id); return; }
  m.classList.remove('open');
  m.style.display = m.classList.contains('modal-overlay') ? 'none' : '';
  document.body.style.overflow = '';
}

// Cerrar con click en el backdrop
document.querySelectorAll('.modal-backdrop').forEach(m => {
  m.addEventListener('click', e => {
    if (e.target === m) closeModal(m.id);
  });
});

// Cerrar con tecla ESC
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop.open').forEach(m => closeModal(m.id));
  }
});

// ── ADMINISTRACIÓN DE PLANES GLOBALES ───────────────────────

function openAdminPlanModal() {
  planEditandoId = null;
  ['mg-nombre', 'mg-km', 'mg-hs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const tipoEl = document.getElementById('mg-tipo'); if (tipoEl) tipoEl.value = '';
  const alertaEl = document.getElementById('mg-alerta'); if (alertaEl) alertaEl.value = '500';
  const titulo = document.querySelector('#modal-crear-plan-global .modal-head-title');
  if (titulo) titulo.textContent = '📐 Nuevo Plan Maestro';
  const btnG = document.getElementById('btn-guardar-global');
  if (btnG) btnG.textContent = '💾 Guardar en Catálogo';

  if (typeof toggleAdminPlanFields === 'function') toggleAdminPlanFields();

  const modal = document.getElementById('modal-crear-plan-global');
  if (modal) {
    document.body.appendChild(modal);
    modal.style.zIndex = '10000000';
  }
  openModal('modal-crear-plan-global');
}

function abrirEditarPlan(planId) {
  const plan = (window._planesCache || []).find(p => String(p.id) === String(planId));
  if (!plan) { toast('Plan no encontrado', 'error'); return; }

  planEditandoId = planId;

  const nombreEl = document.getElementById('mg-nombre');
  const tipoEl   = document.getElementById('mg-tipo');
  const kmEl     = document.getElementById('mg-km');
  const hsEl     = document.getElementById('mg-hs');
  const alertaEl = document.getElementById('mg-alerta');

  if (nombreEl) nombreEl.value = plan.name;
  if (tipoEl)   { tipoEl.value = plan.trigger_type; if (typeof toggleAdminPlanFields === 'function') toggleAdminPlanFields(); }
  if (kmEl)     kmEl.value = plan.interval_km || '';
  if (hsEl)     hsEl.value = plan.interval_hours || '';
  if (alertaEl) alertaEl.value = plan.alert_before_km || 500;

  const titulo = document.querySelector('#modal-crear-plan-global .modal-head-title');
  if (titulo) titulo.textContent = '✏️ Editar Plan Maestro';
  const btn = document.getElementById('btn-guardar-global');
  if (btn) btn.textContent = '💾 Actualizar Plan';

  const modal = document.getElementById('modal-crear-plan-global');
  if (modal) { document.body.appendChild(modal); modal.style.zIndex = '10000000'; }
  openModal('modal-crear-plan-global');
}

async function toggleEstadoPlan(planId, estaActivo) {
  if (estaActivo) {
    if (!confirm('¿Dar de baja este plan maestro?')) return;
  }
  const { error } = await _db
    .from('master_service_plans')
    .update({ activo: !estaActivo })
    .eq('id', planId);
  if (error) { toast(`Error: ${error.message}`, 'error'); return; }
  toast(!estaActivo ? 'Plan reactivado' : 'Plan dado de baja', 'success');
  cargarTablaAdminPlanes();
}
function toggleAdminPlanFields() {
  const tipo = document.getElementById('mg-tipo')?.value;
  const rowKm = document.getElementById('mg-km-row');
  const rowHs = document.getElementById('mg-hs-row');

  if (rowKm) rowKm.style.display = (tipo === 'km' || tipo === 'both') ? 'block' : 'none';
  if (rowHs) rowHs.style.display = (tipo === 'hours' || tipo === 'both') ? 'block' : 'none';
}

async function guardarPlanGlobal() {
  const nombre = document.getElementById('mg-nombre')?.value.trim();
  const tipo = document.getElementById('mg-tipo')?.value;
  const km = parseInt(document.getElementById('mg-km')?.value) || null;
  const hs = parseInt(document.getElementById('mg-hs')?.value) || null;
  const alerta = parseInt(document.getElementById('mg-alerta')?.value) || 500;

  // Validaciones
  if (!nombre) { toast('Ingresá el nombre del plan maestro', 'error'); return; }
  if (!tipo) { toast('Seleccioná el tipo de cadencia', 'error'); return; }
  if ((tipo === 'km' || tipo === 'both') && !km) { toast('Ingresá el intervalo de kilómetros', 'error'); return; }
  if ((tipo === 'hours' || tipo === 'both') && !hs) { toast('Ingresá el intervalo de horas', 'error'); return; }

  const btn = document.getElementById('btn-guardar-global');
  if (btn) { btn.textContent = 'Guardando...'; btn.style.pointerEvents = 'none'; }

  if (planEditandoId) {
    const { error } = await _db
      .from('master_service_plans')
      .update({ name: nombre, trigger_type: tipo, interval_km: km, interval_hours: hs, alert_before_km: alerta })
      .eq('id', planEditandoId);
    if (btn) { btn.textContent = '💾 Guardar en Catálogo'; btn.style.pointerEvents = 'auto'; }
    planEditandoId = null;
    if (error) { toast(`Error: ${error.message}`, 'error'); return; }
    toast('Plan actualizado', 'success');
    closeModal('modal-crear-plan-global');
    cargarTablaAdminPlanes();
    return;
  }

  // Armamos el payload
  const datos = {
    name: nombre,
    trigger_type: tipo,
    interval_km: km,
    interval_hours: hs,
    alert_before_km: alerta
  };

  // Llamamos a Supabase (La función que creamos en el paso anterior)
  const resultado = await crearPlanGlobal(datos);

  if (btn) { btn.textContent = '💾 Guardar en Catálogo'; btn.style.pointerEvents = 'auto'; }

  if (resultado.ok) {
    toast('Plan maestro agregado al catálogo exitosamente', 'success');
    closeModal('modal-crear-plan-global');
    cargarTablaAdminPlanes();
  } else {
    toast(`Error al guardar: ${resultado.errorMsg}`, 'error');
  }
}

// ── PAYMENT METHOD SELECTOR ───────────────────
function selectPayment(method) {
  document.querySelectorAll('.payment-opt').forEach(el => {
    el.style.borderColor = 'var(--border)';
    el.style.background  = 'var(--bg)';
  });
  const sel = document.getElementById('pay-' + method);
  sel.style.borderColor = 'var(--amber)';
  sel.style.background  = 'var(--amber-lo)';
  // show app selector only when method = app
  document.getElementById('app-selector').style.display = method === 'app' ? 'block' : 'none';
}

function selectApp(el, name) {
  document.querySelectorAll('.app-opt').forEach(o => {
    o.style.borderColor = 'var(--border)';
    o.style.background  = 'var(--bg)';
  });
  el.style.borderColor = 'var(--cyan)';
  el.style.background  = 'rgba(46,196,214,0.1)';
}

// ── TRIGGER TYPE SELECTOR ─────────────────────
function selectTrigger(type) {
  document.querySelectorAll('.trigger-opt').forEach(el => {
    el.style.borderColor = 'var(--border)';
    el.style.background  = 'var(--bg)';
  });
  const sel = document.getElementById('trig-' + type);
  sel.style.borderColor = 'var(--amber)';
  sel.style.background  = 'var(--amber-lo)';

  const kmInput    = document.getElementById('input-km');
  const hoursInput = document.getElementById('input-hours');
  if (type === 'km')    { kmInput.style.display='block'; hoursInput.style.display='none'; }
  if (type === 'hours') { kmInput.style.display='none';  hoursInput.style.display='block'; }
  if (type === 'both')  { kmInput.style.display='block'; hoursInput.style.display='block'; }
}

// ── REMITO WIZARD ──────────────────────────────────────────
let _remPasoActual = 1;
const REM_TOTAL_PASOS = 5;

function remWizardReset() {
  _remPasoActual = 1;
  _remWizardActualizar();
  
  const ahora = new Date();
  const arStr = ahora.toLocaleString('sv', { timeZone: 'America/Argentina/Buenos_Aires' });
  const dt = document.getElementById('rem-fecha');
  if (dt) dt.value = arStr.replace(' ', 'T').slice(0, 16);
  
  const f = arStr.slice(0,10).replace(/-/g,'');
  const r = Math.floor(Math.random() * 9000) + 1000;
  const nro = document.getElementById('rem-nro');
  if (nro) nro.value = `REM-${f}-${r}`;
  
  if (typeof resetPagoForm === 'function') resetPagoForm();
  if (typeof limpiarFirma === 'function') limpiarFirma();
  
  fotosCount = 0;
  if (typeof updateFotoCounter === 'function') updateFotoCounter();
  
  document.querySelectorAll('.foto-slot').forEach(s => {
    s.classList.remove('loaded');
    s.style.borderColor = ''; s.style.background = '';
    const st = s.querySelector('.pu-text'); if (st) st.textContent = s.getAttribute('data-label') || 'Cargar Foto';
    const prev = s.querySelector('.img-preview'); if (prev) prev.remove();
    const inp = s.querySelector('input[type="file"]'); if (inp) inp.value = '';
  });

  // Limpieza general de inputs de texto
  ['rem-nro-prestadora','rem-patente','rem-marca-modelo','rem-km','rem-origen','rem-destino',
   'rem-cliente','rem-cuit','rem-telefono','imp-peaje','imp-excedente','imp-otros','rem-observaciones'
  ].forEach(id => { 
      const el = document.getElementById(id); 
      if (el) { el.value = ''; el.readOnly = false; el.style.opacity = ''; } 
  });

  const tipo = document.getElementById('rem-tipo-servicio'); 
  if (tipo) tipo.value = 'Servicio de grúa'; 

  const total = document.getElementById('imp-total'); 
  if (total) total.textContent = '$0';

  // Reseteo de Toggles del Paso 5 (Arrastre apagado, el resto encendido)
  document.querySelectorAll('#rem-step-5 .acept-toggle').forEach(row => {
    const t = row.querySelector('.toggle');
    const titulo = row.querySelector('.toggle-title')?.textContent.trim();
    if (t) {
      if (titulo === 'Conformidad de Arrastre') {
          t.classList.remove('on');
      } else {
          t.classList.add('on');
      }
    }
  });

  // Apagar Toggle de Firma de Chofer y resetear título
  const toggleChofer = document.querySelector('#rem-step-5 .toggle-row[onclick*="toggleFirmaChofer"] .toggle');
  if (toggleChofer) toggleChofer.classList.remove('on');
  const labelFirma = document.getElementById('label-firma-canvas');
  if (labelFirma) {
      labelFirma.textContent = '✍️ Firma digital del socio';
      labelFirma.style.color = 'var(--text)';
  }

  // Ejecutar auditores visuales
  if (typeof auditarPagosActivos === 'function') auditarPagosActivos();
  if (typeof actualizarPagosCruzados === 'function') actualizarPagosCruzados();
  if (typeof actualizarProgresoFirmas === 'function') actualizarProgresoFirmas();

  // Limpieza de mensajes de error
  document.querySelectorAll('.rem-error-msg').forEach(e => e.classList.remove('visible'));
  document.querySelectorAll('.rem-field-error').forEach(e => e.classList.remove('rem-field-error'));
}

function _remWizardActualizar() {
  for (let i = 1; i <= REM_TOTAL_PASOS; i++) {
    const panel = document.getElementById(`rem-step-${i}`);
    if (panel) panel.classList.toggle('active', i === _remPasoActual);
  }
  
  const fill = document.getElementById('rem-progress-fill');
  if (fill) fill.style.width = `${(_remPasoActual / REM_TOTAL_PASOS) * 100}%`;
  
  const num = document.getElementById('rem-step-num');
  if (num) num.textContent = _remPasoActual;
  
  document.querySelectorAll('.rem-step-dot').forEach((d, i) => {
    d.classList.remove('active', 'done');
    if (i + 1 < _remPasoActual) d.classList.add('done');
    else if (i + 1 === _remPasoActual) d.classList.add('active');
  });
  
  const btnBack = document.getElementById('rem-btn-back');
  const btnNext = document.getElementById('rem-btn-next');
  
  if (btnBack) btnBack.style.display = _remPasoActual === 1 ? 'none' : '';
  
  if (btnNext) {
    if (_remPasoActual === REM_TOTAL_PASOS) {
      btnNext.textContent = '✅ Finalizar';
      // Conectamos la Cláusula de Guardia antes de guardar (Firma y Toggles obligatorios)
      btnNext.onclick = () => {
          if (typeof validarPaso5Final === 'function' && validarPaso5Final()) {
              finalizarRemito(); 
          }
      };
    } else {
      btnNext.textContent = 'Siguiente →';
      btnNext.onclick = () => remWizardIr(1);
    }
  }
  
  document.querySelector('.content')?.scrollTo(0, 0);
}

function _remWizardActualizar() {
  for (let i = 1; i <= REM_TOTAL_PASOS; i++) {
    const panel = document.getElementById(`rem-step-${i}`);
    if (panel) panel.classList.toggle('active', i === _remPasoActual);
  }
  
  const fill = document.getElementById('rem-progress-fill');
  if (fill) fill.style.width = `${(_remPasoActual / REM_TOTAL_PASOS) * 100}%`;
  
  const num = document.getElementById('rem-step-num');
  if (num) num.textContent = _remPasoActual;
  
  document.querySelectorAll('.rem-step-dot').forEach((d, i) => {
    d.classList.remove('active', 'done');
    if (i + 1 < _remPasoActual) d.classList.add('done');
    else if (i + 1 === _remPasoActual) d.classList.add('active');
  });
  
  const btnBack = document.getElementById('rem-btn-back');
  const btnNext = document.getElementById('rem-btn-next');
  if (btnBack) btnBack.style.display = _remPasoActual === 1 ? 'none' : '';
  
  // ── INYECCIÓN DEL BOTÓN PENDIENTE EN EL FOOTER ──
  const footer = document.querySelector('.rem-wizard-footer');
  let btnPendiente = document.getElementById('btn-pendiente-footer');
  
  // Si no existe el botón en el footer, lo creamos y lo metemos en el medio
  if (!btnPendiente && footer && btnNext) {
      btnPendiente = document.createElement('button');
      btnPendiente.id = 'btn-pendiente-footer';
      btnPendiente.className = 'btn btn-ghost';
      btnPendiente.innerHTML = '💾 Pendiente';
      btnPendiente.onclick = guardarRemitoPendiente;
      // Estilos para que quede alineado perfecto
      btnPendiente.style.flex = '1';
      btnPendiente.style.margin = '0 10px';
      btnPendiente.style.padding = '12px 0';
      btnPendiente.style.fontSize = '14px';
      footer.insertBefore(btnPendiente, btnNext);
  }
  
  if (btnNext) {
    if (_remPasoActual === REM_TOTAL_PASOS) {
      // ESTAMOS EN EL PASO 5 (FIRMA)
      btnNext.textContent = '✅ Finalizar';
      if (btnPendiente) btnPendiente.style.display = 'none';
      btnNext.onclick = () => {
          if (typeof validarPaso5Final === 'function' && validarPaso5Final()) {
              finalizarRemito();
          }
      };
    } else if (_remPasoActual === 1) {
      // PASO 1 — mostrar "Guardar y seguir después"
      btnNext.textContent = 'Siguiente →';
      if (btnPendiente) { btnPendiente.style.display = 'block'; btnPendiente.innerHTML = '💾 Guardar y seguir después'; }
      btnNext.onclick = () => remWizardIr(1);
    } else {
      // PASOS 2 al 4
      btnNext.textContent = 'Siguiente →';
      if (btnPendiente) btnPendiente.style.display = 'none';
      btnNext.onclick = () => remWizardIr(1);
    }
  }
  
  document.querySelector('.content')?.scrollTo(0, 0);
}

function remWizardIr(delta) {
  if (delta > 0 && !_remWizardValidar(_remPasoActual)) return;
  _remPasoActual = Math.max(1, Math.min(REM_TOTAL_PASOS, _remPasoActual + delta));
  _remWizardActualizar();
  if (_remPasoActual === 5 && typeof initCanvas === 'function') {
    setTimeout(() => initCanvas('sig-canvas'), 80);
  }
}

function _remWizardValidar(paso) {
  let ok = true;
  const marcar = (inputId, errorId) => {
    const inp = document.getElementById(inputId);
    const err = document.getElementById(errorId);
    const vacio = !inp || !String(inp.value).trim();
    if (inp) inp.classList.toggle('rem-field-error', vacio);
    if (err) err.classList.toggle('visible', vacio);
    if (vacio) ok = false;
  };
  
  if (paso === 1) {
    marcar('rem-tipo-servicio', 'err-tipo');
    marcar('rem-patente', 'err-patente');
    marcar('rem-origen', 'err-origen');
    marcar('rem-destino', 'err-destino');
  }
  if (paso === 2) {
    marcar('rem-cuit', 'err-dni');
  }
  if (paso === 3) {
    const errorEl = document.getElementById('rem-pago-error');

    // ── NOTA 1: HELPER PARA ERRORES ──
    // Función auxiliar. Muestra el texto rojo en pantalla y marca "ok = false" 
    // para bloquear automáticamente el avance al Paso 4.
    const showError = (msg) => {
      if (errorEl) {
        errorEl.textContent = msg;
        errorEl.classList.add('visible');
      }
      ok = false;
    };

    // ── NOTA 2: LIMPIEZA INICIAL ──
    // Siempre que validamos, apagamos el error viejo para no confundir.
    if (errorEl) errorEl.classList.remove('visible');

    // ── NOTA 3: PARSEO DE MONEDA ARS (EL FIX CRÍTICO) ──
    // Toma "$ 1.250,50" -> Quita el punto -> Cambia coma por punto -> Parsea a 1250.50
    const totalStr = document.getElementById('imp-total')?.textContent || '$0';
    const totalVal = parseFloat(totalStr.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;

    // ── NOTA 4: IGNORAR SI ES $0 ──
    // Si el servicio no tiene cargos extra, salteamos toda la validación de pagos.
    if (totalVal > 0) {

      // ── NOTA 5: CAPTURA DE DATOS DE LA UI ──
      // Buscamos qué botones tienen el borde ámbar (están seleccionados)
      const p1El = document.querySelector('#rem-pago-opts [style*="var(--amber)"]');
      const p2El = document.querySelector('#rem-pago-opts2 [style*="var(--amber)"]');
      const p1 = p1El?.querySelector('div:last-child')?.textContent?.trim();
      const p2 = p2El?.querySelector('div:last-child')?.textContent?.trim();

      // Verificamos si el switch de "Pago Mixto" está abierto en pantalla
      const contenedor2 = document.getElementById('pago2-container');
      const pagoMixtoActivo = contenedor2 && window.getComputedStyle(contenedor2).display !== 'none';

      // Capturamos lo que el chofer escribió en los inputs numéricos
      const m1Str = document.getElementById('pago1-monto')?.value || '0';
      const m2Str = document.getElementById('pago2-monto')?.value || '0';
      const m1 = parseFloat(m1Str.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
      const m2 = parseFloat(m2Str.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;

      // ── NOTA 6: BARRERAS DE VALIDACIÓN (REGLAS DE NEGOCIO ESTRICTAS) ──

      if (!p1) {
        // REGLA A: Sí o sí tiene que elegir un Medio 1 si hay plata a cobrar.
        showError('Seleccioná un medio de pago principal.');
      } 
      else if (m1 <= 0) {
        // REGLA B: El monto 1 no puede ser cero ni negativo.
        showError('El monto del primer medio de pago debe ser mayor a $0.');
      } 
      else if (pagoMixtoActivo) {
        // --- SI EL PAGO MIXTO ESTÁ ACTIVADO ---
        if (!p2) {
          // REGLA C.1: Exige que elija con qué va a pagar la segunda parte.
          showError('Seleccioná el segundo medio de pago (Medio 2).');
        } 
        else if (p1 === p2) {
          // REGLA C.2: Bloquea medios idénticos (ej: Efectivo y Efectivo).
          showError('Los medios de pago no pueden ser iguales. Elegí uno distinto.');
        } 
        else if (m1 >= totalVal) {
          // REGLA C.3: El Medio 1 no puede ser el 100% de la plata si eligió dividir el pago.
          showError(`En un pago mixto, el Monto 1 no puede cubrir el total ($${totalVal.toLocaleString('es-AR')}).`);
        } 
        else {
          // REGLA C.4: La suma matemática (M1 + M2) debe ser idéntica al Total. 
          // (Usamos tolerancia de 0.01 por posibles redondeos de centavos en JS).
          const diff = Math.abs((m1 + m2) - totalVal);
          if (diff > 0.01) {
            showError(`La suma ingresada ($${(m1+m2).toLocaleString('es-AR')}) no coincide con el total ($${totalVal.toLocaleString('es-AR')}).`);
          }
        }
      } 
      else {
        // --- SI ES PAGO ÚNICO (MIXTO APAGADO) ---
        // REGLA D: El monto 1 debe cubrir el 100% del total. Ni un centavo más, ni uno menos.
        const diff = Math.abs(m1 - totalVal);
        if (diff > 0.01) {
          showError(`El Monto 1 ($${m1.toLocaleString('es-AR')}) debe ser exactamente igual al Total ($${totalVal.toLocaleString('es-AR')}).`);
        }
      }
    }
  }
  return ok;
}

// ── LÓGICA DE CONFIRMACIONES DINÁMICAS (PASO 5) ──────────────

function toggleAcept(elemento) {
    const toggleBtn = elemento.querySelector('.toggle');
    if (toggleBtn) {
        // 1. Cambia el estado visual (prende/apaga)
        toggleBtn.classList.toggle('on');
        
        // 2. Ejecuta SOLO nuestra nueva función matemática (si existe)
        if (typeof actualizarProgresoFirmas === 'function') {
            actualizarProgresoFirmas();
        }
    }
}

// ── 1. TOGGLE DE FIRMA DEL CHOFER ──
function toggleFirmaChofer(elemento) {
    const btn = elemento.querySelector('.toggle');
    btn.classList.toggle('on');
    
    const labelFirma = document.getElementById('label-firma-canvas'); // Asegurate de ponerle este ID al <label> de tu firma
    
    if (btn.classList.contains('on')) {
        labelFirma.textContent = '✍️ Firma del Chofer (En representación)';
        labelFirma.style.color = 'var(--green)';
    } else {
        labelFirma.textContent = '✍️ Firma digital del socio';
        labelFirma.style.color = 'var(--text)';
    }
}

// ── 2. MATEMÁTICA ESTRICTA DE LA BARRA DE PROGRESO ──
function actualizarProgresoFirmas() {
    const panel = document.getElementById('rem-step-5');
    if (!panel) return;

    let esperados = 0;
    let activos = 0;

    const toggles = panel.querySelectorAll('.acept-toggle');
    
    toggles.forEach(row => {
        const tituloElement = row.querySelector('.toggle-title');
        if (!tituloElement) return;
        
        const titulo = tituloElement.textContent.trim();
        const isOn = row.querySelector('.toggle').classList.contains('on');

        if (titulo === 'Conformidad de Arrastre') {
            // El arrastre suma al total SOLO si está prendido
            if (isOn) {
                esperados++;
                activos++;
            }
        } else {
            // Servicio, Cargos y Daños siempre son obligatorios
            esperados++;
            if (isOn) activos++;
        }
    });

    const txtProgreso = document.getElementById('acept-progress');
    const barra = document.getElementById('acept-bar');
    const txtStatus = document.getElementById('acept-status');

    if (txtProgreso) txtProgreso.textContent = `${activos} / ${esperados}`;

    if (barra) {
        // Evitamos división por cero por las dudas
        const porcentaje = esperados === 0 ? 100 : (activos / esperados) * 100;
        barra.style.width = `${porcentaje}%`;

        if (activos === esperados && esperados > 0) {
            barra.style.background = 'var(--green)';
            if (txtStatus) { txtStatus.textContent = '✓ Completo'; txtStatus.style.color = 'var(--green)'; }
        } else {
            barra.style.background = 'var(--red)';
            if (txtStatus) { txtStatus.textContent = 'Faltan confirmaciones'; txtStatus.style.color = 'var(--red)'; }
        }
    }
}

// ── 3. GUARD CLAUSE (VALIDACIÓN ANTES DE GUARDAR) ──
// Esta función se ejecuta cuando el chofer toca "Finalizar y Guardar"
function validarPaso5Final() {
    // 1. Verificamos las confirmaciones obligatorias (excluye Arrastre por ser opcional)
    const obligatorios = document.querySelectorAll('#rem-step-5 .acept-toggle:not(#row-arrastre) .toggle');
    let todasConfirmadas = true;
    obligatorios.forEach(t => {
        if (!t.classList.contains('on')) todasConfirmadas = false;
    });

    if (!todasConfirmadas) {
        toast('Marcá todas las confirmaciones antes de finalizar', 'error');
        return false;
    }

    // 2. Verificamos la firma usando hasSig (más confiable que comparar pixel-data)
    if (!hasSig) {
        const canvas = document.getElementById('sig-canvas');
        if (canvas) {
            canvas.style.borderColor = 'var(--red)';
            setTimeout(() => canvas.style.borderColor = 'var(--amber)', 2500);
            canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        toast('Dibujá la firma antes de finalizar', 'error');
        return false;
    }

    return true;
}

// ── CLÁUSULA DE GUARDIA (BLINDAJE DE GUARDADO) ──────────────

function calcPagoAuto() {
  const totalStr = document.getElementById('imp-total')?.textContent || '$0';
  const total = parseFloat(totalStr.replace(/[^0-9.,]/g,'').replace(',','.')) || 0;
  const monto1 = parseFloat(document.getElementById('pago1-monto')?.value) || 0;
  const monto2El = document.getElementById('pago2-monto');
  const contenedor2 = document.getElementById('pago2-container');
  if (monto2El && contenedor2?.style.display !== 'none') {
    const resto = Math.max(0, total - monto1);
    monto2El.value = resto > 0 ? resto.toFixed(2) : '';
  }
}

// ── REMITOS SUB-VISTAS ────────────────────────
function showRemitosView(view, param) {
  // Destrucción incondicional de superposiciones antes de cambiar de vista
document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none');
 // Scroll al inicio de la pantalla para evitar que el usuario quede atrapado en un scroll profundo al cambiar de vista
  window.scrollTo(0, 0);
  document.querySelector('.content')?.scrollTo(0, 0);

  // 1. Barrido de pantallas brutal y limpio
  ['lista', 'nuevo', 'detalle', 'firma'].forEach(v => {
    const el = document.getElementById('remitos-' + v);
    if (el) {
      el.style.display = 'none';
      el.classList.remove('active');
    }
  });

  // 2. Aniquilación de modales fantasma
  document.querySelectorAll('.modal.open, .modal-backdrop.open, .modal-backdrop').forEach(m => {
    m.classList.remove('open');
    m.style.display = ''; // ESTRICTAMENTE VACÍO para devolver el control al CSS
  });
  document.body.style.overflow = ''; // Libera el bloqueo de scroll

  const vistaDestino = document.getElementById('remitos-' + view);
  if (!vistaDestino) return console.error(`❌ No existe la vista: remitos-${view}`);
  
  // 2. Encender solo la vista destino
  vistaDestino.style.display = 'block';
  vistaDestino.classList.add('active'); // Mantiene el estado consistente

  // 2. Lógica para NUEVO REMITO
if (view === 'nuevo') {
  const esChofer = PERFIL_USUARIO?.roles?.name === 'chofer';
  const jActiva  = _jornadasAbiertasCache?.[0] || _jornadaActivaLocal;
  if (esChofer && !jActiva) {
    vistaDestino.style.display = 'none';
    vistaDestino.classList.remove('active');
    const lista = document.getElementById('remitos-lista');
    if (lista) { lista.style.display = 'block'; lista.classList.add('active'); }
    if (typeof toast === 'function') toast('Debés iniciar una jornada antes de crear un remito', 'error');
    return;
  }
  remWizardReset();
  console.log("✅ Vista 'Nuevo Remito' reseteada y lista.");
}
  // 3. Lógica para FIRMA
 if (view === 'firma') {
  setTimeout(() => {
    // Resetear estado cliente presente
    clientePresente = true;
    if (typeof setClientePresente === 'function') setClientePresente(true);

    initCanvas('sig-canvas-firma');

    let d = null;
    if (param && typeof param === 'object' && param.getAttribute) {
      try { d = JSON.parse(param.getAttribute('data-rem')); } catch(e) {}
    } else if (param && typeof param === 'string') {
      const rows = document.querySelectorAll('#tbody-remitos tr');
      for (const r of rows) {
        try {
          const rd = JSON.parse(r.getAttribute('data-rem') || '{}');
          if (rd.nro === param) { d = rd; break; }
        } catch(e) {}
      }
    }

    if (d) {
      const setT = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val || '—'; };
      const setV = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };

      setT('firma-nro',     d.nro);
      setT('firma-fecha',   d.fecha);
      setT('firma-nro-srv', d.nroSrv);

      setV('firma-edit-patente',   d.patente);
      setV('firma-edit-marca',     d.marca);
      setV('firma-edit-cliente',   d.cliente);
      setV('firma-edit-origen',    d.origen);
      setV('firma-edit-destino',   d.destino);
      setV('firma-edit-km',        d.km);
      resetFirmaPagoForm();
      setV('firma-edit-peaje',     d.peaje);
      setV('firma-edit-excedente', d.excedente);
      setV('firma-edit-otros',     d.otros);
      calcularTotalFirma();

      setT('firma-origen',  d.origen);
      setT('firma-destino', d.destino);
      setT('firma-km',      (d.km || '—') + ' km');
      setT('firma-patente', d.patente);
      setT('firma-marca',   d.marca || '—');
    }

    const arrastreTrigger = document.getElementById('firma-arrastre-trigger');
    const arrastreRow     = document.getElementById('firma-arrastre-row');
    if (arrastreTrigger) arrastreTrigger.style.display = 'block';
    if (arrastreRow)     arrastreRow.style.display     = 'none';

    document.querySelectorAll('#remitos-firma .toggle-row .toggle')
      .forEach(t => t.classList.add('on'));

  }, 80);
}
} // cierra showRemitosView


function verRemito(nro) {
  showRemitosView('detalle', nro);
}

// ── FIRMA CANVAS ──────────────────────────────
let activeCanvas = null, activeCtx = null, drawing = false, hasSig = false;
// Map nro → signature dataURL
const sigDataStore = {};

function initCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  activeCanvas = canvas;
  
  // 1. Forzar dimensiones basadas en el CSS real AHORA, sin timeouts.
  const rect = canvas.getBoundingClientRect();
  canvas.width  = rect.width > 0 ? rect.width : (canvas.parentElement.offsetWidth || 300);
  canvas.height = 160; // Fijo según tu HTML
  
  // 2. Crear el contexto DESPUÉS de redimensionar (vital)
  activeCtx = canvas.getContext('2d');
  activeCtx.strokeStyle = '#f5a623'; // Lápiz naranja
  activeCtx.lineWidth   = 2.5;
  activeCtx.lineCap     = 'round';
  activeCtx.lineJoin    = 'round';

  // 3. Resetear estados
  hasSig = false;
  updateSigStatus(canvasId, false);

  // 4. Asignar eventos de dibujo
  canvas.onmousedown  = e => startDraw(e, canvas);
  canvas.onmousemove  = e => draw(e, canvas);
  canvas.onmouseup    = ()  => stopDraw(canvasId);
  canvas.onmouseleave = ()  => stopDraw(canvasId);
  
  canvas.ontouchstart = e => { e.preventDefault(); startDraw(e.touches[0], canvas); };
  canvas.ontouchmove  = e => { e.preventDefault(); draw(e.touches[0], canvas); };
  canvas.ontouchend   = ()  => stopDraw(canvasId);
}

function getPos(e, canvas) {
  const r = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / r.width;
  const scaleY = canvas.height / r.height;
  return {
    x: (e.clientX - r.left) * scaleX,
    y: (e.clientY - r.top)  * scaleY
  };
}

function startDraw(e, canvas) {
  drawing = true;
  const p = getPos(e, canvas);
  activeCtx.beginPath();
  activeCtx.moveTo(p.x, p.y);
  // hide placeholder
  const ph = document.getElementById('sig-placeholder');
  if (ph) ph.style.display = 'none';
  canvas.style.border = '2px dashed var(--amber)';
  canvas.style.background = 'rgba(245,166,35,0.04)';
}

function draw(e, canvas) {
  if (!drawing) return;
  const p = getPos(e, canvas);
  activeCtx.lineTo(p.x, p.y);
  activeCtx.stroke();
}

function stopDraw(canvasId) {
  if (!drawing) return;
  drawing = false;
  hasSig  = true;
  updateSigStatus(canvasId, true);
  const dot = document.getElementById('sig-status-dot');
const txt = document.getElementById('sig-status-txt');
if (dot && txt) {
    dot.style.background = 'var(--green)';
    txt.textContent = '✓ Firma registrada';
    txt.style.color = 'var(--green)';
}
}

function updateSigStatus(canvasId, signed) {
  if (canvasId === 'sig-canvas') {
    const dot = document.getElementById('sig-status-dot');
    const txt = document.getElementById('sig-status-txt');
    if (dot) dot.style.background = signed ? 'var(--green)' : 'var(--muted)';
    if (txt) txt.style.color      = signed ? 'var(--green)' : 'var(--muted)';
    if (txt) txt.textContent      = signed ? '✓ Firma registrada' : 'Sin firma';
  }
  if (canvasId === 'sig-canvas-firma') {
    const el = document.getElementById('sig-status-firma');
    if (el) { el.textContent = signed ? '✅ Firma registrada' : '⬜ Sin firma'; el.style.color = signed ? 'var(--green)' : 'var(--muted)'; }
  }
}

function limpiarFirma() {
  if (!activeCtx || !activeCanvas) return;
  activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
  activeCanvas.style.border     = '2px dashed var(--border2)';
  activeCanvas.style.background = 'var(--bg)';
  const ph = document.getElementById('sig-placeholder');
  if (ph) ph.style.display = 'flex';
  hasSig = false;
  updateSigStatus('sig-canvas', false);
}

function limpiarFirmaModal() {
  const canvas = document.getElementById('sig-canvas-firma');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.style.border     = '2px dashed var(--border2)';
  canvas.style.background = 'var(--bg)';
  hasSig = false;
  updateSigStatus('sig-canvas-firma', false);
}

function drawDemoSignature() {
  const canvas = document.getElementById('sig-display');
  if (!canvas) return;
  canvas.width  = canvas.offsetWidth || 400;
  canvas.height = canvas.offsetHeight || 90;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#27c47a';
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // draw a demo cursive signature stroke
  const pts = [[30,55],[45,35],[60,50],[75,30],[90,52],[110,28],[130,55],[145,40],[160,52],
               [180,34],[200,55],[215,45],[230,55],[250,38],[265,55],[275,48],[285,55]];
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

// ── FINALIZAR BTN LOGIC ───────────────────────
let arrastreRequerido = false;



async function finalizarRemito() {
  const btn = document.getElementById('btn-finalizar');
  if (btn && btn.style.opacity === '0.5') {
    toast('Se requiere firma para finalizar', 'error'); return;
  }

  // ── Leer datos del formulario ─────────────────────────
  const _fecha = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const _rand  = Math.floor(Math.random() * 9000) + 1000;
  const nro       = document.getElementById('rem-nro')?.value || `REM-${_fecha}-${_rand}`;
  const tipo      = document.getElementById('rem-tipo-servicio')?.value || 'Remolque';
  const patente   = document.getElementById('rem-patente')?.value?.trim() || '';
  const km        = document.getElementById('rem-km')?.value || '0';
  const origen    = document.getElementById('rem-origen')?.value?.trim() || '';
  const destino   = document.getElementById('rem-destino')?.value?.trim() || '';
  const cliente   = document.getElementById('rem-cliente')?.value?.trim() || '';
  const cuit      = document.getElementById('rem-cuit')?.value || '';
  const peaje     = parseFloat(document.getElementById('imp-peaje')?.value)     || 0;
  const excedente = parseFloat(document.getElementById('imp-excedente')?.value) || 0;
  const otros     = parseFloat(document.getElementById('imp-otros')?.value)     || 0;
  const hora      = new Date().toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});
  const pago      = document.getElementById('rem-pago-selected')?.value || remPago1 || '—';
  const nroSrv    = document.getElementById('rem-nro-prestadora')?.value || '';

  // ── Validaciones ──────────────────────────────────────
  if (!patente) {
    toast('Ingresá la patente del vehículo', 'error'); return;
  }
  if (!origen) {
    toast('Ingresá el origen del servicio', 'error'); return;
  }
  if (!destino) {
    toast('Ingresá el destino del servicio', 'error'); return;
  }
  if (cuit && !/^\d{7,11}$/.test(cuit) && !/^\d{2}-\d{7,8}-\d{1}$/.test(cuit)) {
    toast('DNI/CUIT inválido. Ingresá solo números o formato XX-XXXXXXXX-X', 'error'); return;
  }
  const totalStr = document.getElementById('imp-total')?.textContent || '$0';
  const totalVal = parseFloat(totalStr.replace(/[^0-9.,]/g,'').replace(',','.')) || 0;
  if (totalVal > 0 && (!pago || pago === '—')) {
    toast('Seleccioná un medio de pago antes de finalizar', 'error');
    remWizardIr(3 - _remPasoActual);
    return;
  }

  // Build display for split or single payment
  const pagoPartes = pago.includes('+') ? pago.split('+') : [pago];
  const payIcon    = pagoPartes.map(p => PAY_ICONS[p]||'💳').join('');
  const payColor   = pagoPartes.length > 1 ? 'var(--amber)' : (PAY_COLORS[pago]||'var(--text)');
  const pagoLabel  = pagoPartes.length > 1 ? pagoPartes.join(' + ') : pago;
  const extras     = peaje > 0
    ? `Peaje: $${peaje.toLocaleString('es-AR')}`
    : excedente > 0
      ? `Excedente: $${excedente.toLocaleString('es-AR')}`
      : 'Sin extras';

  // ① → Tabla de remitos
  const tbodyRemitos = document.getElementById('tbody-remitos');
  if (tbodyRemitos) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-rem', JSON.stringify({
      nro, fecha:`${new Date().toLocaleDateString('es-AR')} · ${hora}`,
      nroSrv, patente, marca:'—', cliente: cliente||'Sin nombre',
      origen, destino, km,
      peaje: String(peaje), excedente: String(excedente), otros: String(otros),
      pago, tipo,
      confirmaciones:['Conformidad con el servicio','Aceptación de cargos variables','Sin daños reportados']
    }));
    tr.innerHTML = `
      <td><span style="font-family:'DM Mono';color:var(--amber);font-size:11px">${nro}</span></td>
      <td style="font-family:'DM Mono'">${hora}</td>
      <td style="font-size:11px;color:var(--muted2)">—</td>
      <td><div style="font-family:'DM Mono';font-weight:700;font-size:13px">${patente}</div></td>
      <td>
        <div style="font-size:12px">${tipo}</div>
        <div style="font-size:10px;color:var(--muted);font-family:'DM Mono'">${nroSrv || '—'}</div>
      </td>
      <td><div style="font-size:11px;color:var(--muted)">${extras}</div></td>
      <td><div style="display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:${payColor}"><span>${payIcon}</span>${pagoLabel}</div></td>
      <td><span class="pill pill-green">✓ Firmado</span></td>
      <td>
        <div style="display:flex;gap:5px">
          <button class="btn btn-ghost btn-ver-remito" style="padding:4px 10px;font-size:10px">Ver</button>
          <button class="btn btn-ghost btn-pdf-remito" style="padding:4px 10px;font-size:10px">PDF</button>
        </div>
      </td>`;
    tbodyRemitos.insertBefore(tr, tbodyRemitos.firstChild);
  }

  // ② → Viajes del día
  const tbodyViajes = document.querySelector('#tabla-viajes tbody');
  if (tbodyViajes && origen && destino) {
    const num = String(tbodyViajes.rows.length + 1).padStart(2,'0');
    const tr  = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--muted);font-family:'DM Mono'">${num}</td>
      <td><span style="font-family:'DM Mono';color:var(--amber);font-size:11px">${nroSrv || '—'}</span></td>
      <td><span style="font-family:'DM Mono';font-weight:600">${patente}</span></td>
      <td><span class="pill pill-blue">🔧 ${tipo}</span></td>
      <td>${origen}</td>
      <td>${destino}</td>
      <td style="font-family:'DM Mono'">${hora}</td>
      <td><span style="font-family:'DM Mono';color:var(--amber)">${km} km</span></td>
      <td><span class="pill pill-green">✓ Completado</span></td>`;
    tbodyViajes.appendChild(tr);
    const counter = document.getElementById('viajes-counter');
    if (counter) counter.textContent = `${tbodyViajes.rows.length} servicios registrados`;
  }

  // ③ → Historial de jornadas
  const tbodyHistorial = document.getElementById('tbody-historial-jornadas');
  if (tbodyHistorial) {
    const today = new Date().toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'});
    const existingRow = tbodyHistorial.querySelector('tr[data-today]');
    if (existingRow) {
      const kmCell = existingRow.querySelector('td:nth-child(4) span');
      if (kmCell) kmCell.textContent = (parseInt(kmCell.textContent) + parseInt(km)) + ' km';
    } else {
      const tr = document.createElement('tr');
      tr.setAttribute('data-today', '1');
      tr.innerHTML = `
        <td><b>${today}</b> <span class="pill pill-blue" style="font-size:8px;padding:2px 5px">Hoy</span></td>
        <td style="font-family:'DM Mono'">—</td>
        <td style="font-family:'DM Mono'">—</td>
        <td><span style="font-family:'DM Mono';color:var(--amber);font-weight:600">${km} km</span></td>
        <td>—</td>
        <td><span class="pill pill-muted">No</span></td>
        <td><span class="pill pill-amber">Abierta</span></td>`;
      tbodyHistorial.insertBefore(tr, tbodyHistorial.firstChild);
    }
  }

  // ④ → Últimas jornadas dashboard
  const jornadasList = document.querySelector('#screen-dashboard div[style*="flex-direction:column;gap:8px"]');
  if (jornadasList) {
    const today = new Date().toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'});
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg);border-radius:7px;border:1px solid rgba(245,166,35,0.3)';
    div.innerHTML = `
      <div>
        <div style="font-size:12px;font-weight:600">📍 ${today} <span style="color:var(--amber)">· Nuevo</span></div>
        <div style="font-size:10px;color:var(--muted);margin-top:1px">${km} km · ${tipo} · ${patente}</div>
      </div>
      <span class="pill pill-amber">Abierta</span>`;
    jornadasList.insertBefore(div, jornadasList.firstChild);
  }

  // ⑤ → Save signature
  const sigCanvas = document.getElementById('sig-canvas');
  if (sigCanvas && hasSig) sigDataStore[nro] = sigCanvas.toDataURL();

  resetPagoForm();

  // ⑥ → Recolectar confirmaciones
  const confirmaciones = [];
  document.querySelectorAll('#remitos-nuevo .acept-toggle .toggle.on').forEach(el => {
    const row = el.closest('.toggle-row');
    if (row?.querySelector('.toggle-title')) {
      confirmaciones.push(row.querySelector('.toggle-title').textContent.trim());
    }
  });

  // ⑦ → Guardar en Supabase
  // 1. Mini-función para arreglar el bug de los miles (ej: "9.100" -> 9100)
  const parsearImporte = (val) => {
    if (!val) return 0;
    const limpio = String(val).replace(/\./g, '').replace(',', '.');
    return parseFloat(limpio) || 0;
  };

  // 2. Recalculamos los valores numéricos de forma segura
  const peajeLimpio     = parsearImporte(document.getElementById('imp-peaje')?.value);
  const excedenteLimpio = parsearImporte(document.getElementById('imp-excedente')?.value);
  const otrosLimpio     = parsearImporte(document.getElementById('imp-otros')?.value);

  // 🚨 DIAGNÓSTICO DE SEGURIDAD
  console.log("ID del chofer enviado a Supabase (Remito Final):", USUARIO_ACTUAL.id);

  const ok = await guardarRemitoCompleto({
    nro,
    driver_id: USUARIO_ACTUAL.id, // 🛠️ INYECCIÓN DE SEGURIDAD
    log_id:  _jornadasAbiertasCache?.[0]?.log_id || _jornadaActivaLocal?.log_id || null, // 🛠️ REGISTRO SILENCIOSO
    nroSrv,
    patente,
    marca:   document.getElementById('rem-marca-modelo')?.value || '',
    cliente,
    cuit,
    telefono: document.getElementById('rem-telefono')?.value?.trim() || null,
    tipo,
    origen,
    destino,
    km,
    peaje:     String(peajeLimpio),
    excedente: String(excedenteLimpio),
    otros:     String(otrosLimpio),
    pago,
    pago1Monto: (() => {
      const explicit = parsearImporte(document.getElementById('pago1-monto')?.value);
      if (explicit > 0) return explicit;
      const base  = parsearImporte(document.getElementById('imp-base')?.value);
      const total = base + peajeLimpio + excedenteLimpio + otrosLimpio;
      return total > 0 ? total : null;
    })(),
    pago2Monto: parsearImporte(document.getElementById('pago2-monto')?.value) || null,
    observaciones: document.getElementById('rem-observaciones')?.value?.trim() || null,
    confirmaciones,
  });

  if (!ok) return;
}

// ── CÁLCULO DE TOTAL ──────────────────────────
function calcularTotal() {
  const base = parseFloat(document.getElementById('imp-base')?.value)      || 0;
  const peaj = parseFloat(document.getElementById('imp-peaje')?.value)     || 0;
  const exc  = parseFloat(document.getElementById('imp-excedente')?.value) || 0;
  const otro = parseFloat(document.getElementById('imp-otros')?.value)     || 0;
  const total = base + peaj + exc + otro;
  const el = document.getElementById('imp-total');
  if (el) el.textContent = '$' + total.toLocaleString('es-AR');
  // Auto-llenar monto 1 con el total si no hay pago mixto activo
  const m1El = document.getElementById('pago1-monto');
  if (m1El && !pagoMixtoActivo) {
    m1El.value = total > 0 ? total.toFixed(2) : '';
  }
  // Si hay pago mixto, recalcular diferencia en monto 2
  if (pagoMixtoActivo) calcPagoAuto();
}

// ── FILTROS Y BÚSQUEDA DE REMITOS ────────────
// ── VARIABLES DE FILTRO ───────────────────────
let filtroEstado  = 'todos';
let filtroBuscar  = '';
let filtroPeriodo = 'todos';

function filtrarBusqueda(val) {
  filtroBuscar = val.trim();
  aplicarFiltrosRemitos();
}

function filtrarEstado(estado, el) {
  el.closest('.filter-tabs').querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  filtroEstado = estado;
  aplicarFiltrosRemitos();
}

function filtrarPeriodo(periodo, el) {
  el.closest('.filter-tabs').querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  filtroPeriodo = periodo;
  const panelDia   = document.getElementById('panel-dia');
  const panelRango = document.getElementById('panel-rango');
  if (panelDia)   panelDia.style.display   = periodo === 'dia'   ? 'block' : 'none';
  if (panelRango) panelRango.style.display = periodo === 'rango' ? 'flex'  : 'none';
  aplicarFiltrosRemitos();
}

function limpiarFiltrosAdmin() {
  filtroBuscar  = '';
  filtroPeriodo = 'todos';
  ['filtro-chofer-input','filtro-patente',
   'input-buscar-remitos','filtro-dia-especifico','filtro-desde','filtro-hasta']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  const tipoSel = document.getElementById('filtro-tipo-servicio');
  if (tipoSel) tipoSel.value = '';
  const pagoSel = document.getElementById('filtro-pago');
  if (pagoSel) pagoSel.value = '';
  const panelDia   = document.getElementById('panel-dia');
  const panelRango = document.getElementById('panel-rango');
  if (panelDia)   panelDia.style.display   = 'none';
  if (panelRango) panelRango.style.display = 'none';
  document.querySelectorAll('#ftabs-periodo-admin .ftab').forEach((t,i) => {
    t.classList.toggle('active', i === 0);
  });
  aplicarFiltrosRemitos();
}

function aplicarFiltrosRemitos() {
  const rows  = document.querySelectorAll('#tbody-remitos tr');
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  const choferInput = document.getElementById('filtro-chofer-input')?.value.toLowerCase().trim() || '';
  const patenteInput = document.getElementById('filtro-patente')?.value.toLowerCase().trim() || '';
  const tipoInput   = document.getElementById('filtro-tipo-servicio')?.value || '';
  const extrasMin   = parseFloat(document.getElementById('filtro-extras-min')?.value) || 0;
  const diaEsp      = document.getElementById('filtro-dia-especifico')?.value || '';
  const desde       = document.getElementById('filtro-desde')?.value || '';
  const hasta       = document.getElementById('filtro-hasta')?.value || '';

  let visible = 0;
  let totalExtras = 0;

  rows.forEach(tr => {
    let d = {};
    try { d = JSON.parse(tr.getAttribute('data-rem') || '{}'); } catch(e) {}

    // ── Estado ───────────────────────────────
    const estadoCell = tr.querySelector('td:nth-child(8) .pill');
    const estadoTxt  = (estadoCell?.textContent || '').toLowerCase();
    const estadoOk =
      filtroEstado === 'todos'     ? true :
      filtroEstado === 'firmado'   ? estadoTxt.includes('firmado') && !estadoTxt.includes('anulado') :
      filtroEstado === 'pendiente' ? estadoTxt.includes('pendiente') :
      filtroEstado === 'anulado'   ? estadoTxt.includes('anulado') : true;

    // ── Búsqueda general ─────────────────────
    const rowText  = tr.textContent.toLowerCase();
    const buscarOk = !filtroBuscar || rowText.includes(filtroBuscar.toLowerCase());

    // ── Chofer ───────────────────────────────
    const choferOk = !choferInput ||
      (d.chofer || '').toLowerCase().includes(choferInput);

    // ── Patente ──────────────────────────────
    const patenteOk = !patenteInput ||
      (d.patente || '').toLowerCase().includes(patenteInput);

    // ── Tipo de servicio ─────────────────────
    const tipoOk = !tipoInput || (d.tipo || '').includes(tipoInput);

    // ── Medio de pago ─────────────────────────
      const pagoInput = document.getElementById('filtro-pago')?.value || '';
      const pagoOk = !pagoInput || (d.pago || '').includes(pagoInput);

    // ── Extras mínimos ───────────────────────
    const extrasRow = (parseInt(d.peaje)||0) + (parseInt(d.excedente)||0) + (parseInt(d.otros)||0);
    const extrasOk  = extrasMin === 0 || extrasRow >= extrasMin;

    // ── Período ──────────────────────────────
    let periodoOk = true;
    if (filtroPeriodo !== 'todos' && d.fecha) {
      try {
        const partes = d.fecha.split(' ');
        const [dd, mm, yy] = partes[0].split('/');
        const fechaStr = `20${yy}-${mm}-${dd}`;
        const fechaRow = new Date(fechaStr);
        if (filtroPeriodo === 'mes') {
          periodoOk = fechaRow >= inicioMes;
        } else if (filtroPeriodo === 'dia' && diaEsp) {
          periodoOk = fechaStr === diaEsp;
        } else if (filtroPeriodo === 'rango' && desde && hasta) {
          periodoOk = fechaStr >= desde && fechaStr <= hasta;
        }
      } catch(e) { periodoOk = true; }
    }

    const show = estadoOk && buscarOk && choferOk && patenteOk && tipoOk && extrasOk && periodoOk && pagoOk;
    tr.style.display = show ? '' : 'none';

    if (show) {
  visible++;
  if (d.estado !== 'anulado') totalExtras += extrasRow;
  }
  });

  const countEl = document.getElementById('filtro-count');
  if (countEl) countEl.textContent = `— ${visible} remito${visible !== 1 ? 's' : ''}`;

  const totalEl = document.getElementById('filtro-total-extras');
  if (totalEl) {
    totalEl.textContent = totalExtras > 0
      ? `Total extras: $${totalExtras.toLocaleString('es-AR')}`
      : '';
  }

  let emptyRow = document.getElementById('remitos-empty-row');
  if (visible === 0) {
    if (!emptyRow) {
      emptyRow = document.createElement('tr');
      emptyRow.id = 'remitos-empty-row';
      emptyRow.innerHTML = `<td colspan="9" style="text-align:center;padding:24px;color:var(--muted);font-size:12px">No se encontraron remitos</td>`;
      document.getElementById('tbody-remitos')?.appendChild(emptyRow);
    }
    emptyRow.style.display = '';
  } else if (emptyRow) {
    emptyRow.style.display = 'none';
  }

  const hayFiltroActivo = filtroEstado !== 'todos' || !!filtroBuscar;
  if (hayFiltroActivo) {
    document.getElementById('mobile-ver-todos-btn')?.remove();
  }
  document.querySelectorAll('#mobile-remitos-list .mobile-card-remito').forEach(card => {
    let d = {};
    try { d = JSON.parse(card.getAttribute('data-rem') || '{}'); } catch(e) {}
    const estadoOk = filtroEstado === 'todos' || (d.estado || '') === filtroEstado;
    const buscarOk = !filtroBuscar || card.textContent.toLowerCase().includes(filtroBuscar.toLowerCase());
    card.style.display = (estadoOk && buscarOk) ? '' : 'none';
  });
}



// ── CAMERA PICKER ────────────────────────────
let camPickerTarget = null;
let camPickerMode   = null;

function openCamPicker(targetOrId, mode) {
  camPickerTarget = targetOrId;
  camPickerMode   = mode;
  const picker = document.getElementById('cam-picker');
  if (picker) picker.classList.add('open');
  // title
  const title = document.getElementById('cam-picker-title');
  if (title) {
    const lbl = (mode === 'foto-slot' && targetOrId?.getAttribute)
      ? targetOrId.getAttribute('data-label') : 'AGREGAR ARCHIVO';
    title.textContent = '📷 ' + (lbl || 'ADJUNTAR FOTO').toUpperCase();
  }
}

function closeCamPicker() {
  document.getElementById('cam-picker')?.classList.remove('open');
}

function simCamSource(source) {
  closeCamPicker();
  const sourceLabels = {
    camera:  'Foto tomada con cámara',
    gallery: 'Imagen seleccionada de galería',
    google:  'Imagen importada de Google Fotos',
    files:   'Archivo cargado desde almacenamiento',
  };
  const label = sourceLabels[source] || 'Archivo cargado';
  const mode  = camPickerMode;
  const target = camPickerTarget;

  if (mode === 'foto-slot' && target?.classList) {
    // Es un foto-slot del formulario de remito
    target.classList.add('loaded');
    target.style.borderColor = 'var(--green)';
    target.style.background  = 'var(--green-lo)';
    const icon   = target.querySelector('.pu-icon');
    const status = target.querySelector('.pu-text');
    if (icon)   icon.textContent   = '✅';
    if (status) { status.textContent = label; status.style.color = 'var(--green)'; }
    fotosCount++;
    updateFotoCounter();
    toast(label, 'success', 2000);
  } else if (mode === 'doc-upload') {
    // Upload form de documentación
    const icon   = document.getElementById('doc-upload-icon');
    const status = document.getElementById('doc-upload-status');
    if (icon)   icon.textContent   = '✅';
    if (status) { status.textContent = `✅ ${label}`; status.style.color = 'var(--green)'; }
    toast(label, 'success', 2000);
  } else if (mode === 'doc-adjunto') {
    // Modal detalle doc
    const icon   = document.getElementById('dd-adjunto-icon');
    const status = document.getElementById('dd-adjunto-status');
    if (icon)   icon.textContent   = '✅';
    if (status) { status.textContent = `✅ ${label}`; status.style.color = 'var(--green)'; }
    toast(label, 'success', 2000);
  } else if (typeof target === 'string') {
    // Generic: target is an icon/status id pair
    toast(label, 'success', 2000);
  }
  camPickerTarget = null; camPickerMode = null;
}

// ── VER DOCUMENTO (card click) ────────────────
const IS_ADMIN = true; // toggle this to test role restriction

function verDoc(data) {
  const colors = { Vigente:'var(--green)', Próximo:'var(--amber)', Urgente:'var(--red)' };
  document.getElementById('dd-icon').textContent    = data.icon;
  document.getElementById('dd-titulo').textContent  = data.tipo.toUpperCase();
  document.getElementById('dd-tipo').textContent    = data.tipo;
  document.getElementById('dd-nro').textContent     = data.nro;
  document.getElementById('dd-emision').textContent = data.emision;
  document.getElementById('dd-vencimiento').textContent = data.vencimiento;
  document.getElementById('dd-vencimiento').style.color = colors[data.estado] || 'var(--text)';
  const diasEl = document.getElementById('dd-dias');
  diasEl.textContent   = data.dias + ' días';
  diasEl.style.color   = colors[data.estado] || 'var(--text)';
  document.getElementById('dd-estado').innerHTML = `<span class="pill ${data.pill}">${data.estado}</span>`;
  // Reset adjunto
  document.getElementById('dd-adjunto-icon').textContent   = '📎';
  document.getElementById('dd-adjunto-status').textContent = 'Sin archivo adjunto — tocá para subir';
  document.getElementById('dd-adjunto-status').style.color = '';
  // Admin only edit button
  document.getElementById('dd-admin-only').style.display = IS_ADMIN ? 'inline' : 'none';
  openModal('modal-doc-detalle');
}

function guardarDocForm() {
  if (!IS_ADMIN) { toast('Solo los administradores pueden cargar documentos', 'error'); return; }
  const tipo  = document.getElementById('doc-form-tipo')?.value;
  const nro   = document.getElementById('doc-form-nro')?.value;
  const venc  = document.getElementById('doc-form-vencimiento')?.value;
  if (!venc) { toast('Ingresá la fecha de vencimiento', 'error'); return; }
  const dias = Math.round((new Date(venc) - new Date()) / 86400000);
  const pillClass = dias < 30 ? 'pill-red' : dias < 60 ? 'pill-amber' : 'pill-green';
  const color     = dias < 30 ? 'var(--red)' : dias < 60 ? 'var(--amber)' : 'var(--green)';
  const estado    = dias < 30 ? 'Urgente' : dias < 60 ? 'Próximo' : 'Vigente';
  const icons     = { VTV:'🔍', Seguro:'🛡️', 'Habilitación de ruta':'📋', 'Libreta de porte':'⚖️', Matafuegos:'🧯', Otro:'📄' };
  const icon      = icons[tipo] || '📄';
  const grid = document.getElementById('doc-grid');
  const addCard = document.getElementById('doc-add-card');
  if (grid && addCard) {
    const div = document.createElement('div');
    div.className = 'doc-card';
    div.setAttribute('onclick', `verDoc({icon:'${icon}',tipo:'${tipo}',nro:'${nro||'—'}',emisor:'',emision:'',vencimiento:'${new Date(venc).toLocaleDateString('es-AR')}',dias:${dias},estado:'${estado}',pill:'${pillClass}'})`);
    div.innerHTML = `
      <div class="doc-icon">${icon}</div>
      <div><div class="doc-name">${tipo}</div><div class="doc-meta">Nº ${nro||'—'}</div></div>
      <div class="doc-expiry">
        <div class="doc-days" style="color:${color}">${dias}</div>
        <div class="doc-days-lbl">días restantes</div>
        <span class="pill ${pillClass}" style="margin-top:4px">${estado}</span>
      </div>`;
    grid.insertBefore(div, addCard);
  }
  toast(`Documento "${tipo}" guardado`, 'success');
}

// ── VER REMITO MODAL ──────────────────────────
const PAY_ICONS = { Efectivo:'💵', Transferencia:'🏦', Tarjeta:'💳', App:'📱' };
const PAY_COLORS = { Efectivo:'var(--green)', Transferencia:'var(--blue)', Tarjeta:'var(--purple)', App:'var(--cyan)' };

/**
 * Abre el modal de detalles de un remito y puebla los datos.
 * @param {HTMLElement|Object} elemento - Fila clickeada, card, u objeto de datos.
 */
function verRemitoModal(elemento) {
  const TAG = "[UI-MODAL-DETALLES]";
  
  try {
    // 1. Obtener y parsear los datos de manera robusta
    let d = null;
    if (elemento && typeof elemento.getAttribute === 'function') {
      const raw = elemento.getAttribute('data-rem');
      d = raw ? JSON.parse(raw) : null;
    } else if (typeof elemento === 'object') {
      d = elemento; // Por si se pasa el objeto directamente
    }

    if (!d) {
      console.error(`${TAG} ❌ Error: No se encontraron datos válidos en la card/fila.`);
      if (typeof toast === 'function') toast('No hay datos para mostrar', 'error');
      return;
    }

    console.log(`${TAG} 🔍 Abriendo detalles para remito: ${d.nro}`, d);

    // ── Limpiar estado anterior del modal ────────────────────────
    const confContainer = document.getElementById('vr-confirmaciones');
    if (confContainer) confContainer.innerHTML = '';
    
    const prevCanvas = document.getElementById('vr-sig-display');
    if (prevCanvas) {
      prevCanvas.width  = prevCanvas.offsetWidth || 360;
      prevCanvas.height = 80;
      const ctx = prevCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, prevCanvas.width, prevCanvas.height);
    }

    // ── Función Helper para Cabecera con sensor de errores ───────
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = val ?? '—';
      } else {
        console.warn(`${TAG} ⚠️ El HTML no tiene el ID: '${id}'. El dato [${val}] no se mostrará.`);
      }
    };

    set('vr-modal-nro', d.nro);
    set('vr-nro',       d.nro);
    set('vr-fecha',     d.fecha);
    set('vr-nro-srv',   d.nroSrv || '—'); 
    set('vr-patente',   d.patente);
    set('vr-marca',     d.marca);
    set('vr-cliente',   d.cliente);
    set('vr-origen',    d.origen);
    set('vr-destino',   d.destino);
    set('vr-km',        (d.km || '—') + ' km');
    set('vr-peaje',     '$' + parseInt(d.peaje     || 0).toLocaleString('es-AR'));
    set('vr-excedente', '$' + parseInt(d.excedente || 0).toLocaleString('es-AR'));
    set('vr-otros',     '$' + parseInt(d.otros     || 0).toLocaleString('es-AR'));

    // ── Forma de pago ─────────────────────────────────────────────
    const pagoEl = document.getElementById('vr-pago');
    if (pagoEl) {
      const pagoParts = (d.pago || '—').split('+').map(p => p.trim());
      // Protegemos las variables globales por si no están definidas
      const iconos = typeof PAY_ICONS !== 'undefined' ? PAY_ICONS : {};
      const colores = typeof PAY_COLORS !== 'undefined' ? PAY_COLORS : {};
      
      pagoEl.innerHTML = pagoParts.map(p => {
        const icon  = iconos[p]  || '💳';
        const color = colores[p] || 'var(--text)';
        return `<span style="color:${color};font-weight:600">${icon} ${p}</span>`;
      }).join('<span style="color:var(--muted);margin:0 4px">+</span>');
    }

    // ── Confirmaciones ────────────────────────────────────────────
    if (confContainer) {
      if (d.confirmaciones?.length) {
        confContainer.innerHTML = d.confirmaciones.map(c => `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;
            background:var(--bg);border-radius:6px;
            border:1px solid rgba(39,196,122,0.2);font-size:12px">
            <span style="color:var(--green)">✓</span><span>${c}</span>
          </div>`).join('');
      } else {
        confContainer.innerHTML = `
          <div style="font-size:12px;color:var(--muted);padding:8px">
            Sin confirmaciones registradas
          </div>`;
      }
    }

    // ── Motivo de anulación ───────────────────────────────────────
    const anuladoSection = document.getElementById('vr-anulado-section');
    if (anuladoSection) {
      if (d.estado === 'anulado') {
        anuladoSection.style.display = 'block';
        const motivoEl = document.getElementById('vr-anulado-motivo');
        if (motivoEl) motivoEl.textContent = d.observaciones || 'Sin motivo registrado';
      } else {
        anuladoSection.style.display = 'none';
      }
    }

    // ── Fecha de firma ────────────────────────────────────────────
    set('vr-sig-fecha', d.fecha);

    // ── Botón anular (Admin) ──────────────────────────────────────
    const btnAnular = document.getElementById('btn-anular-remito');
    if (btnAnular) {
      const esAdmin = typeof PERFIL_USUARIO !== 'undefined' && PERFIL_USUARIO?.roles?.name === 'administracion';
      btnAnular.style.display = (esAdmin && d.estado !== 'anulado') ? 'block' : 'none';
    }

    // ── Dinámica de WhatsApp ──────────────────────────────────────
    const btnWA = document.getElementById('btn-vr-wa'); // Asegurate de que tu botón WA tenga este ID
    if (btnWA) {
      const _extras = (parseFloat(d.peaje)||0)+(parseFloat(d.excedente)||0)+(parseFloat(d.otros)||0);
      const whatsappMsg = encodeURIComponent(
        `*Remito Sigma Remolques*\n` +
        `N°: ${d.nro}\nFecha: ${d.fecha}\n` +
        `Vehículo: ${d.patente}${d.marca ? ' · '+d.marca : ''}\n` +
        `Cliente: ${d.cliente || '—'}\n` +
        `Servicio: ${d.origen} → ${d.destino}\n` +
        `KM: ${d.km || '—'}` +
        (_extras > 0 ? `\nExtras: $${_extras.toLocaleString('es-AR')}` : '') +
        (d.pago && d.pago !== '—' ? `\nPago: ${d.pago}` : '') +
        `\nEstado: ${d.estado.toUpperCase()}`
      );
      
      const linkWA = d.telefono ? `https://wa.me/${d.telefono}?text=${whatsappMsg}` : `https://wa.me/?text=${whatsappMsg}`;
      
      // Truco JS: Clonamos el botón para eliminar listeners anteriores y que no mande 5 mensajes a la vez
      const newBtnWA = btnWA.cloneNode(true);
      btnWA.parentNode.replaceChild(newBtnWA, btnWA);
      newBtnWA.addEventListener('click', () => window.open(linkWA, '_blank'));
    }

    // ── Mostrar Modal y Renderizar Firma ──────────────────────────
    const modalVer = document.getElementById('modal-ver-remito');
    if (modalVer) modalVer.style.display = '';
    if (typeof openModal === 'function') openModal('modal-ver-remito');

    requestAnimationFrame(() => {
      setTimeout(() => {
        const c = document.getElementById('vr-sig-display');
        if (!c) {
          console.warn(`${TAG} ⚠️ No se encontró el canvas 'vr-sig-display' para la firma.`);
          return;
        }
        
        const rect = c.getBoundingClientRect();
        c.width  = rect.width  > 0 ? rect.width  : (c.parentElement?.offsetWidth || 360);
        c.height = rect.height > 0 ? rect.height : 120;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, c.width, c.height);
        
        const savedSig = (typeof sigDataStore !== 'undefined' ? sigDataStore[d.nro] : null) || d.firmaUrl || null;
        
        if (savedSig) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload  = () => {
            ctx.drawImage(img, 0, 0, c.width, c.height);
            console.log(`${TAG} ✅ Firma renderizada correctamente.`);
          };
          img.onerror = () => {
            console.error(`${TAG} ❌ Error cargando la imagen de la firma.`);
            if (typeof dibujarFirmaDemo === 'function') dibujarFirmaDemo(ctx, c.width, c.height);
          };
          img.src = savedSig;
        } else {
          console.log(`${TAG} ℹ️ No hay firma real, dibujando demo/vacío.`);
          if (typeof dibujarFirmaDemo === 'function') dibujarFirmaDemo(ctx, c.width, c.height);
        }
      }, 100);
    });

  } catch (error) {
    console.error("[UI-MODAL-DETALLES] ❌ CRÍTICO: Crash interno al procesar los datos del remito.", error);
    if (typeof toast === 'function') toast('Ocurrió un error al cargar la información', 'error');
  }
}
// ── FORMA DE PAGO — soporta pago mixto ────────
let remPago1 = '', remPago2 = '', pagoMixtoActivo = false;

function selectRemPago(el, pago, slot) {
  const containerId = slot === 2 ? 'rem-pago-opts2' : 'rem-pago-opts';
  document.querySelectorAll('#' + containerId + ' > div').forEach(o => {
    o.style.borderColor = 'var(--border)'; o.style.background = 'var(--card)';
  });
  el.style.borderColor = 'var(--amber)'; el.style.background = 'var(--amber-lo)';
  if (slot === 2) remPago2 = pago; else remPago1 = pago;
  actualizarPagoResumen();
}

function activarPagoMixto() {
  pagoMixtoActivo = true;
  document.getElementById('pago2-container').style.display = 'block';
  document.getElementById('btn-add-pago2').style.display = 'none';
  // Recalcular diferencia para pago2
  calcPagoAuto();
  actualizarPagoResumen();
}

function desactivarPagoMixto() {
  pagoMixtoActivo = false;
  remPago2 = '';
  document.getElementById('pago2-container').style.display = 'none';
  document.getElementById('btn-add-pago2').style.display = '';
  document.getElementById('pago2-monto').value = '';
  document.querySelectorAll('#rem-pago-opts2 > div').forEach(o => {
    o.style.borderColor = 'var(--border)'; o.style.background = 'var(--card)';
  });
  actualizarPagoResumen();
}

function calcPagoMixto() { actualizarPagoResumen(); }

function actualizarPagoResumen() {
  const resumen = document.getElementById('pago-mixto-resumen');
  const hidden  = document.getElementById('rem-pago-selected');
  if (!resumen) return;
  const m1 = parseFloat(document.getElementById('pago1-monto')?.value) || 0;
  const m2 = parseFloat(document.getElementById('pago2-monto')?.value) || 0;

  if (pagoMixtoActivo && remPago1 && remPago2) {
    resumen.style.display = 'block';
    const fmt = v => v > 0 ? ' $' + v.toLocaleString('es-AR') : '';
    resumen.innerHTML =
      `<b>Pago mixto:</b> ${PAY_ICONS[remPago1]||''} ${remPago1}${fmt(m1)} + ${PAY_ICONS[remPago2]||''} ${remPago2}${fmt(m2)}`;
    if (hidden) hidden.value = `${remPago1}+${remPago2}`;
  } else if (remPago1) {
    resumen.style.display = 'none';
    if (hidden) hidden.value = remPago1;
  } else {
    resumen.style.display = 'none';
    if (hidden) hidden.value = '';
  }
}

function resetPagoForm() {
  remPago1 = ''; remPago2 = ''; pagoMixtoActivo = false;
  const p2 = document.getElementById('pago2-container');
  const btn = document.getElementById('btn-add-pago2');
  if (p2) p2.style.display = 'none';
  if (btn) btn.style.display = '';
  ['pago1-monto','pago2-monto'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['rem-pago-opts','rem-pago-opts2'].forEach(cid => {
    document.querySelectorAll('#' + cid + ' > div').forEach(o => {
      o.style.borderColor = 'var(--border)';
      o.style.background  = 'var(--card)';
    });
  });
  const resumen = document.getElementById('pago-mixto-resumen');
  if (resumen) resumen.style.display = 'none';
  const hidden = document.getElementById('rem-pago-selected');
  if (hidden) hidden.value = '';
}

// ── ROLE CHECK ON DOCUMENTOS ──────────────────
function applyDocRole() {
  const isAdmin = IS_ADMIN;
  const uploadForm = document.getElementById('doc-upload-form');
  const addCard    = document.getElementById('doc-add-card');
  const btnCargar  = document.getElementById('btn-cargar-doc');
  const aviso      = document.getElementById('doc-rol-aviso');
  if (!isAdmin) {
    if (uploadForm) uploadForm.style.display = 'none';
    if (addCard)    addCard.style.display    = 'none';
    if (btnCargar)  btnCargar.style.display  = 'none';
    if (aviso)      aviso.style.display      = 'flex';
  }
}

// ── PANTALLA DE FIRMA — helpers ───────────────
// --- NUEVA LÓGICA DE ARRASTRE (Limpia y sin romper el layout) ---

// Esta función reemplaza a activarArrastre y activarArrastreFirma
function toggleConformidadArrastre(btnElement) {
  // Cambia visualmente el interruptor (prende/apaga)
  btnElement.classList.toggle('on');
  
  // Guardamos el estado en tu variable global por si la usás en otro lado
  arrastreRequerido = btnElement.classList.contains('on');
  // Opcional: Si querés mostrar un mensaje o hacer algo más cuando se active/desactive
  if (arrastreRequerido) {
    toast('Arrastre requerido para confirmar esta conformidad', 'info');
  }
}

async function confirmarFirma() {
  if (!hasSig) { toast('El socio debe firmar antes de confirmar', 'error'); return; }

  const nro2 = document.getElementById('firma-nro')?.textContent || '—';

  const btnConfirmar = document.getElementById('btn-firma-confirmar');
  if (btnConfirmar) { btnConfirmar.textContent = 'Guardando... ⏳'; btnConfirmar.style.pointerEvents = 'none'; }

  try {
    const sigCF = document.getElementById('sig-canvas-firma');
    if (sigCF && hasSig) sigDataStore[nro2] = sigCF.toDataURL();

    const confirmaciones = [];
    document.querySelectorAll('#remitos-firma .toggle-row:not([style*="display:none"]) .toggle.on').forEach(t => {
      const row = t.closest('.toggle-row');
      if (row?.querySelector('.toggle-title'))
        confirmaciones.push(row.querySelector('.toggle-title').textContent.trim());
    });

    const datosActualizados = {
      patente:    document.getElementById('firma-edit-patente')?.value    || null,
      marca:      document.getElementById('firma-edit-marca')?.value      || null,
      cliente:    document.getElementById('firma-edit-cliente')?.value    || null,
      origen:     document.getElementById('firma-edit-origen')?.value     || null,
      destino:    document.getElementById('firma-edit-destino')?.value    || null,
      km:         parseInt(document.getElementById('firma-edit-km')?.value)        || null,
      peaje:      parseFloat(document.getElementById('firma-edit-peaje')?.value)     || 0,
      excedente:  parseFloat(document.getElementById('firma-edit-excedente')?.value) || 0,
      otros:      parseFloat(document.getElementById('firma-edit-otros')?.value)     || 0,
      pago:       document.getElementById('firma-pago-selected')?.value   || null,
      pago1Monto: parseFloat(document.getElementById('firma-pago1-monto')?.value) || null,
      pago2Monto: parseFloat(document.getElementById('firma-pago2-monto')?.value) || null,
    };

    // ── Registrar edición en el historial ────────────────
    const edicion = {
      fecha:   new Date().toISOString(),
      usuario: USUARIO_ACTUAL?.email,
      cambios: {
        patente:   datosActualizados.patente,
        origen:    datosActualizados.origen,
        destino:   datosActualizados.destino,
        km:        datosActualizados.km,
        peaje:     datosActualizados.peaje,
        excedente: datosActualizados.excedente,
      }
    };

    const { data: remitoActual } = await _db
      .from('remitos')
      .select('historial_ediciones, cliente_presente')
      .eq('nro_remito', nro2)
      .single();

    const historialActual = Array.isArray(remitoActual?.historial_ediciones)
      ? remitoActual.historial_ediciones
      : [];
    historialActual.push(edicion);

    // ── Subir firma ───────────────────────────────────────
    toast('Subiendo firma...', 'info');
    let firmaUrl = null;
    if (sigCF) {
      const blob = await new Promise(r => sigCF.toBlob(r, 'image/png'));
      const nombre = `firma_${nro2}_${Date.now()}.png`;
      const { error: fe } = await _db.storage
        .from('firmas')
        .upload(nombre, blob, { contentType: 'image/png', upsert: true });
      if (!fe) {
        const { data: fd } = _db.storage.from('firmas').getPublicUrl(nombre);
        firmaUrl = fd.publicUrl;
      } else {
        console.warn('⚠️ No se pudo subir la firma:', fe.message);
      }
    }

    // ── Pago mixto ────────────────────────────────────────
    const metodosValidos = ['efectivo','transferencia','tarjeta','app'];
    const pagosFirma = (datosActualizados.pago || '').split('+').map(p => p.trim().toLowerCase());
    const pago1Firma = metodosValidos.includes(pagosFirma[0]) ? pagosFirma[0] : null;
    const pago2Firma = pagosFirma[1] && metodosValidos.includes(pagosFirma[1]) ? pagosFirma[1] : null;

    // ── Actualizar remito en Supabase ─────────────────────
    toast('Guardando en base de datos...', 'info');

    const _logId = _jornadasAbiertasCache?.[0]?.log_id || _jornadaActivaLocal?.log_id || null;

    const { error } = await _db.from('remitos')
      .update({
        ...(_logId ? { log_id: _logId } : {}),
        patente:              datosActualizados.patente,
        marca_modelo:         datosActualizados.marca,
        razon_social:         datosActualizados.cliente,
        origen:               datosActualizados.origen,
        destino:              datosActualizados.destino,
        km_reales:            datosActualizados.km,
        imp_peaje:            datosActualizados.peaje,
        imp_excedente:        datosActualizados.excedente,
        imp_otros:            datosActualizados.otros,
        firma_imagen_url:     firmaUrl,
        firmado_at:           new Date().toISOString(),
        conformidad_servicio: confirmaciones.includes('Conformidad con el servicio'),
        conformidad_cargos:   confirmaciones.includes('Aceptación de cargos variables'),
        sin_danos:            confirmaciones.includes('Sin daños reportados'),
        conformidad_arrastre: confirmaciones.includes('Conformidad de Arrastre') || null,
        pago_1_metodo:        pago1Firma,
        pago_1_monto:         datosActualizados.pago1Monto,
        pago_2_metodo:        pago2Firma,
        pago_2_monto:         datosActualizados.pago2Monto,
        cliente_presente:     clientePresente,
        historial_ediciones:  historialActual,
        status:               'firmado',
      })
      .eq('nro_remito', nro2);

    if (error) {
      toast('Error al guardar: ' + error.message, 'error');
      return;
    }

    console.log('✅ Remito actualizado en Supabase:', nro2);
    await cargarRemitos();
    showRemitosView('lista');
    toast(`Remito ${nro2} firmado y guardado ✓`, 'success');

  } catch (err) {
    console.error('Error inesperado en confirmarFirma:', err);
    toast('Error inesperado: ' + err.message, 'error');
  } finally {
    if (btnConfirmar) {
      btnConfirmar.textContent = '✅ Confirmar y guardar remito firmado';
      btnConfirmar.style.pointerEvents = 'auto';
    }
  }
}
function simFotoSlot(slot) {
  if (slot.classList.contains('loaded')) return;
  slot.classList.add('loaded');
  slot.style.borderColor = 'var(--green)';
  slot.style.background  = 'var(--green-lo)';
  const icon   = slot.querySelector('.pu-icon');
  const status = slot.querySelector('.pu-text');
  const label  = slot.getAttribute('data-label');
  if (icon)   icon.textContent = '✅';
  if (status) { status.textContent = `${label} cargada`; status.style.color = 'var(--green)'; }
  fotosCount++;
  updateFotoCounter();
}
function updateFotoCounter() {
  const dots = document.querySelectorAll('#foto-counter-dots > div');
  const txt  = document.getElementById('foto-counter-txt');
  dots.forEach((d,i) => d.style.background = i < fotosCount ? 'var(--amber)' : 'var(--border2)');
  if (txt) txt.textContent = `${fotosCount} / 6 fotos cargadas`;
}

// ── FILTROS KM (Registro Diario) ──────────────
const KM_FILTROS = {
  hoy:    { label:'Jornadas de hoy',              stat:'1 jornada activa',   km:'287 km' },
  semana: { label:'Jornadas de esta semana',      stat:'5 jornadas',         km:'1.463 km' },
  mes:    { label:'Jornadas de Marzo 2026',       stat:'18 jornadas',        km:'4.280 km' },
  anio:   { label:'Jornadas del año 2026',        stat:'52 jornadas',        km:'14.820 km' },
};
const KM_ESTADOS = {
  todas:    'Todas las jornadas',
  abiertas: 'Solo jornadas abiertas',
  cerradas: 'Solo jornadas cerradas',
  taller:   'Solo días en taller',
};
function filtrarKM(periodo, el) {
  el.closest('.filter-tabs').querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const d = KM_FILTROS[periodo];
  const lbl  = document.getElementById('km-filtro-label');
  const stat = document.getElementById('km-filtro-stat');
  const km   = document.getElementById('km-filtro-km');
  if (lbl)  lbl.textContent  = d.label;
  if (stat) stat.textContent = '— ' + d.stat;
  if (km)   km.textContent   = 'Total: ' + d.km;
}
function filtrarKMEstado(estado, el) {
  el.closest('.filter-tabs').querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const lbl = document.getElementById('km-filtro-label');
  if (lbl) lbl.textContent = KM_ESTADOS[estado];
}
function filtrarKMFecha(val) {
  if (!val) return;
  const d = new Date(val + 'T00:00:00');
  const fmt = d.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const lbl = document.getElementById('km-filtro-label');
  if (lbl) lbl.textContent = 'Jornada del ' + fmt;
  const stat = document.getElementById('km-filtro-stat');
  if (stat) stat.textContent = '— fecha específica';
}

// ── RANGO PERSONALIZADO KM ───────────────────
function toggleRangoPersonalizado(el) {
  el.closest('.filter-tabs').querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const panel = document.getElementById('km-rango-personalizado');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  const lbl = document.getElementById('km-filtro-label');
  if (lbl) lbl.textContent = 'Rango personalizado';
  const stat = document.getElementById('km-filtro-stat');
  if (stat) stat.textContent = '— seleccioná fechas arriba';
  const km = document.getElementById('km-filtro-km');
  if (km) km.textContent = 'Total: —';
}
function aplicarRangoKM() {
  const desde = document.getElementById('km-rango-desde')?.value;
  const hasta = document.getElementById('km-rango-hasta')?.value;
  if (!desde || !hasta) return;
  const d1 = new Date(desde + 'T00:00:00');
  const d2 = new Date(hasta + 'T00:00:00');
  if (d2 < d1) { toast('La fecha "hasta" debe ser mayor a "desde"', 'error'); return; }
  const diffDays = Math.round((d2 - d1) / 86400000) + 1;
  const fmtD = d1.toLocaleDateString('es-AR', {day:'numeric',month:'short'});
  const fmtH = d2.toLocaleDateString('es-AR', {day:'numeric',month:'short',year:'numeric'});
  const lbl  = document.getElementById('km-filtro-label');
  const stat = document.getElementById('km-filtro-stat');
  const km   = document.getElementById('km-filtro-km');
  const prev = document.getElementById('km-rango-preview');
  if (lbl)  lbl.textContent  = `Del ${fmtD} al ${fmtH}`;
  if (stat) stat.textContent = `— ${diffDays} día${diffDays > 1 ? 's' : ''} seleccionado${diffDays > 1 ? 's' : ''}`;
  if (km)   km.textContent   = `Total: ${(diffDays * 287).toLocaleString('es-AR')} km (est.)`;
  if (prev) { prev.style.display = 'block'; prev.textContent = `✔ Rango aplicado: ${fmtD} → ${fmtH} · ${diffDays} días`; prev.style.color = 'var(--green)'; }
  toast(`Filtro aplicado: ${fmtD} → ${fmtH}`, 'info');
}
function limpiarRangoKM() {
  const desde = document.getElementById('km-rango-desde');
  const hasta = document.getElementById('km-rango-hasta');
  if (desde) desde.value = '';
  if (hasta) hasta.value = '';
  const prev = document.getElementById('km-rango-preview');
  if (prev) prev.style.display = 'none';
  filtrarKM('hoy', document.querySelector('#ftabs-km-periodo .ftab'));
  document.getElementById('km-rango-personalizado').style.display = 'none';
}

// ── PANEL PRINCIPAL: Dual-Contexto ────────────

let _dashVistaActual = 'rendimiento';
let _rendPeriodo     = 'mes';
let _negocioData     = null;
let _negocioRaw      = null;   // datos sin filtrar
let _negocioFiltered = null;   // snapshot filtrado para export
let _fltTrucks       = null;   // Set de truck_id seleccionados (null = todos)
let _fltDrivers      = null;   // Set de driver_id seleccionados (null = todos)
let _fltPeriodo      = '6m';   // período activo
let _chartNegocio   = null;   // instancia Chart.js del gráfico de tendencia negocio
let _chartEvolucion = null;   // instancia Chart.js del gráfico evolución 7 días
let _remitosEfectivoActuales = [];  // remitos con pago en efectivo del render actual
let _rendRemitosActuales    = [];   // remitos del período activo en vista rendimiento
let _negocioUsuariosActuales  = [];
let _negocioLogTruckMapActual = {};
let _negocioJornadasActuales  = [];

// ── helpers ──────────────────────────────────
const _AR = n => Math.round(n).toLocaleString('es-AR');

function _KPI(icon, label, val, color, sub, detail, cta) {
  return `<div class="kpi-dash">
    <div class="kpi-dash-icon">${icon}</div>
    <div class="kpi-dash-label">${label}</div>
    <div class="kpi-dash-val" style="color:${color||'var(--amber)'}">${val}</div>
    ${sub    ? `<div class="kpi-dash-sub">${sub}</div>` : ''}
    ${detail ? `<details class="kpi-more"><summary>Ver más</summary><div class="kpi-more-body">${detail}</div></details>` : ''}
    ${cta    ? `<div class="kpi-dash-cta">${cta}</div>` : ''}
  </div>`;
}

function _mrow(label, val) {
  return `<div class="kpi-more-row"><span>${label}</span><span>${val}</span></div>`;
}

function _metodoRow(label, monto, total) {
  const pct = total > 0 ? Math.round(monto / total * 100) : 0;
  return `<div style="margin-bottom:8px">
    <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
      <span>${label}</span><span style="font-family:'DM Mono'">$${_AR(monto)} <span style="color:var(--muted)">(${pct}%)</span></span>
    </div>
    <div style="height:4px;background:var(--border);border-radius:2px">
      <div style="width:${pct}%;height:100%;background:var(--amber);border-radius:2px"></div>
    </div>
  </div>`;
}

function _desde(tipo) {
  const now = new Date();
  if (tipo === 'hoy')    return now.toISOString().slice(0, 10);
  if (tipo === 'semana') { const d = new Date(now); d.setDate(d.getDate() - 6); return d.toISOString().slice(0,10); }
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
}

// ── cargarDashboard ───────────────────────────
async function _inicializarFiltrosRendAdmin() {
  const esAdmin = PERFIL_USUARIO?.roles?.name === 'administracion' ||
                  PERFIL_USUARIO?.roles?.name === 'supervision';
  const bloque = document.getElementById('dash-rend-filtros-admin');
  if (!bloque) return;
  if (!esAdmin) { bloque.style.display = 'none'; return; }
  bloque.style.display = '';

  // Poblar select de choferes (solo si aún vacío)
  const selChofer = document.getElementById('rend-filtro-chofer');
  if (selChofer && selChofer.options.length === 1) {
    const { data } = await _db.from('users').select('user_id, full_name').eq('role_id', 3).order('full_name');
    (data || []).forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.user_id;
      opt.textContent = u.full_name;
      selChofer.appendChild(opt);
    });
  }

  // Poblar select de camiones (solo si aún vacío)
  const selCamion = document.getElementById('rend-filtro-camion');
  if (selCamion && selCamion.options.length === 1) {
    const { data } = await _db.from('trucks').select('truck_id, plate, numero_interno').eq('status', 'activo').order('plate');
    (data || []).forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.truck_id;
      opt.textContent = t.plate + (t.numero_interno ? ' · N°'+t.numero_interno : '');
      selCamion.appendChild(opt);
    });
  }
}

function dashRendFiltroChange() {
  _cargarViewRendimiento();
}

async function cargarDashboard() {
  if (!USUARIO_ACTUAL?.id) return;
  const esAdmin = PERFIL_USUARIO?.roles?.name === 'administracion' ||
                  PERFIL_USUARIO?.roles?.name === 'supervision';
  const ctxBar = document.getElementById('dash-ctx-bar');
  if (ctxBar) ctxBar.style.display = esAdmin ? '' : 'none';
  await _inicializarFiltrosRendAdmin();
  if (esAdmin && _dashVistaActual === 'negocio') await _cargarViewNegocio();
  else { _dashVistaActual = 'rendimiento'; await _cargarViewRendimiento(); }
}

function dashCambiarVista(vista, el) {
  el.closest('.filter-tabs').querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  _dashVistaActual = vista;
  document.getElementById('dash-view-rendimiento').style.display = vista === 'rendimiento' ? '' : 'none';
  document.getElementById('dash-view-negocio').style.display     = vista === 'negocio'     ? '' : 'none';
  if (vista === 'negocio')     _cargarViewNegocio();
  if (vista === 'rendimiento') _cargarViewRendimiento();
}

function dashRendPeriod(tipo, el) {
  el.closest('.filter-tabs').querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  _rendPeriodo = tipo;
  const lbl = document.getElementById('dash-rend-periodo-lbl');
  if (lbl) lbl.textContent = { hoy:'Hoy', semana:'Últimos 7 días', mes:'Mes actual' }[tipo];
  _cargarViewRendimiento();
}

// ── Vista Chofer ──────────────────────────────
async function _cargarViewRendimiento() {
  document.getElementById('dash-view-rendimiento').style.display = '';
  document.getElementById('dash-view-negocio').style.display     = 'none';

  const LOAD = '<div style="color:var(--muted);font-size:12px;text-align:center;padding:16px">Cargando...</div>';
  ['dash-rend-fin','dash-rend-op-top','dash-rend-op-bot','dash-jornada-hoy-content'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = LOAD;
  });

  const desde = _desde(_rendPeriodo);
  const esAdmin  = PERFIL_USUARIO?.roles?.name === 'administracion' ||
                   PERFIL_USUARIO?.roles?.name === 'supervision';
  const esChofer = PERFIL_USUARIO?.roles?.name === 'chofer';
  const selChofer = document.getElementById('rend-filtro-chofer');
  const selCamion = document.getElementById('rend-filtro-camion');
  const targetUserId = esAdmin && selChofer?.value ? selChofer.value : USUARIO_ACTUAL.id;
  const targetTruck  = esAdmin && selCamion?.value ? parseInt(selCamion.value, 10) : null;

  // Si es admin y no seleccionó chofer, mostrar placeholder
  if (esAdmin && !selChofer?.value) {
    ['dash-rend-fin','dash-rend-op-top','dash-rend-op-bot','dash-jornada-hoy-content'].forEach(id => {
      const el = document.getElementById(id); if (el) el.innerHTML = '';
    });
    const finEl = document.getElementById('dash-rend-fin');
    if (finEl) finEl.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:24px;grid-column:1/-1">Seleccioná un chofer para ver su rendimiento individual.</div>';
    return;
  }

  const [datos, jornadas] = await Promise.all([
    cargarDatosChofer(targetUserId, desde, targetTruck),
    cargarJornadasAbiertas(),
  ]);

  const { remitos, jornadas: logs, fuel, rendicion, alertas } = datos;
  _rendRemitosActuales = remitos;

  // ── Cálculos financieros ──
  let factTotal = 0, factEf = 0, factTr = 0;
  remitos.forEach(r => {
    const p1 = r.pago_1_monto || 0, p2 = r.pago_2_monto || 0;
    factTotal += p1 + p2;
    if (r.pago_1_metodo === 'efectivo') factEf += p1; else if (r.pago_1_metodo === 'transferencia') factTr += p1;
    if (r.pago_2_metodo === 'efectivo') factEf += p2; else if (r.pago_2_metodo === 'transferencia') factTr += p2;
  });
  const efRendido    = rendicion.reduce((s, r) => s + (r.efectivo_declarado || 0), 0);
  const pendiente    = Math.max(0, factEf - efRendido);

  // ── Cálculos operativos ──
  const kmTotal  = logs.reduce((s, j) => s + Math.max(0, (j.km_final||0) - (j.km_inicio||0)), 0);
  const srvs     = remitos.length;
  const truckIds = new Set(logs.map(j => j.truck_id).filter(Boolean));
  const litros   = fuel.filter(f => truckIds.has(f.truck_id)).reduce((s, f) => s + (f.liters || 0), 0);
  const kmPorL      = litros > 0   ? (kmTotal / litros).toFixed(1)  : '—';
  const kmPorJornada = logs.length > 0 ? Math.round(kmTotal / logs.length) : null;
  const srvPorJornada = logs.length > 0 ? Math.round(srvs / logs.length)   : null;
  const kmPorViaje   = srvs > 0        ? Math.round(kmTotal / srvs)        : null;

  // ── Detalles para ver más ──
  const topRemitos  = [...remitos].sort((a,b)=>((b.pago_1_monto||0)+(b.pago_2_monto||0))-((a.pago_1_monto||0)+(a.pago_2_monto||0))).slice(0,3);
  const gastosFuel  = fuel.filter(f=>truckIds.has(f.truck_id)).reduce((s,f)=>s+(f.total_cost||0),0);

  const detTotal = topRemitos.map(r=>_mrow('#'+(r.nro_remito||'—'), '$'+_AR((r.pago_1_monto||0)+(r.pago_2_monto||0)))).join('')
    + `<span class="kpi-more-link" onclick="goTo('remitos')">Ver todos los remitos →</span>`;


  const detPend = pendiente > 0
    ? _mrow('Cobrado en efectivo', '$'+_AR(factEf)) + _mrow('Ya rendido', '$'+_AR(efRendido)) + _mrow('Diferencia', '$'+_AR(pendiente))
    : '<div style="color:var(--muted);font-size:11px">Todo rendido ✓</div>';

  const detKm = logs.slice(0,3).map(j=>_mrow(j.log_date||'—', Math.max(0,(j.km_final||0)-(j.km_inicio||0)).toLocaleString('es-AR')+' km')).join('')
    + `<span class="kpi-more-link" onclick="goTo('registro')">Ver historial de jornadas →</span>`;


  const detXKm = kmTotal > 0
    ? _mrow('KM recorridos', kmTotal.toLocaleString('es-AR')+' km') + _mrow('Facturación', '$'+_AR(factTotal)) + (litros>0?_mrow('Consumo estimado', kmPorL+' km/l'):'') + (gastosFuel>0?_mrow('Costo combustible', '$'+_AR(gastosFuel)):'')
    : '<div style="color:var(--muted);font-size:11px">Sin jornadas cerradas</div>';

  // ── KPIs financieros ──
  const efCount = remitos.filter(r => r.pago_1_metodo==='efectivo'    || r.pago_2_metodo==='efectivo').length;
  const trCount = remitos.filter(r => r.pago_1_metodo==='transferencia'|| r.pago_2_metodo==='transferencia').length;
  const finEl = document.getElementById('dash-rend-fin');
  if (finEl) {
    finEl.style.gridTemplateColumns = esChofer ? 'repeat(3,1fr)' : 'repeat(2,1fr)';
    finEl.innerHTML =
      (esChofer ? '' : _KPI('💰', 'Total generado', '$'+_AR(factTotal), 'var(--amber)', `${srvs} servicios`, detTotal)) +
      _KPI('💵', 'Efectivo en mano',  '$'+_AR(factEf),   'var(--green)',
        `${efCount} cobros`, null,
        `<span class="kpi-dash-cta-btn" onclick="abrirModalDesglosePago('efectivo')">📋 Ver detalle</span>`) +
      _KPI('📲', 'Transferencias',    '$'+_AR(factTr),   'var(--blue)',
        `${trCount} cobros`, null,
        `<span class="kpi-dash-cta-btn" onclick="abrirModalDesglosePago('transferencia')">📋 Ver detalle</span>`) +
      _KPI('⚠️', 'Pendiente de rendir','$'+_AR(pendiente), pendiente>0?'var(--red)':'var(--muted)', pendiente>0?'sin rendir':'al día ✓', detPend);
  }

  // ── KPIs operativos ──
  const opTop = document.getElementById('dash-rend-op-top');
  const opBot = document.getElementById('dash-rend-op-bot');
  if (opTop) opTop.innerHTML =
    _KPI('🚛', 'Km recorridos', kmTotal.toLocaleString('es-AR')+' km', 'var(--amber)',  `${logs.length} jornadas`, detKm) +
    _KPI('📦', 'Servicios',     String(srvs),                          'var(--blue)',
      `${srvs>0?'en el período':''} <span style="cursor:pointer;color:var(--accent);font-size:10px" onclick="goTo('remitos')">Ver remitos →</span>`, null) +
    _KPI('⛽', 'KM / Litro',   kmPorL!=='—'?kmPorL:'—',               'var(--purple)', kmPorL!=='—'?'km/l':'sin datos', null);
  if (opBot) opBot.innerHTML =
    _KPI('📊', 'KM / Jornada', kmPorJornada!==null?String(kmPorJornada):'—', 'var(--green)',
      kmPorJornada!==null?`${srvPorJornada} srv/jornada`:'sin jornadas', null) +
    _KPI('📍', 'KM / Viaje',   kmPorViaje!==null?String(kmPorViaje):'—',    'var(--green)',
      'promedio', null);

  // ── Jornada activa ──
  const jCard = document.getElementById('dash-jornada-hoy-content');
  if (jCard) {
    if (jornadas.length > 0) {
      const j = jornadas[0], t = j.trucks;
      jCard.innerHTML = `<div style="display:flex;align-items:center;gap:14px">
        <div style="width:44px;height:44px;background:var(--amber-lo);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🚛</div>
        <div style="flex:1">
          <div style="font-family:'Bebas Neue';font-size:18px;color:var(--amber)">${t?.plate||'—'} <span style="font-size:12px;color:var(--muted)">${t?.brand||''} ${t?.model||''}</span></div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">KM base: ${(j.km_inicio||0).toLocaleString('es-AR')}</div>
        </div>
        <span class="pill pill-amber">Abierta</span>
      </div>`;
    } else {
      jCard.innerHTML = `<div style="text-align:center;padding:16px;color:var(--muted)">
        <div style="font-size:24px;margin-bottom:8px">🚫</div>
        <div style="font-size:13px">Sin jornada activa hoy</div>
        <button class="btn btn-primary" style="margin-top:12px;font-size:12px" onclick="goTo('registro')">Iniciar jornada →</button>
      </div>`;
    }
  }

  // ── Evolución 7 días (KM + servicios) ──
  const dias7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    dias7.push({ key: d.toISOString().slice(0,10), label: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()], km: 0, srvs: 0 });
  }
  const hace7 = dias7[0].key;
  // KM por día (desde jornadas cerradas)
  logs.filter(j => (j.log_date||'') >= hace7).forEach(j => {
    const d = dias7.find(d => d.key === j.log_date);
    if (d) d.km += Math.max(0, (j.km_final||0) - (j.km_inicio||0));
  });
  // Servicios por día (desde remitos)
  remitos.filter(r => (r.created_at_device||'').slice(0,10) >= hace7).forEach(r => {
    const d = dias7.find(d => d.key === (r.created_at_device||'').slice(0,10));
    if (d) d.srvs++;
  });
  const hoyKey = new Date().toISOString().slice(0,10);
  const hoyIdx = dias7.findIndex(d => d.key === hoyKey);
  const canvas = document.getElementById('dash-evolucion-canvas');
  if (canvas) {
    if (_chartEvolucion) { _chartEvolucion.destroy(); _chartEvolucion = null; }
    _chartEvolucion = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: dias7.map(d => d.label),
        datasets: [
          {
            type: 'bar',
            label: 'KM',
            data: dias7.map(d => d.km),
            backgroundColor: dias7.map((_, i) => i === hoyIdx ? 'rgba(245,166,35,1)' : 'rgba(245,166,35,0.45)'),
            borderRadius: 4,
            borderSkipped: false,
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'Servicios',
            data: dias7.map(d => d.srvs),
            borderColor: '#4ade80',
            backgroundColor: 'rgba(74,222,128,0.12)',
            pointBackgroundColor: '#4ade80',
            pointRadius: 4,
            tension: 0.3,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: true,
            labels: { color: '#6b7280', font: { size: 10 }, boxWidth: 12, padding: 8 },
          },
          tooltip: {
            callbacks: {
              label: ctx => ctx.dataset.label === 'KM'
                ? ctx.parsed.y + ' km'
                : ctx.parsed.y + ' srv',
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#6b7280', font: { size: 10 } },
          },
          y: {
            position: 'left',
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#6b7280', font: { size: 10 }, callback: v => v + ' km' },
            beginAtZero: true,
          },
          y1: {
            position: 'right',
            grid: { display: false },
            ticks: { color: '#4ade80', font: { size: 10 }, stepSize: 1 },
            beginAtZero: true,
          },
        },
      },
    });
  }

  // ── Alertas personales ──
  const alertaCard = document.getElementById('dash-alertas-pers-card');
  const alertaBody = document.getElementById('dash-alertas-pers');
  if (alertaCard && alertaBody) {
    if (alertas.length === 0) {
      alertaCard.style.display = 'none';
    } else {
      alertaCard.style.display = '';
      const TIPO = { diferencia_efectivo:'💰 Diferencia de efectivo', gasto_no_registrado:'🧾 Gasto no registrado', sin_rendicion:'⚠️ Sin rendición' };
      alertaBody.innerHTML = alertas.map(a =>
        `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:var(--red-lo);border:1px solid rgba(231,76,60,0.3);border-radius:7px;margin-bottom:6px">
          <div><div style="font-size:12px;font-weight:600">${TIPO[a.tipo]||a.tipo}</div>
          <div style="font-size:10px;color:var(--muted)">${a.fecha||''}</div></div>
          <div style="font-family:'Bebas Neue';font-size:18px;color:var(--red)">$${_AR(Math.abs(a.diferencia_monto||0))}</div>
        </div>`
      ).join('');
    }
  }
}

// ── Vista Negocio ─────────────────────────────
function _periodoLabel(p) {
  if (p === '1m')  return '1 mes';
  if (p === '3m')  return '3 meses';
  if (p === '12m') return '12 meses';
  if (p === 'año') return 'este año';
  return '6 meses';
}

function _periodoDesde(p) {
  const now = new Date();
  if (p === '1m')  { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.toISOString().slice(0, 10); }
  if (p === '3m')  { const d = new Date(now.getFullYear(), now.getMonth() - 2, 1); return d.toISOString().slice(0, 10); }
  if (p === '12m') { const d = new Date(now.getFullYear(), now.getMonth() - 11, 1); return d.toISOString().slice(0, 10); }
  if (p === 'año') { return `${now.getFullYear()}-01-01`; }
  // default 6m
  const d = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  return d.toISOString().slice(0, 10);
}

async function _cargarViewNegocio() {
  document.getElementById('dash-view-rendimiento').style.display = 'none';
  document.getElementById('dash-view-negocio').style.display     = '';

  const LOAD = '<div style="color:var(--muted);font-size:12px;text-align:center;padding:20px">Cargando...</div>';
  ['dash-neg-kpis-main','dash-neg-kpis-sec','dash-panel-fact','dash-panel-gastos','dash-ranking-body','dash-alertas-neg'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = LOAD;
  });

  const raw = await cargarDatosNegocio(_periodoDesde(_fltPeriodo));
  _negocioRaw = raw;
  _fltTrucks  = null;
  _fltDrivers = null;
  _dashFiltroInicializarUI(raw.usuarios, raw.jornadas);
  _renderNegocioFiltrado();
}

async function dashFiltroPeriodo(p) {
  if (p === _fltPeriodo) return;
  _fltPeriodo = p;
  // Actualizar botones activos
  document.querySelectorAll('.dash-period-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.p === p);
  });
  // Re-fetch con nuevo período
  const LOAD = '<div style="color:var(--muted);font-size:12px;text-align:center;padding:20px">Cargando...</div>';
  ['dash-neg-kpis-main','dash-neg-kpis-sec','dash-panel-fact','dash-panel-gastos','dash-ranking-body','dash-alertas-neg'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = LOAD;
  });
  const raw = await cargarDatosNegocio(_periodoDesde(p));
  _negocioRaw = raw;
  _fltTrucks  = null;
  _fltDrivers = null;
  _dashFiltroInicializarUI(raw.usuarios, raw.jornadas);
  _renderNegocioFiltrado();
}

function _renderNegocioFiltrado() {
  if (!_negocioRaw) return;
  const { remitos: rAll, fuel: fAll, jornadas: jAll, usuarios, alertas: aAll } = _negocioRaw;

  // Mapa log_id → truck_id para filtrar remitos por camión
  const logTruckMap = {};
  jAll.forEach(j => { if (j.log_id) logTruckMap[j.log_id] = j.truck_id; });

  // Aplicar filtros
  const remitos  = rAll.filter(r =>
    (!_fltDrivers || _fltDrivers.has(r.driver_id)) &&
    (!_fltTrucks  || _fltTrucks.has(logTruckMap[r.log_id]))
  );
  const jornadas = jAll.filter(j => (!_fltDrivers || _fltDrivers.has(j.driver_id)) && (!_fltTrucks || _fltTrucks.has(j.truck_id)));
  const fuel     = fAll.filter(f => (!_fltTrucks  || _fltTrucks.has(f.truck_id)));
  const alertas  = aAll.filter(a => (!_fltDrivers || _fltDrivers.has(a.driver_id)));

  // Persistir snapshot para modal de desglose caja en calle
  _remitosEfectivoActuales = remitos.filter(r =>
    r.pago_1_metodo === 'efectivo' || r.pago_2_metodo === 'efectivo'
  );
  _negocioUsuariosActuales  = usuarios;
  _negocioLogTruckMapActual = logTruckMap;
  _negocioJornadasActuales  = jAll;

  // Status bar
  const totTrucks  = new Set(jAll.map(j=>j.truck_id).filter(Boolean)).size;
  const totDrivers = usuarios.length;
  const selTrucks  = _fltTrucks  ? _fltTrucks.size  : totTrucks;
  const selDrivers = _fltDrivers ? _fltDrivers.size : totDrivers;
  const stEl = document.getElementById('dash-filter-status');
  if (stEl) {
    const filtered = _fltTrucks || _fltDrivers;
    stEl.innerHTML = filtered
      ? `<div class="dash-filter-status-dot"></div>Mostrando ${selTrucks} de ${totTrucks} camiones · ${selDrivers} de ${totDrivers} choferes`
      : `<div class="dash-filter-status-dot"></div>Toda la flota · ${totTrucks} camiones · ${totDrivers} choferes · ${_periodoLabel(_fltPeriodo)}`;
  }

  // ── Facturación ──
  let factTotal = 0, factEf = 0, factTr = 0, factOtros = 0, firmados = 0;
  remitos.forEach(r => {
    const p1 = r.pago_1_monto||0, p2 = r.pago_2_monto||0;
    factTotal += p1 + p2;
    const acum = (m, v) => { if (m==='efectivo') factEf+=v; else if (m==='transferencia') factTr+=v; else if (m) factOtros+=v; };
    acum(r.pago_1_metodo,p1); acum(r.pago_2_metodo,p2);
    if (r.status==='firmado') firmados++;
  });

  // ── Gastos ──
  const gastosFuel = fuel.reduce((s,f) => s+(f.total_cost||0), 0);
  const litrosTot  = fuel.reduce((s,f) => s+(f.liters||0), 0);

  // ── Km y métricas globales ──
  const kmTotal   = jornadas.reduce((s,j) => s+Math.max(0,(j.km_final||0)-(j.km_inicio||0)), 0);
  const resultado = factTotal - gastosFuel;
  const cajaEnCalle = factEf; // efectivo total en período = en manos de choferes
  const ticketProm  = remitos.length > 0 ? Math.round(factTotal / remitos.length) : 0;
  const porKmG      = kmTotal > 0 ? (factTotal / kmTotal).toFixed(1) : '—';
  const costoKm     = kmTotal > 0 && litrosTot > 0 ? (gastosFuel / kmTotal).toFixed(1) : '—';
  const deudaTotal  = alertas.reduce((s,a) => s+Math.abs(a.diferencia_monto||0), 0);

  // ── Detalles para KPIs principales ──
  const margenPct  = factTotal > 0 ? Math.round(resultado / factTotal * 100) : 0;
  const detFact    = _mrow('Efectivo', '$'+_AR(factEf)) +
                     _mrow('Transferencia', '$'+_AR(factTr)) +
                     (factOtros>0 ? _mrow('Otros', '$'+_AR(factOtros)) : '') +
                     _mrow('Firmados', firmados + ' de ' + remitos.length);
  const detResult  = _mrow('Facturación', '$'+_AR(factTotal)) +
                     _mrow('Combustible', '−$'+_AR(gastosFuel)) +
                     _mrow('Margen bruto', margenPct+'%');
  const numConDeuda = new Set(alertas.map(a => a.driver_id)).size;
  const detCaja    = _mrow('Efectivo en choferes', '$'+_AR(cajaEnCalle)) +
                     _mrow('Alertas pendientes', _AR(alertas.length)) +
                     (deudaTotal>0 ? _mrow('Deuda total', '$'+_AR(deudaTotal)) : '') +
                     (numConDeuda>0 ? _mrow('Choferes con deuda', numConDeuda) : '');

  // ── Detalles para KPIs secundarios ──
  const jornadasTot = jornadas.length;
  const kmPorJorn   = jornadasTot > 0 ? Math.round(kmTotal / jornadasTot) : 0;
  const detKmG      = _mrow('Km totales', kmTotal.toLocaleString('es-AR')+'km') +
                      _mrow('Jornadas cerradas', jornadasTot) +
                      _mrow('Km / jornada prom.', kmPorJorn+'km');
  const montosList  = remitos.map(r=>(r.pago_1_monto||0)+(r.pago_2_monto||0)).filter(v=>v>0);
  const minTk       = montosList.length > 0 ? Math.min(...montosList) : 0;
  const maxTk       = montosList.length > 0 ? Math.max(...montosList) : 0;
  const detTicket   = _mrow('Ticket promedio', ticketProm>0?'$'+_AR(ticketProm):'—') +
                      _mrow('Ticket mínimo', minTk>0?'$'+_AR(minTk):'—') +
                      _mrow('Ticket máximo', maxTk>0?'$'+_AR(maxTk):'—') +
                      _mrow('Total servicios', remitos.length);
  const detPorKm    = _mrow('$/km (ingresos)', porKmG!=='—'?'$'+porKmG:'—') +
                      _mrow('Km totales', kmTotal.toLocaleString('es-AR')+'km') +
                      _mrow('Facturación total', '$'+_AR(factTotal));
  const detCostoKm  = _mrow('Precio unitario prom. ($/km)', costoKm!=='—'?'$'+costoKm:'—') +
                      _mrow('Total combustible', '$'+_AR(gastosFuel)) +
                      _mrow('Litros cargados', _AR(litrosTot)+'L') +
                      (deudaTotal>0 ? _mrow('⚠️ Deuda en alertas', '$'+_AR(deudaTotal)) : '');

  // ── KPIs principales ──
  const mainEl = document.getElementById('dash-neg-kpis-main');
  if (mainEl) mainEl.innerHTML =
    _KPI('💵', 'Facturación', '$' + _AR(factTotal), 'var(--amber)', `${remitos.length} servicios`, detFact) +
    _KPI('📈', 'Resultado op.', (resultado>=0?'$':'−$') + _AR(Math.abs(resultado)), resultado>=0?'var(--green)':'var(--red)', `${margenPct}% margen`, detResult) +
    _KPI('💰', 'Caja en calle', '$' + _AR(cajaEnCalle), 'var(--blue)', '<span style="cursor:pointer;color:var(--blue);text-decoration:underline" onclick="abrirModalCajaCalle()">Ver desglose completo →</span>', detCaja);

  // ── KPIs secundarios ──
  const secEl = document.getElementById('dash-neg-kpis-sec');
  if (secEl) secEl.innerHTML =
    _KPI('🚛', 'Km totales',   kmTotal.toLocaleString('es-AR') + ' km', 'var(--amber)', jornadasTot+' jornadas', detKmG) +
    _KPI('🎫', 'Ticket prom.', ticketProm > 0 ? '$' + _AR(ticketProm) : '—', 'var(--green)', remitos.length+' servicios', detTicket) +
    _KPI('💸', '$ / Km',       porKmG !== '—' ? '$' + porKmG : '—', 'var(--blue)', 'ingreso por km', detPorKm) +
    _KPI('⛽', 'Costo / Km',   costoKm !== '—' ? '$' + costoKm : '—', deudaTotal>0?'var(--red)':'var(--muted)', deudaTotal>0?'⚠️ $'+_AR(deudaTotal)+' en alertas':'combustible/km', detCostoKm);

  // ── Panel Frecuencia (reemplaza Facturación) ──
  const factEl = document.getElementById('dash-panel-fact');
  if (factEl) factEl.innerHTML = _renderHeatmap(remitos);

  // ── Panel Gastos ──
  const gastosEl = document.getElementById('dash-panel-gastos');
  if (gastosEl) gastosEl.innerHTML = `
    <div class="card-label" style="margin-bottom:14px">⛽ Gastos — ${_periodoLabel(_fltPeriodo)}</div>
    <div style="font-family:'Bebas Neue';font-size:32px;color:var(--red)">${'$'+_AR(gastosFuel)}</div>
    <div style="font-size:10px;color:var(--muted);margin-bottom:14px">${fuel.length} cargas · ${_AR(litrosTot)} L</div>
    <div style="padding:10px 12px;background:var(--bg);border-radius:7px;border:1px solid var(--border)">
      <div style="font-size:10px;color:var(--muted)">MARGEN BRUTO</div>
      <div style="font-family:'Bebas Neue';font-size:22px;color:var(--green)">${'$'+_AR(resultado)}</div>
      <div style="font-size:10px;color:var(--muted)">${factTotal>0?Math.round(resultado/factTotal*100):0}% sobre facturación</div>
    </div>`;

  // ── Datos mensuales ──
  const meses = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    meses.push({ key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label:['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'][d.getMonth()], km:0, srvs:0, fact:0 });
  }
  jornadas.forEach(j => { const m=meses.find(m=>m.key===(j.log_date||'').slice(0,7)); if(m) m.km+=Math.max(0,(j.km_final||0)-(j.km_inicio||0)); });
  remitos.forEach(r  => { const m=meses.find(m=>m.key===(r.created_at_device||'').slice(0,7)); if(m){m.srvs++;m.fact+=(r.pago_1_monto||0)+(r.pago_2_monto||0);} });

  // ── Ranking por chofer ──
  const perChofer = {};
  usuarios.forEach(u => { perChofer[u.user_id] = { nombre:u.full_name, km:0, srvs:0, ingresos:0, deuda:0 }; });
  jornadas.forEach(j => { if(perChofer[j.driver_id]) perChofer[j.driver_id].km += Math.max(0,(j.km_final||0)-(j.km_inicio||0)); });
  remitos.forEach(r  => { if(perChofer[r.driver_id]){ perChofer[r.driver_id].srvs++; perChofer[r.driver_id].ingresos+=(r.pago_1_monto||0)+(r.pago_2_monto||0); } });
  alertas.forEach(a  => { if(perChofer[a.driver_id]) perChofer[a.driver_id].deuda += Math.abs(a.diferencia_monto||0); });

  _negocioData     = { meses, perChofer };
  _negocioFiltered = { remitos, jornadas, fuel, alertas, meses, perChofer, usuarios,
                       factTotal, factEf, factTr, factOtros, gastosFuel, kmTotal, resultado };
  _renderNegocioChart('fact');
  _renderNegocioRanking('ingresos');

  // ── Alertas de negocio ──
  const alertaNegEl = document.getElementById('dash-alertas-neg');
  if (alertaNegEl) {
    if (alertas.length === 0) {
      alertaNegEl.innerHTML = '<div style="color:var(--muted);font-size:12px;text-align:center;padding:20px">Sin alertas pendientes ✓</div>';
    } else {
      const TIPO = { diferencia_efectivo:'💰 Diferencia de efectivo', gasto_no_registrado:'🧾 Gasto no registrado', sin_rendicion:'⚠️ Sin rendición' };
      alertaNegEl.innerHTML = alertas.map(a =>
        `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg);border:1px solid rgba(231,76,60,0.25);border-radius:7px;margin-bottom:6px">
          <div>
            <div style="font-size:12px;font-weight:600">${TIPO[a.tipo]||a.tipo}</div>
            <div style="font-size:10px;color:var(--muted)">${a.fecha||''} ${a.nota_chofer?'· '+a.nota_chofer.slice(0,35):''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:'Bebas Neue';font-size:18px;color:var(--red)">$${_AR(Math.abs(a.diferencia_monto||0))}</div>
            <span class="pill pill-amber" style="font-size:9px">pendiente</span>
          </div>
        </div>`
      ).join('');
    }
  }
}

// ── Heatmap de frecuencia ─────────────────────
function _renderHeatmap(remitos) {
  const DIAS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const HORAS = [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22];

  const grid = Array.from({length: 7}, () => new Array(HORAS.length).fill(0));
  remitos.forEach(r => {
    if (!r.created_at_device) return;
    const d    = new Date(r.created_at_device);
    const dow  = d.getDay();
    const hIdx = HORAS.indexOf(d.getHours());
    if (hIdx >= 0) grid[dow][hIdx]++;
  });

  const max = Math.max(1, ...grid.flat());

  // Peak day/hour
  let peakDow = 1, peakHour = HORAS[0], peakVal = 0;
  for (let d = 0; d < 7; d++) for (let hi = 0; hi < HORAS.length; hi++) {
    if (grid[d][hi] > peakVal) { peakVal = grid[d][hi]; peakDow = d; peakHour = HORAS[hi]; }
  }

  // Avg services per active day
  const byDay = {};
  remitos.forEach(r => { if (r.created_at_device) { const k = r.created_at_device.slice(0,10); byDay[k]=(byDay[k]||0)+1; } });
  const activeDays = Object.keys(byDay).length;
  const avgPerDay  = activeDays > 0 ? (remitos.length / activeDays).toFixed(1) : '—';

  // Most active day name
  const dowTotals = Array(7).fill(0);
  grid.forEach((row, d) => { dowTotals[d] = row.reduce((s,v)=>s+v,0); });
  const topDow  = dowTotals.indexOf(Math.max(...dowTotals));

  const cell = (count) => {
    const op = count === 0 ? 0.06 : (0.15 + 0.75 * (count / max)).toFixed(2);
    return `<div title="${count} servicios" style="border-radius:2px;background:rgba(245,166,35,${op})"></div>`;
  };

  const cols = HORAS.length + 1;
  const headerCells = `<div></div>${HORAS.map(h=>`<div style="font-size:7px;color:var(--muted2);text-align:center;line-height:1">${h}h</div>`).join('')}`;
  const rowCells    = DIAS.map((dia, d) =>
    `<div style="font-size:9px;color:var(--muted2);display:flex;align-items:center;line-height:1">${dia}</div>` +
    HORAS.map((_,hi) => cell(grid[d][hi])).join('')
  ).join('');

  return `
    <div class="card-label" style="margin-bottom:12px">🕐 Frecuencia de servicios — ${_periodoLabel(_fltPeriodo)}</div>
    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:80px;padding:8px 10px;background:var(--bg);border-radius:7px;border:1px solid var(--border)">
        <div style="font-size:9px;color:var(--muted2);margin-bottom:2px">SERVICIOS/DÍA</div>
        <div style="font-family:'Bebas Neue';font-size:22px;color:var(--amber)">${avgPerDay}</div>
        <div style="font-size:9px;color:var(--muted)">${activeDays} días activos</div>
      </div>
      <div style="flex:1;min-width:80px;padding:8px 10px;background:var(--bg);border-radius:7px;border:1px solid var(--border)">
        <div style="font-size:9px;color:var(--muted2);margin-bottom:2px">DÍA MÁS ACTIVO</div>
        <div style="font-family:'Bebas Neue';font-size:22px;color:var(--amber)">${DIAS[topDow]}</div>
        <div style="font-size:9px;color:var(--muted)">${dowTotals[topDow]} servicios</div>
      </div>
      <div style="flex:1;min-width:80px;padding:8px 10px;background:var(--bg);border-radius:7px;border:1px solid var(--border)">
        <div style="font-size:9px;color:var(--muted2);margin-bottom:2px">HORA PICO</div>
        <div style="font-family:'Bebas Neue';font-size:22px;color:var(--amber)">${peakHour}h</div>
        <div style="font-size:9px;color:var(--muted)">${peakVal} servicios</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:28px repeat(${HORAS.length},1fr);gap:3px;">
      ${headerCells}
      ${rowCells}
    </div>
    <div style="display:flex;align-items:center;gap:6px;margin-top:10px;justify-content:flex-end">
      <span style="font-size:9px;color:var(--muted2)">Menos</span>
      ${[0.06,0.25,0.45,0.65,0.85].map(op=>`<div style="width:10px;height:10px;border-radius:2px;background:rgba(245,166,35,${op})"></div>`).join('')}
      <span style="font-size:9px;color:var(--muted2)">Más</span>
    </div>`;
}

// ── Filtros negocio ───────────────────────────
function _dashFiltroInicializarUI(usuarios, jornadas) {
  // Construir listas únicas
  const trucks = [];
  const seenT  = new Set();
  jornadas.forEach(j => {
    if (j.truck_id && !seenT.has(j.truck_id)) {
      seenT.add(j.truck_id);
      trucks.push({ id: j.truck_id, plate: j.trucks?.plate || j.truck_id });
    }
  });

  const tList = document.getElementById('flt-trucks-list');
  const dList = document.getElementById('flt-drivers-list');
  if (tList) tList.innerHTML = trucks.map(t =>
    `<div class="dash-filter-item checked" data-id="${t.id}" onclick="dashFiltroItem('trucks','${t.id}',this)">
       <div class="dash-filter-cb"></div>
       <div><div>${t.plate}</div></div>
     </div>`).join('');
  if (dList) dList.innerHTML = usuarios.map(u =>
    `<div class="dash-filter-item checked" data-id="${u.user_id}" onclick="dashFiltroItem('drivers','${u.user_id}',this)">
       <div class="dash-filter-cb"></div>
       <div><div>${u.full_name||u.email||u.user_id}</div></div>
     </div>`).join('');
}

function dashFiltroToggle(tipo) {
  const dd  = document.getElementById(`flt-${tipo}-dd`);
  const btn = document.getElementById(`flt-${tipo}-btn`);
  const isOpen = dd.classList.contains('open');
  document.querySelectorAll('.dash-filter-dd').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.dash-filter-btn').forEach(b => b.classList.remove('open'));
  if (!isOpen) { dd.classList.add('open'); btn.classList.add('open'); }
}

function dashFiltroItem(tipo, id, el) {
  el.classList.toggle('checked');
  const all    = [...document.querySelectorAll(`#flt-${tipo}-list .dash-filter-item`)];
  const checked = all.filter(i => i.classList.contains('checked'));
  const isAll  = checked.length === all.length;
  if (tipo === 'trucks')  _fltTrucks  = isAll ? null : new Set(checked.map(i => parseInt(i.dataset.id)));
  if (tipo === 'drivers') _fltDrivers = isAll ? null : new Set(checked.map(i => i.dataset.id));
  _dashFiltroActualizarBtn(tipo, checked.length, all.length);
  _dashFiltroActualizarPills();
  _renderNegocioFiltrado();
}

function dashFiltroTodos(tipo) {
  document.querySelectorAll(`#flt-${tipo}-list .dash-filter-item`).forEach(i => i.classList.add('checked'));
  if (tipo === 'trucks')  _fltTrucks  = null;
  if (tipo === 'drivers') _fltDrivers = null;
  const all = document.querySelectorAll(`#flt-${tipo}-list .dash-filter-item`).length;
  _dashFiltroActualizarBtn(tipo, all, all);
  _dashFiltroActualizarPills();
  _renderNegocioFiltrado();
}

function dashFiltroNinguno(tipo) {
  document.querySelectorAll(`#flt-${tipo}-list .dash-filter-item`).forEach(i => i.classList.remove('checked'));
  if (tipo === 'trucks')  _fltTrucks  = new Set();
  if (tipo === 'drivers') _fltDrivers = new Set();
  _dashFiltroActualizarBtn(tipo, 0, document.querySelectorAll(`#flt-${tipo}-list .dash-filter-item`).length);
  _dashFiltroActualizarPills();
  _renderNegocioFiltrado();
}

function dashFiltroReset() {
  ['trucks','drivers'].forEach(t => dashFiltroTodos(t));
}

function dashFiltroSearch(tipo, q) {
  const norm = q.toLowerCase();
  document.querySelectorAll(`#flt-${tipo}-list .dash-filter-item`).forEach(i => {
    i.style.display = i.textContent.toLowerCase().includes(norm) ? '' : 'none';
  });
}

function _dashFiltroActualizarBtn(tipo, sel, total) {
  const btn = document.getElementById(`flt-${tipo}-btn`);
  const lbl = document.getElementById(`flt-${tipo}-lbl`);
  if (!btn || !lbl) return;
  const isAll = sel === total;
  btn.classList.toggle('active', !isAll);
  lbl.innerHTML = isAll
    ? (tipo === 'trucks' ? 'Todos los camiones' : 'Todos los choferes')
    : `${tipo === 'trucks' ? 'Camiones' : 'Choferes'} <span class="dash-filter-count">${sel}</span>`;
}

function _dashFiltroActualizarPills() {
  const pillsEl  = document.getElementById('flt-pills');
  const resetBtn = document.getElementById('flt-reset-btn');
  const pills = [];

  if (_fltTrucks) {
    document.querySelectorAll('#flt-trucks-list .dash-filter-item.checked').forEach(i => {
      pills.push(`<span class="dash-filter-pill">🚛 ${i.querySelector('div > div').textContent} <span class="dash-filter-pill-x" onclick="dashFiltroItem('trucks','${i.dataset.id}',document.querySelector('[data-id=\\'${i.dataset.id}\\']'))">×</span></span>`);
    });
  }
  if (_fltDrivers) {
    document.querySelectorAll('#flt-drivers-list .dash-filter-item.checked').forEach(i => {
      pills.push(`<span class="dash-filter-pill blue">👤 ${i.querySelector('div > div').textContent} <span class="dash-filter-pill-x" onclick="dashFiltroItem('drivers','${i.dataset.id}',document.querySelector('[data-id=\\'${i.dataset.id}\\']'))">×</span></span>`);
    });
  }

  const hasFilter = pills.length > 0;
  if (pillsEl)  { pillsEl.innerHTML = pills.join(''); pillsEl.style.display = hasFilter ? '' : 'none'; }
  if (resetBtn) resetBtn.style.display = hasFilter ? '' : 'none';
}

// Cerrar dropdowns al click fuera
document.addEventListener('click', e => {
  if (!e.target.closest('.dash-filter-group')) {
    document.querySelectorAll('.dash-filter-dd').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.dash-filter-btn').forEach(b => b.classList.remove('open'));
  }
});

// ── Exportar Excel ────────────────────────────
function exportarNegocioExcel() {
  if (!_negocioFiltered || typeof XLSX === 'undefined') {
    alert('Los datos aún no están listos. Esperá un momento.');
    return;
  }

  const { remitos, jornadas, fuel, alertas, meses, perChofer, usuarios,
          factTotal, factEf, factTr, factOtros, gastosFuel, kmTotal, resultado } = _negocioFiltered;

  const nameMap = {};
  usuarios.forEach(u => { nameMap[u.user_id] = u.full_name || u.user_id; });

  // Mapas de patentes y nombres para resumen
  const truckPlates  = [...new Set(jornadas.map(j => j.trucks?.plate).filter(Boolean))].sort();
  const driverNames  = _fltDrivers
    ? usuarios.filter(u => _fltDrivers.has(u.user_id)).map(u => u.full_name)
    : usuarios.map(u => u.full_name);

  const wb = XLSX.utils.book_new();

  // ── Hoja 1: Resumen ──
  const wsResumen = XLSX.utils.aoa_to_sheet([
    ['SIGMA — Reporte de Negocio'],
    ['Período', _periodoLabel(_fltPeriodo)],
    ['Exportado', new Date().toLocaleString('es-AR')],
    [],
    ['FILTROS APLICADOS', ''],
    ['Camiones', truckPlates.length > 0 ? truckPlates.join(', ') : 'Todos'],
    ['Choferes', driverNames.length > 0 ? driverNames.join(', ') : 'Todos'],
    [],
    ['MÉTRICAS', ''],
    ['Facturación total', factTotal],
    ['  Efectivo', factEf],
    ['  Transferencia', factTr],
    ['  Otros', factOtros],
    ['Combustible', gastosFuel],
    ['Resultado operativo', resultado],
    ['Km totales', kmTotal],
    ['Servicios (remitos)', remitos.length],
    ['Cargas de combustible', fuel.length],
    ['Jornadas cerradas', jornadas.length],
    ['Alertas pendientes', alertas.length],
  ]);
  wsResumen['!cols'] = [{ wch: 28 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  // ── Hoja 2: Servicios ──
  const wsServ = XLSX.utils.aoa_to_sheet([
    [
      'Fecha', 'Nro Remito', 'Nro Servicio', 'Chofer',
      'Patente Veh.', 'Marca/Modelo',
      'Tipo Servicio', 'Origen', 'Destino', 'Km Reales',
      'Cliente (Razón Social)', 'CUIT', 'Teléfono', 'Email',
      'Peaje', 'Excedente', 'Otros Extras', 'Total Extras',
      'Método Pago 1', 'Monto 1', 'Método Pago 2', 'Monto 2', 'Total Cobrado',
      'Conformidad Servicio', 'Conformidad Cargos', 'Sin Daños', 'Cliente Presente',
      'Observaciones', 'Estado',
    ],
    ...remitos.map(r => [
      (r.created_at_device || '').slice(0, 10),
      r.nro_remito        || '',
      r.nro_servicio      || '',
      nameMap[r.driver_id] || r.driver_id,
      r.patente           || '',
      r.marca_modelo      || '',
      r.tipo_servicio     || '',
      r.origen            || '',
      r.destino           || '',
      r.km_reales         || '',
      r.razon_social      || '',
      r.cuit              || '',
      r.telefono          || '',
      r.email_cliente     || '',
      r.imp_peaje         || 0,
      r.imp_excedente     || 0,
      r.imp_otros         || 0,
      r.imp_total_extras  || 0,
      r.pago_1_metodo     || '',
      r.pago_1_monto      || 0,
      r.pago_2_metodo     || '',
      r.pago_2_monto      || 0,
      (r.pago_1_monto || 0) + (r.pago_2_monto || 0),
      r.conformidad_servicio ? 'Sí' : 'No',
      r.conformidad_cargos   ? 'Sí' : 'No',
      r.sin_danos            ? 'Sí' : 'No',
      r.cliente_presente === false ? 'No' : 'Sí',
      r.observaciones     || '',
      r.status            || '',
    ])
  ]);
  wsServ['!cols'] = [
    {wch:12},{wch:14},{wch:14},{wch:22},{wch:12},{wch:20},
    {wch:18},{wch:22},{wch:22},{wch:10},
    {wch:28},{wch:14},{wch:14},{wch:24},
    {wch:10},{wch:12},{wch:12},{wch:12},
    {wch:16},{wch:12},{wch:16},{wch:12},{wch:14},
    {wch:20},{wch:20},{wch:12},{wch:16},
    {wch:30},{wch:10},
  ];
  XLSX.utils.book_append_sheet(wb, wsServ, 'Servicios');

  // ── Hoja 3: Combustible ──
  const wsFuel = XLSX.utils.aoa_to_sheet([
    ['Fecha', 'Dominio (Patente)', 'Litros', '$/L', 'Total', 'Km al cargar', 'Cómo pagó', 'App/Tarjeta', 'Estación'],
    ...fuel.map(f => {
      const truckInfo = _negocioRaw?.jornadas?.find(j => j.truck_id === f.truck_id)?.trucks?.plate || f.truck_id || '';
      return [
        f.fuel_date        || '',
        truckInfo,
        f.liters           || 0,
        f.price_per_liter  || 0,
        f.total_cost       || 0,
        f.km_at_load       || '',
        f.payment_method   || '',
        f.payment_app      || '',
        f.gas_station      || '',
      ];
    })
  ]);
  wsFuel['!cols'] = [{wch:12},{wch:16},{wch:10},{wch:10},{wch:12},{wch:14},{wch:16},{wch:16},{wch:24}];
  XLSX.utils.book_append_sheet(wb, wsFuel, 'Combustible');

  // ── Hoja 4: Jornadas ──
  const wsJorn = XLSX.utils.aoa_to_sheet([
    ['Fecha', 'Chofer', 'Dominio', 'Marca/Modelo', 'Km inicio', 'Km final', 'Km recorridos', 'Hora inicio', 'Hora fin', 'Ingresó al taller', 'Detalle taller/Observaciones'],
    ...jornadas.map(j => [
      j.log_date            || '',
      nameMap[j.driver_id]  || j.driver_id,
      j.trucks?.plate       || '',
      j.trucks ? `${j.trucks.brand || ''} ${j.trucks.model || ''}`.trim() : '',
      j.km_inicio           || 0,
      j.km_final            || 0,
      Math.max(0, (j.km_final || 0) - (j.km_inicio || 0)),
      j.hora_inicio         || '',
      j.hora_fin            || '',
      j.in_workshop         ? 'Sí' : 'No',
      j.workshop_detail     || '',
    ])
  ]);
  wsJorn['!cols'] = [{wch:12},{wch:22},{wch:12},{wch:22},{wch:10},{wch:10},{wch:14},{wch:12},{wch:10},{wch:18},{wch:40}];
  XLSX.utils.book_append_sheet(wb, wsJorn, 'Jornadas');

  // ── Hoja 5: Ranking por chofer ──
  const rankRows = Object.values(perChofer).sort((a, b) => b.ingresos - a.ingresos);
  const wsRank = XLSX.utils.aoa_to_sheet([
    ['Chofer', 'Servicios', 'Ingresos', 'Km recorridos', 'Deuda pendiente'],
    ...rankRows.map(c => [c.nombre, c.srvs, c.ingresos, c.km, c.deuda])
  ]);
  wsRank['!cols'] = [{wch:22},{wch:10},{wch:14},{wch:14},{wch:16}];
  XLSX.utils.book_append_sheet(wb, wsRank, 'Ranking Choferes');

  // ── Hoja 6: Mensual ──
  const wsMes = XLSX.utils.aoa_to_sheet([
    ['Mes', 'Facturación', 'Servicios', 'Km'],
    ...meses.map(m => [m.label, m.fact, m.srvs, m.km])
  ]);
  wsMes['!cols'] = [{wch:8},{wch:14},{wch:10},{wch:12}];
  XLSX.utils.book_append_sheet(wb, wsMes, 'Mensual');

  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `sigma_negocio_${fecha}.xlsx`);
}

// ── Gráfico ───────────────────────────────────
function _renderNegocioChart(tipo) {
  if (!_negocioData) return;
  const { meses } = _negocioData;
  const vals   = meses.map(m => m[tipo]);
  const labels = meses.map(m => m.label);
  const cur    = new Date().toISOString().slice(0, 7);
  const fmt    = tipo === 'fact' ? v => '$' + _AR(v) : v => v.toLocaleString('es-AR');

  const canvas = document.getElementById('dash-chart-canvas');
  if (!canvas) return;

  if (_chartNegocio) { _chartNegocio.destroy(); _chartNegocio = null; }

  _chartNegocio = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: vals,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.08)',
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: meses.map(m => m.key === cur ? '#f59e0b' : 'rgba(245,158,11,0.4)'),
        pointRadius: meses.map(m => m.key === cur ? 5 : 3),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => fmt(ctx.parsed.y),
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#6b7280', font: { size: 10 } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#6b7280', font: { size: 10 }, callback: v => fmt(v) },
          beginAtZero: true,
        },
      },
    },
  });
}

// ── Ranking ───────────────────────────────────
function _renderNegocioRanking(tipo) {
  if (!_negocioData) return;
  const lista = Object.values(_negocioData.perChofer);
  const el    = document.getElementById('dash-ranking-body');
  if (!el) return;
  if (lista.length === 0) { el.innerHTML = '<div style="color:var(--muted);font-size:12px;text-align:center;padding:20px">Sin datos</div>'; return; }

  let sorted, metrica, sub;
  if (tipo === 'ingresos') {
    sorted  = [...lista].sort((a,b)=>b.ingresos-a.ingresos);
    metrica = c => '$'+_AR(c.ingresos);
    sub     = c => c.srvs+' servicios';
  } else if (tipo === 'km') {
    sorted  = [...lista].sort((a,b)=>b.km-a.km);
    metrica = c => c.km.toLocaleString('es-AR')+' km';
    sub     = c => c.srvs+' servicios';
  } else if (tipo === 'eficiencia') {
    sorted  = [...lista].sort((a,b)=>(b.srvs?b.km/b.srvs:0)-(a.srvs?a.km/a.srvs:0));
    metrica = c => c.srvs ? Math.round(c.km/c.srvs).toLocaleString('es-AR')+' km/srv' : '—';
    sub     = c => c.srvs+' srvs · '+c.km.toLocaleString('es-AR')+' km';
  } else {
    sorted  = [...lista].sort((a,b)=>b.deuda-a.deuda);
    metrica = c => '$'+_AR(c.deuda);
    sub     = c => c.deuda>0?'diferencia pendiente':'sin alertas ✓';
  }

  const MEDALS = ['🥇','🥈','🥉'];
  const isDeuda = tipo === 'deuda';
  const rawOf   = c => tipo==='ingresos'?c.ingresos : tipo==='km'?c.km : tipo==='eficiencia'?(c.srvs?c.km/c.srvs:0) : c.deuda;
  const maxVal  = Math.max(...sorted.map(rawOf), 1);

  el.innerHTML = sorted.map((c,i) => {
    const pct      = Math.max(4, Math.round(rawOf(c)/maxVal*100));
    const barColor = isDeuda && c.deuda>0 ? 'var(--red)' : 'var(--amber)';
    const valColor = isDeuda && c.deuda>0 ? 'var(--red)' : 'var(--amber)';
    return `<div style="padding:10px 12px;background:var(--bg);border-radius:7px;border:1px solid var(--border);margin-bottom:6px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">${MEDALS[i]||'#'+(i+1)}</span>
          <div><div style="font-size:13px;font-weight:700">${c.nombre}</div>
          <div style="font-size:10px;color:var(--muted)">${sub(c)}</div></div>
        </div>
        <div style="font-family:'Bebas Neue';font-size:18px;color:${valColor}">${metrica(c)}</div>
      </div>
      <div style="height:4px;background:var(--border);border-radius:2px">
        <div style="width:${pct}%;height:100%;background:${barColor};border-radius:2px;transition:width 0.4s"></div>
      </div>
    </div>`;
  }).join('');
}

function dashChartSwitch(tipo, el) {
  el.closest('.filter-tabs').querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  _renderNegocioChart(tipo);
}

function dashRankSwitch(tipo, el) {
  el.closest('.filter-tabs').querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  _renderNegocioRanking(tipo);
}

// ══════════════════════════════════════════════
//  MODAL ENGINE
// ══════════════════════════════════════════════
function openModal(id) {
  const m = document.getElementById(id);
 if (!m) {
    console.error(`🚨 ERROR CRÍTICO UI: Intentaste abrir el modal '${id}' pero no existe en el HTML.`);
    return;
  }
  m.classList.add('open');
  if (m.classList.contains('modal-overlay')) m.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Inyectar fecha/hora actual automáticamente en modales de Control del Camión
  const now  = new Date();
  const hoy  = now.toISOString().slice(0,10);
  const hora = now.toTimeString().slice(0,5);

  const autoDateFields = {
    'modal-neumaticos':   ['neu-fecha'],
    'modal-service-log':  ['sl-fecha'],
    'modal-plan':         [],
    'modal-combustible':  [],
  };

  if (autoDateFields[id] !== undefined) {
    autoDateFields[id].forEach(fieldId => {
      const el = document.getElementById(fieldId);
      if (el && !el.value) el.value = hoy;
    });
  }

  // Fecha+hora en remito nuevo
  if (id === 'modal-nueva-jornada') {
    const fd = document.getElementById('nj-fecha');
    const fh = document.getElementById('nj-hora');
    if (fd && !fd.value) fd.value = hoy;
    if (fh && !fh.value) fh.value = hora;
  }
  if (id === 'modal-cerrar-jornada') {
    const fh = document.getElementById('cj-hora');
    if (fh) fh.value = hora; // siempre pone la hora actual
  }
}

// Close on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
});


// ── INPUT SANITIZERS ────────────────────────────
function sanitizeDecimal(input) {
  let v = input.value.replace(/[^0-9.,]/g, '').replace(',', '.');
  const parts = v.split('.');
  if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
  input.value = v;
}
function sanitizeInt(input) {
  input.value = input.value.replace(/[^0-9]/g, '');
}

// ── MODAL INLINE ERROR ──────────────────────────
function _modalError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

// ── TOAST ─────────────────────────────────────
function toast(msg, type='success', duration=3000) {
  const icons = { success:'✅', error:'❌', info:'💡' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── SIMULA FOTO CARGADA ────────────────────────
function simFoto(boxId, statusId) {
  const box = document.getElementById(boxId);
  const status = document.getElementById(statusId);
  const icon = box.querySelector('[id$="-icon"], .pu-icon');
  if (!box || !status) return;
  box.style.borderColor = 'var(--green)';
  box.style.background  = 'var(--green-lo)';
  status.textContent = '✅ Foto cargada correctamente';
  status.style.color = 'var(--green)';
  if (icon) icon.textContent = '✅';
}

// ── WIRE UP BOTONES ───────────────────────────
// Registro diario

function wireButtons() {
  // 1. Limpieza de botones con atributos inline viejos
  const btnNJ = document.querySelector('button[onclick*="Jornada iniciada"]');
  if (btnNJ) { 
    btnNJ.removeAttribute('onclick'); 
    btnNJ.onclick = () => openModal('modal-nueva-jornada'); 
  }

  const btnCJ = document.querySelector('button[onclick*="Jornada cerrada"]');
  if (btnCJ) { 
    btnCJ.removeAttribute('onclick'); 
    btnCJ.onclick = () => openModal('modal-cerrar-jornada'); 
  }

  // 2. Diccionario de Acciones (Evita los múltiples IFs)
  // Mapeamos el texto exacto con la función que debe ejecutar
  const actionMap = {
    '+ Agregar viaje':     () => openModal('modal-agregar-viaje'),
    '+ Nuevo plan':        () => openPlanModal(),
    '+ Registrar service': () => openServiceModal(),
    '+ Agregar service':   () => openServiceModal(),
    '+ Nuevo registro':    () => openModal('modal-nuevo-registro'),
    '+ Registrar':         () => openNeumaticosModal()
  };

  // 3. Recorremos los botones una sola vez
  document.querySelectorAll('button').forEach(btn => {
    const text = btn.textContent.trim();

    // Si el texto del botón existe en nuestro diccionario, asignamos la acción
    if (actionMap[text]) {
      btn.onclick = actionMap[text];
    }

    // 4. Caso Especial: Prevención de Conflictos para Combustible
    if (text === '+ Cargar') {
      // Usamos .closest() para asegurarnos de que NO estamos afectando 
      // al botón de la nueva pantalla de Documentación.
      if (!btn.closest('#screen-documentos')) {
        btn.onclick = () => openFuelModal();
      }
    }
  });
} 

// ── GUARDAR — JORNADA ─────────────────────────
function guardarNuevaJornada() {
  const km = document.getElementById('nj-km')?.value;
  const camion = document.getElementById('nj-camion');
  const hora = document.getElementById('nj-hora')?.value || new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
  if (!km) { toast('Ingresá el kilometraje inicial', 'error'); return; }
  closeModal('modal-nueva-jornada');

  // Update alert strip
  const strip = document.querySelector('.alert-strip.ok span:nth-child(2)');
  if (strip) strip.innerHTML = `<b>Jornada activa</b> — Iniciada a las ${hora}. Camión: ${camion?.options[camion.selectedIndex]?.text?.split('·')[0]?.trim() || ''}`;

  // Add "Abierta" row to historial (not servicios del día)
  const tbody = document.getElementById('tbody-historial-jornadas');
  if (tbody) {
    const today = new Date().toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'});
    const existingToday = tbody.querySelector('tr[data-today]');
    if (!existingToday) {
      const tr = document.createElement('tr');
      tr.setAttribute('data-today','1');
      tr.setAttribute('data-km-inicio', km);
      tr.innerHTML = `
        <td><b>${today}</b> <span class="pill pill-blue" style="font-size:8px;padding:2px 5px">Hoy</span></td>
        <td style="font-family:'DM Mono'">${parseInt(km).toLocaleString('es-AR')}</td>
        <td style="font-family:'DM Mono'">—</td>
        <td><span style="font-family:'DM Mono';color:var(--muted)">En curso</span></td>
        <td>—</td>
        <td><span class="pill pill-muted">No</span></td>
        <td><span class="pill pill-amber">Abierta</span></td>`;
      tbody.insertBefore(tr, tbody.firstChild);
    }
  }
  toast(`Jornada iniciada · KM: ${parseInt(km).toLocaleString('es-AR')}`, 'success');
}

function calcKmRecorridos() {
  const kmFinal = parseInt(document.getElementById('cj-km')?.value) || 0;
  const kmInicio = 182340;
  const diff = kmFinal - kmInicio;
  const el = document.getElementById('cj-km-calc');
  if (el) {
    el.textContent = diff > 0 ? `+${diff.toLocaleString('es-AR')} km` : '— km';
    el.style.color = diff > 0 ? 'var(--amber)' : 'var(--muted)';
  }
}

function guardarCerrarJornada() {
  const kmFinal = document.getElementById('cj-km')?.value;
  if (!kmFinal) { toast('Ingresá el kilometraje final', 'error'); return; }
  closeModal('modal-cerrar-jornada');

  const tbody = document.getElementById('tbody-historial-jornadas');
  if (tbody) {
    // Try to find and update existing "today" row first
    const existingRow = tbody.querySelector('tr[data-today]');
    const kmInicio = existingRow ? parseInt(existingRow.getAttribute('data-km-inicio')) || 182340 : 182340;
    const diff = parseInt(kmFinal) - kmInicio;
    const horas = document.getElementById('cj-hora')?.value || '—';
    const today = new Date().toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'});

    if (existingRow) {
      existingRow.innerHTML = `
        <td><b>${today}</b> <span class="pill pill-blue" style="font-size:8px;padding:2px 5px">Hoy</span></td>
        <td style="font-family:'DM Mono'">${kmInicio.toLocaleString('es-AR')}</td>
        <td style="font-family:'DM Mono'">${parseInt(kmFinal).toLocaleString('es-AR')}</td>
        <td><span style="font-family:'DM Mono';color:var(--amber);font-weight:600">${diff > 0 ? diff.toLocaleString('es-AR') : '—'} km</span></td>
        <td>${horas} hs</td>
        <td><span class="pill pill-muted">No</span></td>
        <td><span class="pill pill-green">Cerrada</span></td>`;
      existingRow.removeAttribute('data-today');
    } else {
      // No open row — just insert a new closed one
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><b>${today}</b></td>
        <td style="font-family:'DM Mono'">${kmInicio.toLocaleString('es-AR')}</td>
        <td style="font-family:'DM Mono'">${parseInt(kmFinal).toLocaleString('es-AR')}</td>
        <td><span style="font-family:'DM Mono';color:var(--amber);font-weight:600">${diff > 0 ? diff.toLocaleString('es-AR') : '—'} km</span></td>
        <td>${horas} hs</td>
        <td><span class="pill pill-muted">No</span></td>
        <td><span class="pill pill-green">Cerrada</span></td>`;
      tbody.insertBefore(tr, tbody.firstChild);
    }
  }
  // Update alert strip
  const strip = document.querySelector('.alert-strip.ok');
  if (strip) {
    strip.className = 'alert-strip warn mb16';
    strip.innerHTML = `<span>ℹ️</span><span>No hay jornada activa hoy. <b>Iniciá una nueva jornada</b> para comenzar.</span>`;
  }
  toast('Jornada cerrada y guardada correctamente', 'success');
}

// ── GUARDAR — VIAJE ───────────────────────────
function guardarViaje() {
  const origen  = document.getElementById('av-origen')?.value.trim();
  const destino = document.getElementById('av-destino')?.value.trim();
  const nroSrv  = document.getElementById('av-nro-srv')?.value.trim() || '—';
  const patente = (document.getElementById('av-patente')?.value.trim() || '—').toUpperCase();
  const tipo    = document.getElementById('av-tipo-srv')?.value || 'Servicio';
  const km      = document.getElementById('av-km')?.value || '—';
  const salida  = document.getElementById('av-salida')?.value || new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});

  if (!origen || !destino) { toast('Completá origen y destino', 'error'); return; }
  closeModal('modal-agregar-viaje');

  // → Tabla Servicios del día
  const tbody = document.querySelector('#tabla-viajes tbody');
  if (tbody) {
    const num = String(tbody.rows.length + 1).padStart(2,'0');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--muted);font-family:'DM Mono'">${num}</td>
      <td><span style="font-family:'DM Mono';color:var(--amber);font-size:11px">${nroSrv}</span></td>
      <td><span style="font-family:'DM Mono';font-weight:600">${patente}</span></td>
      <td><span class="pill pill-blue">${tipo}</span></td>
      <td>${origen}</td>
      <td>${destino}</td>
      <td style="font-family:'DM Mono'">${salida}</td>
      <td><span style="font-family:'DM Mono';color:var(--amber)">${km !== '—' ? km+' km' : '—'}</span></td>
      <td><span class="pill pill-green">✓ Completado</span></td>`;
    tbody.appendChild(tr);
    const counter = document.getElementById('viajes-counter');
    if (counter) counter.textContent = `${tbody.rows.length} servicios registrados`;
  }

  // → Historial de jornadas (misma lógica que al guardar remito)
  if (km !== '—') {
    const tbodyH = document.getElementById('tbody-historial-jornadas');
    if (tbodyH) {
      const today = new Date().toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'});
      const existingRow = tbodyH.querySelector('tr[data-today]');
      if (existingRow) {
        const kmCell = existingRow.querySelector('td:nth-child(4) span');
        if (kmCell) {
          const prev = parseInt(kmCell.textContent.replace(/\D/g,'')) || 0;
          kmCell.textContent = (prev + parseInt(km)) + ' km';
        }
      } else {
        const tr = document.createElement('tr');
        tr.setAttribute('data-today','1');
        tr.innerHTML = `
          <td><b>${today}</b> <span class="pill pill-blue" style="font-size:8px;padding:2px 5px">Hoy</span></td>
          <td style="font-family:'DM Mono'">182.340</td>
          <td style="font-family:'DM Mono'">—</td>
          <td><span style="font-family:'DM Mono';color:var(--amber);font-weight:600">${km} km</span></td>
          <td>—</td>
          <td><span class="pill pill-muted">No</span></td>
          <td><span class="pill pill-amber">Abierta</span></td>`;
        tbodyH.insertBefore(tr, tbodyH.firstChild);
      }
    }
  }

  // Reset fields
  ['av-origen','av-destino','av-km','av-notas','av-nro-srv','av-patente'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value='';
  });
  toast(`Servicio ${origen} → ${destino} agregado`, 'success');
}

// carga extra toggle in viaje modal (legacy - kept for compat)
const _avCargaTipo = document.getElementById('av-carga-tipo');
if (_avCargaTipo) _avCargaTipo.addEventListener('change', function(e) {
  const val  = e.target.value;
  const cont = document.getElementById('av-carga-extra-container');
  if (cont) cont.style.display = val === 'con carga' ? 'block' : 'none';
});
// ── MÓDULO CAMIÓN ─────────────────────────────
let _truckActual        = null;
let _camionCombustible  = [];
let _camionNeumaticos   = null;
let _camionPlanes       = [];
let _camionHistorial    = [];
let _camionLogDate      = null;

async function cargarScreenCamion() {
  const truckId   = _jornadasAbiertasCache?.[0]?.truck_id  || null;
  const truckData = _jornadasAbiertasCache?.[0]?.trucks     || null;
  _camionLogDate  = _jornadasAbiertasCache?.[0]?.log_date   || null;

  if (!truckId) {
    _truckActual       = null;
    _camionCombustible = [];
    _camionNeumaticos  = null;
    _camionPlanes      = [];
    _camionHistorial   = [];
    _renderCamionSinJornada();
    return;
  }

  _truckActual = { truck_id: truckId, ...truckData };

  const set     = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const nombre  = `${truckData?.brand || ''} ${truckData?.model || ''}`.trim() || '—';
  const patente = truckData?.plate || '—';
  const km      = _truckActual.current_km != null ? _truckActual.current_km.toLocaleString('es-AR') : null;
  set('camion-nombre',  nombre.toUpperCase());
  set('camion-detalle', `Patente: ${patente}`);
  set('camion-km-pill', km != null ? `${km} km actuales` : '— km actuales');
  set('camion-sec-sub', `${nombre} · ${patente}`);

  const [combustible, ultimoControl, services, planes] = await Promise.all([
    cargarCombustible(truckId),
    cargarUltimoControlNeumaticos(truckId),
    cargarHistorialServices(truckId),
    cargarPlanesDetalleOptimizados(truckId),
  ]);

  _camionCombustible = _camionLogDate
    ? (combustible || []).filter(r => r.fuel_date >= _camionLogDate)
    : (combustible || []);
  _camionNeumaticos  = (!_camionLogDate || ultimoControl?.check_date >= _camionLogDate) ? ultimoControl : null;
  _camionPlanes      = planes || [];
  _camionHistorial   = services || [];

  _renderCamionCards();
  renderPlanes(_camionPlanes);
  renderHistorialServices(_camionHistorial);
  _volverCamionMain();
}

function _renderCamionSinJornada() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  ['camion-nombre','camion-detalle','camion-sec-sub'].forEach(id => set(id, '—'));
  set('camion-km-pill', '— km');
  const pill = document.getElementById('camion-next-service-pill');
  if (pill) pill.style.display = 'none';
  const cont = document.getElementById('camion-cards-container');
  if (cont) cont.innerHTML = `
    <div class="card" style="text-align:center;padding:30px;color:var(--muted)">
      Iniciá una jornada para ver el camión activo
    </div>`;
  _volverCamionMain();
}

function _renderCamionCards() {
  const cont = document.getElementById('camion-cards-container');
  if (!cont) return;

  const esChofer = PERFIL_USUARIO?.roles?.name === 'chofer';

  // ── Estado Neumáticos ──
  const neuOk    = !!_camionNeumaticos;
  const neuLabel = { bueno: 'Bueno', regular: 'Regular', malo: 'Malo' };
  const neuColor = neuOk
    ? (_camionNeumaticos.tire_condition === 'bueno' ? '#4ade80'
      : _camionNeumaticos.tire_condition === 'regular' ? '#f59e0b' : '#ef4444')
    : '#ef4444';
  const neuStatus = neuOk
    ? `${neuLabel[_camionNeumaticos.tire_condition] || '—'} · ${neuLabel[_camionNeumaticos.brake_condition] || '—'} frenos`
    : '⚠ Sin control hoy';
  const neuBorder = neuOk ? '#f59e0b' : (esChofer ? '#ef4444' : '#f59e0b');

  // ── Estado Combustible ──
  const totalLitros = _camionCombustible.reduce((s, r) => s + (r.liters || 0), 0);
  const totalPesos  = _camionCombustible.reduce((s, r) => s + (r.total_cost || 0), 0);
  const combStatus  = _camionCombustible.length
    ? (esChofer
        ? `${_camionCombustible.length} carga${_camionCombustible.length > 1 ? 's' : ''} · ${totalLitros} L`
        : `${totalLitros} L · ${totalPesos.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })}`)
    : 'Sin cargas esta jornada';
  const combColor = _camionCombustible.length ? '#4ade80' : 'var(--muted)';

  // ── Estado Mantenimiento / Planes ──
  const planUrgente = (_camionPlanes || [])
    .filter(p => p.plan_estado && p.plan_estado !== '_error')
    .sort((a, b) => (a.km_restantes ?? Infinity) - (b.km_restantes ?? Infinity))[0];
  const estadoLabel = { al_dia: '✓ Al día', proximo: '⚠ Próximo', vencido: '✕ Vencido', sin_registro: '— Sin ejecución', sin_odometro: '— Sin odómetro' };
  const mantStatus  = planUrgente
    ? `${estadoLabel[planUrgente.plan_estado] || ''} · ${planUrgente.name}`
    : (_camionPlanes.length ? 'Al día' : 'Sin planes');
  const mantColor   = planUrgente
    ? (planUrgente.plan_estado === 'al_dia' ? '#4ade80'
      : planUrgente.plan_estado === 'proximo' ? '#f59e0b' : '#ef4444')
    : '#4ade80';

  const mkCard = (icon, title, status, statusColor, borderColor, actionLabel, actionBg, actionFg, actionFn, subId) => `
    <div class="camion-module-card" style="border-left-color:${borderColor}">
      <span class="camion-card-icon">${icon}</span>
      <div class="camion-card-info">
        <div class="camion-card-title">${title}</div>
        <div class="camion-card-status" style="color:${statusColor}">${status}</div>
      </div>
      <div class="camion-card-actions">
        <button class="btn-camion-action"
          style="background:${actionBg};color:${actionFg}"
          onclick="${actionFn}">${actionLabel}</button>
        <button class="btn-camion-ver" onclick="_abrirSubCamion('${subId}')">Ver →</button>
      </div>
    </div>`;

  let html = '';
  if (esChofer) {
    html += mkCard('🔧','Neumáticos & Frenos', neuStatus, neuColor, neuBorder,
      '+ Registrar','#ef4444','#fff','openNeumaticosModal()','camion-sub-neumaticos');
    html += mkCard('⛽','Combustible', combStatus, combColor,'#3b82f6',
      '+ Cargar','#3b82f6','#fff','openFuelModal()','camion-sub-combustible');
    html += mkCard('🔩','Mantenimiento', mantStatus, mantColor,'#4ade80',
      '+ Registrar','#4ade80','#000','openServiceModal()','camion-sub-mantenimiento');
  } else {
    html += mkCard('🔧','Neumáticos & Frenos', neuStatus, neuColor, neuBorder,
      '+ Registrar','#f59e0b','#000','openNeumaticosModal()','camion-sub-neumaticos');
    html += mkCard('⛽','Combustible', combStatus, combColor,'#3b82f6',
      '+ Cargar','#3b82f6','#fff','openFuelModal()','camion-sub-combustible');
    html += mkCard('📋','Planes de Service',
      `${(_camionPlanes || []).filter(p => !p._error).length} planes activos`,
      '#a78bfa','#a78bfa',
      '+ Plan','#a78bfa','#000','openPlanModal()','camion-sub-planes');
    html += mkCard('🔩','Historial Ejecuciones',
      _camionHistorial.length ? 'Últimos services del camión' : 'Sin services registrados',
      'var(--muted)','#4ade80',
      '+ Service','#4ade80','#000','openServiceModal()','camion-sub-historial');
  }
  cont.innerHTML = html;

  // Próximo service pill en hero (admin/supervisor)
  if (!esChofer && planUrgente) {
    const pill = document.getElementById('camion-next-service-pill');
    if (pill) {
      pill.textContent = `⚙ ${planUrgente.name} en ${Math.abs(planUrgente.km_restantes || 0).toLocaleString('es-AR')} km`;
      pill.style.display = '';
    }
  }
}

const _CAMION_SUBS = [
  'camion-sub-combustible',
  'camion-sub-neumaticos',
  'camion-sub-mantenimiento',
  'camion-sub-planes',
  'camion-sub-historial',
];

function _volverCamionMain() {
  _CAMION_SUBS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const main = document.getElementById('camion-main-view');
  if (main) main.style.display = '';
}

function _abrirSubCamion(subId) {
  const main = document.getElementById('camion-main-view');
  if (main) main.style.display = 'none';
  _CAMION_SUBS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById(subId);
  if (target) target.style.display = '';

  if (subId === 'camion-sub-combustible')   _renderSubCombustible();
  if (subId === 'camion-sub-neumaticos')    _renderSubNeumaticos();
  if (subId === 'camion-sub-mantenimiento') _renderSubMantenimiento();
  // 'camion-sub-planes' and 'camion-sub-historial' are pre-rendered by renderPlanes/renderHistorialServices
}

function _renderSubCombustible() {
  const body = document.getElementById('camion-sub-combustible-body');
  if (!body) return;

  const esChofer    = PERFIL_USUARIO?.roles?.name === 'chofer';
  const totalLitros = _camionCombustible.reduce((s, r) => s + (r.liters || 0), 0);
  const totalPesos  = _camionCombustible.reduce((s, r) => s + (r.total_cost || 0), 0);

  const summaryPesos = esChofer ? '' : `
    <div class="camion-summary-item">
      <div class="camion-summary-label">Total $</div>
      <div class="camion-summary-value" style="color:#4ade80">
        ${totalPesos.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })}
      </div>
    </div>`;

  body.innerHTML = `
    <div class="camion-summary-row">
      <div class="camion-summary-item">
        <div class="camion-summary-label">Litros</div>
        <div class="camion-summary-value">${totalLitros} L</div>
      </div>
      ${summaryPesos}
      <div class="camion-summary-item">
        <div class="camion-summary-label">Cargas</div>
        <div class="camion-summary-value">${_camionCombustible.length}</div>
      </div>
    </div>
    <div class="card-label" style="margin-bottom:8px">Cargas de esta jornada</div>
    <div class="card">${_renderCombustibleList(_camionCombustible, esChofer)}</div>
    <div style="color:var(--muted);font-size:10px;text-align:center;margin-top:8px">
      Solo se muestran cargas de la jornada activa
    </div>`;
}

function _renderCombustibleList(data, esChofer) {
  const payIcons = { efectivo: '💵', transferencia: '🏦', app: '📱', tarjeta: '💳' };
  if (!data.length) return `
    <div style="text-align:center;color:var(--muted);padding:20px">
      Sin cargas registradas en esta jornada
    </div>`;
  return `<table class="data-table" style="width:100%">
    <thead>
      <tr>
        <th>Fecha</th>
        <th>Litros</th>
        ${esChofer ? '' : '<th>Total</th>'}
        <th>Pago</th>
      </tr>
    </thead>
    <tbody>
      ${data.map(r => {
        const fecha = new Date(r.fuel_date + 'T12:00:00')
          .toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
        const total = Number(r.total_cost || 0)
          .toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
        return `<tr>
          <td>${payIcons[r.payment_method] || '💵'} ${fecha}</td>
          <td style="font-family:'DM Mono'">${r.liters} L</td>
          ${esChofer ? '' : `<td style="font-family:'DM Mono';color:var(--amber)">${total}</td>`}
          <td style="font-size:11px;color:var(--muted)">${r.payment_app || r.payment_method || '—'}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

function _renderSubNeumaticos() {
  const body = document.getElementById('camion-sub-neumaticos-body');
  if (!body) return;

  if (!_camionNeumaticos) {
    body.innerHTML = `
      <div class="card" style="text-align:center;padding:30px">
        <div style="font-size:32px;margin-bottom:8px">🔧</div>
        <div style="color:var(--muted);font-size:13px">Sin control registrado en esta jornada</div>
        <div style="color:var(--muted);font-size:11px;margin-top:6px">
          Registrá el estado antes de arrancar
        </div>
      </div>`;
    return;
  }

  const d          = _camionNeumaticos;
  const pillClass  = { bueno: 'pill-green', regular: 'pill-amber', malo: 'pill-red' };
  const pillLabel  = { bueno: 'Bueno', regular: 'Regular', malo: 'Malo' };
  const fecha      = new Date(d.check_date + 'T12:00:00')
    .toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });

  body.innerHTML = `
    <div class="card">
      <div class="card-label" style="margin-bottom:12px">Control de esta jornada</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:10px 12px;background:var(--bg);border-radius:7px;border:1px solid var(--border)">
          <div style="font-size:12px">Neumáticos</div>
          <div style="display:flex;align-items:center;gap:8px">
            ${d.pressure_psi
              ? `<span style="font-family:'DM Mono';font-size:11px;color:var(--muted)">${d.pressure_psi} PSI</span>`
              : ''}
            <span class="pill ${pillClass[d.tire_condition] || 'pill-muted'}">
              ${pillLabel[d.tire_condition] || '—'}
            </span>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:10px 12px;background:var(--bg);border-radius:7px;border:1px solid var(--border)">
          <div style="font-size:12px">Frenos</div>
          <span class="pill ${pillClass[d.brake_condition] || 'pill-muted'}">
            ${pillLabel[d.brake_condition] || '—'}
          </span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:10px 12px;background:var(--bg);border-radius:7px;border:1px solid var(--border)">
          <div style="font-size:12px">Fecha</div>
          <span style="font-size:12px;font-family:'DM Mono';color:var(--muted)">${fecha}</span>
        </div>
      </div>
    </div>`;
}

function _renderSubMantenimiento() {
  const body = document.getElementById('camion-sub-mantenimiento-body');
  if (!body) return;

  if (!_camionPlanes?.length) {
    body.innerHTML = `
      <div class="card" style="text-align:center;padding:30px;color:var(--muted)">
        Sin planes de service asignados a este camión
      </div>`;
    return;
  }

  const estadoColor = {
    al_dia: 'var(--green)', proximo: 'var(--amber)', vencido: 'var(--red)',
    sin_registro: 'var(--muted)', sin_odometro: 'var(--muted)',
  };
  const estadoLabel = {
    al_dia: '✓ Al día', proximo: '⚠ Próximo', vencido: '✕ Vencido',
    sin_registro: '— Sin ejecución', sin_odometro: '— Sin odómetro',
  };

  const planesHtml = _camionPlanes.map(p => {
    const estado   = p.plan_estado || 'sin_registro';
    const color    = estadoColor[estado];
    const label    = estadoLabel[estado];
    const kmInfo   = p.interval_km
      ? `Cada <b style="color:var(--amber);font-family:'DM Mono'">${p.interval_km.toLocaleString('es-AR')} km</b>`
      : '';
    const nextDue  = p.next_due_km ? p.next_due_km.toLocaleString('es-AR') + ' km' : '—';
    const restante = p.km_restantes != null
      ? `${p.km_restantes > 0 ? 'Faltan' : 'Excedidos'} <b>${Math.abs(p.km_restantes).toLocaleString('es-AR')} km</b>`
      : '';
    const progreso = (p.next_due_km && p.interval_km && p.km_restantes != null)
      ? Math.min(100, Math.max(0, Math.round(((p.interval_km - p.km_restantes) / p.interval_km) * 100)))
      : 0;
    return `
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;
        padding:14px 16px;margin-bottom:10px">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div style="width:36px;height:36px;border-radius:8px;background:var(--amber-lo);
            display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">🔧</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
              <span style="font-size:13px;font-weight:600">${p.name}</span>
              <span style="font-size:10px;padding:2px 8px;border-radius:20px;
                background:${color}22;color:${color};font-weight:600">${label}</span>
            </div>
            <div style="font-size:10px;color:var(--muted);margin-bottom:6px">${kmInfo}</div>
            <div style="background:var(--border);border-radius:3px;height:4px;overflow:hidden;margin-bottom:6px">
              <div style="width:${progreso}%;height:100%;background:${color};border-radius:3px"></div>
            </div>
            <div style="font-size:9px;color:var(--muted)">PRÓXIMO VENCIMIENTO</div>
            <div style="font-family:'DM Mono';font-size:14px;font-weight:700;color:${color}">${nextDue}</div>
            ${restante ? `<div style="font-size:10px;color:var(--muted)">${restante}</div>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  const histHtml = _camionHistorial.length ? `
    <div class="card-label" style="margin:16px 0 8px">Historial</div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Fecha</th><th>Service</th><th>KM</th></tr></thead>
        <tbody>
          ${_camionHistorial.slice(0, 5).map(s => {
            const fecha = new Date(s.performed_at + 'T12:00:00')
              .toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
            return `<tr>
              <td>${fecha}</td>
              <td style="font-weight:600">${s.master_service_plans?.name || '—'}</td>
              <td style="font-family:'DM Mono'">${(s.km_at_service || 0).toLocaleString('es-AR')} km</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : '';

  body.innerHTML = planesHtml + histHtml;
}

function renderCombustible(data) {
  const tbody = document.getElementById('tbody-combustible');
  if (!tbody) return;
  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Sin cargas registradas</td></tr>';
    return;
  }
  const payIcons  = { efectivo:'💵', transferencia:'🏦', app:'📱', tarjeta:'💳' };
  const payColors = { efectivo:'var(--green)', transferencia:'var(--blue)', app:'var(--cyan)', tarjeta:'var(--purple)' };
  const payLabels = { efectivo:'Efectivo', transferencia:'Transfer.', app:'App', tarjeta:'Tarjeta' };

  tbody.innerHTML = data.map(r => {
    const fecha  = new Date(r.fuel_date + 'T12:00:00').toLocaleDateString('es-AR', { day:'2-digit', month:'short' });
    const total  = Number(r.total_cost || 0).toLocaleString('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 });
    const precio = Number(r.price_per_liter || 0).toLocaleString('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 });
    const method = r.payment_method || 'efectivo';
    const appTag = r.payment_app ? `<div style="font-size:9px;color:var(--muted)">${r.payment_app}</div>` : '';
    return `<tr>
      <td>${fecha}</td>
      <td style="font-family:'DM Mono'">${r.liters} L</td>
      <td style="font-family:'DM Mono'">${precio}</td>
      <td style="font-family:'DM Mono';color:var(--amber)">${total}</td>
      <td><div style="display:flex;align-items:center;gap:5px">
        <span style="font-size:14px">${payIcons[method] || '💵'}</span>
        <div><div style="font-size:11px;font-weight:600;color:${payColors[method]}">${payLabels[method]}</div>${appTag}</div>
      </div></td>
    </tr>`;
  }).join('');
}

// ── OFFLINE — INDEXEDDB ───────────────────────
const _IDB_NAME  = 'SigmaOfflineDB';
const _IDB_STORE = 'fuel_queue';

function _idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_IDB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(_IDB_STORE))
        db.createObjectStore(_IDB_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function _idbAdd(datos) {
  const db  = await _idbOpen();
  return new Promise((resolve, reject) => {
    const req = db.transaction(_IDB_STORE, 'readwrite').objectStore(_IDB_STORE).add({ ...datos, _savedAt: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function _idbGetAll() {
  const db = await _idbOpen();
  return new Promise((resolve, reject) => {
    const req = db.transaction(_IDB_STORE, 'readonly').objectStore(_IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function _idbDelete(id) {
  const db = await _idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(_IDB_STORE, 'readwrite');
    tx.objectStore(_IDB_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

async function _idbUpdate(registro) {
  const db = await _idbOpen();
  return new Promise((resolve, reject) => {
    const req = db.transaction(_IDB_STORE, 'readwrite').objectStore(_IDB_STORE).put(registro);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// Sincronización al recuperar señal
window.addEventListener('online',  syncOfflineFuel);
window.addEventListener('offline', _actualizarEstadoConexion);
window.addEventListener('online',  _actualizarEstadoConexion);

function _actualizarEstadoConexion() {
  const btn   = document.getElementById('cb-scan-btn');
  const label = document.getElementById('cb-scan-label');
  if (!btn || !label) return;
  if (navigator.onLine) {
    btn.disabled      = false;
    btn.style.opacity = '1';
    label.textContent = 'Escanear ticket con IA';
  } else {
    btn.disabled      = true;
    btn.style.opacity = '0.4';
    label.textContent = 'OCR no disponible sin señal';
  }
}

async function syncOfflineFuel() {
  const todos = await _idbGetAll();
  // Solo procesar los pendientes (no los que ya fallaron con error de validación)
  const pendientes = todos.filter(r => !r._syncError);
  if (!pendientes.length) return;

  let exitos = 0;
  let erroresValidacion = 0;

  for (const registro of pendientes) {
    const { id, _savedAt, ...datos } = registro;
    const resultado = await registrarCombustible(datos);

    if (resultado.ok) {
      await _idbDelete(id);
      exitos++;
    } else if (resultado.isValidation) {
      // Error de datos — marcar para revisión manual, no reintentar
      await _idbUpdate({ ...registro, _syncError: true, _errorMsg: resultado.errorMsg });
      erroresValidacion++;
    }
    // Si isValidation=false (error de red) → no hacer nada, se reintentará la próxima vez
  }

  await actualizarIndicadorOffline();

  if (exitos > 0) {
    toast(`✅ ${exitos} carga${exitos > 1 ? 's' : ''} offline sincronizada${exitos > 1 ? 's' : ''}`, 'success');
    if (_truckActual?.truck_id) {
      cargarScreenCamion();
    }
  }

  if (erroresValidacion > 0) {
    toast(
      `⚠️ ${erroresValidacion} carga${erroresValidacion > 1 ? 's' : ''} no pudieron sincronizarse — abrí la cola para corregirlas`,
      'error'
    );
  }
}

// Verificar al iniciar si hay registros con error de validación pendientes
async function verificarOfflineErrores() {
  await actualizarIndicadorOffline();
  const todos = await _idbGetAll();
  const conError = todos.filter(r => r._syncError);
  if (conError.length > 0) {
    toast(`⚠️ Hay ${conError.length} carga${conError.length > 1 ? 's' : ''} offline con errores — revisá la cola`, 'error');
  }
}

async function actualizarIndicadorOffline() {
  const todos       = await _idbGetAll();
  const indicador   = document.getElementById('offline-indicator');
  const badgeText   = document.getElementById('offline-badge-text');
  const btnSync     = document.getElementById('btn-sync-manual');
  if (!indicador) return;

  if (todos.length === 0) {
    indicador.style.display = 'none';
    return;
  }

  const conError    = todos.filter(r => r._syncError).length;
  const pendientes  = todos.length - conError;
  const partes      = [];
  if (pendientes > 0) partes.push(`${pendientes} pendiente${pendientes > 1 ? 's' : ''}`);
  if (conError   > 0) partes.push(`${conError} con error`);

  indicador.style.display   = 'flex';
  indicador.style.background = conError > 0 ? 'var(--red)' : 'var(--amber)';
  indicador.style.color      = conError > 0 ? '#fff'       : '#000';
  if (badgeText) badgeText.textContent = partes.join(' · ');
  if (btnSync)   btnSync.disabled = !navigator.onLine;
}

async function abrirColaOffline() {
  const todos  = await _idbGetAll();
  const lista  = document.getElementById('offline-queue-lista');
  if (!lista) return;

  if (!todos.length) {
    lista.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px">Sin registros pendientes</div>';
    openModal('modal-offline-queue');
    return;
  }

  lista.innerHTML = todos.map(r => {
    const fecha   = r.fuel_date || new Date(r._savedAt).toLocaleDateString('es-AR');
    const litros  = r.liters  ? `${r.liters} L` : '—';
    const precio  = r.price_per_liter ? `$${r.price_per_liter}/L` : '';
    const estacion = r.gas_station || '';
    const tieneError = !!r._syncError;

    const pillColor = tieneError ? 'var(--red)' : 'var(--blue)';
    const pillLabel = tieneError ? '✕ Error' : '⏳ Pendiente';
    const errorMsg  = tieneError ? `<div style="font-size:10px;color:var(--red);margin-top:4px">${r._errorMsg || 'Error de validación'}</div>` : '';

    const acciones = tieneError
      ? `<div style="display:flex;gap:6px;margin-top:10px">
           <button onclick="editarRegistroOffline(${r.id})" class="btn btn-primary" style="font-size:11px;padding:5px 12px">✏️ Editar y reintentar</button>
           <button onclick="eliminarRegistroOffline(${r.id})" class="btn btn-ghost" style="font-size:11px;padding:5px 12px;color:var(--red)">🗑 Eliminar</button>
         </div>`
      : '';

    return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
        <div style="font-size:12px;font-weight:600">${fecha} · ${litros} ${precio}</div>
        <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${pillColor}22;color:${pillColor};font-weight:600;flex-shrink:0">${pillLabel}</span>
      </div>
      ${estacion ? `<div style="font-size:11px;color:var(--muted)">${estacion}</div>` : ''}
      ${errorMsg}
      ${acciones}
    </div>`;
  }).join('');

  openModal('modal-offline-queue');
}

async function eliminarRegistroOffline(id) {
  if (!confirm('¿Eliminar este registro? No se puede deshacer.')) return;
  await _idbDelete(id);
  await actualizarIndicadorOffline();
  await abrirColaOffline(); // re-render
}

let _idEditandoOffline = null;

async function editarRegistroOffline(id) {
  const todos   = await _idbGetAll();
  const registro = todos.find(r => r.id === id);
  if (!registro) return;

  // Guardar referencia para borrarlo al confirmar
  _idEditandoOffline = id;

  // Abrir modal de combustible pre-relleno
  closeModal('modal-offline-queue');

  // Asegurarse de que _truckActual esté disponible
  if (!_truckActual?.truck_id) {
    toast('Necesitás tener una jornada abierta para editar este registro', 'warning');
    _idEditandoOffline = null;
    return;
  }

  const info = document.getElementById('cb-camion-info');
  if (info) info.textContent = `${_truckActual.plate || '—'}`;

  const set = (id, val) => { if (val != null) { const el = document.getElementById(id); if (el) el.value = val; } };
  set('cb-fecha',   registro.fuel_date);
  set('cb-litros',  registro.liters);
  set('cb-precio',  registro.price_per_liter);
  set('cb-km',      registro.km_at_load);
  set('cb-estacion', registro.gas_station);
  if (registro.liters && registro.price_per_liter) calcCombTotal();
  if (registro.payment_method) selectPayBtn('cb', registro.payment_method);
  _modalError('cb-error', '');
  openModal('modal-combustible');
}

// ── LECTOR DE TICKET OCR ──────────────────────
async function leerTicketCombustible(input) {
  const file = input.files[0];
  if (!file) return;

  const status = document.getElementById('cb-scan-status');
  const mostrar = (msg, color, bg) => {
    status.style.display = 'block';
    status.style.color = color;
    status.style.background = bg;
    status.style.border = `1px solid ${color}44`;
    status.innerHTML = msg;
  };

  mostrar('⏳ Analizando ticket con IA...', 'var(--amber)', 'var(--amber-lo)');

  // Comprimir imagen si es muy grande
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1600;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width  = img.width  * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
try {
    // LLAMADO A LA EDGE FUNCTION DE SUPABASE
    const res = await fetch(`${SUPABASE_URL}/functions/v1/procesar-ticket`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}` // Seguridad vital
      },
      body: JSON.stringify({ imagen_base64: base64 }),
    });

    if (!res.ok) { 
      const errData = await res.json().catch(() => ({}));
      mostrar(`❌ Error: ${errData.error || res.statusText}`, 'var(--red)', 'rgba(255,59,48,0.1)'); 
      return; 
    }
    
    const d = await res.json();
    if (d.error || !d.success) { 
      mostrar(`❌ ${d.error || 'No se pudo leer el ticket'}`, 'var(--red)', 'rgba(255,59,48,0.1)'); 
      return; 
    }

    // Rellenar campos
    const set = (id, val) => { if (val != null) { const el = document.getElementById(id); if (el) el.value = val; } };
    set('cb-litros',  d.litros);
    set('cb-precio',  d.precio_por_litro);
    set('cb-km',      d.km);
    set('cb-estacion', d.estacion);
    set('cb-fecha',   d.fecha);
    if (d.litros && d.precio_por_litro) calcCombTotal();

    if (d.metodo_pago) {
      const metodos = { efectivo:'efectivo', transferencia:'transferencia', tarjeta:'transferencia' };
      const m = metodos[d.metodo_pago] || null;
      if (m) selectPayBtn('cb', m);
    }

    // Cruzar patente detectada con el camión activo
    if (d.patente) {
      const patenteDetectada = d.patente.replace(/\s|-/g, '').toUpperCase();
      const patenteActual = (_truckActual?.plate || '').replace(/\s|-/g, '').toUpperCase();
      const info = document.getElementById('cb-camion-info');
      if (patenteActual && patenteDetectada === patenteActual) {
        if (info) info.textContent = `✓ ${_truckActual.plate} · ${_truckActual.brand || ''} ${_truckActual.model || ''}`.trim();
      } else if (patenteActual && patenteDetectada !== patenteActual) {
        if (info) info.textContent = `⚠ Ticket: ${d.patente} — Jornada: ${_truckActual.plate}`;
      }
    }

    // Resumen de lo detectado
    const campos = [
      d.litros          && `${d.litros} L`,
      d.precio_por_litro && `$${d.precio_por_litro}/L`,
      d.total           && `Total $${d.total}`,
      d.estacion        && d.estacion,
      d.km              && `${d.km} km`,
      d.fecha           && d.fecha,
      d.patente         && `Patente: ${d.patente}`,
    ].filter(Boolean);

    mostrar(
      `✅ Detectado: ${campos.length ? campos.join(' · ') : 'Verificá los campos'}<br><span style="font-size:10px;opacity:0.7">Revisá que los datos sean correctos antes de guardar</span>`,
      'var(--green)', 'rgba(52,199,89,0.1)'
    );
  } catch (err) {
    mostrar('❌ No se pudo conectar con el servidor local', 'var(--red)', 'rgba(255,59,48,0.1)');
    console.error('[OCR]', err);
  }

  // Limpiar el input para permitir re-escanear la misma imagen
  input.value = '';
}

// ── GUARDAR — COMBUSTIBLE ─────────────────────
let selectedPayMethod = '';
function selectPayBtn(prefix, method) {
  document.querySelectorAll('[id^="'+prefix+'-"]').forEach(el => {
    el.style.borderColor = 'var(--border)'; el.style.background = 'var(--bg)';
  });
  const sel = document.getElementById(prefix + '-' + method);
  if (sel) { sel.style.borderColor = 'var(--amber)'; sel.style.background = 'var(--amber-lo)'; }
  selectedPayMethod = method;
  const appSel = document.getElementById('cb-app-select');
  if (appSel) appSel.style.display = method === 'app' ? 'block' : 'none';
}

let selectedApp = '';
function selectAppBtn(el, name) {
  document.querySelectorAll('.app-btn2').forEach(o => { o.style.borderColor='var(--border)'; o.style.background='var(--bg)'; });
  el.style.borderColor = 'var(--cyan)'; el.style.background = 'rgba(46,196,214,0.1)';
  selectedApp = name;
}

function calcCombTotal() {
  const l = parseFloat(document.getElementById('cb-litros')?.value) || 0;
  const p = parseFloat(document.getElementById('cb-precio')?.value) || 0;
  const el = document.getElementById('cb-total');
  if (el) el.textContent = '$' + (l * p).toLocaleString('es-AR');
}

async function guardarCombustible() {
  const litros = parseFloat(document.getElementById('cb-litros')?.value);
  const precio = parseFloat(document.getElementById('cb-precio')?.value);
  const fecha  = document.getElementById('cb-fecha')?.value;
  const km     = parseInt(document.getElementById('cb-km')?.value) || null;
  const estacion = document.getElementById('cb-estacion')?.value || null;

  if (!fecha)                     { _modalError('cb-error', 'Seleccioná la fecha'); return; }
  if (!litros || isNaN(litros))   { _modalError('cb-error', 'Ingresá los litros cargados'); return; }
  if (litros <= 0)                { _modalError('cb-error', 'Los litros deben ser un valor mayor a 0'); return; }
  if (litros > 5000)              { _modalError('cb-error', 'Los litros ingresados parecen incorrectos (máx. 5000)'); return; }
  if (!precio || isNaN(precio))   { _modalError('cb-error', 'Ingresá el precio por litro'); return; }
  if (precio <= 0)                { _modalError('cb-error', 'El precio debe ser mayor a 0'); return; }
  if (km !== null && km <= 0)     { _modalError('cb-error', 'Los KM deben ser un valor mayor a 0'); return; }
  if (!selectedPayMethod)         { _modalError('cb-error', 'Seleccioná el medio de pago'); return; }
  if (selectedPayMethod === 'app' && !selectedApp) { _modalError('cb-error', 'Seleccioná la app de pago'); return; }
  _modalError('cb-error', '');

  const datos = {
    truck_id:        _truckActual.truck_id,
    fuel_date:       fecha || new Date().toISOString().slice(0, 10),
    liters:          litros,
    price_per_liter: precio,
    km_at_load:      km,
    payment_method:  selectedPayMethod,
    payment_app:     selectedPayMethod === 'app' ? selectedApp : null,
    gas_station:     estacion,
  };

  if (!navigator.onLine) {
    // Sin señal: guardar en IndexedDB (reemplazar si venía de edición)
    if (_idEditandoOffline !== null) await _idbDelete(_idEditandoOffline);
    _idEditandoOffline = null;
    await _idbAdd(datos);
    await actualizarIndicadorOffline();
    toast('Sin señal — carga guardada localmente. Se sincronizará al recuperar conexión.', 'warning');
    closeModal('modal-combustible');
    selectedPayMethod = ''; selectedApp = '';
    return;
  }

  const btn = document.getElementById('btn-guardar-combustible');
  if (btn) { btn.textContent = 'Guardando...'; btn.style.pointerEvents = 'none'; }

  const resultado = await registrarCombustible(datos);

  if (btn) { btn.textContent = '⛽ Guardar carga'; btn.style.pointerEvents = 'auto'; }

  if (resultado.ok) {
    // Si era edición de un registro offline, eliminar el original de la cola
    if (_idEditandoOffline !== null) { await _idbDelete(_idEditandoOffline); _idEditandoOffline = null; }
    await actualizarIndicadorOffline();
    toast(`${litros}L registrados correctamente`, 'success');
    closeModal('modal-combustible');
    selectedPayMethod = ''; selectedApp = '';
    cargarScreenCamion();
  } else {
    _idEditandoOffline = null;
    toast(`Error al guardar: ${resultado.errorMsg || 'Error desconocido'}`, 'error');
  }
}

// ── NEUMÁTICOS & FRENOS ───────────────────────
function openNeumaticosModal() {
  if (!_truckActual?.truck_id) { toast('No hay un camión activo para esta jornada', 'error'); return; }
  const info = document.getElementById('neu-camion-info');
  if (info) info.textContent = `${_truckActual.plate || '—'} · ${_truckActual.brand || ''} ${_truckActual.model || ''}`;
  const fecha = document.getElementById('neu-fecha');
  if (fecha) fecha.value = new Date().toISOString().slice(0, 10);
  ['neu-cond','neu-frenos'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['neu-psi','neu-notas'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  _modalError('neu-error', '');
  openModal('modal-neumaticos');
}

function renderUltimoControlNeumaticos(data) {
  const pillClass = { bueno:'pill-green', regular:'pill-amber', malo:'pill-red' };
  const pillLabel = { bueno:'Bueno', regular:'Regular', malo:'Malo' };

  const condEl   = document.getElementById('neu-display-cond');
  const frenosEl = document.getElementById('neu-display-frenos');
  const psiEl    = document.getElementById('neu-display-psi');
  const fechaEl  = document.getElementById('neu-display-fecha');
  const tireStatus = document.getElementById('camion-tire-status');

  if (!data) {
    if (condEl)   { condEl.className = 'pill pill-muted'; condEl.textContent = '—'; }
    if (frenosEl) { frenosEl.className = 'pill pill-muted'; frenosEl.textContent = '—'; }
    if (psiEl)    psiEl.textContent = '—';
    if (fechaEl)  fechaEl.textContent = 'Sin registros';
    if (tireStatus) tireStatus.textContent = '—';
    return;
  }

  if (condEl)   { condEl.className = `pill ${pillClass[data.tire_condition] || 'pill-muted'}`; condEl.textContent = pillLabel[data.tire_condition] || '—'; }
  if (frenosEl) { frenosEl.className = `pill ${pillClass[data.brake_condition] || 'pill-muted'}`; frenosEl.textContent = pillLabel[data.brake_condition] || '—'; }
  if (psiEl)    psiEl.textContent = data.pressure_psi ? `${data.pressure_psi} PSI` : '—';
  if (fechaEl)  fechaEl.textContent = new Date(data.check_date + 'T12:00:00').toLocaleDateString('es-AR', { day:'2-digit', month:'short', year:'numeric' });
  if (tireStatus) {
    tireStatus.textContent = pillLabel[data.tire_condition] || '—';
    tireStatus.style.color = data.tire_condition === 'bueno' ? 'var(--green)' : data.tire_condition === 'regular' ? 'var(--amber)' : 'var(--red)';
  }
}

async function guardarNeumaticos() {
  const cond   = document.getElementById('neu-cond')?.value;
  const frenos = document.getElementById('neu-frenos')?.value;
  const fecha  = document.getElementById('neu-fecha')?.value;
  const psi    = parseFloat(document.getElementById('neu-psi')?.value) || null;
  const notas  = document.getElementById('neu-notas')?.value || null;

  if (!cond)                        { _modalError('neu-error', 'Seleccioná el estado de los neumáticos'); return; }
  if (!frenos)                      { _modalError('neu-error', 'Seleccioná el estado de los frenos'); return; }
  if (psi !== null && psi <= 0)     { _modalError('neu-error', 'La presión PSI debe ser mayor a 0'); return; }
  if (psi !== null && psi > 250)    { _modalError('neu-error', 'La presión PSI parece incorrecta (máx. 250)'); return; }
  _modalError('neu-error', '');

  const btn = document.getElementById('btn-guardar-neumaticos');
  if (btn) { btn.textContent = 'Guardando...'; btn.style.pointerEvents = 'none'; }

  const exito = await registrarControlNeumaticos({
    truck_id:        _truckActual.truck_id,
    check_date:      fecha || new Date().toISOString().slice(0, 10),
    tire_condition:  cond,
    brake_condition: frenos,
    pressure_psi:    psi,
    notes:           notas,
  });

  if (btn) { btn.textContent = '🔩 Guardar control'; btn.style.pointerEvents = 'auto'; }

  if (exito) {
    toast(`Control registrado · Neumáticos: ${cond} · Frenos: ${frenos}`, 'success');
    closeModal('modal-neumaticos');
    cargarScreenCamion();
  } else {
    toast('Error al guardar el control', 'error');
  }
}

// ── PLANES DE SERVICE ─────────────────────────
let selectedTrigger = '';

// ── ASIGNACIÓN DE PLANES (NUEVO FLUJO MASTER-DETAIL) ─────────────────

async function openAsignarPlanModal() {

  if (!_truckActual?.truck_id) { toast('Seleccioná un camión primero', 'error'); return; }

  // 1. Mostramos el nombre del camión en el modal
  const info = document.getElementById('ap-camion-info');
  if (info) info.textContent = `${_truckActual.plate} · ${_truckActual.brand || ''}`;

  // 1. Abrimos el modal y mostramos estado de carga
  const select = document.getElementById('ap-plan-select');
  if (select) select.innerHTML = '<option value="">⏳ Cargando catálogo...</option>';
  openModal('modal-asignar-plan');

  // 2. Traemos las reglas globales desde Supabase
  const catalogo = await cargarCatalogoPlanes();

  // 3. Pobramos el select
  if (select) {
    if (catalogo.length === 0) {
      select.innerHTML = '<option value="">⚠️ No hay planes globales creados</option>';
      return;
    }

    select.innerHTML = '<option value="">— Seleccioná un plan del catálogo —</option>';
    catalogo.forEach(plan => {
      const opt = document.createElement('option');
      opt.value = plan.id;
      
      // Armamos un texto descriptivo rápido (ej: "Cambio de Aceite (Cada 40,000 km)")
      const cadencia = plan.interval_km ? `${plan.interval_km.toLocaleString('es-AR')} km` : `${plan.interval_hours} hs`;
      opt.textContent = `${plan.name} (Cada ${cadencia})`;
      
      select.appendChild(opt);
    });
  }
}

async function asignarPlanAlCamion() {
  const masterPlanId = document.getElementById('ap-plan-select')?.value;
  
  if (!masterPlanId) { toast('Seleccioná un plan de la lista', 'error'); return; }

  const btn = document.getElementById('btn-asignar-plan');
  if (btn) { btn.textContent = 'Asignando...'; btn.style.pointerEvents = 'none'; }

  // Llamamos a la nueva función de supabase.js
  const resultado = await suscribirCamionAPlan(_truckActual.truck_id, parseInt(masterPlanId));

  if (btn) { btn.textContent = '➕ Asignar al camión'; btn.style.pointerEvents = 'auto'; }

  if (resultado.ok) {
    toast('Plan asignado exitosamente', 'success');
    closeModal('modal-asignar-plan');
    
    // Refrescamos la UI del camión
    const planesActualizados = await cargarPlanesDetalleOptimizados(_truckActual.truck_id);
    renderPlanes(planesActualizados);
  } else {
    toast(`Error: ${resultado.errorMsg}`, 'error');
  }
}

function renderPlanes(data) {
  const lista = document.getElementById('planes-lista');
  if (!lista) return;

  if (data?._error) {
    lista.innerHTML = '<div style="text-align:center;color:var(--red);padding:20px;font-size:13px">⚠ Error al cargar planes de service. Revisá la conexión.</div>';
    return;
  }

  const esAdmin = PERFIL_USUARIO?.roles?.name === 'administracion';

  if (!data?.length) {
    lista.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;font-size:13px">Sin planes de service</div>';
    return;
  }

  const estadoColor = { al_dia:'var(--green)', proximo:'var(--amber)', vencido:'var(--red)', sin_registro:'var(--muted)', sin_odometro:'var(--muted)' };
  const estadoLabel = { al_dia:'✓ Al día', proximo:'⚠ Próximo', vencido:'✕ Vencido', sin_registro:'— Sin ejecución', sin_odometro:'— Sin odómetro' };

  lista.innerHTML = data.map(p => {
    const estado   = p.plan_estado || 'sin_registro';
    const color    = estadoColor[estado];
    const label    = estadoLabel[estado];
    const kmInfo   = p.interval_km    ? `Cada <b style="color:var(--amber);font-family:'DM Mono'">${p.interval_km.toLocaleString('es-AR')} km</b>` : '';
    const hsInfo   = p.interval_hours ? `${p.interval_km ? ' / ' : 'Cada '}<b style="color:var(--blue);font-family:'DM Mono'">${p.interval_hours.toLocaleString('es-AR')} hs</b>` : '';
    const nextDue  = p.next_due_km    ? p.next_due_km.toLocaleString('es-AR') + ' km' : '—';
    const restante = p.km_restantes  != null ? `${p.km_restantes > 0 ? 'Faltan' : 'Excedidos'} <b>${Math.abs(p.km_restantes).toLocaleString('es-AR')} km</b>` : '';
    const progreso = (p.next_due_km && p.interval_km && p.km_restantes != null)
      ? Math.min(100, Math.max(0, Math.round(((p.interval_km - p.km_restantes) / p.interval_km) * 100)))
      : 0;

    return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:10px">
      <div style="display:flex;align-items:flex-start;gap:12px">
        <div style="width:40px;height:40px;border-radius:8px;background:var(--amber-lo);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🔧</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
            <span style="font-size:13px;font-weight:600">${p.name}</span>
            <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${color}22;color:${color};font-weight:600">${label}</span>
          </div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:8px">${kmInfo}${hsInfo}</div>
          <div style="background:var(--border);border-radius:3px;height:4px;overflow:hidden;margin-bottom:8px">
            <div style="width:${progreso}%;height:100%;background:${color};border-radius:3px;transition:width 0.3s"></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:flex-end">
            <div>
              <div style="font-size:9px;color:var(--muted)">PRÓXIMO VENCIMIENTO</div>
              <div style="font-family:'DM Mono';font-size:14px;font-weight:700;color:${color}">${nextDue}</div>
              ${restante ? `<div style="font-size:10px;color:var(--muted)">${restante}</div>` : ''}
            </div>
            ${esAdmin ? `<button onclick="desactivarPlanUI(${p.plan_id})" style="font-size:10px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--muted);cursor:pointer">Desactivar</button>` : ''}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function desactivarPlanUI(masterPlanId) {
  if (!_truckActual?.truck_id) { toast('Error: no hay camión activo', 'error'); return; }
  if (!confirm('¿Seguro querés desvincular este camión de este plan de mantenimiento?')) return;
  
  // NUEVO: Pasamos el truck_id y el master_plan_id
  const resultado = await desactivarSuscripcionPlan(_truckActual.truck_id, masterPlanId);
  
  if (!resultado.ok) { 
    toast(`Error: ${resultado.errorMsg}`, 'error'); 
    return; 
  }
  
  toast('Plan desvinculado exitosamente', 'success');
  const planes = await cargarPlanesDetalleOptimizados(_truckActual.truck_id);
  renderPlanes(planes);
}


// ── HISTORIAL DE SERVICES ─────────────────────
let _planesCache = [];

async function openServiceModal() {
  if (!_truckActual?.truck_id) { toast('No hay un camión activo para esta jornada', 'error'); return; }
  const info = document.getElementById('sl-camion-info');
  if (info) info.textContent = `${_truckActual.plate || '—'} · ${_truckActual.brand || ''} ${_truckActual.model || ''}`;
  const fecha = document.getElementById('sl-fecha');
  if (fecha) fecha.value = new Date().toISOString().slice(0, 10);
  ['sl-km','sl-costo','sl-taller','sl-notas'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const next = document.getElementById('sl-next-preview'); if (next) next.style.display = 'none';
  _modalError('sl-error', '');

  // Traer solo los planes a los que este camión está suscrito
  const _planesCacheRaw = await cargarPlanesDetalleOptimizados(_truckActual.truck_id);
  _planesCache = _planesCacheRaw?._error ? [] : (_planesCacheRaw || []);
  const select = document.getElementById('sl-plan');

  if (select) {
    select.innerHTML = '<option value="">— Seleccioná el plan —</option>';
    _planesCache.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.plan_id; // Este es el master_plan_id internamente
      opt.textContent = p.name;
      opt.dataset.intervalKm = p.interval_km || 0;
      select.appendChild(opt);
    });
  }
  openModal('modal-service-log');
}

function calcNextService() {
  const km = parseInt(document.getElementById('sl-km')?.value) || 0;
  const select = document.getElementById('sl-plan');
  const selectedOpt = select?.options[select.selectedIndex];
  const interval = parseInt(selectedOpt?.dataset?.intervalKm) || 0;
  const preview = document.getElementById('sl-next-preview');
  const el = document.getElementById('sl-next');
  if (km > 0 && interval > 0 && el && preview) {
    preview.style.display = 'flex';
    el.textContent = (km + interval).toLocaleString('es-AR') + ' km';
  } else if (preview) {
    preview.style.display = 'none';
  }
}

function renderHistorialServices(data) {
  const tbody = document.getElementById('tbody-services');
  const mList = document.getElementById('mobile-services-list');
  if (!tbody) return;

  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">Sin services registrados</td></tr>';
    if (mList) mList.innerHTML = `<div style="text-align:center;color:var(--muted);padding:20px;font-size:13px">Sin services registrados</div>`;
    return;
  }

  tbody.innerHTML = data.map(s => {
    const fecha   = new Date(s.performed_at + 'T12:00:00').toLocaleDateString('es-AR', { day:'2-digit', month:'short', year:'numeric' });
    const km      = (s.km_at_service || 0).toLocaleString('es-AR');
    const nextKm  = s.next_due_km ? s.next_due_km.toLocaleString('es-AR') + ' km' : '—';
    const costo   = s.cost ? Number(s.cost).toLocaleString('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 }) : '—';
    const taller  = s.workshop_name || '—';
    const plan    = s.master_service_plans?.name || '—';
    return `<tr>
      <td>${fecha}</td>
      <td style="font-weight:600">${plan}</td>
      <td style="font-family:'DM Mono'">${km} km</td>
      <td style="font-size:11px;color:var(--muted)">${taller}</td>
      <td style="font-family:'DM Mono';color:var(--amber)">${costo}</td>
      <td style="font-family:'DM Mono';font-size:11px;color:var(--amber)">${nextKm}</td>
    </tr>`;
  }).join('');

  // ── Mobile: lista compacta ──
  if (!mList) return;
  mList.innerHTML = '';
  data.forEach(s => {
    const fecha  = new Date(s.performed_at + 'T12:00:00').toLocaleDateString('es-AR', { day:'2-digit', month:'short', year:'numeric' });
    const km     = (s.km_at_service || 0).toLocaleString('es-AR');
    const nextKm = s.next_due_km ? s.next_due_km.toLocaleString('es-AR') + ' km' : '—';
    const costo  = s.cost ? Number(s.cost).toLocaleString('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 }) : '—';
    const taller = s.workshop_name || '—';
    const plan   = s.master_service_plans?.name || '—';
    const titulo = `${plan} — ${fecha}`;
    const detalle = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <div style="color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:0.4px">KM al service</div>
          <div style="color:var(--text);font-size:12px;font-family:'DM Mono';font-weight:600">${km} km</div>
        </div>
        <div>
          <div style="color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:0.4px">Taller</div>
          <div style="color:var(--text);font-size:12px">${taller}</div>
        </div>
        <div>
          <div style="color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:0.4px">Costo</div>
          <div style="color:var(--amber);font-size:12px;font-family:'DM Mono'">${costo}</div>
        </div>
        <div>
          <div style="color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:0.4px">Próximo</div>
          <div style="color:var(--amber);font-size:12px;font-family:'DM Mono'">${nextKm}</div>
        </div>
      </div>`;

    const row = document.createElement('div');
    row.style.cssText = `background:var(--card);border:1px solid var(--border);border-left:3px solid #4ade80;border-radius:8px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px;cursor:pointer`;
    row.innerHTML = `
      <div style="flex:1;min-width:0">
        <div style="color:var(--text);font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${plan}</div>
        <div style="color:var(--muted);font-size:10px">${fecha} · ${km} km</div>
      </div>
      <span style="color:var(--muted2);font-size:16px;flex-shrink:0">›</span>`;
    row.onclick = () => _abrirDetalleMovil(titulo, detalle);
    mList.appendChild(row);
  });
}

async function guardarServiceLog() {
  const planId  = document.getElementById('sl-plan')?.value;
  const km      = parseInt(document.getElementById('sl-km')?.value);
  const fecha   = document.getElementById('sl-fecha')?.value;
  const taller  = document.getElementById('sl-taller')?.value || null;
  const costo   = parseFloat(document.getElementById('sl-costo')?.value) || null;
  const notas   = document.getElementById('sl-notas')?.value || null;

  if (!planId)           { _modalError('sl-error', 'Seleccioná el plan de service'); return; }
  if (!km || isNaN(km))  { _modalError('sl-error', 'Ingresá los KM al realizar el service'); return; }
  if (km <= 0)           { _modalError('sl-error', 'Los KM deben ser un valor positivo mayor a cero'); return; }
  if (costo !== null && costo < 0) { _modalError('sl-error', 'El costo no puede ser negativo'); return; }
  _modalError('sl-error', '');

  if (_truckActual?.current_km) {
    const currentKm = _truckActual.current_km;
    if (Math.abs(km - currentKm) > currentKm * 0.2) {
      toast(`El KM ingresado difiere mucho del odómetro actual (${currentKm.toLocaleString('es-AR')} km). Verificá el dato.`, 'error');
    }
  }

  const select = document.getElementById('sl-plan');
  const interval = parseInt(select?.options[select.selectedIndex]?.dataset?.intervalKm) || 0;
  const nextDueKm = interval > 0 ? km + interval : null;

  const btn = document.getElementById('btn-guardar-service');
  if (btn) { btn.textContent = 'Guardando...'; btn.style.pointerEvents = 'none'; }

  // NUEVO: Enviamos master_plan_id y recibimos la respuesta estandarizada
  const resultado = await registrarServiceOptimizado({
    truck_id:       _truckActual.truck_id,
    master_plan_id: parseInt(planId), 
    performed_at:   fecha || new Date().toLocaleDateString('sv-SE'),
    km_at_service:  km,
    next_due_km:    nextDueKm,
    workshop_name:  taller,
    cost:           costo,
    notes:          notas,
  });

  if (btn) { btn.textContent = '🔧 Guardar service'; btn.style.pointerEvents = 'auto'; }

  if (resultado.ok) {
    toast('Service registrado correctamente', 'success');
    closeModal('modal-service-log');
    
    // Refrescamos ambas tablas (el log y las barras de progreso de planes)
    const services = await cargarHistorialServices(_truckActual.truck_id);
    renderHistorialServices(services);
    const planesActualizados = await cargarPlanesDetalleOptimizados(_truckActual.truck_id);
    renderPlanes(planesActualizados);
  } else {
    // Si falla por internet o validación, mostramos el motivo real
    toast(`Error al guardar: ${resultado.errorMsg}`, 'error');
  }
}

// ── GUARDAR — DOCUMENTO ───────────────────────
function calcDocDias() {
  const venc = document.getElementById('doc-vencimiento')?.value;
  if (!venc) return;
  const dias = Math.round((new Date(venc) - new Date()) / 86400000);
  const el = document.getElementById('doc-dias-val');
  const preview = document.getElementById('doc-dias-preview');
  if (el && preview) {
    preview.style.display = 'flex';
    el.textContent = dias + ' días';
    el.style.color = dias < 30 ? 'var(--red)' : dias < 60 ? 'var(--amber)' : 'var(--green)';
  }
}

function guardarDoc() {
  const tipo = document.getElementById('doc-tipo')?.value;
  const venc = document.getElementById('doc-vencimiento')?.value;
  if (!venc) { toast('Ingresá la fecha de vencimiento', 'error'); return; }
  const dias = Math.round((new Date(venc) - new Date()) / 86400000);
  closeModal('modal-doc');
  const grid = document.querySelector('#screen-documentos div[style*="grid-template-columns:repeat(3"]');
  if (grid) {
    const addBtn = grid.querySelector('[onclick*="Cargar nuevo"]');
    const pillClass = dias < 30 ? 'pill-red' : dias < 60 ? 'pill-amber' : 'pill-green';
    const pillTxt   = dias < 30 ? 'Urgente' : dias < 60 ? 'Próximo' : 'Vigente';
    const color     = dias < 30 ? 'var(--red)' : dias < 60 ? 'var(--amber)' : 'var(--green)';
    const div = document.createElement('div');
    div.className = 'doc-card';
    div.innerHTML = `
      <div class="doc-icon">📋</div>
      <div>
        <div class="doc-name">${tipo}</div>
        <div class="doc-meta">Nº ${document.getElementById('doc-nro')?.value || '—'}</div>
      </div>
      <div class="doc-expiry">
        <div class="doc-days" style="color:${color}">${dias}</div>
        <div class="doc-days-lbl">días restantes</div>
        <span class="pill ${pillClass}" style="margin-top:4px">${pillTxt}</span>
      </div>`;
    grid.insertBefore(div, addBtn);
  }
  toast(`Documento "${tipo}" guardado`, 'success');
}

// ── NUEVO REGISTRO (selector) ─────────────────
let selectedRegTipo = '';
function selectRegTipo(tipo) {
    // Quitamos la clase de selección a todos
    document.querySelectorAll('.rec-btn').forEach(el => {
        el.style.borderColor = 'var(--border)';
        el.style.background = 'var(--bg)';
    });

    // Aplicamos al seleccionado
    const sel = document.getElementById('rec-' + tipo);
    if (sel) {
        sel.style.borderColor = 'var(--amber)';
        sel.style.background = 'var(--amber-lo)';
        selectedRegTipo = tipo;
        
        // Habilitar botón continuar
        const btn = document.getElementById('rec-btn-continuar');
        if (btn) {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
    }
}

function continueReg() {
  if (!selectedRegTipo) return;
  closeModal('modal-nuevo-registro');
  if (selectedRegTipo === 'combustible') openFuelModal();
  if (selectedRegTipo === 'neumaticos')  openNeumaticosModal();
  if (selectedRegTipo === 'service')     openServiceModal();
  selectedRegTipo = '';
}
// ── MOTOR DE ARCHIVOS REALES (VERSIÓN DEFINITIVA) ──────────────────
function procesarArchivoReal(input, statusId, iconId) {
  if (!input.files || input.files.length === 0) {
    console.warn("Carga cancelada: no se seleccionó ningún archivo.");
    return;
  }

  const file = input.files[0];
  const statusEl = document.getElementById(statusId);
  const iconEl = document.getElementById(iconId);
  const boxEl = input.closest('.photo-upload');

  console.log("Procesando archivo:", file.name, "| Tipo:", file.type, "| Tamaño:", (file.size / 1024 / 1024).toFixed(2), "MB");

  const notificar = (msg) => {
    if (typeof toast === 'function') { toast(msg); } 
    else { alert(msg); }
  };

  // Validación de peso (5MB)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    let pesoMB = (file.size / 1024 / 1024).toFixed(2);
    console.error(`Error: Archivo muy pesado (${pesoMB}MB).`);
    notificar(`El archivo pesa ${pesoMB}MB. El límite máximo es 5MB.`);
    input.value = ''; // Reseteamos el input
    actualizarContadorFotosRemito(); // <-- INYECCIÓN 1: Resta del contador si falla
    return;
  }

  if (iconEl) iconEl.textContent = '⏳';
  if (statusEl) {
    statusEl.textContent = 'Procesando...';
    statusEl.style.color = 'var(--text)';
  }

  const reader = new FileReader();
  
  reader.onload = function(e) {
    try {
      boxEl.style.borderColor = 'var(--green)';
      boxEl.style.background = 'var(--bg)';

      if (iconEl) iconEl.textContent = '✅';
      if (statusEl) {
        let nombre = file.name;
        if (nombre.length > 22) {
          nombre = nombre.substring(0, 12) + '...' + nombre.substring(nombre.length - 7);
        }
        statusEl.textContent = nombre;
        statusEl.style.color = 'var(--green)';
      }

      // ── INYECCIÓN 2: UX Cambio de subtítulo ──
      let subEl = boxEl.querySelector('.pu-sub');
      if (subEl) {
        subEl.textContent = '🔄 Toca para volver a tomar foto';
        subEl.style.color = 'var(--text)'; 
      }

      if (file.type.startsWith('image/')) {
        let preview = boxEl.querySelector('.img-preview');
        if (!preview) {
          preview = document.createElement('img');
          preview.className = 'img-preview';
          preview.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:0.15; pointer-events:none; border-radius:inherit; z-index:1;';
          boxEl.appendChild(preview);
        }
        preview.src = e.target.result;
      }
      
      console.log("Renderizado finalizado con éxito.");
      actualizarContadorFotosRemito(); // <-- INYECCIÓN 3: Suma al contador si hay éxito
      
    } catch (error) {
      console.error("Error crítico renderizando UI:", error);
      notificar("Hubo un error al mostrar la imagen.");
    }
  };

  reader.onerror = function() {
    console.error("Lector falló:", reader.error);
    notificar('Error al leer el archivo desde el sistema operativo.');
    if (iconEl) iconEl.textContent = '❌';
  };

  reader.readAsDataURL(file);
}
// ── ACTUALIZACIÓN DE ESTADO UX: Contador de fotos de remitos ──
function actualizarContadorFotosRemito() {
  // Buscamos todos los inputs de archivo solo dentro de la grilla del remito
  const inputsFotos = document.querySelectorAll('#foto-grid input[type="file"]');
  if (inputsFotos.length === 0) return; // Si no estamos en esa pantalla, ignorar

  let fotosCargadas = 0;
  
  // Contamos la fuente real de los datos: ¿el input tiene un archivo de verdad?
  inputsFotos.forEach(input => {
    if (input.files && input.files.length > 0) {
      fotosCargadas++;
    }
  });

  // 1. Actualizamos el texto
  const txtContador = document.getElementById('foto-counter-txt');
  if (txtContador) {
    txtContador.textContent = `${fotosCargadas} / ${inputsFotos.length} fotos cargadas`;
    txtContador.style.color = fotosCargadas > 0 ? 'var(--amber)' : 'var(--muted)';
  }

  // 2. Pintamos los "puntitos" (dots) en base a la cantidad
  const dots = document.querySelectorAll('#foto-counter-dots div');
  dots.forEach((dot, index) => {
    if (index < fotosCargadas) {
      dot.style.background = 'var(--green)'; // Lleno
    } else {
      dot.style.background = 'var(--border2)'; // Vacío
    }
  });
}

// ═══════════════════════════════════════════
// 2. FUNCIONES DE RENDERIZADO Y LÓGICA
// ═══════════════════════════════════════════
function generarHtmlPill(estado) {
  if (estado === 'firmado') return `<span class="pill pill-green">✓ Firmado</span>`;
  if (estado === 'anulado') return `<span class="pill pill-red">🚫 Anulado</span>`;
  return `<span class="pill pill-amber">⏳ Pendiente</span>`;
}

function renderTablaRemitos(data) {
  const tbody = document.getElementById('tbody-remitos');
  const mobileList = document.getElementById('mobile-remitos-list');

  if (!tbody) return;

  tbody.innerHTML = '';
  if (mobileList) mobileList.innerHTML = '';

  const esAdmin = typeof PERFIL_USUARIO !== 'undefined' &&
                  PERFIL_USUARIO?.roles?.name === 'administracion';

  // Protegemos las variables globales por si no cargan a tiempo
  const iconosPago = typeof PAY_ICONS !== 'undefined' ? PAY_ICONS : {};
  const coloresPago = typeof PAY_COLORS !== 'undefined' ? PAY_COLORS : {};

  data.forEach((r, index) => {
    try {
      const peaje     = parseInt(r.peaje)     || 0;
      const excedente = parseInt(r.excedente) || 0;
      const otros     = parseInt(r.otros)     || 0;

      const extrasHTML = `
        <div style="display:flex;flex-direction:column;gap:2px">
          <div style="font-size:11px;color:${peaje > 0 ? 'var(--muted)' : 'var(--border2)'}">
            Peaje: $${peaje.toLocaleString('es-AR')}
          </div>
          <div style="font-size:11px;color:${excedente > 0 ? 'var(--amber)' : 'var(--border2)'}">
            Excedente: $${excedente.toLocaleString('es-AR')}
          </div>
          ${otros > 0 ? `<div style="font-size:11px;color:var(--muted)">Otros: $${otros.toLocaleString('es-AR')}</div>` : ''}
        </div>`;

      const esAnulado = r.estado === 'anulado';
      const esFirmado = r.estado === 'firmado';

      const estadoPill = esFirmado
        ? `<span class="pill pill-green">✓ Firmado</span>`
        : esAnulado
        ? `<span class="pill pill-red">🚫 Anulado</span>`
        : `<span class="pill pill-amber">⏳ Pendiente</span>`;

      const pagoParts  = (r.pago || '—').split('+').map(p => p.trim());
      const pagoHTML = pagoParts.map(p => {
        const icon  = iconosPago[p]  || '💳';
        const color = coloresPago[p] || 'var(--text)';
        return `<span style="color:${color};font-size:11px;font-weight:600">${icon} ${p}</span>`;
      }).join('<span style="color:var(--muted);font-size:10px;margin:0 2px">+</span>');

      const _extras = (parseFloat(r.peaje)||0)+(parseFloat(r.excedente)||0)+(parseFloat(r.otros)||0);
      const whatsappMsg = encodeURIComponent(
        `*Remito Sigma Remolques*\n` +
        `N°: ${r.nro}\nFecha: ${r.fecha}\n` +
        `Vehículo: ${r.patente}${r.marca ? ' · '+r.marca : ''}\n` +
        `Cliente: ${r.cliente || '—'}\n` +
        `Servicio: ${r.origen} → ${r.destino}\n` +
        `KM: ${r.km || '—'}` +
        (_extras > 0 ? `\nExtras: $${_extras.toLocaleString('es-AR')}` : '') +
        (r.pago && r.pago !== '—' ? `\nPago: ${r.pago}` : '') +
        `\nEstado: ✓ Firmado digitalmente`
      );

      const btnWA  = `<a href="https://wa.me/?text=${whatsappMsg}" target="_blank"
        class="btn btn-ghost" style="padding:4px 10px;font-size:10px;text-decoration:none">📲</a>`;
      const btnPDF = esAdmin
        ? `<button class="btn btn-ghost btn-pdf-remito" style="padding:4px 10px;font-size:10px">PDF</button>`
        : '';

      const acciones = esFirmado
        ? `<div style="display:flex;gap:5px;align-items:center">
             <button class="btn btn-ghost btn-ver-remito" style="padding:4px 10px;font-size:10px">Ver</button>
             ${btnPDF}
             ${btnWA}
           </div>`
        : esAnulado
          ? `<div style="display:flex;gap:5px">
               <button class="btn btn-ghost btn-ver-remito" style="padding:4px 10px;font-size:10px;opacity:0.5">Ver</button>
             </div>`
          : `<div style="display:flex;gap:5px;align-items:center">
               <button class="btn btn-primary btn-firmar-remito" style="padding:4px 10px;font-size:10px">Completar</button>
               <button class="btn btn-ghost btn-ver-remito" style="padding:4px 10px;font-size:10px">Ver</button>
             </div>`;

      const tr = document.createElement('tr');
      if (esAnulado) tr.style.opacity = '0.5';
      else if (!esFirmado) tr.style.background = 'rgba(245,166,35,0.03)';
      
      tr.setAttribute('data-rem', JSON.stringify(r));
      // Agregamos una clase de estado por si el CSS los está ocultando
      tr.className = `fila-remito estado-${r.estado}`; 

      tr.innerHTML = `
        <td><span style="font-family:'DM Mono';color:var(--amber);font-size:11px">${r.nro}</span></td>
        <td style="font-family:'DM Mono';font-size:11px">${r.fecha || '—'}</td>
        <td style="font-size:11px;color:var(--muted2)">${r.chofer || '—'}</td>
        <td><div style="font-family:'DM Mono';font-weight:700;font-size:13px">${r.patente}</div></td>
        <td>
          <div style="font-size:12px">${r.tipo || '—'}</div>
          <div style="font-size:10px;color:var(--muted);font-family:'DM Mono'">${r.nroSrv || '—'}</div>
        </td>
        <td>${extrasHTML}</td>
        <td>${pagoHTML}</td>
        <td>${estadoPill}</td>
        <td>${acciones}</td>`;
      
      tbody.appendChild(tr);

    } catch (err) {
      console.error(`❌ Error dibujando remito ${r?.nro}:`, err);
    }
  });

  // Mobile card list — pendientes primero, máximo 3 visible inicialmente
  if (mobileList) {
    mobileList.innerHTML = '';

    const mobileSorted = [...data].sort((a, b) =>
      (a.estado === 'pendiente' ? 0 : 1) - (b.estado === 'pendiente' ? 0 : 1)
    );

    mobileSorted.forEach((r, mIdx) => {
      const esFirmado = r.estado === 'firmado';
      const esAnulado = r.estado === 'anulado';
      const mcard = document.createElement('div');
      mcard.className = `mobile-card-remito estado-${r.estado}`;
      mcard.setAttribute('data-rem', JSON.stringify(r));
      if (mIdx >= 3) mcard.style.display = 'none';
      mcard.innerHTML = `
        <div class="card-header-main">
          <div>
            <span class="text-codigo">${r.nroSrv || 'S/SERVICIO'}</span>
            <span class="text-patente">${r.patente || '—'}</span>
          </div>
          ${generarHtmlPill(r.estado)}
        </div>
        <div style="font-size:13px;font-weight:600">${r.tipo || '—'}</div>
        <div style="font-size:12px;color:var(--muted)">${r.origen || '—'} → ${r.destino || '—'}</div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:var(--muted)">
          <span>N° ${r.nro}</span><span>${r.fecha || '—'}</span>
        </div>
        <div style="margin-top:12px">
          ${!esFirmado && !esAnulado
            ? `<button class="btn btn-primary btn-firmar-remito" style="width:100%;padding:14px;font-weight:800">✍️ COMPLETAR REMITO</button>`
            : esAnulado
            ? `<button class="btn btn-ghost btn-ver-remito" style="width:100%;padding:12px;opacity:0.5">Ver detalles</button>`
            : `<button class="btn-ver-full btn-ver-remito">🔍 VER DETALLES</button>`
          }
        </div>`;
      mobileList.appendChild(mcard);
    });

    if (mobileSorted.length > 3) {
      const verTodosBtn = document.createElement('button');
      verTodosBtn.id = 'mobile-ver-todos-btn';
      verTodosBtn.className = 'btn btn-ghost';
      verTodosBtn.style.cssText = 'width:100%;margin-top:4px;font-size:12px;padding:12px';
      verTodosBtn.textContent = `Ver todos los remitos (${mobileSorted.length})`;
      verTodosBtn.onclick = () => {
        mobileList.querySelectorAll('.mobile-card-remito').forEach(c => c.style.display = '');
        verTodosBtn.remove();
      };
      mobileList.appendChild(verTodosBtn);
    }
  }

  if (tbody.children.length > 0 && tbody.clientHeight === 0) {
    console.warn("⚠️ tabla invisible — verificá contenedor padre.");
  }
}

// --- LÓGICA DE PAGOS (Refactorizada y Segura) ---
let firmaPago1 = '';
let firmaPago2 = '';
let firmaPagoMixtoActivo = false;

// 🛠️ HELPER: Centraliza la lectura de inputs para evitar errores y código repetido
function obtenerValorNumericoFirma(id) {
  const valor = parseFloat(document.getElementById(id)?.value);
  return isNaN(valor) ? 0 : valor;
}

// --- FIX: LECTURA SEGURA DE DINERO (ARGENTINA) ---

// Esta función lee lo que escribe el chofer y lo limpia de puntos o comas
function leerPlata(id) {
  const el = document.getElementById(id);
  if (!el || !el.value) return 0;
  
  // Si el chofer escribe "9.000" o "9000,50", lo pasamos a "9000" o "9000.50" para que JS lo entienda
  let valorLimpio = el.value.replace(/\./g, '').replace(',', '.');
  
  return parseFloat(valorLimpio) || 0;
}

// ==========================================
// FIX DEFINITIVO: MATEMÁTICA DE PAGOS (NUEVO REMITO)
// ==========================================

function calcularTotal() {
  // 1. Leemos los valores puros directamente de las cajas de texto
  const peaje = parseFloat(document.getElementById('imp-peaje')?.value) || 0;
  const excedente = parseFloat(document.getElementById('imp-excedente')?.value) || 0;
  const otros = parseFloat(document.getElementById('imp-otros')?.value) || 0;
  
  // 2. Suma matemática pura
  const total = peaje + excedente + otros;
  
  // 3. Formateamos el texto en pantalla (ESTO ES SOLO VISUAL)
  const totalVisual = document.getElementById('imp-total');
  if (totalVisual) {
    totalVisual.textContent = '$' + total.toLocaleString('es-AR');
  }
  
  // 4. Revisamos si el segundo panel de pago está abierto
  const m1El = document.getElementById('pago1-monto');
  const p2Container = document.getElementById('pago2-container');
  const isMixto = p2Container && p2Container.style.display !== 'none';

  // Si es un solo pago, le mandamos el número puro (Ej: 9000, no 9.000)
  if (m1El && !isMixto) {
    m1El.value = total > 0 ? total : ''; 
  }
  
  // Si hay dos pagos, que se encargue la otra función
  if (isMixto) {
    calcPagoAuto();
  }
}

function calcPagoAuto() {
  const m2El = document.getElementById('pago2-monto');
  const p2Container = document.getElementById('pago2-container');
  
  // Si no está abierto el segundo pago, no hacemos nada
  if (!m2El || !p2Container || p2Container.style.display === 'none') return;

  // ¡MAGIA ACÁ! Volvemos a sumar las cajas, NO LEEMOS el texto visual con el signo $
  const peaje = parseFloat(document.getElementById('imp-peaje')?.value) || 0;
  const excedente = parseFloat(document.getElementById('imp-excedente')?.value) || 0;
  const otros = parseFloat(document.getElementById('imp-otros')?.value) || 0;
  const totalGeneral = peaje + excedente + otros;

  const monto1 = parseFloat(document.getElementById('pago1-monto')?.value) || 0;
  
  // Restamos
  const resto = totalGeneral - monto1;
  m2El.value = resto > 0 ? resto : '';
  
  if (typeof actualizarPagoResumen === 'function') {
    actualizarPagoResumen();
  }
}
// --- INTERFAZ Y ESTILOS ---

function selFirmaPago(el, pago, slot) {
  const containerId = slot === 2 ? 'firma-pago-opts2' : 'firma-pago-opts';
  
  // Reset visual de los botones del contenedor correspondiente
  document.querySelectorAll(`#${containerId} > div`).forEach(o => {
    o.style.borderColor = 'var(--border)';
    o.style.background  = 'var(--bg)';
  });
  
  // Activar botón seleccionado
  el.style.borderColor = 'var(--amber)';
  el.style.background  = 'var(--amber-lo)';
  
  // Guardar en variable global
  if (slot === 2) firmaPago2 = pago; 
  else firmaPago1 = pago;
  
  actualizarFirmaPagoResumen();
}

function activarFirmaPagoMixto() {
  firmaPagoMixtoActivo = true;
  document.getElementById('firma-pago2-container').style.display = 'block';
  document.getElementById('firma-btn-add-pago2').style.display = 'none';
  calcFirmaPagoAuto();
  actualizarFirmaPagoResumen();
}

function desactivarFirmaPagoMixto() {
  firmaPagoMixtoActivo = false;
  firmaPago2 = '';
  
  document.getElementById('firma-pago2-container').style.display = 'none';
  document.getElementById('firma-btn-add-pago2').style.display = '';
  document.getElementById('firma-pago2-monto').value = '';
  
  // Reset visual de opciones de pago 2
  document.querySelectorAll('#firma-pago-opts2 > div').forEach(o => {
    o.style.borderColor = 'var(--border)'; 
    o.style.background = 'var(--bg)';
  });
  
  // Al desactivar el mixto, el pago 1 vuelve a absorber todo el total
  calcularTotalFirma(); 
  actualizarFirmaPagoResumen();
}

function actualizarFirmaPagoResumen() {
  const inputHidden = document.getElementById('firma-pago-selected');
  if (!inputHidden) return;
  
  if (firmaPagoMixtoActivo && firmaPago1 && firmaPago2) {
    inputHidden.value = `${firmaPago1}+${firmaPago2}`;
  } else {
    inputHidden.value = firmaPago1 || '';
  }
}

function resetFirmaPagoForm() {
  firmaPago1 = ''; 
  firmaPago2 = ''; 
  firmaPagoMixtoActivo = false;
  
  const container2 = document.getElementById('firma-pago2-container');
  const btnAdd = document.getElementById('firma-btn-add-pago2');
  
  if (container2) container2.style.display = 'none';
  if (btnAdd) btnAdd.style.display = '';
  
  // Limpiar inputs numéricos
  ['firma-pago1-monto', 'firma-pago2-monto'].forEach(id => {
    const el = document.getElementById(id); 
    if (el) el.value = '';
  });
  
  // Reset visual de los métodos de pago
  ['firma-pago-opts', 'firma-pago-opts2'].forEach(cid => {
    document.querySelectorAll(`#${cid} > div`).forEach(o => {
      o.style.borderColor = 'var(--border)'; 
      o.style.background = 'var(--bg)';
    });
  });
  
  const inputHidden = document.getElementById('firma-pago-selected');
  if (inputHidden) inputHidden.value = '';
  
  const totalVisual = document.getElementById('firma-imp-total');
  if (totalVisual) totalVisual.textContent = '$0';
}

function _abrirDetalleMovil(titulo, htmlContent) {
  if (window.innerWidth > 600) return;
  const tituloEl = document.getElementById('mmd-titulo');
  const bodyEl   = document.getElementById('mmd-body');
  if (tituloEl) tituloEl.textContent = titulo;
  if (bodyEl)   bodyEl.innerHTML     = htmlContent;
  openModal('modal-mobile-detalle');
}

function renderHistorialJornadas(data) {
  const tbody    = document.getElementById('tbody-historial-jornadas');
  const mList    = document.getElementById('mobile-jornadas-list');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (mList) mList.innerHTML = '';

  const borderColor = { cerrada: '#4ade80', abierta: '#f59e0b', anulada: '#ef4444' };

  data.forEach(j => {
    const tallerPill = j.taller
      ? `<span class="pill pill-amber">Sí</span>`
      : `<span class="pill pill-muted">No</span>`;
    const estadoPill = j.estado === 'abierta'
      ? `<span class="pill pill-amber">Abierta</span>`
      : `<span class="pill pill-green">Cerrada</span>`;

    // ── Desktop: fila de tabla (sin cambios) ──
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${j.fecha}</b></td>
      <td style="font-family:'DM Mono';font-weight:600">${j.camion}</td>
      <td style="font-family:'DM Mono'">${j.kmInicio}</td>
      <td style="font-family:'DM Mono'">${j.kmFinal}</td>
      <td><span style="font-family:'DM Mono';color:var(--amber);font-weight:600">${j.kmRec} km</span></td>
      <td>${j.horas} hs</td>
      <td>${tallerPill}</td>
      <td>${estadoPill}</td>`;
    tbody.appendChild(tr);

    // ── Mobile: fila compacta + modal de detalle ──
    if (!mList) return;
    const color   = borderColor[j.estado] || '#4ade80';
    const titulo  = `${j.fecha} · ${j.camion}`;
    const detalle = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div>
          <div style="color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:0.4px">KM Inicio</div>
          <div style="color:var(--text);font-size:12px;font-family:'DM Mono'">${j.kmInicio}</div>
        </div>
        <div>
          <div style="color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:0.4px">Taller</div>
          <div style="font-size:12px">${j.taller ? '<span style="color:var(--amber);font-weight:600">Sí</span>' : '<span style="color:var(--muted)">No</span>'}</div>
        </div>
        <div>
          <div style="color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:0.4px">KM Final</div>
          <div style="color:var(--text);font-size:12px;font-family:'DM Mono'">${j.kmFinal}</div>
        </div>
        <div>
          <div style="color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:0.4px">Hs Totales</div>
          <div style="color:var(--text);font-size:12px">${j.horas} hs</div>
        </div>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:10px;display:flex;align-items:center;gap:8px">
        <span style="color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:0.4px">Recorrido</span>
        <span style="color:#4ade80;font-size:16px;font-weight:700;font-family:'DM Mono'">${j.kmRec} km</span>
      </div>`;

    const row = document.createElement('div');
    row.style.cssText = `background:var(--card);border:1px solid var(--border);border-left:3px solid ${color};border-radius:8px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px;cursor:pointer`;
    row.innerHTML = `
      <div style="flex:1;min-width:0">
        <div style="color:var(--text);font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${titulo}</div>
        <div style="color:var(--muted);font-size:10px">${j.kmRec} km recorridos</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        ${estadoPill}
        <span style="color:var(--muted2);font-size:16px">›</span>
      </div>`;
    row.onclick = () => _abrirDetalleMovil(titulo, detalle);
    mList.appendChild(row);
  });

  if (mList && data.length > 4) {
    const hidden = Array.from(mList.children).slice(4);
    hidden.forEach(el => { el.style.display = 'none'; });
    const btn = document.createElement('button');
    btn.textContent = `Ver más (${data.length - 4} restantes)`;
    btn.style.cssText = `width:100%;padding:10px;margin-top:4px;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--accent);font-size:12px;cursor:pointer`;
    btn.onclick = () => {
      hidden.forEach(el => { el.style.display = ''; });
      btn.remove();
    };
    mList.appendChild(btn);
  }
}

function _resetJornadasMobile() {
  const mList = document.getElementById('mobile-jornadas-list');
  if (!mList) return;
  const rows = Array.from(mList.children).filter(el => el.tagName !== 'BUTTON');
  if (rows.length <= 4) return;
  rows.slice(4).forEach(el => { el.style.display = 'none'; });
  const existingBtn = mList.querySelector('button');
  if (existingBtn) existingBtn.remove();
  const btn = document.createElement('button');
  btn.textContent = `Ver más (${rows.length - 4} restantes)`;
  btn.style.cssText = `width:100%;padding:10px;margin-top:4px;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--accent);font-size:12px;cursor:pointer`;
  btn.onclick = () => {
    rows.slice(4).forEach(el => { el.style.display = ''; });
    btn.remove();
  };
  mList.appendChild(btn);
}

function renderServiciosDia(data) {
  const tbody = document.querySelector('#tabla-viajes tbody');
  const mList = document.getElementById('mobile-viajes-list');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (mList) mList.innerHTML = '';

  const borderColor = { completado: '#4ade80', 'en curso': '#f59e0b', anulado: '#ef4444', pendiente: '#f59e0b' };
  const estadoPillHtml = (estado) => {
    if (estado === 'completado') return `<span class="pill pill-green">✓ Completado</span>`;
    if (estado === 'anulado')    return `<span class="pill pill-red">✕ Anulado</span>`;
    return `<span class="pill pill-amber">⏳ Pendiente</span>`;
  };

  data.forEach(s => {
    const kmCell = s.km
      ? `<span style="font-family:'DM Mono';color:var(--amber)">${s.km} km</span>`
      : `<span style="color:var(--muted)">—</span>`;

    // ── Desktop: fila de tabla (sin cambios) ──
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--muted);font-family:'DM Mono'">${s.num}</td>
      <td><span style="font-family:'DM Mono';color:var(--amber);font-size:11px">${s.nroSrv}</span></td>
      <td><span style="font-family:'DM Mono';font-weight:600">${s.patente}</span></td>
      <td><span class="pill pill-blue">${s.tipo}</span></td>
      <td>${s.origen}</td>
      <td>${s.destino}</td>
      <td style="font-family:'DM Mono'">${s.salida}</td>
      <td>${kmCell}</td>
      <td>${estadoPillHtml(s.estado)}</td>`;
    tbody.appendChild(tr);

    // ── Mobile: fila compacta + modal de detalle ──
    if (!mList) return;
    const color  = borderColor[s.estado] || '#f59e0b';
    const titulo = `N° ${s.nroSrv} · ${s.patente}`;
    const detalle = `
      <div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:12px;display:flex;align-items:center;gap:8px">
        <span style="color:var(--text);font-size:12px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.origen}</span>
        <span style="color:#3b82f6;font-size:18px">→</span>
        <span style="color:var(--text);font-size:12px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right">${s.destino}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">
        <div>
          <div style="color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:0.4px">Salida</div>
          <div style="color:var(--text);font-size:11px;font-family:'DM Mono'">${s.salida}</div>
        </div>
        <div>
          <div style="color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:0.4px">KM</div>
          <div style="color:var(--amber);font-size:11px;font-family:'DM Mono';font-weight:600">${s.km || '—'}</div>
        </div>
        <div>
          <div style="color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:0.4px">Peaje</div>
          <div style="color:var(--text);font-size:11px;font-family:'DM Mono'">${s.peaje}</div>
        </div>
        <div>
          <div style="color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:0.4px">Excedente</div>
          <div style="color:var(--text);font-size:11px;font-family:'DM Mono'">${s.excedente}</div>
        </div>
      </div>`;

    const row = document.createElement('div');
    row.style.cssText = `background:var(--card);border:1px solid var(--border);border-left:3px solid ${color};border-radius:8px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px;cursor:pointer`;
    row.innerHTML = `
      <div style="flex:1;min-width:0">
        <div style="color:var(--text);font-size:11px;font-weight:700">${s.nroSrv} · <span style="color:var(--amber)">${s.patente}</span></div>
        <div style="color:var(--muted);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.origen} → ${s.destino}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        ${estadoPillHtml(s.estado)}
        <span style="color:var(--muted2);font-size:16px">›</span>
      </div>`;
    row.onclick = () => _abrirDetalleMovil(titulo, detalle);
    mList.appendChild(row);
  });

  const counter = document.getElementById('viajes-counter');
  if (counter) counter.textContent = `${data.length} servicios registrados`;
}

// ═══════════════════════════════════════════
// 3. DELEGACIÓN DE EVENTOS GLOBALES (No necesitan DOMContentLoaded)
// ═══════════════════════════════════════════

// Cerrar modales con ESC (Tu bloque C)
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.open').forEach(m => closeModal(m.id));
    }
    });




async function guardarRemitoPendiente() {
  const nro       = document.getElementById('rem-nro')?.value;
  const tipo      = document.getElementById('rem-tipo-servicio')?.value || 'Remolque';
  const patente   = document.getElementById('rem-patente')?.value?.trim() || '';
  const km        = document.getElementById('rem-km')?.value || '0';
  const origen    = document.getElementById('rem-origen')?.value?.trim() || '';
  const destino   = document.getElementById('rem-destino')?.value?.trim() || '';
  const cliente   = document.getElementById('rem-cliente')?.value || '';
  const cuit      = document.getElementById('rem-cuit')?.value || '';
  const peaje     = parseFloat(document.getElementById('imp-peaje')?.value)     || 0;
  const excedente = parseFloat(document.getElementById('imp-excedente')?.value) || 0;
  const otros     = parseFloat(document.getElementById('imp-otros')?.value)     || 0;
  const observaciones = document.getElementById('rem-observaciones')?.value?.trim() || null;
  const nroSrv    = document.getElementById('rem-nro-prestadora')?.value || null;

  // ── Validaciones ──────────────────────────────────────
  if (!patente) { toast('Ingresá la patente del vehículo', 'error'); return; }
  if (!origen)  { toast('Ingresá el origen del servicio', 'error'); return; }
  if (!destino) { toast('Ingresá el destino del servicio', 'error'); return; }

  // ── Registro Silencioso (Asignación a la jornada) ─────
  const _logId = _jornadasAbiertasCache?.[0]?.log_id || _jornadaActivaLocal?.log_id || null;

  // ── Empaquetado de Datos ──────────────────────────────
  const remitoDB = {
    nro_remito:        nro,
    driver_id:         USUARIO_ACTUAL.id,
    log_id:            _logId,
    nro_servicio:      nroSrv,
    patente:           patente,
    marca_modelo:      document.getElementById('rem-marca-modelo')?.value || null,
    razon_social:      cliente || null,
    cuit:              cuit    || null,
    tipo_servicio:     tipo,
    origen:            origen,
    destino:           destino,
    km_reales:         parseInt(km) || null,
    imp_peaje:         peaje,
    imp_excedente:     excedente,
    imp_otros:         otros,
    observaciones:     observaciones,
    status:            'pendiente',
    created_at_device: new Date().toISOString(),
  };

  // 🚨 DIAGNÓSTICO DE SEGURIDAD (Mirar Consola F12) 🚨
  console.log("ID del chofer enviado a Supabase:", USUARIO_ACTUAL.id);

  const { data, error } = await _db.from('remitos').upsert(remitoDB, { onConflict: 'nro_remito' });

  // 🚨 CAPTURA DE ERRORES DE SUPABASE (RLS/Foreign Keys) 🚨
  if (error) {
    console.error("❌ ERROR REAL DE SUPABASE:", error.message, "\nDetalles:", error.details, "\nPista:", error.hint);
    toast('Error al guardar: ' + error.message, 'error');
    return;
  }

  console.log("✅ Remito guardado en BD exitosamente:", data);

  await cargarRemitos();
  showRemitosView('lista');
  toast(`Remito ${nro} guardado como pendiente ✓`, 'success');
}

function completarRemitoPendiente(r) {
  showRemitosView('nuevo'); // calls remWizardReset() internally — clears all fields
  const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
  set('rem-nro',            r.nro);
  set('rem-patente',        r.patente);
  set('rem-tipo-servicio',  r.tipo);
  set('rem-origen',         r.origen);
  set('rem-destino',        r.destino);
  set('rem-km',             r.km !== '—' ? r.km : '');
  set('rem-nro-prestadora', r.nroSrv);
  set('rem-marca-modelo',   r.marca);
  set('rem-cliente',        r.cliente);
  set('rem-cuit',           r.cuit);
  set('imp-peaje',          r.peaje && r.peaje !== '0' ? r.peaje : '');
  set('imp-excedente',      r.excedente && r.excedente !== '0' ? r.excedente : '');
  set('imp-otros',          r.otros && r.otros !== '0' ? r.otros : '');
  set('rem-observaciones',  r.observaciones);
  if (typeof _validarPatente === 'function') _validarPatente(r.patente || '');
  toast(`Completando remito ${r.nro}`, 'info');
}
// ═══════════════════════════════════════════
// 4. INICIALIZACIÓN DE LA APP (Un solo DOMContentLoaded)
// ═══════════════════════════════════════════
function _restaurarJornadaDesdeStorage() {
  try {
    const raw = localStorage.getItem('sigma_jornada_activa');
    if (raw) {
      _jornadaActivaLocal = JSON.parse(raw);
      console.log('✅ Jornada restaurada desde almacenamiento local:', _jornadaActivaLocal.patente);
    }
  } catch (e) { _jornadaActivaLocal = null; }
}

window.addEventListener('load', () => {
  console.log("Iniciando FleetLog...");

  _restaurarJornadaDesdeStorage();
  wireButtons();
  _actualizarEstadoConexion();
  verificarOfflineErrores();
  applyDocRole();

  if (typeof _db === 'undefined') {
    renderTablaRemitos(REMITOS_DEMO);
    renderHistorialJornadas(JORNADAS_DEMO);
    renderServiciosDia(SERVICIOS_DEMO);
  }

  const searchInput = document.querySelector('#filtros-remitos input[placeholder*="Nº remito"]');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      filtroBuscar = this.value.trim();
      aplicarFiltrosRemitos();
    }); 
  }
   else {
    console.warn("No se encontró el input de búsqueda en #remitos-lista. La función de búsqueda no estará disponible.");
   }
});

async function compartirRemitoPorWhatsApp(tr) {
  const raw = tr?.getAttribute('data-rem');
  const d = raw ? JSON.parse(raw) : null;
  if (!d) return;

  // 1. Preparamos el texto profesional (Tu lógica mejorada)
  const totalExtras = (parseFloat(d.peaje) || 0) + (parseFloat(d.excedente) || 0) + (parseFloat(d.otros) || 0);
  const extrasLinea = totalExtras > 0 
    ? `\n*Extras:* $${totalExtras.toLocaleString('es-AR')} (Peaje: $${parseFloat(d.peaje) || 0} / Exc: $${parseFloat(d.excedente) || 0})` 
    : '';
  
  const mapsUrl = d.destino
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.destino)}`
    : null;

  const texto = `*SIGMA REMOLQUES - REMITO DIGITAL*\n` +
    `-----------------------------------\n` +
    `📄 *N°:* ${d.nro}\n` +
    `📅 *Fecha:* ${d.fecha}\n` +
    `🚗 *Vehículo:* ${d.patente}${d.marca ? ' · ' + d.marca : ''}\n` +
    `👤 *Cliente:* ${d.cliente || '—'}\n` +
    `📍 *Ruta:* ${d.origen} → ${d.destino}\n` +
    (mapsUrl ? `🗺️ *Ver destino:* ${mapsUrl}\n` : '') +
    `🛣️ *KM:* ${d.km || '—'}` +
    extrasLinea + `\n` +
    `✅ *Estado:* Firmado digitalmente`;

  // 2. Intentamos compartir como ARCHIVO (Funciona en Celulares/Tablets)
  if (navigator.share && navigator.canShare) {
    try {
      toast('Generando archivo para WhatsApp...', 'info');
      
      // Creamos el HTML temporal para el PDF (Usamos la función de PDF que ya tenés)
      const elemento = document.createElement('div');
      // NOTA: Aquí asumo que tu función de PDF se puede llamar o que el contenido es el mismo
      elemento.innerHTML = `<div>${texto.replace(/\n/g, '<br>')}</div>`; 
      
      // Generamos el Blob del PDF
      const pdfBlob = await html2pdf().set({
        margin: 10,
        filename: `Remito_${d.nro}.pdf`,
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).from(elemento).output('blob');

      const file = new File([pdfBlob], `Remito_${d.nro}_${d.patente}.pdf`, { type: 'application/pdf' });

      // Verificamos si el sistema permite compartir este archivo específico
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Remito Sigma ${d.nro}`,
          text: texto // El texto va como "caption" del archivo
        });
        return; // Éxito: terminamos la función aquí
      }
    } catch (err) {
      console.error("Error al compartir archivo:", err);
      // Si falla la generación del archivo, el código seguirá al fallback de abajo
    }
  }

  // 3. FALLBACK: Si es PC o el navegador no permite compartir archivos, enviamos LINK/TEXTO
  // Limpiamos el teléfono del cliente (si existe) para enviarlo directo
  const telLimpio = d.telefono ? d.telefono.replace(/\D/g, '') : '';
  const url = `https://wa.me/${telLimpio}?text=${encodeURIComponent(texto)}`;
  
  window.open(url, '_blank');
}

/**
 * Genera y descarga el remito en formato PDF profesional.
 * Versión: 0.2.0 - Sigma Remolques
 */
function descargarRemitoPDF(tr) {
  const raw = tr?.getAttribute('data-rem');
  const d = raw ? JSON.parse(raw) : null;
  if (!d) { toast('No hay datos para el PDF', 'error'); return; }

  const totalExtras = (parseFloat(d.peaje || 0) + parseFloat(d.excedente || 0) + parseFloat(d.otros || 0));

  // --- LÓGICA: PROCESAMIENTO DE FOTOS ---
  const fotosArray = d.foto_urls || d.fotos || [];
  let seccionFotos = '';
  if (fotosArray.length > 0) {
    seccionFotos = `
      <div style="margin-bottom:24px;">
        <div style="font-size:9px; color:#999; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; font-weight:bold; border-bottom: 1px solid #eee; padding-bottom: 5px;">
          📷 Registro Fotográfico de la Unidad (Evidencia)
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
          ${fotosArray.map(url => `
            <div style="border: 1px solid #eee; border-radius: 4px; overflow: hidden; height: 130px; background: #fdfdfd;">
              <img src="${(typeof ENV !== 'undefined' && ENV.API_BASE_URL && !url.startsWith('http')) ? ENV.API_BASE_URL + url : url}" style="width: 100%; height: 100%; object-fit: cover;" crossorigin="anonymous">
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // --- LÓGICA: CONFORMIDAD DE ARRASTRE (NUEVO) ---
  // Buscamos si "Conformidad de Arrastre" está dentro del array de confirmaciones
  const requiereArrastre = d.confirmaciones && d.confirmaciones.includes('Conformidad de Arrastre');
  
  const bloqueLegalArrastre = requiereArrastre ? `
    <div style="background:#fff3cd; border:1px solid #ffeeba; border-radius:6px; padding:12px; margin-bottom:20px;">
      <div style="font-size:10px; color:#856404; font-weight:bold; margin-bottom:5px;">
        ⚠️ DECLARACIÓN DE CONFORMIDAD DE ARRASTRE
      </div>
      <div style="font-size:9px; color:#856404; line-height:1.4; text-align:justify;">
        El cliente autoriza expresamente a Sigma Remolques a realizar maniobras de arrastre sobre el vehículo, asumiendo total responsabilidad por posibles daños mecánicos (transmisión, frenos, etc.) o estéticos derivados de la condición actual de la unidad (falta de llaves, ruedas bloqueadas, fallas electrónicas, etc). El operador queda eximido de reclamos posteriores por dichos conceptos.
      </div>
    </div>
  ` : '';

  // --- ARMADO DEL HTML ---
  const _firmaUrl = (() => { const u = d.firma_imagen_url || d.firmaUrl || ''; return (typeof ENV !== 'undefined' && ENV.API_BASE_URL && u && !u.startsWith('http')) ? ENV.API_BASE_URL + u : u; })();
  const contenido = `
    <div style="font-family:'Helvetica Neue', Arial, sans-serif; padding:35px; color:#333; background:#fff;">
      
      <table style="width:100%; border-bottom:2px solid #333; padding-bottom:15px; margin-bottom:20px;">
        <tr>
          <td>
            <div style="font-size:22px; font-weight:bold; color:#f5a623;">SIGMA REMOLQUES</div>
            <div style="font-size:10px; color:#777;">Auxilio y Traslados de Vehículos</div>
          </td>
          <td style="text-align:right;">
            <div style="font-size:16px; font-weight:bold;">REMITO N° ${d.nro}</div>
            <div style="font-size:11px; color:#888;">${d.fecha}</div>
          </td>
        </tr>
      </table>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:20px; font-size:12px;">
        <div style="background:#f9f9f9; padding:12px; border-radius:6px;">
          <b style="color:#f5a623; font-size:10px; text-transform:uppercase;">Datos de la Unidad</b><br>
          <div style="margin-top:5px;"><b>Patente:</b> ${d.patente}</div>
          <div><b>Marca/Mod:</b> ${d.marca || '—'}</div>
        </div>
        <div style="background:#f9f9f9; padding:12px; border-radius:6px;">
          <b style="color:#f5a623; font-size:10px; text-transform:uppercase;">Cliente / Servicio</b><br>
          <div style="margin-top:5px;"><b>Titular:</b> ${d.cliente || '—'}</div>
          <div><b>Tipo:</b> ${d.tipo}</div>
        </div>
      </div>

      <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:11px;">
        <tr style="background:#f5a623; color:#fff; font-weight:bold;">
          <td style="padding:8px;">Concepto de Extras</td>
          <td style="padding:8px; text-align:right;">Monto</td>
        </tr>
        <tr>
          <td style="padding:8px; border-bottom:1px solid #eee;">Peajes y Gastos de Ruta</td>
          <td style="padding:8px; text-align:right; border-bottom:1px solid #eee;">$${parseFloat(d.peaje||0).toLocaleString('es-AR')}</td>
        </tr>
        <tr>
          <td style="padding:8px; border-bottom:1px solid #eee;">Excedente de Kilometraje (${d.km} KM totales)</td>
          <td style="padding:8px; text-align:right; border-bottom:1px solid #eee;">$${parseFloat(d.excedente||0).toLocaleString('es-AR')}</td>
        </tr>
        <tr>
          <td style="padding:8px; border-bottom:1px solid #eee;">Otros cargos adicionales</td>
          <td style="padding:8px; text-align:right; border-bottom:1px solid #eee;">$${parseFloat(d.otros||0).toLocaleString('es-AR')}</td>
        </tr>
        <tr style="font-weight:bold; font-size:13px;">
          <td style="padding:10px; text-align:right;">TOTAL EXTRAS:</td>
          <td style="padding:10px; text-align:right; color:#f5a623;">$${totalExtras.toLocaleString('es-AR')}</td>
        </tr>
      </table>

      ${seccionFotos}

      ${bloqueLegalArrastre}

      <div style="margin-top:30px; border-top:1px solid #eee; padding-top:20px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-end;">
          <div style="text-align:center; width:200px;">
            ${_firmaUrl ? `<img src="${_firmaUrl}" style="width:150px; border-bottom:1px solid #333;" crossorigin="anonymous">` : '<div style="height:50px; border-bottom:1px dashed #ccc;"></div>'}
            <div style="font-size:10px; color:#999; margin-top:5px;">Firma de Conformidad del Cliente</div>
          </div>
          <div style="font-size:9px; color:#bbb; text-align:right; max-width:250px;">
            El cliente declara conformidad con el estado de la unidad al momento de la entrega y acepta los cargos detallados.
          </div>
        </div>
      </div>

    </div>
  `;

  // --- CONFIGURACIÓN DE GENERACIÓN ---
  const opt = {
    margin: 10,
    filename: `REMITO_${d.nro}_${d.patente}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { 
      scale: 3, 
      useCORS: true, 
      letterRendering: true 
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  if (typeof toast === 'function') toast('Generando PDF...', 'info');
  
  const elemento = document.createElement('div');
  elemento.innerHTML = contenido;
  document.body.appendChild(elemento);

  html2pdf().set(opt).from(elemento).save().then(() => {
    document.body.removeChild(elemento);
  });
}

// ── ANULACIÓN DE REMITOS ──────────────────────
let _nroAnular = null;

function abrirModalAnular() {
  const nroEl = document.getElementById('vr-nro');
  _nroAnular = nroEl?.textContent || null;
  if (!_nroAnular) return;
  document.getElementById('anular-motivo-tipo').value = '';
  document.getElementById('anular-motivo-detalle').value = '';
  closeModal('modal-ver-remito');
  openModal('modal-anular-remito');
}

async function confirmarAnulacion() {
  const tipo    = document.getElementById('anular-motivo-tipo')?.value;
  const detalle = document.getElementById('anular-motivo-detalle')?.value?.trim();

  if (!tipo) { toast('Seleccioná el motivo de anulación', 'error'); return; }
  if (!detalle || detalle.length < 10) {
    toast('Describí el motivo con al menos 10 caracteres', 'error'); return;
  }

  const motivo = `[${tipo}] ${detalle}`;

  const { error } = await _db.from('remitos')
    .update({
      status:            'anulado',
      observaciones:     motivo,
      firmado_at:        new Date().toISOString(),
    })
    .eq('nro_remito', _nroAnular);

  if (error) {
    toast('Error al anular: ' + error.message, 'error');
    return;
  }

  closeModal('modal-anular-remito');
  await cargarRemitos();
  toast(`Remito ${_nroAnular} anulado`, 'error');
  _nroAnular = null;
}

// ── FIRMA SIN CLIENTE ─────────────────────────
let clientePresente = true;

function setClientePresente(presente) {
  clientePresente = presente;

  const btnSi  = document.getElementById('btn-cliente-presente');
  const btnNo  = document.getElementById('btn-cliente-ausente');
  const aviso  = document.getElementById('aviso-cliente-ausente');
  const label  = document.getElementById('firma-canvas-label');

  if (presente) {
    btnSi.style.borderColor = 'var(--green)';
    btnSi.style.background  = 'var(--green-lo)';
    btnSi.style.color       = 'var(--green)';
    btnNo.style.borderColor = 'var(--border)';
    btnNo.style.background  = 'var(--card)';
    btnNo.style.color       = 'var(--muted)';
    if (aviso) aviso.style.display = 'none';
    if (label) label.textContent   = 'Firma del cliente';
  } else {
    btnNo.style.borderColor = 'var(--amber)';
    btnNo.style.background  = 'rgba(245,166,35,0.1)';
    btnNo.style.color       = 'var(--amber)';
    btnSi.style.borderColor = 'var(--border)';
    btnSi.style.background  = 'var(--card)';
    btnSi.style.color       = 'var(--muted)';
    if (aviso) aviso.style.display = 'block';
    if (label) label.textContent   = 'Firma del chofer (testigo)';
  }
}
function dibujarFirmaDemo(ctx, w, h) {
  ctx.fillStyle = "#0c0e12"; // Fondo oscuro (--bg)
  ctx.fillRect(0, 0, w, h);
  ctx.font = "bold 14px monospace";
  ctx.fillStyle = "#5a6278"; // Texto mutado (--muted)
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("PENDIENTE DE FIRMA", w/2, h/2);
}

function mostrarVista(idVista) {
  // 1. Apagar TODAS las vistas brutalmente
  document.querySelectorAll('.view').forEach(view => {
    view.style.display = 'none';
    view.classList.remove('active');
  });
  
  // 2. Encender SOLO la que necesitas
  const vistaDestino = document.getElementById(idVista);
  if(vistaDestino) {
    vistaDestino.style.display = 'block';
    vistaDestino.classList.add('active');

    // 3. Inicializaciones específicas POST-Renderizado
    if (idVista === 'remitos-firma') {
      ajustarCanvasFirma();
    }
  }
}

function ajustarCanvasFirma() {
  const canvas = document.getElementById('sig-canvas-firma');
  if (!canvas) {
    console.error("❌ No se encontró el canvas de firma en el DOM.");
    return;
  }

  // Igualar la resolución interna (buffer) a los píxeles físicos reales que ocupa en la pantalla
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight || 160; // Forzamos los 160px que definiste en tu CSS por seguridad

  // ADVERTENCIA TÉCNICA:
  // Al redimensionar un canvas, su contexto se borra. 
  // Si tienes una función que inicializa el trazo (ej. initSignaturePad, configurar eventos touch/mouse),
  // DEBES llamarla justo en esta línea. 
}

// ══════════════════════════════════════════════
// MÓDULO JORNADAS
// ══════════════════════════════════════════════

let jornadaSeleccionada   = null; // camión seleccionado en modal
let jornadaParaCerrar     = null; // jornada abierta seleccionada para cerrar
let enTaller              = false;
let _camionActual         = null; // camión elegido en pantalla post-login
// ══════════════════════════════════════════════
// MÓDULO DOCUMENTACIÓN (Camión y Chofer)
// ══════════════════════════════════════════════
let _docsCamion       = [];
let _docsChofer       = [];
let _emergencias      = [];
let _docTabActivo     = 'camion';
let _fabContexto      = null; // 'camion' | 'chofer'
let _utdInternalCode  = '';   // internal_code seleccionado en modal upload truck
let _docFiltro        = { camion: 'todos', chofer: 'todos' };
let _adminTruckSeleccionado  = null;
let _adminChoferSeleccionado = null;
let _listaCamiones           = [];
let _listaChoferes           = [];
let _allTruckDocs            = [];
let _allDriverDocs           = [];
let fotoKmInicio          = null;
let fotoKmFinal           = null;
let kmExcepcion = false;  // true si el chofer confirmó excepción de odómetro
let _jornadasAbiertasCache    = [];
let _jornadaPendienteCerrar   = null;

// ── Abrir modal nueva jornada ─────────────────
async function abrirModalNuevaJornada() {
    // Resetear estado
    jornadaSeleccionada = null;
    fotoKmInicio = null;
    _modalError('nj-error', '');

    const kmInput = document.getElementById('nj-km-inicio');
    if (kmInput) { kmInput.value = ''; kmInput.placeholder = 'Esperando lectura...'; }

    const fotoBox    = document.getElementById('nj-foto-box');
    const fotoIcon   = document.getElementById('nj-foto-icon');
    const fotoStatus = document.getElementById('nj-foto-status');
    const fotoInput  = document.getElementById('nj-foto-km');
    if (fotoBox)    { fotoBox.style.borderColor = 'var(--amber)'; fotoBox.style.background = 'var(--amber-lo)'; }
    if (fotoIcon)   { fotoIcon.textContent = '📷'; fotoIcon.style.color = ''; }
    if (fotoStatus) { fotoStatus.textContent = 'Tocar para escanear odómetro'; fotoStatus.style.color = ''; }
    if (fotoInput)  fotoInput.value = '';

    // Reset nuevos elementos del display gigante
    const njFotoArea = document.getElementById('nj-foto-area');
    const njResult   = document.getElementById('nj-km-result');
    const njManual   = document.getElementById('nj-km-manual-area');
    const njCalc     = document.getElementById('nj-km-calc');
    const njKmInput  = document.getElementById('nj-km-inicio');
    if (njFotoArea) njFotoArea.style.display = 'block';
    if (njResult)   njResult.style.display   = 'none';
    if (njManual)   njManual.style.display   = 'none';
    if (njCalc)     njCalc.textContent        = '';
    if (njKmInput)  njKmInput.value           = '';

    const btnConfirmar = document.getElementById('btn-confirmar-inicio');
    if (btnConfirmar) btnConfirmar.disabled = true;

    // Abrir modal
    const modal = document.getElementById('modal-nueva-jornada');
    if (modal) { modal.classList.add('open'); document.body.style.overflow = 'hidden'; }

    // Si hay camión pre-seleccionado desde la pantalla de selección, usarlo directamente
    const preview    = document.getElementById('camion-seleccionado-preview');
    const previewTxt = document.getElementById('camion-preview-texto');
    const btnSelector = document.getElementById('btn-abrir-selector-camion');
    const panel = document.getElementById('panel-selector-camion');

    if (_camionActual) {
      jornadaSeleccionada = _camionActual;
      const kmInput2 = document.getElementById('nj-km-inicio');
      if (kmInput2 && _camionActual.current_km) kmInput2.value = _camionActual.current_km;
      if (preview)    preview.style.display = 'block';
      if (previewTxt) previewTxt.textContent = `${_camionActual.plate}${_camionActual.numero_interno ? ' · N° ' + _camionActual.numero_interno : ''}`;
      if (btnSelector) btnSelector.style.display = 'none';
      if (panel)      panel.style.display = 'none';
      return; // No hace falta cargar la lista de camiones
    }

    if (preview)    preview.style.display = 'none';
    if (btnSelector) { btnSelector.style.display = ''; btnSelector.textContent = '🚛 Seleccionar Camión'; }
    if (panel)      panel.style.display = 'none';

    // Precargar camiones en background
    const hoy = new Date().toISOString().slice(0, 10);
    const [camiones, { data: jornadasAbiertas }] = await Promise.all([
        cargarCamiones(),
        _db.from('daily_logs').select('truck_id, users(full_name)').eq('log_date', hoy).eq('status', 'open')
    ]);

    const enUso = {};
    (jornadasAbiertas || []).forEach(j => { enUso[j.truck_id] = j.users?.full_name || 'otro chofer'; });

    const lista = document.getElementById('lista-camiones-selector');
    if (!lista) return;

    if (!camiones.length) {
        lista.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px">No hay camiones activos.</div>';
        return;
    }

    // Ordenar: disponibles primero, ocupados al final
    const ordenados = [
      ...camiones.filter(c => !enUso[c.truck_id]),
      ...camiones.filter(c =>  enUso[c.truck_id]),
    ];

    lista.innerHTML = ordenados.map(c => {
      const ocupado = enUso[c.truck_id];
      const searchText = [c.plate, c.numero_interno ? 'N°'+c.numero_interno : null].filter(Boolean).join(' ').toLowerCase();
      // data-camion usa &quot; para escapar comillas dobles en el atributo HTML
      const dataAttr = JSON.stringify(c).replace(/"/g, '&quot;');
      return `
  <div
    data-camion="${dataAttr}"
    ${!ocupado ? `onclick="seleccionarCamionDesdeEl(this)"` : ''}
    data-search="${searchText}"
    style="border-radius:10px;border:2px solid var(--border);background:${ocupado ? 'rgba(0,0,0,0.25)' : 'var(--surface)'};padding:10px;cursor:${ocupado ? 'not-allowed' : 'pointer'};transition:all 0.2s;${ocupado ? 'opacity:0.55' : ''}">
      <div style="font-size:15px;font-weight:800;color:${ocupado ? 'var(--muted)' : 'var(--text)'}">${c.plate}</div>
      ${c.numero_interno ? `<div style="font-size:9px;color:var(--muted);margin:2px 0">N° ${c.numero_interno}</div>` : ''}
      <div style="font-size:9px;color:var(--amber);margin:2px 0">🛣 ${c.current_km ? c.current_km.toLocaleString('es-AR') + ' km' : 'Sin km'}</div>
      ${[c.brand, c.model].filter(Boolean).length ? `<div style="font-size:9px;color:var(--muted)">${[c.brand,c.model].filter(Boolean).join(' ')}</div>` : ''}
      <div style="font-size:9px;margin-top:4px;padding:1px 5px;border-radius:4px;display:inline-block;background:${ocupado ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'};color:${ocupado ? 'var(--red)' : '#10b981'}">
        ${ocupado ? '🔴 En uso' : '🟢 Libre'}
      </div>
      <div class="camion-check-icon" style="text-align:right;font-size:14px;margin-top:2px"></div>
  </div>`;
    }).join('');
}

function filtrarCamionesPorBusqueda(q) {
  const norm = q.toLowerCase().trim();
  document.querySelectorAll('#lista-camiones-selector > div').forEach(el => {
    const text = el.dataset.search || '';
    el.style.display = !norm || text.includes(norm) ? '' : 'none';
  });
}

function seleccionarCamionDesdeEl(el) {
  const camion = JSON.parse(el.getAttribute('data-camion').replace(/&quot;/g, '"'));
  seleccionarCamion(camion, el);
}

function toggleSelectorCamion() {
    const panel = document.getElementById('panel-selector-camion');
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function reabrirSelectorCamion() {
    const searchInput = document.getElementById('camion-search-input');
    if (searchInput) { searchInput.value = ''; filtrarCamionesPorBusqueda(''); }
    jornadaSeleccionada = null;
    const preview = document.getElementById('camion-seleccionado-preview');
    const btnSelector = document.getElementById('btn-abrir-selector-camion');
    const panel = document.getElementById('panel-selector-camion');
    if (preview) preview.style.display = 'none';
    if (btnSelector) btnSelector.style.display = '';
    if (panel) panel.style.display = 'block';
    // Reset check icons
    document.querySelectorAll('#lista-camiones-selector .camion-check-icon').forEach(i => i.textContent = '○');
}
// Variable global para almacenar el camión seleccionado

function seleccionarCamion(camion, el) {
  // Reset check icons
  document.querySelectorAll('#lista-camiones-selector .camion-check-icon').forEach(i => i.textContent = '○');
  document.querySelectorAll('#lista-camiones-selector > div').forEach(d => d.style.borderColor = 'var(--border)');

  // Marcar seleccionado
  el.style.borderColor = 'var(--amber)';
  el.querySelector('.camion-check-icon').textContent = '✅';
  jornadaSeleccionada = camion;

  // Mostrar preview y ocultar panel
  const preview = document.getElementById('camion-seleccionado-preview');
  const previewTxt = document.getElementById('camion-preview-texto');
  const btnSelector = document.getElementById('btn-abrir-selector-camion');
  const panel = document.getElementById('panel-selector-camion');
  if (previewTxt) previewTxt.textContent = `${camion.plate}${camion.numero_interno ? ' · N° ' + camion.numero_interno : ''}`;
  if (preview) preview.style.display = 'block';
  if (btnSelector) btnSelector.style.display = 'none';
  if (panel) panel.style.display = 'none';
  const searchInput = document.getElementById('camion-search-input');
  if (searchInput) searchInput.value = '';

  // Pre-llenar KM inicial
  const kmInput = document.getElementById('nj-km-inicio');
  if (kmInput && camion.current_km) kmInput.value = camion.current_km;
}

function procesarFotoJornada(input, statusId, iconId) {
  if (!input.files?.length) return;
  const file = input.files[0];
  const statusEl = document.getElementById(statusId);
  const iconEl   = document.getElementById(iconId);
  const boxEl    = input.closest('label')?.querySelector('.photo-upload');

  if (input.id === 'nj-foto-km') fotoKmInicio = file;
  if (input.id === 'cj-foto-km') fotoKmFinal  = file;

  if (iconEl)   iconEl.textContent   = '✅';
  if (statusEl) { statusEl.textContent = file.name; statusEl.style.color = 'var(--green)'; }
  if (boxEl)    { boxEl.style.borderColor = 'var(--green)'; boxEl.style.background = 'var(--green-lo)'; }
}

async function confirmarNuevaJornada() {
  console.log("📍 PASO 1: Botón clickeado. Iniciando validaciones...");

  // Guard Clauses
  if (!jornadaSeleccionada) {
    _modalError('nj-error', 'Seleccioná un camión de la lista'); return;
  }
  
  const kmInicioInput = document.getElementById('nj-km-inicio')?.value;
  const kmInicio = parseInt(kmInicioInput);

  console.log(`📍 PASO 2: Validaciones superadas. KM: ${kmInicio} | Foto lista: ${fotoKmInicio != null}`);

  if (!kmInicio || isNaN(kmInicio)) {
    _modalError('nj-error', 'Ingresá un KM inicial numérico válido'); return;
  }
  if (kmInicio < 0) {
    _modalError('nj-error', 'El odómetro no puede ser negativo'); return;
  }
  const kmRegistrado = parseInt(jornadaSeleccionada?.current_km) || 0;
  if (kmRegistrado > 0 && kmInicio < kmRegistrado) {
    _modalError('nj-error', `El KM ingresado (${kmInicio.toLocaleString('es-AR')}) es menor al último registrado (${kmRegistrado.toLocaleString('es-AR')}). Verificá el odómetro.`); return;
  }
  if (!fotoKmInicio) {
    _modalError('nj-error', 'Sacá la foto del tablero del camión');
    const box = document.getElementById('nj-foto-box');
    const status = document.getElementById('nj-foto-status');
    if (box) {
      box.style.borderColor = 'var(--red)';
      box.style.background  = 'var(--red-lo)';
      box.style.transition  = 'all 0.3s';
      setTimeout(() => { box.style.borderColor = ''; box.style.background = ''; if (status) status.textContent = 'Tocar para sacar foto'; }, 2500);
    }
    if (status) { status.textContent = '⚠️ Asegurate de cargar la foto del odómetro.'; status.style.color = 'var(--red)'; }
    return;
  }

  const btn = document.querySelector('#modal-nueva-jornada .btn-primary');
  if (btn) { btn.textContent = 'Guardando...'; btn.style.pointerEvents = 'none'; }

  console.log("📍 PASO 3: Enviando datos a Supabase...", {
    truckId: jornadaSeleccionada.truck_id,
    kmInicio: kmInicio
  });

  const resultado = await iniciarJornada({
    truckId:      jornadaSeleccionada.truck_id,
    patente:      jornadaSeleccionada.plate,
    kmInicio:     kmInicio,
    fotoKmInicio: fotoKmInicio,
    marcaModelo:  [jornadaSeleccionada.brand, jornadaSeleccionada.model].filter(Boolean).join(' ') || null,
  });

  console.log("📍 PASO 4: Supabase contestó:", resultado);

  if (btn) { btn.textContent = '✅ Iniciar jornada'; btn.style.pointerEvents = 'auto'; }

  if (resultado && resultado.success) {
    toast('Jornada iniciada ✓', 'success');
    closeModal('modal-nueva-jornada');
    if (typeof actualizarPantallaJornadas === 'function') await actualizarPantallaJornadas();
  } else {
    const msg = resultado?.error || 'No se pudo iniciar la jornada.';
    _modalError('nj-error', msg);
    // Si el error es por camión duplicado, resaltar el selector
    if (msg.includes('camión') || msg.includes('jornada activa')) {
      const lista = document.getElementById('lista-camiones-selector');
      if (lista) {
        lista.style.outline = '2px solid var(--red)';
        lista.style.borderRadius = '8px';
        setTimeout(() => { lista.style.outline = ''; }, 2500);
      }
    }
  }
}


// ── Cerrar jornada ────────────────────────────
function abrirModalCerrarJornada(jornada) {
  if (!jornada || !jornada.log_id) {
    toast('Error: No hay una jornada activa registrada.', 'error');
    return;
  }

  // Setear variables de estado
  jornadaParaCerrar = jornada;
  enTaller = false;
  fotoKmFinal = null;
  kmExcepcion = false;

  // Limpiar inputs viejos
  ['cj-km-final', 'cj-workshop-detail', 'cj-notas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const kmCalc = document.getElementById('cj-km-calc');
  if (kmCalc) kmCalc.textContent = '';

  // Limpiar foto vieja
  const fotoStatus = document.getElementById('cj-foto-status');
  const fotoIcon = document.getElementById('cj-foto-icon');
  const fotoBox = document.getElementById('cj-foto-box');
  const inputFoto = document.getElementById('cj-foto-km');
  
  if (fotoStatus) fotoStatus.textContent = 'Tocar para sacar foto';
  if (fotoIcon) fotoIcon.textContent = '📷';
  if (fotoBox) {
    fotoBox.style.borderColor = '';
    fotoBox.style.background = '';
  }
  if (inputFoto) inputFoto.value = '';

  const kmResult   = document.getElementById('cj-km-result');
  const fotoArea   = document.getElementById('cj-foto-area');
  const manualArea = document.getElementById('cj-km-manual-area');
  const excepcion  = document.getElementById('cj-excepcion-section');
  const excCheck   = document.getElementById('cj-excepcion-check');
  const btnCierre  = document.getElementById('btn-confirmar-cierre');

  if (kmResult)   { kmResult.style.display = 'none'; }
  if (fotoArea)   { fotoArea.style.display = 'block'; }
  if (manualArea) { manualArea.style.display = 'none'; }
  if (excepcion)  { excepcion.style.display = 'none'; }
  if (excCheck)   { excCheck.checked = false; }
  if (btnCierre)  { btnCierre.disabled = false; }

  // Llenar datos de la grúa
  const info = jornada.trucks;
  const camInfo = document.getElementById('cj-camion-info');
  if (camInfo) camInfo.textContent = `${info?.plate || '—'} · ${info?.brand || ''} ${info?.model || ''}`;

  const kmDisp = document.getElementById('cj-km-inicio-display');
  if (kmDisp) kmDisp.textContent = (jornada.km_inicio || 0).toLocaleString('es-AR') + ' km';

  // Resetear toggle de taller
  const tallerToggle  = document.getElementById('cj-taller-toggle');
  const tallerKnob    = document.getElementById('cj-taller-knob');
  const tallerDetalle = document.getElementById('cj-taller-detalle');
  const tallerRow     = document.getElementById('cj-taller-toggle-row');
  if (tallerDetalle)  { tallerDetalle.style.display = 'none'; }
  if (tallerToggle)   { tallerToggle.style.background = 'var(--border)'; }
  if (tallerKnob)     { tallerKnob.style.left = '3px'; }
  const tallerTipo = document.getElementById('cj-taller-tipo'); if (tallerTipo) tallerTipo.value = '';
  const tallerDet  = document.getElementById('cj-workshop-detail'); if (tallerDet) { tallerDet.value = ''; tallerDet.placeholder = 'Detalle del trabajo realizado...'; }
  _modalError('cj-error', '');
  if (tallerRow)      { tallerRow.style.borderColor = 'var(--border)'; tallerRow.style.background = 'var(--bg-darker)'; }

  // Y finalmente... ¡Tu función nativa hace la magia!
  openModal('modal-cerrar-jornada');
}

const _TALLER_EJ = {
  'Mantenimiento': 'Ej: Service, Distribución, Correa de accesorios',
  'Preventivo':    'Ej: Cambio de aceite, Filtros, Engrase',
  'Repuestos':     'Ej: Frenos, Neumáticos, Batería',
  'Reparación':    'Ej: Motor, Caja de cambios, Dirección',
  'Eléctrico':     'Ej: Alternador, Arranque, Luces',
  'Otro':          'Ej: Limpieza, Pintura, Carrocería',
};
function onTallerTipoChange() {
  const tipo = document.getElementById('cj-taller-tipo')?.value;
  const det  = document.getElementById('cj-workshop-detail');
  if (det) det.placeholder = _TALLER_EJ[tipo] || 'Detalle del trabajo realizado...';
}

function toggleTaller() {
  enTaller = !enTaller;
  const toggle  = document.getElementById('cj-taller-toggle');
  const knob    = document.getElementById('cj-taller-knob');
  const detalle = document.getElementById('cj-taller-detalle');
  const row     = document.getElementById('cj-taller-toggle-row');

  if (toggle) toggle.style.background = enTaller ? 'var(--amber)' : 'var(--border)';
  if (knob)   knob.style.left = enTaller ? '23px' : '3px';
  if (detalle) detalle.style.display = enTaller ? 'block' : 'none';
  if (row) {
    row.style.borderColor = enTaller ? 'rgba(245,166,35,0.4)' : 'var(--border)';
    row.style.background  = enTaller ? 'rgba(245,166,35,0.05)' : 'var(--bg-darker)';
  }
}

function editarKmManual() {
  const kmResult   = document.getElementById('cj-km-result');
  const manualArea = document.getElementById('cj-km-manual-area');
  const input      = document.getElementById('cj-km-final');

  if (kmResult)   kmResult.style.display   = 'none';
  if (manualArea) manualArea.style.display = 'block';
  if (input) {
    const currentVal = input.value || document.getElementById('cj-km-number')?.textContent?.replace(/\./g,'') || '';
    input.value = currentVal;
    input.focus();
  }
}

function editarKmManualInicio() {
  const njResult  = document.getElementById('nj-km-result');
  const njManual  = document.getElementById('nj-km-manual-area');
  const input     = document.getElementById('nj-km-inicio');

  if (njResult) njResult.style.display = 'none';
  if (njManual) njManual.style.display = 'block';
  if (input) {
    const currentVal = input.value || document.getElementById('nj-km-number')?.textContent?.replace(/\./g, '') || '';
    input.value = currentVal;
    input.focus();
  }
}

function onKmManualInicioInput() {
  const input   = document.getElementById('nj-km-inicio');
  const calcEl  = document.getElementById('nj-km-calc');
  const btnConf = document.getElementById('btn-confirmar-inicio');

  const kmInicio  = parseInt(input?.value) || 0;
  const kmUltimo  = parseInt(jornadaSeleccionada?.current_km) || 0;

  if (kmInicio <= 0) {
    if (calcEl) calcEl.textContent = '';
    if (btnConf) btnConf.disabled = true;
    return;
  }

  const diff = kmInicio - kmUltimo;
  if (calcEl) {
    if (diff < 0) {
      calcEl.innerHTML = `<span style="color:var(--amber)">⚠ ${Math.abs(diff).toLocaleString('es-AR')} km menor al último cierre</span>`;
    } else {
      calcEl.innerHTML = `<span style="color:#10b981">+${diff.toLocaleString('es-AR')} km vs último cierre</span>`;
    }
  }

  if (btnConf) btnConf.disabled = false;
}

function onKmManualInput() {
  const input      = document.getElementById('cj-km-final');
  const calcEl     = document.getElementById('cj-km-calc');
  const excSection = document.getElementById('cj-excepcion-section');
  const excCheck   = document.getElementById('cj-excepcion-check');
  const btnCierre  = document.getElementById('btn-confirmar-cierre');

  const kmFinal  = parseInt(input?.value) || 0;
  const kmInicio = parseInt(jornadaParaCerrar?.km_inicio) || 0;

  if (kmFinal <= 0) {
    if (calcEl) { calcEl.textContent = ''; }
    if (btnCierre) btnCierre.disabled = true;
    return;
  }

  const diff = kmFinal - kmInicio;
  const esAnomalía = diff < 0;

  if (calcEl) {
    calcEl.textContent = esAnomalía ? '⚠ KM menor al inicio de jornada' : `+${diff.toLocaleString('es-AR')} km recorridos`;
    calcEl.style.color = esAnomalía ? 'var(--red)' : 'var(--green)';
  }

  if (excSection) excSection.style.display = esAnomalía ? 'block' : 'none';
  if (!esAnomalía && excCheck) { excCheck.checked = false; kmExcepcion = false; }

  if (btnCierre) btnCierre.disabled = esAnomalía && !kmExcepcion;
}

function onExcepcionCheck(checkbox) {
  kmExcepcion = checkbox.checked;
  const btnCierre = document.getElementById('btn-confirmar-cierre');
  if (btnCierre) btnCierre.disabled = !kmExcepcion;
}

function validarKmInicioJornada() {
  const input   = document.getElementById('nj-km-inicio');
  const display = document.getElementById('nj-km-validacion');
  if (!input || !display || !jornadaSeleccionada) return;

  const kmIngresado = parseInt(input.value) || 0;
  const kmRegistrado = parseInt(jornadaSeleccionada.current_km) || 0;

  if (kmIngresado === 0) { display.textContent = ''; return; }

  if (kmRegistrado > 0) {
    display.textContent = `Último KM registrado para este camión: ${kmRegistrado.toLocaleString('es-AR')} km`;
    display.style.color = 'var(--muted)';
  }

  if (kmIngresado < kmRegistrado) {
    display.textContent = `⚠️ El KM ingresado (${kmIngresado.toLocaleString('es-AR')}) es menor al último registrado (${kmRegistrado.toLocaleString('es-AR')}). Verificá el odómetro.`;
    display.style.color = 'var(--red)';
  }
}

function calcularKmRecorridos() {
  const kmFinalInput = document.getElementById('cj-km-final');
  const diffDisplay  = document.getElementById('cj-km-calc');

  if (!kmFinalInput || !diffDisplay || !jornadaParaCerrar) return;

  const kmFinal  = parseInt(kmFinalInput.value) || 0;
  const kmInicio = parseInt(jornadaParaCerrar.km_inicio) || 0;

  if (kmFinal === 0) {
    diffDisplay.textContent = '';
    return;
  }

  const diff = kmFinal - kmInicio;

  diffDisplay.textContent = diff < 0
    ? '⚠️ KM menor al inicio'
    : `+${diff.toLocaleString('es-AR')} km recorridos`;

  diffDisplay.style.color = diff < 0 ? 'var(--red)' : 'var(--green)';
}

async function confirmarCerrarJornada() {
  const kmFinal        = parseInt(document.getElementById('cj-km-final')?.value);
  const workshopDetail = document.getElementById('cj-workshop-detail')?.value || null;
  const notas          = document.getElementById('cj-notas')?.value || null;

  const tallerTipo = document.getElementById('cj-taller-tipo')?.value || null;

  // Guard Clauses
  if (!kmFinal || isNaN(kmFinal)) {
    _modalError('cj-error', 'Ingresá el KM final'); return;
  }
  if (kmFinal <= 0) {
    _modalError('cj-error', 'El KM final debe ser mayor a cero'); return;
  }
  if (kmFinal < jornadaParaCerrar.km_inicio && !kmExcepcion) {
    _modalError('cj-error', 'El KM final es menor al inicial. Editá el valor o confirmá la excepción de odómetro.'); return;
  }
  if (!fotoKmFinal) {
    _modalError('cj-error', 'Sacá la foto del odómetro final');
    const box = document.getElementById('cj-foto-box');
    const status = document.getElementById('cj-foto-status');
    if (box) {
      box.style.borderColor = 'var(--red)';
      box.style.background  = 'var(--red-lo)';
      box.style.transition  = 'all 0.3s';
      setTimeout(() => { box.style.borderColor = ''; box.style.background = ''; if (status) status.textContent = 'Tocar para sacar foto'; }, 2500);
    }
    if (status) { status.textContent = '⚠️ Asegurate de cargar la foto del odómetro.'; status.style.color = 'var(--red)'; }
    return;
  }
  if (enTaller && !tallerTipo) {
    _modalError('cj-error', 'Seleccioná el tipo de trabajo en taller'); return;
  }
  if (enTaller && !workshopDetail) {
    _modalError('cj-error', 'Ingresá el detalle del trabajo realizado en taller'); return;
  }
  _modalError('cj-error', '');

  // Bloquear botón mientras Supabase procesa (evita doble envío en redes lentas)
  const btn = document.querySelector('#modal-cerrar-jornada .btn-primary');
  if (btn) {
    btn.textContent = 'Guardando...';
    btn.style.pointerEvents = 'none';
  }

  const exito = await cerrarJornada(jornadaParaCerrar.log_id, {
    truckId:        jornadaParaCerrar.truck_id,
    kmInicio:       jornadaParaCerrar.km_inicio,
    kmFinal:        kmFinal,
    fotoKmFinal:    fotoKmFinal,
    inWorkshop:     enTaller,
    workshopDetail: tallerTipo && workshopDetail ? `${tallerTipo}: ${workshopDetail}` : (workshopDetail || null),
    notas:          notas,
    kmExcepcion:    kmExcepcion,
  });

  // Restaurar el botón
  if (btn) {
    btn.textContent = '🏁 Cerrar jornada';
    btn.style.pointerEvents = 'auto';
  }

  if (exito) {
    toast('Jornada finalizada correctamente', 'success');
    closeModal('modal-cerrar-jornada');
    await actualizarPantallaJornadas();

    // Si el camión cerrado es el activo en la pantalla de camión,
    // actualizar KM en memoria y refrescar las barras de service
    if (_truckActual?.truck_id === jornadaParaCerrar.truck_id) {
      _truckActual.current_km = kmFinal;
      const planesActualizados = await cargarPlanesDetalleOptimizados(_truckActual.truck_id, kmFinal);
      renderPlanes(planesActualizados);
    }

    // Abrir rendición de efectivo
    await abrirRendicion(jornadaParaCerrar.log_id, USUARIO_ACTUAL.id, jornadaParaCerrar.truck_id, jornadaParaCerrar.log_date);
  } else {
    toast('Error: No se pudo cerrar la jornada.', 'error');
  }
}

// ── Rendición de efectivo ─────────────────────

let _rendicionLogId         = null;
let _rendicionFecha         = null;
let _rendicionEfEsperado    = 0;
let _rendicionGastosSistema = 0;

async function abrirRendicion(logId, driverId, truckId, fecha) {
  _rendicionLogId         = logId;
  _rendicionFecha         = fecha;
  _rendicionEfEsperado    = 0;
  _rendicionGastosSistema = 0;

  ['rend-efectivo-declarado', 'rend-gastos-extra', 'rend-motivo-extra', 'rend-notas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const preview   = document.getElementById('rend-diferencia-preview');
  const motivoRow = document.getElementById('rend-motivo-row');
  if (preview)   preview.style.display   = 'none';
  if (motivoRow) motivoRow.style.display = 'none';
  _modalError('rend-error', '');

  const lista = document.getElementById('rend-remitos-lista');
  if (lista) lista.innerHTML = '<div style="color:var(--muted);font-size:12px;text-align:center;padding:8px">Cargando servicios...</div>';

  openModal('modal-rendicion-cierre');

  const { remitos, efectivoEsperado, gastosSistema } = await obtenerResumenRendicion(driverId, fecha, truckId);
  _rendicionEfEsperado    = efectivoEsperado;
  _rendicionGastosSistema = gastosSistema;

  if (lista) {
    if (remitos.length === 0) {
      lista.innerHTML = '<div style="color:var(--muted);font-size:12px;text-align:center;padding:8px">Sin servicios registrados hoy</div>';
    } else {
      lista.innerHTML = remitos.map(r => {
        const total = (r.pago_1_monto || 0) + (r.pago_2_monto || 0);
        const esEf  = r.pago_1_metodo === 'efectivo' || r.pago_2_metodo === 'efectivo';
        return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--muted)">#${r.nro_remito} ${r.tipo_servicio || ''}</span>
          <span style="${esEf ? 'color:var(--amber);font-weight:600' : 'color:var(--muted)'}">
            ${esEf ? '💵 ' : ''}$${total.toLocaleString('es-AR')}
          </span>
        </div>`;
      }).join('');
    }
  }

  const espEl = document.getElementById('rend-efectivo-esperado');
  if (espEl) espEl.textContent = '$' + efectivoEsperado.toLocaleString('es-AR');

  const gastosRow = document.getElementById('rend-gastos-sistema-row');
  const gastosVal = document.getElementById('rend-gastos-sistema-val');
  if (gastosRow && gastosVal) {
    if (gastosSistema > 0) {
      gastosRow.style.display = 'flex';
      gastosVal.textContent   = '-$' + gastosSistema.toLocaleString('es-AR');
    } else {
      gastosRow.style.display = 'none';
    }
  }
}

function rendActualizarDiferencia() {
  const declaradoEl   = document.getElementById('rend-efectivo-declarado');
  const gastosExtraEl = document.getElementById('rend-gastos-extra');
  const motivoRow     = document.getElementById('rend-motivo-row');
  const previewEl     = document.getElementById('rend-diferencia-preview');
  const valEl         = document.getElementById('rend-diferencia-val');
  const msgEl         = document.getElementById('rend-diferencia-msg');

  const declarado   = parseFloat(declaradoEl?.value) || 0;
  const gastosExtra = parseFloat(gastosExtraEl?.value) || 0;

  if (motivoRow) motivoRow.style.display = gastosExtra > 0 ? '' : 'none';

  if (!declaradoEl?.value) {
    if (previewEl) previewEl.style.display = 'none';
    return;
  }

  const neto = _rendicionEfEsperado - _rendicionGastosSistema - gastosExtra;
  const diff = declarado - neto;
  const abs  = Math.abs(diff);

  if (previewEl) previewEl.style.display = '';
  if (valEl) {
    valEl.textContent = (diff >= 0 ? '+' : '-') + '$' + abs.toLocaleString('es-AR');
    valEl.style.color = abs < 500 ? 'var(--green)' : diff > 0 ? 'var(--amber)' : 'var(--red)';
  }
  if (msgEl) {
    msgEl.textContent = abs < 500 ? 'Dentro del margen — todo cuadra ✓'
                      : diff > 0  ? 'Tenés más efectivo del esperado'
                                  : 'Falta efectivo — se generará una alerta';
  }
  if (previewEl) {
    const color  = abs < 500 ? 'rgba(39,174,96,0.3)' : diff > 0 ? 'rgba(245,166,35,0.3)' : 'rgba(231,76,60,0.3)';
    const bg     = abs < 500 ? 'var(--green-lo)'      : diff > 0 ? 'rgba(245,166,35,0.08)' : 'var(--red-lo)';
    previewEl.style.background = bg;
    previewEl.style.border     = `1px solid ${color}`;
  }
}

async function confirmarRendicion() {
  const declaradoEl = document.getElementById('rend-efectivo-declarado');
  if (!declaradoEl?.value) {
    _modalError('rend-error', 'Ingresá el efectivo que tenés en mano'); return;
  }
  const gastosExtra = parseFloat(document.getElementById('rend-gastos-extra')?.value) || 0;
  const motivoExtra = document.getElementById('rend-motivo-extra')?.value?.trim() || null;
  if (gastosExtra > 0 && !motivoExtra) {
    _modalError('rend-error', 'Ingresá el motivo del gasto extra'); return;
  }
  _modalError('rend-error', '');

  const btn = document.getElementById('btn-confirmar-rendicion');
  if (btn) { btn.textContent = 'Enviando...'; btn.style.pointerEvents = 'none'; }

  try {
    const payload = {
      log_id:             _rendicionLogId,
      driver_id:          USUARIO_ACTUAL.id,
      fecha:              _rendicionFecha,
      efectivo_declarado: parseFloat(declaradoEl.value),
      gastos_extra:       gastosExtra || null,
      motivo_extra:       motivoExtra,
      notas:              document.getElementById('rend-notas')?.value?.trim() || null,
    };

    const res  = await fetch(`${SUPABASE_URL}/functions/v1/check-integridad`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_KEY}` },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al enviar rendición');

    closeModal('modal-rendicion-cierre');
    if (json.alerta_generada) {
      toast('Rendición registrada — se generó una alerta por diferencia de efectivo', 'warning');
    } else {
      toast('Rendición confirmada correctamente ✓', 'success');
    }
  } catch (err) {
    console.error('confirmarRendicion:', err);
    _modalError('rend-error', err.message || 'Error al enviar la rendición');
  } finally {
    if (btn) { btn.textContent = '✅ Confirmar rendición'; btn.style.pointerEvents = 'auto'; }
  }
}

function omitirRendicion() {
  closeModal('modal-rendicion-cierre');
}

// ── Actualizar pantalla de jornadas ───────────
async function actualizarPantallaJornadas() {
  const jornadas = await cargarJornadasAbiertas();
  _jornadasAbiertasCache = jornadas;
  actualizarBotonFinalizar(jornadas.length > 0);

  // Sincronizar localStorage con lo que devuelve Supabase
  try {
    if (jornadas.length > 0) {
      const j = jornadas[0];
      _jornadaActivaLocal = {
        log_id:      j.log_id,
        truck_id:    j.truck_id,
        patente:     j.trucks?.plate || j.patente_camion || '',
        marca_modelo: [j.trucks?.brand, j.trucks?.model].filter(Boolean).join(' ') || null,
      };
      localStorage.setItem('sigma_jornada_activa', JSON.stringify(_jornadaActivaLocal));
    } else {
      _jornadaActivaLocal = null;
      localStorage.removeItem('sigma_jornada_activa');
    }
  } catch (e) { /* no crítico */ }

  // Warning en topbar si hay jornadas abiertas
  const warning = document.getElementById('warning-jornada-abierta');
  const section = document.getElementById('section-jornadas-abiertas');
  const lista   = document.getElementById('lista-jornadas-abiertas');

  if (jornadas.length > 0) {
    if (warning) {
      warning.style.display = 'block';
      clearTimeout(window._warningJornadaTimer);
      window._warningJornadaTimer = setTimeout(() => { warning.style.display = 'none'; }, 5000);
    }
    if (section) section.style.display = 'block';
    if (lista) {
      lista.innerHTML = '';
      jornadas.forEach(j => {
        const info = j.trucks;
        const div  = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;gap:14px;padding:16px;background:var(--card);border:1px solid rgba(245,166,35,0.3);border-radius:10px';
        div.innerHTML = `
          <div style="width:44px;height:44px;background:var(--amber-lo);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🚛</div>
          <div style="flex:1">
            <div style="font-family:'Bebas Neue';font-size:16px;letter-spacing:1px;color:var(--amber)">${info?.plate || '—'}</div>
            <div style="font-size:11px;color:var(--muted)">${info?.brand || ''} ${info?.model || ''} · N° ${info?.numero_interno || '—'}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">
              Inicio: <span style="font-family:'DM Mono';color:var(--text)">${j.hora_inicio || '—'}</span> ·
              KM: <span style="font-family:'DM Mono';color:var(--amber)">${(j.km_inicio||0).toLocaleString('es-AR')}</span>
            </div>
          </div>
          <button class="btn btn-primary" style="font-size:11px;padding:8px 14px;flex-shrink:0"
            onclick="iniciarCierreJornada(${JSON.stringify(j).replace(/"/g,'&quot;')})">
            🏁 Cerrar
          </button>`;
        lista.appendChild(div);
      });
    }
  } else {
    if (warning) warning.style.display = 'none';
    if (section) section.style.display = 'none';
  }

  // Recargar historial
  await cargarJornadas();
  await cargarResumenMesPantalla();
}

function scrollToJornadasAbiertas() {
  goTo('registro');
  setTimeout(() => {
    document.getElementById('section-jornadas-abiertas')?.scrollIntoView({ behavior: 'smooth' });
  }, 200);
}

// ── Habilitar/deshabilitar botón FINALIZAR ────
function actualizarBotonFinalizar(tieneJornadaAbierta) {
  const btn = document.getElementById('btn-finalizar-jornada');
  if (!btn) return;
  if (tieneJornadaAbierta) {
    btn.style.opacity        = '1';
    btn.style.pointerEvents  = 'auto';
    btn.disabled             = false;
  } else {
    btn.style.opacity        = '0.4';
    btn.style.pointerEvents  = 'none';
    btn.disabled             = true;
  }
}

// ── Diálogo taller antes de cerrar jornada ────
function iniciarCierreJornada(jornada) {
  abrirModalCerrarJornada(jornada);
}

function mostrarDialogoTaller() {
  const jornada = _jornadasAbiertasCache?.[0] || null;
  if (!jornada) {
    toast('No hay jornada activa para cerrar.', 'error');
    return;
  }
  abrirModalCerrarJornada(jornada);
}

function confirmarDialogoTaller(enTallerValue) {
  // Cerramos el primer modal (le sacamos la clase 'open')
  const modalPregunta = document.getElementById('modal-taller-pregunta');
  if (modalPregunta) {
    modalPregunta.classList.remove('open');
    // Restauramos el scroll por si openModal lo ocultó
    document.body.style.overflow = ''; 
  }
  
  if (!_jornadaPendienteCerrar) {
    toast('Error interno: jornada perdida.', 'error'); return;
  }
  
  // Pasamos al segundo paso
  abrirModalCerrarJornada(_jornadaPendienteCerrar, enTallerValue);
  _jornadaPendienteCerrar = null;
}
async function cargarResumenMesPantalla() {
  if (!USUARIO_ACTUAL?.id) return;
  const hoy  = new Date();
  const data = await cargarResumenMes(USUARIO_ACTUAL.id, hoy.getFullYear(), hoy.getMonth() + 1);
  if (!data) return;

  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const titulo = document.getElementById('resumen-mes-titulo');
  if (titulo) titulo.textContent = `${meses[hoy.getMonth()]} ${hoy.getFullYear()}`;

  const elKm  = document.getElementById('kpi-km-mes');
  const elJor = document.getElementById('kpi-jornadas-mes');
  const elSrv = document.getElementById('kpi-servicios-mes');
  const elAnu = document.getElementById('kpi-anulados-mes');

  if (elKm)  elKm.textContent  = (data.total_km).toLocaleString('es-AR');
  if (elJor) elJor.textContent = data.total_jornadas;
  if (elSrv) elSrv.textContent = data.total_servicios;
  if (elAnu) elAnu.textContent = data.total_anulados > 0 ? `${data.total_anulados} anulado${data.total_anulados > 1 ? 's' : ''}` : '';
}

// ── CONTROLADOR DEL HUB DE CONFIGURACIÓN ───────────────────────

async function openSettingsHub() {
  const esChofer = PERFIL_USUARIO?.roles?.name === 'chofer';

  if (esChofer) {
    _abrirPanelChofer();
    return;
  }

  const modal = document.getElementById('modal-settings');
  if (modal) {
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.zIndex = '9000';
    modal.style.opacity = '1';
    modal.style.visibility = 'visible';
    modal.style.backgroundColor = 'rgba(0,0,0,0.85)';
    switchConfigTab('tab-flota');
  }
}

function _abrirPanelChofer() {
  let panel = document.getElementById('panel-config-chofer');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'panel-config-chofer';
    document.body.appendChild(panel);
  }

  const nombre  = PERFIL_USUARIO?.full_name  || '—';
  const legajo  = PERFIL_USUARIO?.legajo      || '—';
  const dni     = PERFIL_USUARIO?.dni         || '—';
  const tieneJornada = (_jornadasAbiertasCache?.length > 0) || !!_jornadaActivaLocal?.log_id;

  panel.innerHTML = `
    <div class="cfg-ch-backdrop" onclick="if(event.target===this)_cerrarPanelChofer()">
      <div class="cfg-ch-box">
        <div class="cfg-ch-header">
          <div>
            <div class="cfg-ch-title">Mi cuenta</div>
            <div class="cfg-ch-sub">Sigma Remolques</div>
          </div>
          <button class="cfg-ch-close" onclick="_cerrarPanelChofer()">✕</button>
        </div>

        <div class="cfg-ch-section-label">MI PERFIL</div>
        <div class="cfg-ch-card">
          <div class="cfg-ch-row"><span class="cfg-ch-key">Nombre</span><span class="cfg-ch-val">${nombre}</span></div>
          <div class="cfg-ch-row"><span class="cfg-ch-key">Legajo</span><span class="cfg-ch-val">${legajo}</span></div>
          <div class="cfg-ch-row"><span class="cfg-ch-key">DNI</span><span class="cfg-ch-val">${dni}</span></div>
        </div>

        <div class="cfg-ch-section-label">SEGURIDAD</div>
        <div class="cfg-ch-card cfg-ch-card--action" onclick="_abrirCambioPassword()">
          <span>🔑 Cambiar contraseña</span>
          <span class="cfg-ch-arrow">›</span>
        </div>

        <div id="cfg-ch-pass-form" style="display:none" class="cfg-ch-card">
          <input id="cfg-ch-pass-nueva" class="cfg-ch-input" type="password" placeholder="Nueva contraseña">
          <input id="cfg-ch-pass-confirm" class="cfg-ch-input" type="password" placeholder="Confirmar contraseña">
          <button class="cfg-ch-btn-primary" onclick="_guardarNuevaPassword()">Guardar</button>
        </div>

        <div class="cfg-ch-section-label">SESIÓN</div>
        <div class="cfg-ch-card cfg-ch-card--action ${tieneJornada ? 'cfg-ch-card--disabled' : ''}"
             onclick="${tieneJornada ? '' : '_cambiarSesionChofer()'}">
          <div>
            <div>🔄 Cambiar sesión</div>
            ${tieneJornada ? '<div class="cfg-ch-hint">Cerrá tu jornada activa primero</div>' : ''}
          </div>
          <span class="cfg-ch-arrow">›</span>
        </div>
        <div class="cfg-ch-card cfg-ch-card--action cfg-ch-card--danger" onclick="_confirmarCerrarSesion()">
          <span>🚪 Cerrar sesión</span>
          <span class="cfg-ch-arrow">›</span>
        </div>
      </div>
    </div>`;

  panel.style.display = 'block';
}

function _cerrarPanelChofer() {
  const panel = document.getElementById('panel-config-chofer');
  if (panel) panel.style.display = 'none';
}

function _abrirCambioPassword() {
  const form = document.getElementById('cfg-ch-pass-form');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function _guardarNuevaPassword() {
  const nueva    = document.getElementById('cfg-ch-pass-nueva')?.value?.trim();
  const confirm  = document.getElementById('cfg-ch-pass-confirm')?.value?.trim();
  if (!nueva || nueva.length < 6) { toast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }
  if (nueva !== confirm)          { toast('Las contraseñas no coinciden', 'error'); return; }
  const { error } = await _db.auth.updateUser({ password: nueva });
  if (error) { toast('Error al cambiar contraseña: ' + error.message, 'error'); return; }
  toast('Contraseña actualizada correctamente', 'success');
  _cerrarPanelChofer();
}

function _cambiarSesionChofer() {
  const jornadaAbierta = (_jornadasAbiertasCache?.length > 0) || !!_jornadaActivaLocal?.log_id;
  if (jornadaAbierta) {
    const patente = _camionActual?.plate || _jornadaActivaLocal?.patente || '';
    toast(`No podés cambiar de camión: tenés una jornada activa${patente ? ' en ' + patente : ''}. Cerrá la jornada primero.`, 'warning', 5000);
    return;
  }
  _cerrarPanelChofer();
  _camionActual = null;
  mostrarPantallaSeleccionCamion();
}

function _confirmarCerrarSesion() {
  if (confirm('¿Seguro que querés cerrar sesión?')) logoutUsuario();
}
function switchConfigTab(tabId) {
  // 1. Cambiar visibilidad de las secciones (derecha)
  document.querySelectorAll('.config-section').forEach(el => el.style.display = 'none');
  document.getElementById(tabId).style.display = 'block';

  // 2. Cambiar estado visual de los botones (izquierda)
  document.querySelectorAll('.tab-config').forEach(btn => btn.classList.remove('active'));
  // Busca el botón que tiene en su onclick el nombre del tab actual y lo activa
  const activeBtn = Array.from(document.querySelectorAll('.tab-config')).find(btn => btn.getAttribute('onclick').includes(tabId));
  if (activeBtn) activeBtn.classList.add('active');

  // 3. Cargar los datos según la pestaña seleccionada
  if (tabId === 'tab-flota') {
    cargarTablaAdminFlota();
  } else if (tabId === 'tab-usuarios') {
    cargarTablaAdminUsuarios();
  } else if (tabId === 'tab-planes') {
    cargarTablaAdminPlanes();
  } else if (tabId === 'tab-emergencias') {
    cargarYRenderizarConfigEmergencias();
  }
}

async function cargarYRenderizarConfigEmergencias() {
  ['cfg-emerg-telefonos','cfg-emerg-talleres','cfg-emerg-protocolo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '⏳ Cargando...';
  });
  try {
    const items = await cargarEmergencias();
    _emergencias = items;
    renderConfigEmergencias(items);
  } catch (err) {
    ['cfg-emerg-telefonos','cfg-emerg-talleres','cfg-emerg-protocolo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<span style="color:var(--red)">Error al cargar</span>';
    });
  }
}

function renderConfigEmergencias(items) {
  const telefonos = items.filter(i => i.category === 'telefono');
  const talleres  = items.filter(i => i.category === 'taller');
  const protocolo = items.filter(i => i.category === 'protocolo');

  const rowHtml = (item, detalle) => `
    <div style="display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:6px">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${_escHtml(item.title || '')}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${_escHtml(detalle)}</div>
      </div>
      <button onclick="editarEmergenciaItem(${item.config_id})" style="background:rgba(255,255,255,0.06);border:1px solid var(--border);color:var(--muted);border-radius:6px;padding:5px 8px;font-size:11px;cursor:pointer">✏</button>
      <button onclick="eliminarEmergenciaItemConfig(${item.config_id})" style="background:rgba(224,82,82,0.1);border:1px solid rgba(224,82,82,0.3);color:var(--red);border-radius:6px;padding:5px 8px;font-size:11px;cursor:pointer">✕</button>
    </div>`;
  const vacioHtml = msg => `<div style="font-size:12px;color:var(--muted);padding:8px 0">${msg}</div>`;

  const elTel = document.getElementById('cfg-emerg-telefonos');
  if (elTel) elTel.innerHTML = telefonos.length
    ? telefonos.map(t => rowHtml(t, t.value || '')).join('')
    : vacioHtml('Sin teléfonos. Usá + Agregar.');

  const elTal = document.getElementById('cfg-emerg-talleres');
  if (elTal) elTal.innerHTML = talleres.length
    ? talleres.map(t => {
        const rawMapsUrl = t.metadata?.maps_url || (t.metadata?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.metadata.address)}` : '');
        const safeUrl = /^https?:\/\//i.test(rawMapsUrl) ? rawMapsUrl : '';
        const ubicacion = _escHtml([t.metadata?.address, t.metadata?.badge].filter(Boolean).join(' · '));
        const mapsLink = safeUrl ? `<a href="${safeUrl}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none;font-size:11px"> · 🗺 Ver mapa</a>` : '';
        return `
          <div style="display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:6px">
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${_escHtml(t.title || '')}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px">${ubicacion}${mapsLink}</div>
            </div>
            <button onclick="editarEmergenciaItem(${t.config_id})" style="background:rgba(255,255,255,0.06);border:1px solid var(--border);color:var(--muted);border-radius:6px;padding:5px 8px;font-size:11px;cursor:pointer">✏</button>
            <button onclick="eliminarEmergenciaItemConfig(${t.config_id})" style="background:rgba(224,82,82,0.1);border:1px solid rgba(224,82,82,0.3);color:var(--red);border-radius:6px;padding:5px 8px;font-size:11px;cursor:pointer">✕</button>
          </div>`;
      }).join('')
    : vacioHtml('Sin talleres. Usá + Agregar.');

  const elProt = document.getElementById('cfg-emerg-protocolo');
  if (elProt) elProt.innerHTML = protocolo.length
    ? protocolo.map((p, idx) => rowHtml(p, `Paso ${idx + 1}${p.metadata?.critical ? ' · ⚠ Crítico' : ''}`)).join('')
    : vacioHtml('Sin pasos. Usá + Agregar.');
}

async function eliminarEmergenciaItemConfig(configId) {
  if (!confirm('¿Eliminás este item?')) return;
  try {
    await eliminarEmergenciaConfig(configId);
    toast('Item eliminado', 'success');
    _emergencias = _emergencias.filter(i => i.config_id !== configId);
    renderConfigEmergencias(_emergencias);
    renderEmergencias(_emergencias);
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

// Ejemplo de cómo renderizar el catálogo de planes (la pestaña 3)
async function cargarTablaAdminPlanes() {
  const contenedor = document.getElementById('lista-admin-planes');
  contenedor.innerHTML = '⏳ Cargando catálogo...';

  const { data: planes, error } = await _db
    .from('master_service_plans')
    .select('id, name, trigger_type, interval_km, interval_hours, alert_before_km, activo')
    .order('name');

  if (error) {
    contenedor.innerHTML = `<div style="color:var(--red)">Error: ${error.message}</div>`;
    return;
  }
  if (!planes || planes.length === 0) {
    contenedor.innerHTML = '<div style="padding: 20px; text-align: center; border: 1px dashed var(--border); border-radius: 8px;">No hay planes globales creados.</div>';
    return;
  }

  window._planesCache = planes;

  contenedor.innerHTML = `<div style="overflow-x:auto"><table style="width: 100%; border-collapse: collapse; text-align: left;">
    <tr style="border-bottom: 1px solid var(--border); color: var(--muted); font-size: 12px; text-transform: uppercase;">
      <th style="padding: 10px;">Nombre del Plan</th>
      <th style="padding: 10px;">Cadencia</th>
      <th style="padding: 10px;">Alerta</th>
      <th style="padding: 10px;">Estado</th>
      <th style="padding: 10px;">Acciones</th>
    </tr>
    ${planes.map(p => `
      <tr style="border-bottom: 1px solid var(--border); font-size: 14px; opacity: ${p.activo ? '1' : '0.6'}">
        <td style="padding: 12px; font-weight: 600;">${p.name}</td>
        <td style="padding: 12px;">${p.interval_km ? `${p.interval_km.toLocaleString()} km` : `${p.interval_hours} hs`}</td>
        <td style="padding: 12px; color: var(--amber);">${p.alert_before_km} km antes</td>
        <td style="padding: 12px;">${p.activo ? '🟢 Activo' : '🔴 Inactivo'}</td>
        <td style="padding: 12px;">
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            <button class="btn btn-ghost" style="font-size:11px;padding:5px 10px;white-space:nowrap"
              onclick="abrirEditarPlan('${p.id}')">✏️ Editar</button>
            <button style="font-size:11px;padding:5px 10px;white-space:nowrap;border-radius:5px;cursor:pointer;border:1px solid;${p.activo ? 'background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.3)' : 'background:rgba(34,197,94,0.1);color:#22c55e;border-color:rgba(34,197,94,0.3)'}"
              onclick="toggleEstadoPlan('${p.id}', ${p.activo})">
              ${p.activo ? '🚫 Dar de baja' : '✅ Reactivar'}
            </button>
          </div>
        </td>
      </tr>
    `).join('')}
  </table></div>`;
}

// ── 3. ACTUALIZACIÓN: APERTURA PARA "NUEVO" ───────────────
function openNuevoVehiculoModal() {
  vehiculoEditandoId = null; // Avisamos que es MODO CREACIÓN
  
  // Limpiamos los campos
  ['nv-patente', 'nv-marca', 'nv-modelo', 'nv-km', 'nv-anio', 'nv-interno'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const tipo = document.getElementById('nv-tipo'); if(tipo) tipo.value = 'plancha';

  // Restauramos los textos originales del modal
  const titulo = document.querySelector('#modal-nuevo-vehiculo .modal-head-title');
  if(titulo) titulo.textContent = '🚨 Alta de Móvil / Grúa';
  const btnGuardar = document.getElementById('btn-guardar-vehiculo');
  if(btnGuardar) btnGuardar.innerHTML = '💾 Registrar Móvil';

  const modal = document.getElementById('modal-nuevo-vehiculo');
  if (modal) { document.body.appendChild(modal); modal.style.zIndex = '10000000'; }
  openModal('modal-nuevo-vehiculo');
}

// ── 4. ACTUALIZACIÓN: GUARDADO INTELIGENTE ────────────────
async function guardarNuevoVehiculo() {
  const tipo = document.getElementById('nv-tipo').value; 
  const patente = document.getElementById('nv-patente').value.trim().toUpperCase();
  const marca = document.getElementById('nv-marca').value.trim();
  const modelo = document.getElementById('nv-modelo').value.trim();
  const km = parseInt(document.getElementById('nv-km').value);
  const anio = parseInt(document.getElementById('nv-anio').value) || null;
  const interno = document.getElementById('nv-interno').value.trim();

  const btn = document.getElementById('btn-guardar-vehiculo');

  if (!patente) { toast('Ingresá la patente', 'error'); return; }
  if (isNaN(km)) { toast('Ingresá el kilometraje', 'error'); return; }

  if (btn) { btn.textContent = 'Guardando...'; btn.style.pointerEvents = 'none'; }

  // Armamos el paquete de datos
  const payload = {
    plate: patente, brand: marca, model: modelo,
    year: anio, numero_interno: interno, current_km: km,
    tipo_equipo: tipo
  };

  let error_res;

  // LÓGICA BIFURCADA: ¿Insertamos o Actualizamos?
  if (vehiculoEditandoId) {
    // MODO EDICIÓN
    const { error } = await _db.from('trucks').update(payload).eq('truck_id', vehiculoEditandoId);
    error_res = error;
  } else {
    // MODO CREACIÓN (Le agregamos status activo por defecto)
    payload.status = 'active';
    const { error } = await _db.from('trucks').insert(payload);
    error_res = error;
  }

  if (btn) { btn.textContent = vehiculoEditandoId ? '💾 Actualizar Móvil' : '💾 Registrar Móvil'; btn.style.pointerEvents = 'auto'; }

  if (error_res) {
    if (error_res.code === '23505') toast('🚨 Patente o N° Interno duplicado.', 'error');
    else toast(`Error: ${error_res.message}`, 'error');
  } else {
    toast(vehiculoEditandoId ? '✅ Móvil actualizado' : '✅ Móvil registrado', 'success');
    closeModal('modal-nuevo-vehiculo');
    cargarTablaAdminFlota(); 
  }
}

// LECTURA DE VEHICULOS PARA EL SELECTOR DE JORNADA 

/**
 * Obtiene los vehículos de Supabase y los dibuja en la pestaña de Flota
 */
/**
 * Obtiene los vehículos de Supabase y los dibuja en la pestaña de Flota (UI Dark/Native)
 */
async function cargarTablaAdminFlota() {
    const contenedor = document.getElementById('lista-admin-vehiculos');
    if (!contenedor) return;
    contenedor.innerHTML = '⏳ Descargando flota desde la nube...';

    const { data: vehiculos, error } = await _db.from('trucks').select('*').order('numero_interno', { ascending: true });

    if (error) { contenedor.innerHTML = `<div style="color: var(--red);">Error al cargar: ${error.message}</div>`; return; }
    if (!vehiculos || vehiculos.length === 0) { contenedor.innerHTML = `<div style="padding: 30px; text-align: center;">No hay vehículos registrados.</div>`; return; }

    contenedor.innerHTML = `
        <div style="overflow-x: auto">
        <div style="background: var(--bg-darker); border: 1px solid var(--border); border-radius: 8px; overflow: hidden;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <tr style="background: var(--bg); border-bottom: 1px solid var(--border); color: var(--muted); font-size: 11px; text-transform: uppercase;">
                    <th style="padding: 14px 16px;">N° Interno</th>
                    <th style="padding: 14px 16px;">Patente</th>
                    <th style="padding: 14px 16px;">Vehículo</th>
                    <th style="padding: 14px 16px;">Kilometraje</th>
                    <th style="padding: 14px 16px;">Estado</th>
                    <th style="padding: 14px 16px; text-align: center;">Acciones</th>
                </tr>
                ${vehiculos.map(v => `
                    <tr style="border-bottom: 1px solid var(--border); transition: background 0.2s;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='transparent'">
                        <td style="padding: 14px 16px; font-weight: 600;">${v.numero_interno || '—'}</td>
                        <td style="padding: 14px 16px;"><span style="background: var(--bg); border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${v.plate}</span></td>
                        <td style="padding: 14px 16px;">
                            <div style="font-weight: 600;">${v.brand} ${v.model}</div>
                            <div style="font-size: 11px; color: var(--muted);">Año: ${v.year || '—'} | Eq: ${v.tipo_equipo ? v.tipo_equipo.toUpperCase() : '—'}</div>
                        </td>
                        <td style="padding: 14px 16px;">${v.current_km ? v.current_km.toLocaleString('es-AR') + ' km' : '0 km'}</td>
                        <td style="padding: 14px 16px;">
                            <span style="background: ${v.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; color: ${v.status === 'active' ? '#10b981' : '#ef4444'}; padding: 4px 10px; border-radius: 12px; font-size: 10px; font-weight: bold; text-transform: uppercase;">
                                ${v.status === 'active' ? 'Operativo' : 'Inactivo'}
                            </span>
                        </td>
                        <td style="padding: 14px 16px; text-align: center;">
                            <button onclick="abrirEditarVehiculo('${v.truck_id}')" style="background: none; border: none; cursor: pointer; font-size: 16px; margin-right: 8px;" title="Editar Móvil">✏️</button>
                            <button onclick="toggleEstadoVehiculo('${v.truck_id}', '${v.status}')"
                              style="font-size:11px;padding:5px 10px;border-radius:5px;cursor:pointer;border:1px solid;${v.status === 'active' ? 'background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.3)' : 'background:rgba(34,197,94,0.1);color:#22c55e;border-color:rgba(34,197,94,0.3)'}">
                              ${v.status === 'active' ? '🚫 Dar de baja' : '✅ Reactivar'}
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </table>
        </div>
        </div>
    `;
}

// Variable global para saber si estamos editando o creando
let vehiculoEditandoId = null;
let usuarioEditandoId = null;
let planEditandoId = null;

// ── 1. FUNCIÓN SUSPENDER / ACTIVAR ────────────────────────
async function toggleEstadoVehiculo(truckId, estadoActual) {
  if (estadoActual === 'active') {
    const { data } = await _db.from('daily_logs').select('log_id').eq('truck_id', truckId).eq('status', 'open').maybeSingle();
    if (data) {
      alert('Este camión tiene una jornada abierta. Cerrá la jornada antes de darlo de baja.');
      return;
    }
    if (!confirm('¿Dar de baja esta unidad? Quedará inactiva pero sus datos se conservan.')) return;
  }
  const nuevoEstado = estadoActual === 'active' ? 'inactive' : 'active';
  const { error } = await _db.from('trucks').update({ status: nuevoEstado }).eq('truck_id', truckId);
  if (error) { toast(`Error: ${error.message}`, 'error'); return; }
  toast(nuevoEstado === 'active' ? 'Móvil reactivado' : 'Móvil dado de baja', 'success');
  cargarTablaAdminFlota();
}

// ── 2. FUNCIÓN ABRIR EDICIÓN ─────────────────────────────
async function abrirEditarVehiculo(truckId) {
    vehiculoEditandoId = truckId; // Le avisamos al sistema que entramos en modo edición
    
    // 1. Buscamos los datos actuales de ese camión en la BD
    const { data, error } = await _db.from('trucks').select('*').eq('truck_id', truckId).single();
    
    if (error || !data) { toast('No se pudo cargar la información', 'error'); return; }

    // 2. Rellenamos tu formulario HTML con los datos que trajimos
    document.getElementById('nv-patente').value = data.plate || '';
    document.getElementById('nv-marca').value = data.brand || '';
    document.getElementById('nv-modelo').value = data.model || '';
    document.getElementById('nv-anio').value = data.year || '';
    document.getElementById('nv-interno').value = data.numero_interno || '';
    document.getElementById('nv-km').value = data.current_km || '';
    if(data.tipo_equipo) document.getElementById('nv-tipo').value = data.tipo_equipo;

    // 3. Transformamos visualmente el modal de "Alta" a "Edición"
    document.querySelector('#modal-nuevo-vehiculo .modal-head-title').textContent = '✏️ Editar Móvil / Grúa';
    document.getElementById('btn-guardar-vehiculo').innerHTML = '💾 Actualizar Móvil';
    
    // 4. Abrimos el modal con fuerza bruta (z-index)
    const modal = document.getElementById('modal-nuevo-vehiculo');
    if (modal) { document.body.appendChild(modal); modal.style.zIndex = '10000000'; }
    openModal('modal-nuevo-vehiculo');
}


// ── GESTIÓN DE PERSONAL ───────────────────────

// ── 2. APERTURA DE ALTA PERSONAL ───────────────────────
function openNuevoUsuarioModal() {
  usuarioEditandoId = null;
  const emailEl = document.getElementById('nu-email');
  const legajoEl = document.getElementById('nu-legajo');
  if (emailEl) emailEl.disabled = false;
  if (legajoEl) legajoEl.disabled = false;
  const tituloModal = document.querySelector('#modal-nuevo-usuario .modal-head-title');
  if (tituloModal) tituloModal.textContent = '👤 Alta de Personal';
  const btnGuardar = document.getElementById('btn-guardar-usuario');
  if (btnGuardar) btnGuardar.textContent = '💾 Crear Usuario';
  ['nu-nombre', 'nu-legajo', 'nu-email', 'nu-telefono', 'nu-licencia', 'nu-vencimiento'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const rol = document.getElementById('nu-rol');
  if(rol) rol.value = 'chofer';

  // EL TRUCO Z-INDEX: Lo ponemos por encima del Hub
  const modal = document.getElementById('modal-nuevo-usuario');
  if (modal) {
    document.body.appendChild(modal);
    modal.style.zIndex = '10000000'; 
  }
  openModal('modal-nuevo-usuario');
}

// ── 3. FUNCIÓN ABRIR EDICIÓN PERSONAL ───────────────────────
function abrirEditarUsuario(userId) {
  const u = (window._usuariosCache || []).find(x => String(x.user_id) === String(userId));
  if (!u) { toast('No se encontró el usuario', 'error'); return; }

  usuarioEditandoId = userId;

  // Pre-llenar campos
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('nu-nombre',     u.full_name);
  set('nu-telefono',   u.phone);
  set('nu-licencia',   u.license_number);
  set('nu-vencimiento', u.license_expiry ? u.license_expiry.substring(0, 10) : '');

  const rolEl = document.getElementById('nu-rol');
  if (rolEl) rolEl.value = u.role || 'chofer';

  // Deshabilitar campos no editables
  const emailEl = document.getElementById('nu-email');
  const legajoEl = document.getElementById('nu-legajo');
  if (emailEl) { emailEl.value = u.email || ''; emailEl.disabled = true; }
  if (legajoEl) { legajoEl.value = u.employee_id || ''; legajoEl.disabled = true; }

  // Cambiar título y botón
  const tituloModal = document.querySelector('#modal-nuevo-usuario .modal-head-title');
  if (tituloModal) tituloModal.textContent = '✏️ Editar Personal';
  const btnGuardar = document.getElementById('btn-guardar-usuario');
  if (btnGuardar) btnGuardar.innerHTML = '💾 Actualizar Usuario';

  // Mover al body para z-index correcto
  const modal = document.getElementById('modal-nuevo-usuario');
  if (modal) { document.body.appendChild(modal); modal.style.zIndex = '10000000'; }
  openModal('modal-nuevo-usuario');
}

// ── 4. FUNCIÓN SUSPENDER / ACTIVAR PERSONAL ──────────────────
async function toggleEstadoUsuario(userId, estadoActual) {
  if (estadoActual === 'activo') {
    if (!confirm('¿Dar de baja a este usuario?')) return;
    const { data } = await _db
      .from('daily_logs')
      .select('log_id')
      .eq('driver_id', userId)
      .eq('status', 'open')
      .maybeSingle();
    if (data) {
      alert('Este chofer tiene una jornada abierta. Cerrá la jornada antes de darlo de baja.');
      return;
    }
  }
  const nuevoEstado = estadoActual === 'activo' ? 'inactivo' : 'activo';
  const { error } = await _db.from('users').update({ status: nuevoEstado }).eq('user_id', userId);
  if (error) { console.error('[toggleEstadoUsuario] Supabase error:', error); toast(`Error: ${error.message}`, 'error'); return; }
  toast(nuevoEstado === 'activo' ? 'Personal reactivado' : 'Personal dado de baja', 'success');
  cargarTablaAdminUsuarios();
}

async function guardarNuevoUsuario() {
  const nombre  = document.getElementById('nu-nombre').value.trim();
  const legajo  = document.getElementById('nu-legajo').value.trim().toUpperCase();
  const email   = document.getElementById('nu-email').value.trim();
  const tel     = document.getElementById('nu-telefono').value.trim();
  const rol     = document.getElementById('nu-rol').value;

  if (!nombre)  { toast('El nombre es obligatorio', 'error'); return; }
  if (!legajo)  { toast('El legajo es obligatorio', 'error'); return; }
  if (!email)   { toast('El email es obligatorio', 'error'); return; }

  const btn = document.getElementById('btn-guardar-usuario');
  if (btn) { btn.textContent = 'Guardando...'; btn.style.pointerEvents = 'none'; }

  if (usuarioEditandoId) {
    const licencia    = document.getElementById('nu-licencia')?.value.trim() || null;
    const vencimiento = document.getElementById('nu-vencimiento')?.value || null;
    const { error } = await _db.from('users').update({
      full_name: nombre, phone: tel || null, role: rol,
      license_number: licencia, license_expiry: vencimiento
    }).eq('user_id', usuarioEditandoId);
    if (btn) { btn.textContent = '💾 Crear Usuario'; btn.style.pointerEvents = 'auto'; }
    const emailEl2 = document.getElementById('nu-email');
    const legajoEl2 = document.getElementById('nu-legajo');
    if (emailEl2) emailEl2.disabled = false;
    if (legajoEl2) legajoEl2.disabled = false;
    usuarioEditandoId = null;
    if (error) { toast(`Error: ${error.message}`, 'error'); return; }
    toast('Usuario actualizado', 'success');
    closeModal('modal-nuevo-usuario');
    cargarTablaAdminUsuarios();
    return;
  }

  let resp, data;
  try {
    resp = await fetch(`${ENV.API_BASE_URL}/api/create-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: nombre, email, legajo, role_name: rol, phone: tel || null }),
    });
    data = await resp.json();
  } catch (e) {
    data = { error: 'No se pudo conectar con el servidor' };
  }

  if (btn) { btn.textContent = '💾 Crear Usuario'; btn.style.pointerEvents = 'auto'; }

  if (!resp?.ok || data?.error) {
    toast(`Error: ${data?.error || 'Error desconocido'}`, 'error');
  } else {
    toast('Usuario creado — contraseña inicial: Sigma1234!', 'success');
    closeModal('modal-nuevo-usuario');
    cargarTablaAdminUsuarios();
  }
}

// Esta es la consulta que pedías para visualizar al personal
async function cargarTablaAdminUsuarios() {
  const contenedor = document.getElementById('lista-admin-usuarios');
  contenedor.innerHTML = '⏳ Cargando personal...';

  const { data: usuarios, error } = await _db
    .from('users')
    .select('*')
    .order('full_name', { ascending: true });

  if (usuarios) window._usuariosCache = usuarios;

  if (error) {
    contenedor.innerHTML = `<div style="color:var(--red)">Error: ${error.message}</div>`;
    return;
  }

  contenedor.innerHTML = `<div style="overflow-x:auto"><table style="width: 100%; border-collapse: collapse; text-align: left;">
      <tr style="border-bottom: 1px solid var(--border); color: var(--muted); font-size: 12px; text-transform: uppercase;">
        <th style="padding: 10px;">Nombre</th>
        <th style="padding: 10px;">Rol</th>
        <th style="padding: 10px;">Licencia</th>
        <th style="padding: 10px;">Estado</th>
        <th style="padding: 10px;"></th>
      </tr>
      ${usuarios.map(u => `
        <tr style="border-bottom: 1px solid var(--border); font-size: 14px;">
          <td style="padding: 12px;">
            <div style="font-weight: 600;">${u.full_name}</div>
            <div style="font-size: 11px; color: var(--muted);">${u.phone || 'Sin teléfono'}</div>
          </td>
          <td style="padding: 12px; text-transform: capitalize;">${u.role}</td>
          <td style="padding: 12px;">
            <div style="font-size: 12px;">${u.license_number || '—'}</div>
            <div style="font-size: 10px; color: ${esVencida(u.license_expiry) ? 'var(--red)' : 'var(--muted)'};">
              ${u.license_expiry ? `Vence: ${u.license_expiry}` : ''}
            </div>
          </td>
          <td style="padding: 12px;">
            <span class="badge" style="background: ${u.status === 'activo' ? 'var(--green-lo)' : 'var(--red-lo)'}; color: ${u.status === 'activo' ? 'var(--green)' : 'var(--red)'};">
              ${u.status}
            </span>
          </td>
          <td style="padding: 12px;">
            <div style="display:flex;flex-wrap:wrap;gap:5px">
              <button class="btn btn-ghost" style="font-size:11px;padding:5px 10px;white-space:nowrap"
                onclick="abrirEditarUsuario('${u.user_id}')">✏️ Editar</button>
              <button class="btn btn-ghost" style="font-size:11px;padding:5px 10px;white-space:nowrap"
                onclick="abrirResetPassword('${u.user_id}','${u.full_name.replace(/'/g,"\\'")}')">🔑 Pass</button>
              <button style="font-size:11px;padding:5px 10px;white-space:nowrap;border-radius:5px;cursor:pointer;border:1px solid;${u.status === 'activo' ? 'background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.3)' : 'background:rgba(34,197,94,0.1);color:#22c55e;border-color:rgba(34,197,94,0.3)'}"
                onclick="toggleEstadoUsuario('${u.user_id}','${u.status}')">
                ${u.status === 'activo' ? '🚫 Dar de baja' : '✅ Reactivar'}
              </button>
            </div>
          </td>
        </tr>
      `).join('')}
    </table></div>
  `;
}

function abrirResetPassword(userId, nombre) {
  const existing = document.getElementById('modal-reset-pass');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-reset-pass';
  modal.className = 'modal-backdrop';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:380px">
      <div class="modal-head">
        <span class="modal-head-title"></span>
        <button class="modal-close" onclick="document.getElementById('modal-reset-pass').remove()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group" style="margin-bottom:14px">
          <label class="form-label">Nueva contraseña</label>
          <input class="form-input" type="password" id="rp-nueva" placeholder="Mínimo 8 caracteres">
        </div>
        <div class="form-group">
          <label class="form-label">Confirmar contraseña</label>
          <input class="form-input" type="password" id="rp-confirmar" placeholder="Repetí la contraseña">
        </div>
        <div id="rp-error" style="display:none;margin-top:10px;color:var(--red);font-size:12px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="document.getElementById('modal-reset-pass').remove()">Cancelar</button>
        <button class="btn btn-primary" id="rp-btn-confirmar" onclick="confirmarResetPassword('${userId}')">Confirmar</button>
      </div>
    </div>`;
  modal.style.zIndex = '10000001';
  document.body.appendChild(modal);
  const titleEl = modal.querySelector('.modal-head-title');
  if (titleEl) titleEl.textContent = `🔑 Cambiar contraseña — ${nombre}`;
}

async function confirmarResetPassword(userId) {
  const nueva     = document.getElementById('rp-nueva')?.value;
  const confirmar = document.getElementById('rp-confirmar')?.value;
  const errorEl   = document.getElementById('rp-error');
  const btn       = document.getElementById('rp-btn-confirmar');

  if (!nueva || nueva.length < 8) {
    if (errorEl) { errorEl.textContent = 'La contraseña debe tener al menos 8 caracteres.'; errorEl.style.display = 'block'; }
    return;
  }
  if (nueva !== confirmar) {
    if (errorEl) { errorEl.textContent = 'Las contraseñas no coinciden.'; errorEl.style.display = 'block'; }
    return;
  }
  if (errorEl) errorEl.style.display = 'none';
  if (btn) { btn.textContent = 'Guardando...'; btn.disabled = true; }

  try {
    const { data: { session } } = await _db.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      if (errorEl) { errorEl.textContent = 'Sesión expirada. Recargá la página.'; errorEl.style.display = 'block'; }
      if (btn) { btn.textContent = 'Confirmar'; btn.disabled = false; }
      return;
    }
    const res = await fetch(`${ENV.API_BASE_URL}/api/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ userId, newPassword: nueva })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error desconocido');
    document.getElementById('modal-reset-pass').remove();
    toast('Contraseña actualizada ✓', 'success');
  } catch (err) {
    if (errorEl) { errorEl.textContent = err.message; errorEl.style.display = 'block'; }
    if (btn) { btn.textContent = 'Confirmar'; btn.disabled = false; }
  }
}


// ── CONTROL DE VISIBILIDAD DE CAMPOS DE LICENCIA ─────────────────
/**
 * Controla la visibilidad de los campos de licencia en el alta de personal
 * Basado en el ID: nu-licencia-section
 */
function toggleLicenciaSection() {
    const rolSelect = document.getElementById('nu-rol');
    const licenciaSection = document.getElementById('nu-licencia-section');

    if (!rolSelect || !licenciaSection) return;

    // Si es chofer, mostramos la sección; si es admin, la ocultamos
    if (rolSelect.value === 'chofer') {
        licenciaSection.style.display = 'block';
    } else {
        licenciaSection.style.display = 'none';
    }
}


// Helper para detectar licencias vencidas
function esVencida(fecha) {
  if (!fecha) return false;
  return new Date(fecha) < new Date();
}

//
//GESTIÓN DE JORNADAS CÓDIGOS DE INTERACCIÓN Y VALIDACIÓN --> 
//
/**
 * Muestra notificaciones flotantes en pantalla
 * @param {string} mensaje - El texto a mostrar
 * @param {string} tipo - 'success' (verde) o 'error' (rojo)
 */
function toast(mensaje, tipo = 'success') {
    // 1. Buscamos si ya existe el contenedor de notificaciones, si no, lo creamos
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        // Lo fijamos abajo a la derecha, por encima de todo (incluso del panel de admin)
        container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 99999999; display: flex; flex-direction: column; gap: 10px;';
        document.body.appendChild(container);
    }

    // 2. Creamos la notificación
    const el = document.createElement('div');
    const bgColor = tipo === 'success' ? '#10b981' : '#ef4444'; // Verde o Rojo
    
    el.style.cssText = `
        background: ${bgColor}; 
        color: white; 
        padding: 12px 24px; 
        border-radius: 6px; 
        font-family: system-ui, sans-serif;
        font-size: 14px; 
        box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
        opacity: 0; 
        transform: translateY(20px);
        transition: all 0.3s ease;
    `;
    el.textContent = tipo === 'success' ? `✅ ${mensaje}` : `🚨 ${mensaje}`;

    // 3. Lo agregamos a la pantalla y lo animamos
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
    }, 10);

    // 4. Lo destruimos después de 3.5 segundos para no llenar la memoria
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
    }, 3500);
}
//Nota: El código anterior es un ejemplo de cómo implementar un sistema de notificaciones tipo "toast" en tu aplicación. Puedes personalizar los estilos, la posición y la duración según tus necesidades. La función `toast` se puede llamar desde cualquier parte de tu código para mostrar mensajes de éxito o error al usuario.



/// MODULO INTELIGENCIA ARTIFICIAL - OCR PARA ODOMETRO  ///

// ============================================================================
// MOTOR OCR (SIMULADO) - PASO 1 (Foto del odómetro) y PASO 2 (Validación de datos) 
// ============================================================================

async function procesarFotoConIA(event, contexto) {
    const archivo = event.target.files[0];
    if (!archivo) return;

    // 1. Identificamos si estamos abriendo o cerrando el turno
    const isInicio = contexto === 'inicio';
    const prefix = isInicio ? 'nj' : 'cj'; 
    
    const inputKmReal = document.getElementById(isInicio ? 'nj-km-inicio' : 'cj-km-final');
    const msgStatus = document.getElementById(isInicio ? 'nj-km-validacion' : 'cj-km-calc');
    const fotoBox = document.getElementById(`${prefix}-foto-box`);
    const fotoIcon = document.getElementById(`${prefix}-foto-icon`);
    const fotoStatusTxt = document.getElementById(`${prefix}-foto-status`);
    const btnConfirmar = document.getElementById(isInicio ? 'btn-confirmar-inicio' : 'btn-confirmar-cierre');

    if (isInicio && !jornadaSeleccionada) {
        toast('🚨 Primero seleccioná un camión de la lista.', 'error');
        event.target.value = '';
        return;
    }

    // Buscamos contra qué número validar
    let kmBaseReferencia = 0;
    if (isInicio) {
        kmBaseReferencia = jornadaSeleccionada.current_km;
    } else {
        kmBaseReferencia = jornadaParaCerrar?.km_inicio || 0;
    }

    // 2. EFECTO VISUAL: "La IA está pensando..."
    inputKmReal.value = '';
    inputKmReal.style.color = 'var(--text)';
    inputKmReal.placeholder = 'Analizando imagen...';
    msgStatus.innerHTML = '<span style="color: var(--amber);">⏳ Extrayendo datos con IA...</span>';
    fotoBox.style.borderColor = 'var(--amber)';
    fotoIcon.textContent = '🔄';
    fotoStatusTxt.textContent = 'Procesando...';
    if(btnConfirmar) btnConfirmar.disabled = true;

    try {

      msgStatus.innerHTML = '<span style="color: var(--amber);">⬆️ Subiendo evidencia a la nube...</span>';
        const urlPublica = await subirFotoOdometro(archivo, contexto);
        console.log("Foto disponible en:", urlPublica);
        // 3. LLAMAMOS A LA IA REAL (Edge Function)
        const resultadoIA = await llamarIA_Real(urlPublica, contexto, kmBaseReferencia);

        if (!resultadoIA.success) throw new Error('La IA no encontró números claros.');

        const kmDetectado = resultadoIA.km_extraido;

        const esCierre = !isInicio;
        const esAnomalía = esCierre && kmDetectado < kmBaseReferencia;

        // Para inicio: display gigante (siempre verde, diff informativo)
        if (isInicio) {
            fotoKmInicio = urlPublica;

            const njFotoArea = document.getElementById('nj-foto-area');
            const njManual   = document.getElementById('nj-km-manual-area');
            const njResult   = document.getElementById('nj-km-result');
            const njNumber   = document.getElementById('nj-km-number');
            const njDiff     = document.getElementById('nj-km-diff');

            if (njFotoArea) njFotoArea.style.display = 'none';
            if (njManual)   njManual.style.display   = 'none';
            if (njResult)   njResult.style.display   = 'block';

            if (njNumber) { njNumber.textContent = kmDetectado.toLocaleString('es-AR'); }

            if (njDiff) {
                const diff = kmDetectado - kmBaseReferencia;
                if (diff < 0) {
                    njDiff.innerHTML = `<span style="color:var(--amber)">⚠ ${Math.abs(diff).toLocaleString('es-AR')} km menor al último cierre</span>`;
                } else {
                    njDiff.innerHTML = `<span style="color:#10b981">+${diff.toLocaleString('es-AR')} km vs último cierre</span>`;
                }
            }

            // Actualizar input (fuente de verdad para confirmarNuevaJornada)
            if (inputKmReal) inputKmReal.value = kmDetectado;

            if (btnConfirmar) btnConfirmar.disabled = false;
            toast('Odómetro validado', 'success');
            return;
        }

        // Para cierre: display gigante
        fotoKmFinal = urlPublica;
        kmExcepcion = false;

        const kmResult    = document.getElementById('cj-km-result');
        const fotoArea    = document.getElementById('cj-foto-area');
        const manualArea  = document.getElementById('cj-km-manual-area');
        const excSection  = document.getElementById('cj-excepcion-section');
        const excCheck    = document.getElementById('cj-excepcion-check');
        const kmNumber    = document.getElementById('cj-km-number');
        const kmStatusLbl = document.getElementById('cj-km-status-label');
        const kmDiffEl    = document.getElementById('cj-km-diff');
        const btnCierre   = document.getElementById('btn-confirmar-cierre');

        if (fotoArea)   fotoArea.style.display   = 'none';
        if (manualArea) manualArea.style.display  = 'none';
        if (kmResult)   kmResult.style.display    = 'block';

        if (esAnomalía) {
            kmResult.style.background   = 'rgba(239,68,68,0.08)';
            kmResult.style.border       = '2px solid rgba(239,68,68,0.4)';
            kmResult.style.borderRadius = '10px';
            if (kmStatusLbl) { kmStatusLbl.textContent = '⚠ ANOMALÍA DETECTADA'; kmStatusLbl.style.color = '#ef4444'; }
            if (kmNumber)    { kmNumber.textContent = kmDetectado.toLocaleString('es-AR'); kmNumber.style.color = '#ef4444'; }
            const diff = kmDetectado - kmBaseReferencia;
            if (kmDiffEl)    { kmDiffEl.textContent = `KM inicio: ${kmBaseReferencia.toLocaleString('es-AR')} · Diferencia: ${diff.toLocaleString('es-AR')} km`; kmDiffEl.style.color = '#ef4444'; }
            if (excSection)  excSection.style.display = 'block';
            if (excCheck)    excCheck.checked = false;
            if (btnCierre)   btnCierre.disabled = true;
        } else {
            const difKm = kmDetectado - kmBaseReferencia;
            kmResult.style.background   = 'rgba(16,185,129,0.08)';
            kmResult.style.border       = '2px solid rgba(16,185,129,0.4)';
            kmResult.style.borderRadius = '10px';
            if (kmStatusLbl) { kmStatusLbl.textContent = '✓ LECTURA CONFIRMADA'; kmStatusLbl.style.color = '#10b981'; }
            if (kmNumber)    { kmNumber.textContent = kmDetectado.toLocaleString('es-AR'); kmNumber.style.color = '#10b981'; }
            if (kmDiffEl)    { kmDiffEl.textContent = `+${difKm.toLocaleString('es-AR')} km recorridos hoy`; kmDiffEl.style.color = '#10b981'; }
            if (excSection)  excSection.style.display = 'none';
            if (btnCierre)   btnCierre.disabled = false;
        }

        if (inputKmReal) inputKmReal.value = kmDetectado;

        toast(esAnomalía ? 'Anomalía detectada — verificá el odómetro' : 'Odómetro validado', esAnomalía ? 'error' : 'success');

    } catch (error) {
        // 5. ERROR: Manejo visual
        msgStatus.innerHTML = `<span style="color: var(--red);">❌ ${error.message}</span>`;
        inputKmReal.placeholder = 'Reintentar foto';
        fotoBox.style.borderColor = 'var(--red)';
        fotoIcon.textContent = '⚠️';
        fotoStatusTxt.textContent = 'Rechazado - Reintentar';
        fotoStatusTxt.style.color = 'var(--red)';
        if (btnConfirmar) btnConfirmar.disabled = false;
        toast('Falló la validación', 'error');
    }
}

/**
 * Llama a la Edge Function de Supabase para leer el odómetro con IA real
 */
async function llamarIA_Real(urlPublica, contexto, kmReferencia) {
    const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/procesar-odometro`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40000);

    let response;
    try {
        response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + SUPABASE_KEY,
            },
            body: JSON.stringify({
                url_foto: urlPublica,
                contexto: contexto,
                km_referencia: kmReferencia,
            }),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error del servidor: ${response.status}`);
    }

    return await response.json();
}

/**
 * Sube una imagen al Storage de Supabase y devuelve la URL pública
 * @param {File} archivo - El archivo de la imagen
 * @param {string} contexto - 'inicio' o 'cierre'
 * @returns {Promise<string>} URL de la imagen subida
 */
async function subirFotoOdometro(archivo, contexto) {
    try {
        const truckId = jornadaSeleccionada?.truck_id || jornadaParaCerrar?.truck_id || _truckActual?.truck_id;
        if (!truckId) throw new Error('No hay camión activo para subir la foto.');
        const extension = archivo.name.split('.').pop();
        const nombreArchivo = `${contexto}/${truckId}_${Date.now()}.${extension}`;

        const { data, error } = await _db.storage
            .from('odometros')
            .upload(nombreArchivo, archivo, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) throw error;

        // Obtenemos la URL pública para que la IA la pueda ver
        const { data: urlData } = _db.storage
            .from('odometros')
            .getPublicUrl(nombreArchivo);

        return urlData.publicUrl;

    } catch (error) {
        console.error("Error en Storage:", error);
        throw new Error("No se pudo subir la foto al servidor.");
    }
}

// ── MÓDULO DOCUMENTACIÓN ─────────────────────────────────────────────
// Helper: escapa caracteres especiales HTML para uso en atributos e innerHTML
function _escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/**
 * Abre un documento usando el visor nativo del dispositivo.
 * Traduce rutas internas de Supabase a URLs públicas automáticamente.
 */
function abrirDocumentoChofer(pathOrUrl) {
  // 1. Si no hay nada, cortamos acá
  if (!pathOrUrl || pathOrUrl === 'null' || pathOrUrl === 'undefined') {
    alert('El archivo no está disponible o la ruta está vacía.');
    return;
  }

  let linkFinal = pathOrUrl;

  // 2. Si la ruta NO empieza con "http", es una ruta interna. Le pedimos a Supabase el link público.
  if (!pathOrUrl.startsWith('http')) {
    
    // OJO ACÁ: Asegurate de que tu bucket se llame 'docs'. Si se llama distinto (ej: 'documentos'), cambialo.
    const { data } = supabase.storage.from('docs').getPublicUrl(pathOrUrl);
    linkFinal = data.publicUrl;
  }

  // 3. LA PRUEBA DE FUEGO: Te muestro el link en pantalla antes de abrirlo
  const confirmacion = confirm("El sistema generó este link:\n\n" + linkFinal + "\n\n¿Querés intentar abrirlo?");
  
  if (confirmacion) {
    window.open(linkFinal, '_blank', 'noopener,noreferrer');
  }
}

function crearDocCard(doc, meta) {
  const esAdmin = ['administracion', 'supervision'].includes(PERFIL_USUARIO?.roles?.name);
  const statusConfig = {
    vigente:         { border: 'var(--green)',  pill: 'pill-green',  pillTxt: 'Vigente'     },
    proximo:         { border: 'var(--amber)',  pill: 'pill-amber',  pillTxt: 'Próximo'     },
    vencido:         { border: 'var(--red)',    pill: 'pill-red',    pillTxt: 'Vencido'     },
    falta_archivo:   { border: '#f97316',       pill: 'pill-orange', pillTxt: 'Sin archivo' },
    sin_vencimiento: { border: 'var(--border)', pill: 'pill-muted',  pillTxt: 'Sin venc.'   },
  };
  const sc = statusConfig[doc.status] || statusConfig.sin_vencimiento;

  // Usar UTC para ambos extremos — evita error de ±1 día en cambio de horario
  const dias = doc.expiry_date
    ? Math.round((new Date(doc.expiry_date + 'T00:00:00Z') - new Date(new Date().toISOString().slice(0,10) + 'T00:00:00Z')) / 86400000)
    : null;

let fileSectionHtml = '';
  if (doc.file_url) {
    // 1. Traducimos la ruta local al link de internet real ACÁ MISMO
    let linkReal = doc.file_url;
    if (!linkReal.startsWith('http')) {
      // Usamos tu variable _db para pedirle el link a Supabase
      linkReal = _db.storage.from('docs').getPublicUrl(doc.file_url).data.publicUrl;
    }

    const safePath  = _escHtml(linkReal);
    const safeTitle = _escHtml(meta.name || doc.doc_type || '');
    const onclickUpd = meta.isChofer
      ? `abrirUpdateDriverDoc('${_escHtml(doc.doc_type || '')}')`
      : `abrirUploadTruckDoc('${_escHtml(doc.internal_code || '')}')`;
      
    // 2. Cambiamos el <button> de abrir por un <a> (enlace nativo)
    const puedeActualizar = meta.isChofer || esAdmin;
    fileSectionHtml = `
      <div style="display: flex; gap: 4px;">
        ${puedeActualizar ? `<button class="btn-actualizar" onclick="${onclickUpd}" title="Reemplazar archivo">🔄</button>` : ''}
        <a href="${safePath}" target="_blank" rel="noopener noreferrer" class="btn-compartir" style="color:var(--amber); border: 1px solid var(--amber); text-decoration: none; display: flex; align-items: center; justify-content: center;">
          👁 Abrir
        </a>
        <button class="btn-compartir" onclick="compartirDoc('${safePath}', '${safeTitle}', event)">⤴ Compartir</button>
      </div>`;

  } else if (doc.is_obligatorio && (meta.isChofer || esAdmin)) {
    const onclick = meta.isChofer
      ? `onclick="abrirUpdateDriverDoc('${_escHtml(doc.doc_type || '')}')"`
      : `onclick="abrirUploadTruckDoc('${_escHtml(doc.internal_code || '')}')"`;
    fileSectionHtml = `<button class="btn-subir-ahora" ${onclick}>⚠ Subir ahora</button>`;
  } else {
    fileSectionHtml = `<span style="font-size:10px;color:var(--muted)">Sin archivo</span>`;
  }


  const docIdField = meta.isChofer ? doc.driver_doc_id : doc.doc_id;
  const deleteBtn = esAdmin
    ? `<button class="btn-eliminar-doc" onclick="eliminarDoc(${docIdField}, ${meta.isChofer ? 'true' : 'false'}, event)" title="Eliminar">🗑</button>`
    : '';

  const safeDocName = _escHtml(meta.name || doc.doc_type || '');
  const safeDocNum  = doc.doc_number ? _escHtml('Nº ' + doc.doc_number) : '—';

  return `
    <div class="doc-card-v" style="border-left:3px solid ${sc.border}">
      <div class="doc-card-header">
        <div class="doc-icon">${meta.icon}</div>
        <div class="doc-card-title">
          <div class="doc-name">${safeDocName}</div>
          <div class="doc-meta">${safeDocNum}</div>
        </div>
        ${deleteBtn}
      </div>
      <div class="doc-expiry-row">
        <div>
          <div class="doc-days" style="color:${sc.border}">${dias !== null ? dias : '—'}</div>
          <div class="doc-days-label">${dias !== null ? 'días restantes' : 'sin vencimiento'}</div>
        </div>
        <span class="pill ${sc.pill}">${sc.pillTxt}</span>
      </div>
      <div class="doc-file-row">${fileSectionHtml}</div>
    </div>`;
}

async function eliminarDoc(docId, isChofer, event) {
  if (event) event.stopPropagation();
  if (!confirm('¿Eliminar este documento? Esta acción no se puede deshacer.')) return;
  try {
    if (isChofer) {
      await eliminarDriverDoc(docId);
      _allDriverDocs = await cargarAllDriverDocs();
      if (_adminChoferSeleccionado) {
        _docsChofer = _allDriverDocs.filter(d => d.driver_id === _adminChoferSeleccionado.user_id);
      } else {
        _docsChofer = _allDriverDocs.filter(d => d.driver_id === PERFIL_USUARIO?.user_id);
      }
      renderDocsChofer(_docsChofer);
    } else {
      await eliminarTruckDoc(docId);
      _allTruckDocs = await cargarAllTruckDocs();
      if (_adminTruckSeleccionado) {
        _docsCamion = _allTruckDocs.filter(d => d.truck_id === _adminTruckSeleccionado.truck_id);
      }
      renderDocsCamion(_docsCamion);
    }
    actualizarBannerAlertasDocs(_docsCamion, _docsChofer);
    toast('Documento eliminado', 'success');
  } catch (err) {
    console.error('eliminarDoc:', err);
    toast('Error al eliminar el documento', 'error');
  }
}

const DOC_CAMION_META = {
  VTV:               { icon: '🔍', name: 'VTV', fields: ['vencimiento'] },
  SEGURO_POLIZA:     { icon: '🛡️', name: 'Póliza de Seguro', fields: ['vencimiento'] },
 PAGO_SEGURO:       { icon: '📄', name: 'Comprobante de pago', fields: ['periodo'] },
  HABILITACION_RUTA: { icon: '📋', name: 'Habilitación RUTA', fields: ['vencimiento'] },
  PERMISO_ESPECIAL:  { icon: '🚧', name: 'Permiso Especial', fields: ['vencimiento', 'observaciones'] },
  CEDULA_VERDE:      { icon: '🪪', name: 'Cédula Verde' },
  CEDULA_AZUL:       { icon: '🪪', name: 'Cédula Azul' },
  MATAFUEGOS:        { icon: '🧯', name: 'Matafuegos' },
  LIBRETA_PORTE:     { icon: '⚖️', name: 'Libreta de Porte' },
};

function _badgeDocsCamion(docs) {
  if (!docs.length) return { cls: 'badge-muted', txt: 'Sin docs' };
  const venc = docs.filter(d => d.status === 'vencido' || d.status === 'falta_archivo').length;
  const prox = docs.filter(d => d.status === 'proximo').length;
  if (venc > 0) return { cls: 'badge-bad',  txt: `✗ ${venc} vencido${venc > 1 ? 's' : ''}` };
  if (prox > 0) return { cls: 'badge-warn', txt: `⚠ ${prox} por vencer` };
  return { cls: 'badge-ok', txt: '✓ Al día' };
}

function _renderSelectorCamiones() {
  const selEl  = document.getElementById('doc-camion-selector');
  const docsEl = document.getElementById('doc-camion-docs');
  if (selEl)  selEl.style.display  = 'block';
  if (docsEl) docsEl.style.display = 'none';

  const grid = document.getElementById('doc-grid-trucks');
  if (!grid) return;

  if (!_listaCamiones.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;color:var(--muted);font-size:12px;padding:12px">Sin camiones activos.</div>';
    return;
  }

  grid.innerHTML = _listaCamiones.map(truck => {
    const docsTruck = _allTruckDocs.filter(d => d.truck_id === truck.truck_id);
    const badge = _badgeDocsCamion(docsTruck);
    const num   = String(truck.numero_interno || '?').padStart(2, '0');
    return `<div class="truck-select-card" onclick="seleccionarCamionAdmin(${truck.truck_id})">
      <div class="tscard-icon">🚛</div>
      <div class="tscard-num">#${_escHtml(num)}</div>
      <div class="tscard-plate">${_escHtml(truck.plate || '')}</div>
      <div class="tscard-brand">${_escHtml((truck.brand || '') + ' ' + (truck.model || ''))}</div>
      <span class="truck-badge ${badge.cls}">${badge.txt}</span>
    </div>`;
  }).join('');

  const fab = document.getElementById('doc-fab');
  if (fab) fab.style.display = 'none';
}

function seleccionarCamionAdmin(truckId) {
  const truck = _listaCamiones.find(t => t.truck_id === truckId);
  if (!truck) return;
  _adminTruckSeleccionado = truck;
  _docsCamion = _allTruckDocs.filter(d => d.truck_id === truckId);

  const selEl  = document.getElementById('doc-camion-selector');
  const docsEl = document.getElementById('doc-camion-docs');
  const backBtn = document.getElementById('doc-camion-back-btn');
  if (selEl)   selEl.style.display   = 'none';
  if (docsEl)  docsEl.style.display  = 'block';
  if (backBtn) backBtn.style.display = 'inline-flex';

  const titulo = document.getElementById('doc-camion-docs-titulo');
  if (titulo) {
    const num = String(truck.numero_interno || '?').padStart(2, '0');
    titulo.innerHTML = `<div class="dv-num">Móvil #${_escHtml(num)}</div>
      <div class="dv-plate">${_escHtml(truck.plate || '')} — ${_escHtml(truck.brand || '')}</div>`;
  }

  renderDocsCamion(_docsCamion);
  actualizarBannerAlertasDocs(_docsCamion, _docsChofer);

  const fab = document.getElementById('doc-fab');
  if (fab) fab.style.display = 'flex';
}

function volverSelectorCamiones() {
  _adminTruckSeleccionado = null;
  _docsCamion = [];
  _renderSelectorCamiones();
  actualizarBannerAlertasDocs([], _docsChofer);
}

function _renderSelectorChoferes() {
  const selEl  = document.getElementById('doc-chofer-selector');
  const docsEl = document.getElementById('doc-chofer-docs');
  if (selEl)  selEl.style.display  = 'block';
  if (docsEl) docsEl.style.display = 'none';

  const grid = document.getElementById('doc-grid-choferes');
  if (!grid) return;

  if (!_listaChoferes.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;color:var(--muted);font-size:12px;padding:12px">Sin choferes registrados.</div>';
    return;
  }

  grid.innerHTML = _listaChoferes.map(chofer => {
    const docsChofer = _allDriverDocs.filter(d => d.driver_id === chofer.user_id);
    const badge = _badgeDocsCamion(docsChofer);
    return `<div class="truck-select-card" onclick="seleccionarChoferAdmin('${chofer.user_id}')">
      <div class="tscard-icon">👤</div>
      <div class="tscard-num" style="font-size:14px;letter-spacing:0">${_escHtml(chofer.full_name || '')}</div>
      <span class="truck-badge ${badge.cls}">${badge.txt}</span>
    </div>`;
  }).join('');
}

function seleccionarChoferAdmin(driverId) {
  const chofer = _listaChoferes.find(c => c.user_id === driverId);
  if (!chofer) return;
  _adminChoferSeleccionado = chofer;
  _docsChofer = _allDriverDocs.filter(d => d.driver_id === driverId);

  const selEl  = document.getElementById('doc-chofer-selector');
  const docsEl = document.getElementById('doc-chofer-docs');
  const backBtn = document.getElementById('doc-chofer-back-btn');
  if (selEl)   selEl.style.display   = 'none';
  if (docsEl)  docsEl.style.display  = 'block';
  if (backBtn) backBtn.style.display = 'inline-flex';

  const titulo = document.getElementById('doc-chofer-docs-titulo');
  if (titulo) {
    titulo.innerHTML = `<div class="dv-num">${_escHtml(chofer.full_name || '')}</div>`;
  }

  renderDocsChofer(_docsChofer);
  actualizarBannerAlertasDocs(_docsCamion, _docsChofer);
}

function volverSelectorChoferes() {
  _adminChoferSeleccionado = null;
  _docsChofer = [];
  _renderSelectorChoferes();
  actualizarBannerAlertasDocs(_docsCamion, []);
}

function _mostrarDocsCamionChofer(truckId) {
  const selCamion  = document.getElementById('doc-camion-selector');
  const docsCamion = document.getElementById('doc-camion-docs');
  const backCamion = document.getElementById('doc-camion-back-btn');
  const uploadBtn  = document.getElementById('doc-camion-upload-btn');
  if (selCamion)  selCamion.style.display  = 'none';
  if (docsCamion) docsCamion.style.display = 'block';
  if (backCamion) backCamion.style.display = 'none';
  if (uploadBtn)  uploadBtn.style.display  = 'none';

  const titulo = document.getElementById('doc-camion-docs-titulo');
  if (titulo) {
    if (truckId) {
      titulo.innerHTML = '<div class="dv-num">Mi Camión</div>';
    } else {
      titulo.innerHTML = '<div class="dv-num" style="color:var(--muted);font-size:12px">Sin camión asignado</div>';
    }
  }

  const selChofer  = document.getElementById('doc-chofer-selector');
  const docsChofer = document.getElementById('doc-chofer-docs');
  const backChofer = document.getElementById('doc-chofer-back-btn');
  if (selChofer)  selChofer.style.display  = 'none';
  if (docsChofer) docsChofer.style.display = 'block';
  if (backChofer) backChofer.style.display = 'none';

  const tituloChofer = document.getElementById('doc-chofer-docs-titulo');
  if (tituloChofer) {
    tituloChofer.innerHTML = '<div class="dv-num">Mis Documentos</div>';
  }

  renderDocsCamion(_docsCamion);
  renderDocsChofer(_docsChofer);
  actualizarBannerAlertasDocs(_docsCamion, _docsChofer);
}

function _aplicarFiltroDocs(docs, filtro) {
  if (filtro === 'vencidos')  return docs.filter(d => d.status === 'vencido' || d.status === 'falta_archivo');
  if (filtro === 'proximos')  return docs.filter(d => d.status === 'proximo');
  return docs;
}

function renderDocsCamion(docs) {
  const grid = document.getElementById('doc-grid-camion');
  if (!grid) return;

  const filtrados = _aplicarFiltroDocs(docs, _docFiltro.camion);

  if (docs.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--muted);font-size:12px">
      No hay documentos del camión cargados.</div>`;
    return;
  }
  if (filtrados.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--muted);font-size:12px">
      Sin documentos en esta categoría.</div>`;
    return;
  }

  grid.innerHTML = filtrados.map(doc => {
    const meta = { ...(DOC_CAMION_META[doc.internal_code] || { icon: '📄', name: doc.doc_type }), isChofer: false };
    return crearDocCard(doc, meta);
  }).join('');

  // Detectar comprobante de pago faltante o desactualizado
  const pagoDoc    = docs.find(d => d.internal_code === 'PAGO_SEGURO');
  const mesActual  = new Date().toISOString().slice(0, 7); // YYYY-MM
  const bannerPago = document.getElementById('doc-banner-pago');
  if (bannerPago) {
    if (!pagoDoc || !pagoDoc.periodo || pagoDoc.periodo < mesActual) {
      const mesNombre = new Date().toLocaleString('es-AR', { month: 'long', year: 'numeric' });
      bannerPago.textContent = `⚠ Falta el comprobante de pago de ${mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1)}`;
      bannerPago.style.display = 'block';
    } else {
      bannerPago.style.display = 'none';
    }
  }
}

const DOC_CHOFER_META = {
  licencia_particular: { icon: '🪪', name: 'Licencia Particular' },
  licencia_linti:      { icon: '🪪', name: 'Licencia Prof. (LINTI)' },
  psicofisico:         { icon: '🏥', name: 'Psicofísico' },
  art_credencial:      { icon: '🦺', name: 'ART — Credencial' },
  art_cnr:             { icon: '🦺', name: 'ART — Cert. c/ CNR' },
  curso_cargas:        { icon: '📚', name: 'Curso Cargas Gral.' },
  otro:                { icon: '📄', name: 'Otro' },
};

function renderDocsChofer(docs) {
  const grid = document.getElementById('doc-grid-chofer');
  if (!grid) return;

  const filtrados = _aplicarFiltroDocs(docs, _docFiltro.chofer);

  if (docs.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--muted);font-size:12px">
      No tenés documentos cargados aún. Usá el botón ＋ para subir el primero.</div>`;
    return;
  }
  if (filtrados.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--muted);font-size:12px">
      Sin documentos en esta categoría.</div>`;
    return;
  }

  grid.innerHTML = filtrados.map(doc => {
    const meta = { ...(DOC_CHOFER_META[doc.doc_type] || { icon: '📄', name: doc.doc_type }), isChofer: true };
    return crearDocCard(doc, meta);
  }).join('');
}

function renderEmergencias(items) {
  const telSection  = document.getElementById('doc-section-telefonos');
  const protSection = document.getElementById('doc-section-protocolo');
  const talSection  = document.getElementById('doc-section-talleres');
  if (!telSection) return;

  const esAdmin  = PERFIL_USUARIO?.roles?.name === 'administracion';
  const telefonos = items.filter(i => i.category === 'telefono');
  const protocolo = items.filter(i => i.category === 'protocolo');
  const talleres  = items.filter(i => i.category === 'taller');

  // ── Teléfonos ──────────────────────────────────────────
  telSection.innerHTML = `
    <div class="emerg-section-head">
      <div class="section-label">Teléfonos de emergencia</div>
      ${esAdmin ? `<button class="btn-emerg-plus" onclick="agregarEmergenciaItem('telefono')" title="Agregar teléfono">+</button>` : ''}
    </div>
    ${telefonos.length === 0 ? `<div style="font-size:12px;color:var(--muted);padding:8px 0">Sin teléfonos cargados.</div>` : ''}
    ${telefonos.map(t => {
      const phone     = t.metadata?.phone || '';
      const safeTitle = _escHtml(t.title || '');
      const safeValue = _escHtml(t.value || '');
      return `
        <div class="emerg-phone-card">
          <div style="font-size:22px">📞</div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:700">${safeTitle}</div>
            <div style="font-size:11px;color:var(--muted);font-family:'DM Mono',monospace;margin-top:2px">${safeValue}</div>
          </div>
          ${phone ? `<a href="tel:${encodeURIComponent(phone)}" class="btn btn-primary" style="font-size:11px;padding:7px 12px;text-decoration:none">📞 Llamar</a>` : ''}
        </div>`;
    }).join('')}`;

  // ── Protocolo ───────────────────────────────────────────
  protSection.innerHTML = `
    <div class="emerg-section-head" style="margin-top:20px">
      <div class="section-label">Protocolo de siniestro</div>
      ${esAdmin ? `<button class="btn-emerg-plus" onclick="agregarEmergenciaItem('protocolo')" title="Agregar paso">+</button>` : ''}
    </div>
    ${protocolo.length === 0 ? `<div style="font-size:12px;color:var(--muted);padding:8px 0">Sin pasos cargados.</div>` : `
    <div class="emerg-protocol-card">
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">
        🚨 Qué hacer en caso de accidente
      </div>
      ${protocolo.map((p, idx) => {
        const isCritical = p.metadata?.critical;
        const safeTitle  = _escHtml(p.title || '');
        const safeValue  = _escHtml(p.value || '');
        return `
          <div class="emerg-step">
            <div class="emerg-step-num">${idx + 1}</div>
            <div class="emerg-step-text" style="${isCritical ? 'color:var(--red);font-weight:700' : ''}">
              ${safeTitle}: ${safeValue}
            </div>
          </div>`;
      }).join('')}
    </div>`}`;

  // ── Talleres ────────────────────────────────────────────
  talSection.innerHTML = `
    <div class="emerg-section-head" style="margin-top:8px">
      <div class="section-label">Talleres y gomerías de confianza</div>
      ${esAdmin ? `<button class="btn-emerg-plus" onclick="agregarEmergenciaItem('taller')" title="Agregar taller">+</button>` : ''}
    </div>
    ${talleres.length === 0 ? `<div style="font-size:12px;color:var(--muted);padding:8px 0">Sin talleres cargados.</div>` : ''}
    ${talleres.map(t => {
      const phone      = t.metadata?.phone   || '';
      const badge      = _escHtml(t.metadata?.badge    || '');
      const address    = _escHtml(t.metadata?.address  || '');
      const rawMapsUrl = t.metadata?.maps_url
            ? t.metadata.maps_url
            : (t.metadata?.address ? `https://maps.google.com/?q=${encodeURIComponent(t.metadata.address)}` : '');
      const mapsUrl    = /^https?:\/\//i.test(rawMapsUrl) ? rawMapsUrl : '';
      const safeTitle  = _escHtml(t.title || '');
      const safeValue  = _escHtml(t.value  || '');
      return `
        <div class="emerg-taller-card">
          <div class="emerg-taller-top">
            <div style="font-size:20px">🔧</div>
            <div style="flex:1">
              <div style="font-size:12px;font-weight:700">${safeTitle}${badge ? ` <span style="font-size:9px;color:var(--muted);font-weight:400">· ${badge}</span>` : ''}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px">${safeValue}</div>
              ${address ? `<div class="emerg-taller-addr">📍 ${address}</div>` : ''}
            </div>
          </div>
          <div class="emerg-taller-actions">
            ${mapsUrl ? `<a href="${_escHtml(mapsUrl)}" target="_blank" rel="noopener" class="btn-maps">🗺 Ver en Maps</a>` : ''}
            ${phone ? `<a href="tel:${encodeURIComponent(phone)}" class="btn-taller-call">📞 Llamar</a>` : ''}
          </div>
        </div>`;
    }).join('')}`;
}

async function cargarDocumentos() {
  const esAdmin = ['administracion', 'supervision'].includes(PERFIL_USUARIO?.roles?.name);
  const driverId = PERFIL_USUARIO?.user_id;

  if (!driverId) {
    console.error('cargarDocumentos: No hay sesión de usuario activa');
    mostrarErrorDocs();
    return;
  }

  mostrarSkeletonDocs();

  try {
    _emergencias = await cargarEmergencias();
    renderEmergencias(_emergencias);

    if (esAdmin) {
      const [camiones, choferes, allTruck, allDriver] = await Promise.all([
        cargarCamiones(),
        cargarTodosLosChoferes(),
        cargarAllTruckDocs(),
        cargarAllDriverDocs(),
      ]);
      _listaCamiones         = camiones;
      _listaChoferes         = choferes;
      _allTruckDocs          = allTruck;
      _allDriverDocs         = allDriver;
      _docsCamion            = [];
      _docsChofer            = [];
      _adminTruckSeleccionado  = null;
      _adminChoferSeleccionado = null;
      _renderSelectorCamiones();
      _renderSelectorChoferes();
    } else {
      const truckId = _camionActual?.truck_id || _truckActual?.truck_id || await obtenerTruckAsignado().catch(() => null);
      const [truckDocs, driverDocs] = await Promise.all([
        truckId ? cargarTruckDocs(truckId) : Promise.resolve([]),
        cargarDriverDocs(driverId),
      ]);
      _docsCamion = truckDocs;
      _docsChofer = driverDocs;
      _mostrarDocsCamionChofer(truckId);
    }

    docSwitchTab(_docTabActivo || 'camion');

    const offlineBanner = document.getElementById('doc-banner-offline');
    if (offlineBanner) offlineBanner.style.display = 'none';

  } catch (err) {
    console.error('Error crítico en cargarDocumentos:', err);
    mostrarErrorDocs();
  }
}

function actualizarInterfazDocs() {
  const esAdmin = ['administracion', 'supervision'].includes(PERFIL_USUARIO?.roles?.name);
  renderDocsCamion(_docsCamion);
  renderDocsChofer(_docsChofer);
  renderEmergencias(_emergencias);
  actualizarBannerAlertasDocs(_docsCamion, _docsChofer);

  const fab = document.getElementById('doc-fab');
  if (fab) {
    const puedeSubir = (_docTabActivo === 'chofer') || (_docTabActivo === 'camion' && esAdmin);
    fab.style.display = puedeSubir ? 'flex' : 'none';
  }

  const fabHeader = document.getElementById('btn-doc-header-cargar');
  if (fabHeader) fabHeader.style.display = esAdmin ? 'inline-flex' : 'none';

  const offlineBanner = document.getElementById('doc-banner-offline');
  if (offlineBanner) offlineBanner.style.display = 'none';
}

function docSwitchTab(tab) {
  _docTabActivo = tab;
  const esAdmin = PERFIL_USUARIO?.roles?.name === 'administracion';

  ['camion','chofer','emergencias'].forEach(t => {
    const panel = document.getElementById(`doc-panel-${t}`);
    const tabEl = document.getElementById(`doc-tab-${t}`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    if (tabEl) tabEl.classList.toggle('active', t === tab);
  });

  const fab = document.getElementById('doc-fab');
  if (fab) {
    const showFab = (tab === 'chofer') || (tab === 'camion' && esAdmin);
    fab.style.display = showFab ? 'flex' : 'none';
  }

  _fabContexto = tab === 'camion' ? 'camion' : tab === 'chofer' ? 'chofer' : null;
}

function filtrarDocsCamion(filtro, btn) {
  _docFiltro.camion = filtro;
  btn.closest('.doc-filter-bar').querySelectorAll('.doc-ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderDocsCamion(_docsCamion);
}

function filtrarDocsChofer(filtro, btn) {
  _docFiltro.chofer = filtro;
  btn.closest('.doc-filter-bar').querySelectorAll('.doc-ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderDocsChofer(_docsChofer);
}

function abrirUpdateDriverDoc(docType) {
  _modalError('udd-error', '');
  const sel = document.getElementById('udd-tipo');
  if (sel && docType) {
    const opt = sel.querySelector(`option[value="${docType}"]`);
    if (opt) sel.value = docType;
  }
  openModal('modal-upload-driver-doc');
}

function abrirSubirDocChofer() {
  _modalError('udd-error', '');
  ['udd-tipo', 'udd-nro', 'udd-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const venc = document.getElementById('udd-vencimiento');
  if (venc) venc.value = '';
  const box = document.getElementById('udd-file-box');
  if (box) box.textContent = '📎 Tocar para seleccionar archivo';

  const esAdmin = ['administracion', 'supervision'].includes(PERFIL_USUARIO?.roles?.name);
  const driverGroup = document.getElementById('udd-driver-group');
  if (driverGroup) driverGroup.style.display = esAdmin ? 'block' : 'none';

  if (esAdmin) {
    const selDriver = document.getElementById('udd-driver-id');
    if (selDriver) {
      selDriver.innerHTML = '<option value="">— Seleccioná un chofer —</option>';
      _listaChoferes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.user_id;
        opt.textContent = c.full_name;
        if (_adminChoferSeleccionado?.user_id === c.user_id) opt.selected = true;
        selDriver.appendChild(opt);
      });
    }
  }

  openModal('modal-upload-driver-doc');
}

function mostrarSkeletonDocs() {
  const skelHtml = Array(4).fill('<div class="skeleton-card"></div>').join('');
  const gridC  = document.getElementById('doc-grid-camion');
  const gridCh = document.getElementById('doc-grid-chofer');
  if (gridC)  gridC.innerHTML  = skelHtml;
  if (gridCh) gridCh.innerHTML = skelHtml;
}

function mostrarErrorDocs() {
  const html = `<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--muted)">
    <div style="font-size:28px;margin-bottom:8px">⚠️</div>
    <div style="font-size:13px;margin-bottom:12px">No se pudieron cargar los documentos</div>
    <button class="btn btn-ghost" onclick="cargarDocumentos()" style="font-size:11px">Reintentar</button>
  </div>`;
  const gridC  = document.getElementById('doc-grid-camion');
  const gridCh = document.getElementById('doc-grid-chofer');
  if (gridC)  gridC.innerHTML  = html;
  if (gridCh) gridCh.innerHTML = html;
}

function actualizarBannerAlertasDocs(camion, chofer) {
  const banner = document.getElementById('doc-banner-alertas');
  if (!banner) return;
  const criticos = [...camion, ...chofer].filter(d => d.status === 'vencido' || d.status === 'falta_archivo');
  if (criticos.length > 0) {
    banner.innerHTML = `⚠️ <strong>${criticos.length} documento${criticos.length > 1 ? 's' : ''} requiere${criticos.length === 1 ? '' : 'n'} atención</strong>`;
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

// ─── Task 8: FAB, Upload Modals, Share, Emergencias CRUD ─────────────────────

function abrirFab() {
  if (_fabContexto === 'camion') {
    abrirUploadTruckDoc('');
  } else {
    abrirSubirDocChofer();
  }
}

/**
 * Abre el modal para subir documentos de camión.
 * @param {string} internalCode - Si viene vacío, permite elegir; si no, bloquea el tipo.
 */
function abrirUploadTruckDoc(internalCode = '') {
  _modalError('utd-error', '');

  // 1. Referencia al selector
  const sel = document.getElementById('utd-tipo');
  if (sel) {
    // Poblamos el select dinámicamente desde tu objeto DOC_CAMION_META
    // Esto garantiza que la lista "se despliegue" con datos actualizados
    sel.innerHTML = '<option value="" disabled selected>Seleccione tipo de documento...</option>';
    
    Object.entries(DOC_CAMION_META).forEach(([key, info]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${info.icon} ${info.name}`;
      sel.appendChild(opt);
    });

    // 2. Lógica de selección
    if (internalCode) {
      sel.value = internalCode;
      sel.disabled = true; // Si viene de una card, no dejamos cambiar el tipo
    } else {
      sel.value = '';
      sel.disabled = false; // Si viene del botón "+", dejamos elegir
    }
  }

  // 3. Resetear el estado global y los inputs
  _utdInternalCode = internalCode; 
  _utdFile = null; // IMPORTANTE: Resetea el archivo anterior para evitar subidas duplicadas

  const campos = ['utd-nro', 'utd-observaciones', 'utd-vencimiento', 'utd-periodo'];
  campos.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const box = document.getElementById('utd-file-box');
  if (box) box.textContent = '📎 Tocar para seleccionar archivo';

  // 4. Actualizar visibilidad de campos (Vencimiento vs Periodo)
  utdOnTipoChange();

  // 5. Selector de camión (solo admin)
  const esAdmin = ['administracion', 'supervision'].includes(PERFIL_USUARIO?.roles?.name);
  const truckGroup = document.getElementById('utd-truck-group');
  if (truckGroup) truckGroup.style.display = esAdmin ? 'block' : 'none';

  if (esAdmin) {
    const selTruck = document.getElementById('utd-truck-id');
    if (selTruck) {
      selTruck.innerHTML = '<option value="">— Seleccioná un móvil —</option>';
      _listaCamiones.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.truck_id;
        const num = String(t.numero_interno || '?').padStart(2, '0');
        opt.textContent = `#${num} — ${t.plate} (${t.brand})`;
        if (_adminTruckSeleccionado?.truck_id === t.truck_id) opt.selected = true;
        selTruck.appendChild(opt);
      });
    }
  }

  // 6. Mostrar el modal
  openModal('modal-upload-truck-doc');
}

function utdOnTipoChange() {
  const sel = document.getElementById('utd-tipo');
  if (!sel) return;

  const tipoSeleccionado = sel.value;
  _utdInternalCode = tipoSeleccionado;

  // Obtenemos la configuración del documento o una por defecto
  const config = DOC_CAMION_META[tipoSeleccionado] || { fields: [] };
  const fields = config.fields || [];

  // Elementos de la UI
  const ui = {
    periodo: document.getElementById('utd-periodo-group'),
    venc:    document.getElementById('utd-venc-group'),
    obs:     document.getElementById('utd-obs-group')
  };

  // Lógica de visibilidad basada en el array 'fields'
  if (ui.periodo) ui.periodo.style.display = fields.includes('periodo') ? 'block' : 'none';
  if (ui.venc)    ui.venc.style.display    = fields.includes('vencimiento') ? 'block' : 'none';
  if (ui.obs)     ui.obs.style.display     = fields.includes('observaciones') ? 'block' : 'none';
}

function utdOnFileChange() {
  const input = document.getElementById('utd-file');
  const box   = document.getElementById('utd-file-box');
  if (input?.files[0] && box) box.textContent = `✅ ${input.files[0].name}`;
}

function uddOnFileChange() {
  const input = document.getElementById('udd-file');
  const box   = document.getElementById('udd-file-box');
  if (input?.files[0] && box) box.textContent = `✅ ${input.files[0].name}`;
}

async function subirDocCamion() {
  const esAdmin = ['administracion', 'supervision'].includes(PERFIL_USUARIO?.roles?.name);
  if (!esAdmin) { toast('Solo el admin puede cargar documentos del camión', 'error'); return; }

  const tipo    = document.getElementById('utd-tipo')?.value;
  const nro     = document.getElementById('utd-nro')?.value || null;
  const periodo = document.getElementById('utd-periodo')?.value || null;
  const obs     = document.getElementById('utd-observaciones')?.value || null;
  const file    = document.getElementById('utd-file')?.files?.[0] || null;

  const vencGroup    = document.getElementById('utd-venc-group');
  const vencRequerido = vencGroup && vencGroup.style.display !== 'none';
  const venc         = document.getElementById('utd-vencimiento')?.value || null;

  if (!tipo)             { _modalError('utd-error', 'Seleccioná el tipo de documento'); return; }
  if (!_utdInternalCode) { _modalError('utd-error', 'Tipo inválido'); return; }
  if (vencRequerido && !venc) { _modalError('utd-error', 'Seleccioná la fecha de vencimiento'); return; }
  if (!file)             { _modalError('utd-error', 'Seleccioná un archivo'); return; }

  const selTruck = document.getElementById('utd-truck-id');
  const truckId  = selTruck ? parseInt(selTruck.value) : null;
  if (!truckId)  { _modalError('utd-error', 'Seleccioná un móvil'); return; }

  const docType = _utdInternalCode || 'otro';

  try {
    let fileUrl = null;
    if (file) {
      const nameParts = file.name.split('.');
      const ext  = nameParts.length > 1 ? nameParts.pop() : 'bin';
      const path = `truck-${truckId}/${_utdInternalCode}-${Date.now()}.${ext}`;
      fileUrl    = await subirArchivoDoc(path, file);
    }

    await insertarTruckDoc({
      truck_id:      truckId,
      doc_type:      docType,
      internal_code: _utdInternalCode,
      doc_number:    nro,
      expiry_date:   venc || null,
      file_url:      fileUrl,
      periodo:       periodo,
      observaciones: obs,
      is_obligatorio: ['VTV','SEGURO_POLIZA','HABILITACION_RUTA','CEDULA_VERDE','MATAFUEGOS'].includes(_utdInternalCode),
      alert_days:    30,
    });

    closeModal('modal-upload-truck-doc');
    toast('Documento guardado', 'success');

    _allTruckDocs = await cargarAllTruckDocs();
    if (_adminTruckSeleccionado?.truck_id === truckId) {
      _docsCamion = _allTruckDocs.filter(d => d.truck_id === truckId);
      renderDocsCamion(_docsCamion);
      actualizarBannerAlertasDocs(_docsCamion, _docsChofer);
    }
  } catch (err) {
    console.error('subirDocCamion:', err);
    _modalError('utd-error', 'Error al guardar: ' + err.message);
  }
}

async function subirDocChofer() {
  const esAdmin = ['administracion', 'supervision'].includes(PERFIL_USUARIO?.roles?.name);

  const tipo  = document.getElementById('udd-tipo')?.value;
  const nro   = document.getElementById('udd-nro')?.value   || null;
  const venc  = document.getElementById('udd-vencimiento')?.value || null;
  const notes = document.getElementById('udd-notes')?.value || null;
  const file  = document.getElementById('udd-file')?.files?.[0] || null;

  if (!tipo) { _modalError('udd-error', 'Seleccioná el tipo de documento'); return; }
  if (!file) { _modalError('udd-error', 'Seleccioná un archivo'); return; }

  let driverId;
  if (esAdmin) {
    const selDriver = document.getElementById('udd-driver-id');
    driverId = selDriver ? parseInt(selDriver.value) : null;
    if (!driverId) { _modalError('udd-error', 'Seleccioná un chofer'); return; }
  } else {
    driverId = PERFIL_USUARIO?.user_id;
    if (!driverId) { _modalError('udd-error', 'No se pudo identificar el chofer'); return; }
  }

  try {
    let fileUrl = null;
    if (file) {
      const nameParts = file.name.split('.');
      const ext  = nameParts.length > 1 ? nameParts.pop() : 'bin';
      const path = `driver-${driverId}/${tipo}-${Date.now()}.${ext}`;
      fileUrl    = await subirArchivoDoc(path, file);
    }

    await insertarDriverDoc({
      driver_id:   driverId,
      doc_type:    tipo,
      doc_number:  nro,
      expiry_date: venc || null,
      file_url:    fileUrl,
      notes:       notes,
      uploaded_by: PERFIL_USUARIO?.user_id,
    });

    closeModal('modal-upload-driver-doc');
    toast('Documento guardado', 'success');

    _allDriverDocs = await cargarAllDriverDocs();
    if (esAdmin && _adminChoferSeleccionado?.user_id === driverId) {
      _docsChofer = _allDriverDocs.filter(d => d.driver_id === driverId);
      renderDocsChofer(_docsChofer);
      actualizarBannerAlertasDocs(_docsCamion, _docsChofer);
    } else if (!esAdmin) {
      _docsChofer = _allDriverDocs.filter(d => d.driver_id === driverId);
      renderDocsChofer(_docsChofer);
      actualizarBannerAlertasDocs(_docsCamion, _docsChofer);
    }
  } catch (err) {
    console.error('subirDocChofer:', err);
    _modalError('udd-error', 'Error al guardar: ' + err.message);
  }
}

async function compartirDoc(storagePath, titulo, event) {
  if (event) event.stopPropagation();
  try {
    toast('Generando link seguro...', 'info');
    const signedUrl = await obtenerSignedUrl(storagePath);

    if (navigator.share) {
      await navigator.share({ title: titulo, url: signedUrl });
    } else {
      // Fallback: bottom sheet
      const sheet = document.createElement('div');
      sheet.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999;display:flex;align-items:flex-end;justify-content:center';
      const safeTitle  = _escHtml(titulo);
      const waUrl      = 'https://wa.me/?text=' + encodeURIComponent(signedUrl);
      const safeSignedUrl = _escHtml(signedUrl);
      sheet.innerHTML = `
        <div style="background:var(--card);border-radius:14px 14px 0 0;padding:20px;width:100%;max-width:480px">
          <div style="font-size:13px;font-weight:700;margin-bottom:16px;text-align:center">${safeTitle}</div>
          <a href="${_escHtml(waUrl)}" target="_blank"
             style="display:flex;align-items:center;gap:12px;padding:14px;background:rgba(37,211,102,0.1);border-radius:8px;text-decoration:none;color:var(--text);margin-bottom:8px">
            <span style="font-size:22px">📱</span>
            <div><div style="font-weight:700;font-size:13px">WhatsApp</div><div style="font-size:11px;color:var(--muted)">Enviar por WhatsApp</div></div>
          </a>
          <a href="${safeSignedUrl}" target="_blank"
             style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--bg);border-radius:8px;text-decoration:none;color:var(--text);margin-bottom:16px">
            <span style="font-size:22px">🔗</span>
            <div><div style="font-weight:700;font-size:13px">Ver archivo</div><div style="font-size:11px;color:var(--muted)">Abrir en pantalla completa</div></div>
          </a>
          <button onclick="this.closest('[style*=fixed]').remove()"
            class="btn btn-ghost" style="width:100%;font-size:13px">Cancelar</button>
        </div>`;
      document.body.appendChild(sheet);
      sheet.addEventListener('click', e => { if (e.target === sheet) sheet.remove(); });
    }
  } catch (err) {
    console.error('compartirDoc:', err);
    toast('Error al generar el link', 'error');
  }
}


function agregarEmergenciaItem(category = 'telefono') {
  const idEl     = document.getElementById('mei-config-id');
  const tituloEl = document.getElementById('mei-titulo');
  const catEl    = document.getElementById('mei-category');
  const titleEl  = document.getElementById('mei-title');
  const valueEl  = document.getElementById('mei-value');
  const orderEl  = document.getElementById('mei-sort-order');
  const phoneEl  = document.getElementById('mei-phone');
  const badgeEl  = document.getElementById('mei-badge');
  const critEl   = document.getElementById('mei-critical');
  const addrEl   = document.getElementById('mei-address');
  const mapsEl   = document.getElementById('mei-maps-url');

  if (idEl)     idEl.value            = '';
  if (tituloEl) tituloEl.textContent  = 'Agregar item';
  if (catEl)    catEl.value           = category;
  if (titleEl)  titleEl.value         = '';
  if (valueEl)  valueEl.value         = '';
  if (orderEl)  orderEl.value         = '99';
  if (phoneEl)  phoneEl.value         = '';
  if (badgeEl)  badgeEl.value         = '';
  if (critEl)   critEl.checked        = false;
  if (addrEl)   addrEl.value          = '';
  if (mapsEl)   mapsEl.value          = '';

  meiOnCategoryChange();
  openModal('modal-emergencia-item');
}

function editarEmergenciaItem(configId) {
  const item = _emergencias.find(i => i.config_id === configId);
  if (!item) return;
  document.getElementById('mei-config-id').value      = configId;
  document.getElementById('mei-titulo').textContent   = 'Editar item';
  document.getElementById('mei-category').value       = item.category;
  document.getElementById('mei-title').value          = item.title;
  document.getElementById('mei-value').value          = item.value;
  document.getElementById('mei-sort-order').value     = item.sort_order;
  document.getElementById('mei-phone').value          = item.metadata?.phone || '';
  document.getElementById('mei-badge').value          = item.metadata?.badge || '';
  const addrEl  = document.getElementById('mei-address');
  const mapsEl  = document.getElementById('mei-maps-url');
  if (addrEl)  addrEl.value  = item.metadata?.address  || '';
  if (mapsEl)  mapsEl.value  = item.metadata?.maps_url || '';
  const crit = document.getElementById('mei-critical');
  if (crit) crit.checked = !!item.metadata?.critical;
  meiOnCategoryChange();
  openModal('modal-emergencia-item');
}

function meiOnCategoryChange() {
  const cat = document.getElementById('mei-category')?.value;
  const phoneGrp   = document.getElementById('mei-phone-group');
  const badgeGrp   = document.getElementById('mei-badge-group');
  const critGrp    = document.getElementById('mei-critical-group');
  const addrGrp    = document.getElementById('mei-address-group');
  const mapsGrp    = document.getElementById('mei-maps-url-group');
  if (phoneGrp) phoneGrp.style.display = (cat === 'telefono' || cat === 'taller') ? 'block' : 'none';
  if (badgeGrp) badgeGrp.style.display = cat === 'taller'    ? 'block' : 'none';
  if (critGrp)  critGrp.style.display  = cat === 'protocolo' ? 'block' : 'none';
  if (addrGrp)  addrGrp.style.display  = cat === 'taller'    ? 'block' : 'none';
  if (mapsGrp)  mapsGrp.style.display  = cat === 'taller'    ? 'block' : 'none';
}

async function guardarEmergenciaItem() {
  const configId  = document.getElementById('mei-config-id')?.value || null;
  const category  = document.getElementById('mei-category')?.value;
  const title     = document.getElementById('mei-title')?.value?.trim();
  const value     = document.getElementById('mei-value')?.value?.trim();
  const sortOrder = parseInt(document.getElementById('mei-sort-order')?.value) || 99;
  const phone     = document.getElementById('mei-phone')?.value?.trim() || null;
  const badge     = document.getElementById('mei-badge')?.value?.trim() || null;
  const address   = document.getElementById('mei-address')?.value?.trim()   || null;
  const mapsUrl   = document.getElementById('mei-maps-url')?.value?.trim()  || null;
  const critical  = document.getElementById('mei-critical')?.checked || false;

  if (!category || !title || !value) { toast('Completá los campos obligatorios', 'error'); return; }

  const metadata = {};
  if (phone)    metadata.phone    = phone;
  if (badge)    metadata.badge    = badge;
  if (address)  metadata.address  = address;
  if (mapsUrl)  metadata.maps_url = mapsUrl;
  if (critical) metadata.critical = true;

  try {
    await guardarEmergenciaConfig({
      config_id:  configId ? parseInt(configId) : undefined,
      category, title, value,
      sort_order: sortOrder,
      metadata:   Object.keys(metadata).length > 0 ? metadata : null,
    });
    closeModal('modal-emergencia-item');
    toast('Item guardado', 'success');
    _emergencias = await cargarEmergencias();
    renderEmergencias(_emergencias);
    const cfgPanel = document.getElementById('tab-emergencias');
    if (cfgPanel && cfgPanel.style.display !== 'none') renderConfigEmergencias(_emergencias);
  } catch (err) {
    toast('Error al guardar: ' + err.message, 'error');
  }
}

/**
 * Abre un documento usando el visor nativo del dispositivo.
 * @param {string} url - La URL pública del archivo en Supabase Storage
 */
function abrirDocumentoChofer(url) {
  if (!url || url === 'null' || url === 'undefined') {
    toast('El archivo físico no está disponible para este documento.', 'error');
    return;
  }
  
  // El '_blank' fuerza al navegador móvil a abrir su visor nativo o una nueva pestaña
  window.open(url, '_blank', 'noopener,noreferrer');
}

function abrirModalDesglosePago(tipo) {
  const _esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const remitos  = _rendRemitosActuales || [];
  const filtrados = remitos.filter(r => r.pago_1_metodo === tipo || r.pago_2_metodo === tipo);
  const getMonto  = r => (r.pago_1_metodo===tipo ? (r.pago_1_monto||0) : 0) +
                         (r.pago_2_metodo===tipo ? (r.pago_2_monto||0) : 0);

  const totalMonto    = filtrados.reduce((s, r) => s + getMonto(r), 0);
  const totalPeajes   = filtrados.reduce((s, r) => s + (r.imp_peaje||0), 0);
  const totalExcedente= filtrados.reduce((s, r) => s + (r.imp_excedente||0), 0);
  const totalOtros    = filtrados.reduce((s, r) => s + (r.imp_otros||0), 0);
  const totalServBase = Math.max(0, totalMonto - totalPeajes - totalExcedente - totalOtros);

  const icono = tipo === 'efectivo' ? '💵' : '📲';
  const label = tipo === 'efectivo' ? 'Efectivo en mano' : 'Transferencias';
  const color = tipo === 'efectivo' ? 'var(--green)' : 'var(--blue)';

  const tituloEl = document.getElementById('modal-desglose-titulo');
  if (tituloEl) tituloEl.textContent = `${icono} ${label} · $${_AR(totalMonto)}`;

  const body = document.getElementById('modal-desglose-body');
  if (!body) return;

  const rowsHtml = filtrados.length === 0
    ? '<div style="color:var(--muted);text-align:center;padding:16px;font-size:12px">Sin cobros en este período</div>'
    : filtrados.map(r => {
        const fecha = (r.created_at_device||'').slice(5,10).replace('-','/');
        const monto = getMonto(r);
        return '<div class="modal-desglose-row">'
          + '<span style="color:var(--muted);font-size:11px">' + fecha + '</span>'
          + '<span style="color:var(--amber);font-weight:600;font-size:11px">' + _esc(r.nro_remito||'—') + '</span>'
          + '<span style="color:var(--text);font-size:11px;font-family:\'DM Mono\'">' + _esc(r.patente||'—') + '</span>'
          + '<span class="desktop-only" style="color:var(--muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(r.origen||'—') + '</span>'
          + '<span class="desktop-only" style="color:var(--muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(r.destino||'—') + '</span>'
          + '<span style="color:' + color + ';font-weight:600;font-size:11px">$' + _AR(monto) + '</span>'
          + '</div>';
      }).join('');

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="background:var(--card);border:1px solid var(--border);border-radius:7px;padding:10px;text-align:center">
        <div style="color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Servicio</div>
        <div style="color:${color};font-weight:700;font-size:14px">$${_AR(totalServBase)}</div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:7px;padding:10px;text-align:center">
        <div style="color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Peajes</div>
        <div style="color:var(--amber);font-weight:700;font-size:14px">$${_AR(totalPeajes)}</div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:7px;padding:10px;text-align:center">
        <div style="color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Excedente</div>
        <div style="color:var(--amber);font-weight:700;font-size:14px">$${_AR(totalExcedente)}</div>
      </div>
    </div>
    <div style="border:1px solid var(--border);border-radius:7px;overflow:hidden">
      <div class="modal-desglose-header">
        <span>Fecha</span>
        <span>N° Servicio</span>
        <span>Patente</span>
        <span class="desktop-only">Origen</span>
        <span class="desktop-only">Destino</span>
        <span>Monto</span>
      </div>
      ${rowsHtml}
    </div>
    <div style="color:var(--muted2);font-size:10px;text-align:right;margin-top:8px">${filtrados.length} servicios · período activo</div>
  `;

  openModal('modal-desglose-pago');
}

function abrirModalCajaCalle() {
  const modal = document.getElementById('modal-caja-calle');
  if (!modal) return;

  const remitos  = _remitosEfectivoActuales;
  const usuarios = _negocioUsuariosActuales;
  const jornadas = _negocioJornadasActuales;

  // Mapa user_id → nombre
  const nombreMap = {};
  usuarios.forEach(u => { nombreMap[u.user_id] = u.full_name; });

  // Mapa log_id → trucks.plate
  const truckMap = {};
  jornadas.forEach(j => { if (j.log_id && j.trucks) truckMap[j.log_id] = j.trucks.plate; });

  // Drivers con alerta pendiente
  const conDeuda = new Set(
    (_negocioRaw?.alertas || []).map(a => a.driver_id)
  );

  let totalEf = 0;
  const filas = remitos.map(r => {
    const ef = (r.pago_1_metodo === 'efectivo' ? (r.pago_1_monto||0) : 0)
             + (r.pago_2_metodo === 'efectivo' ? (r.pago_2_monto||0) : 0);
    totalEf += ef;
    const fecha  = r.created_at_device ? r.created_at_device.slice(0,10) : '—';
    const chofer = nombreMap[r.driver_id] || '—';
    const camion = truckMap[r.log_id] || r.patente || '—';
    const estado = conDeuda.has(r.driver_id)
      ? '<span style="color:var(--amber)">⚠️ Pendiente</span>'
      : '<span style="color:var(--green)">✓ Rendido</span>';
    return `<tr style="border-bottom:1px solid var(--border);font-size:12px">
      <td style="padding:8px 6px">${r.nro_remito || '—'}</td>
      <td style="padding:8px 6px">${chofer}</td>
      <td style="padding:8px 6px">${camion}</td>
      <td style="padding:8px 6px">${fecha}</td>
      <td style="padding:8px 6px;font-family:'DM Mono';font-weight:700;color:var(--amber)">$${_AR(ef)}</td>
      <td style="padding:8px 6px">${estado}</td>
    </tr>`;
  }).join('');

  const tabla = remitos.length === 0
    ? '<div style="text-align:center;color:var(--muted);padding:20px">Sin cobros en efectivo para el período y filtros seleccionados.</div>'
    : `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:1px solid var(--border);color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:0.5px">
            <th style="padding:8px 6px;text-align:left">N° Remito</th>
            <th style="padding:8px 6px;text-align:left">Chofer</th>
            <th style="padding:8px 6px;text-align:left">Camión</th>
            <th style="padding:8px 6px;text-align:left">Fecha</th>
            <th style="padding:8px 6px;text-align:left">Efectivo</th>
            <th style="padding:8px 6px;text-align:left">Estado</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr style="border-top:2px solid var(--border)">
            <td colspan="4" style="padding:10px 6px;font-size:11px;color:var(--muted)">Total — ${remitos.length} servicios</td>
            <td style="padding:10px 6px;font-family:'Bebas Neue';font-size:18px;color:var(--amber)">$${_AR(totalEf)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table></div>`;

  document.getElementById('caja-calle-body').innerHTML = tabla;
  openModal('modal-caja-calle');
}

// --- PWA OFFLINE BANNER ---
function _pwaBanner(msg, tipo) {
  let el = document.getElementById('_pwa_banner');
  if (!el) {
    el = document.createElement('div');
    el.id = '_pwa_banner';
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:10px 16px;font-size:13px;font-weight:700;text-align:center;transition:opacity 0.4s';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = tipo === 'ok' ? '#4ade80' : '#f97316';
  el.style.color = '#000';
  el.style.opacity = '1';
  clearTimeout(el._t);
  if (tipo === 'ok') el._t = setTimeout(() => { el.style.opacity = '0'; }, 3000);
}
window.addEventListener('offline', () => _pwaBanner('Sin conexión — los datos no se actualizarán hasta recuperar señal.', 'warn'));
window.addEventListener('online',  () => _pwaBanner('Conexión recuperada.', 'ok'));
