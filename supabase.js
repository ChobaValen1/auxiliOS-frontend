// ================================================================
//  supabase.js — Capa de datos completa v2
//  Variable: _db (evita conflicto con window.supabase)
// ================================================================

const SUPABASE_URL = 'https://bcjcrlrrqfbipleiwkqi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_daGVg7URncTvLzC7N8NzOA_Z0CWB-1M'; // ← reemplazá con la tuya

const { createClient } = window.supabase;
const _db = createClient(SUPABASE_URL, SUPABASE_KEY);

// Wrapper de toast — funciona aunque sigma.js no haya cargado todavía
function _toast(msg, type = 'success') {
  if (typeof toast === 'function') {
    toast(msg, type);
  } else {
    console.log(`[${type.toUpperCase()}] ${msg}`);
  }
}

let USUARIO_ACTUAL = null;
let PERFIL_USUARIO = null;
// ── AUTENTICACIÓN ─────────────────────────────────────────────

async function verificarSesion() {
  const { data: { session } } = await _db.auth.getSession();
  if (session) {
    USUARIO_ACTUAL = session.user;
    await cargarPerfilUsuario();
    await inicializarApp();
  } else {
    mostrarPantallaLogin();
  }
}
// Nota: esta función se llama al cargar la página para verificar si el usuario ya tiene una sesión activa. Si la hay, carga su perfil y arranca la app. Si no, muestra la pantalla de login.

async function loginUsuario(email, password)  {   
  const { data, error } = await _db.auth.signInWithPassword({ email, password }); 
  if (error) { mostrarErrorLogin('Email o contraseña incorrectos'); return false; } 
  USUARIO_ACTUAL = data.user;  
  await cargarPerfilUsuario();
  await inicializarApp();
  return true;
}
// Nota: esta función no solo hace login, sino que también carga el perfil y arranca la app. Si el login falla, muestra un error específico. 


async function logoutUsuario() {
  await _db.auth.signOut();
  USUARIO_ACTUAL = null;
  PERFIL_USUARIO = null;
  try { localStorage.removeItem('sigma_jornada_activa'); } catch (e) { /* no crítico */ }
  window.location.reload();
}
// Nota: el logout es simple, pero recarga la página para limpiar cualquier estado residual.

async function cargarPerfilUsuario() {
  const { data, error } = await _db
    .from('users')
    .select('*, roles(name)')
    .eq('user_id', USUARIO_ACTUAL.id)
    .single();
  if (error) { console.error('Error perfil:', error); return; }
  PERFIL_USUARIO = data;
  const avatar = document.querySelector('.nav-avatar');
  if (avatar && data.full_name) {
    const p = data.full_name.split(' ');
    avatar.textContent = (p[0][0] + (p[1]?.[0] || '')).toUpperCase();
  }
  const badge = document.querySelector('.role-badge');
  if (badge && data.roles?.name) {
    const map = { administracion:'🔑 Admin', supervision:'👁 Supervisor', chofer:'🚛 Chofer' };
    badge.textContent = map[data.roles.name] || data.roles.name;
  }
}
// Nota: esta función se llama justo después del login para cargar el perfil completo del usuario, incluyendo su rol. Esto permite mostrar su nombre en el avatar y ajustar la UI según su rol (ej: mostrar filtros admin).



// ── INICIALIZACIÓN ────────────────────────────────────────────

async function inicializarApp() {
  ocultarPantallaLogin();
  const rol = PERFIL_USUARIO?.roles?.name;
  if (rol === 'chofer') {
    await _hidratarSesionChofer();
    return;
  }
  await _finalizarInicializacion();
}

async function _hidratarSesionChofer() {
  // Intentar recuperar jornada activa desde Supabase
  try {
    const { data: jornada, error } = await _db
      .from('daily_logs')
      .select('*, trucks(truck_id, plate, brand, model, current_km, numero_interno)')
      .eq('driver_id', USUARIO_ACTUAL.id)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (jornada) {
      // Jornada activa encontrada — saltar selección de camión
      _camionActual = jornada.trucks;
      // Sincronizar localStorage para resiliencia offline
      try {
        const jornadaLocal = {
          log_id:      jornada.log_id,
          truck_id:    jornada.truck_id,
          patente:     jornada.trucks?.plate || jornada.patente_camion || '',
          marca_modelo: [jornada.trucks?.brand, jornada.trucks?.model].filter(Boolean).join(' ') || null,
        };
        localStorage.setItem('sigma_jornada_activa', JSON.stringify(jornadaLocal));
        if (typeof _jornadaActivaLocal !== 'undefined') _jornadaActivaLocal = jornadaLocal;
      } catch (e) { /* no crítico */ }

      document.querySelector('.sidenav').style.display = '';
      document.querySelector('.main').style.display    = '';

      // Aviso: jornada activa detectada, camión auto-asignado
      const _mostrarAvisoJornada = () => {
        const patente = jornada.trucks?.plate || '';
        const modelo  = [jornada.trucks?.brand, jornada.trucks?.model].filter(Boolean).join(' ');
        if (typeof toast === 'function') {
          toast(`🚛 Jornada activa — Camión ${patente}${modelo ? ' · ' + modelo : ''}. No podés cambiar de camión hasta cerrar la jornada.`, 'warning', 6000);
        }
        // Banner persistente en la parte superior
        let banner = document.getElementById('banner-jornada-activa');
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'banner-jornada-activa';
          banner.style.cssText = 'position:sticky;top:0;z-index:9999;background:#f5a623;color:#1a1a1a;padding:7px 16px;text-align:center;font-size:12px;font-weight:700;letter-spacing:0.3px;';
          document.querySelector('.main')?.prepend(banner);
        }
        banner.textContent = `⚠️ Jornada activa · Camión ${patente}${modelo ? ' · ' + modelo : ''} · No podés cambiar de camión hasta cerrar la jornada`;
      };
      // Esperar a que sigma.js esté listo antes de mostrar el toast
      setTimeout(_mostrarAvisoJornada, 800);

      await _finalizarInicializacion();
      return;
    }
  } catch (err) {
    console.warn('[Hidratación] Fallo consulta Supabase, intentando localStorage:', err.message);
    // Fallback: leer del disco del dispositivo
    try {
      const raw = localStorage.getItem('sigma_jornada_activa');
      if (raw) {
        const jornadaLocal = JSON.parse(raw);
        // Reconstruir _camionActual mínimo para que la app funcione
        _camionActual = { truck_id: jornadaLocal.truck_id, plate: jornadaLocal.patente };
        if (typeof _jornadaActivaLocal !== 'undefined') _jornadaActivaLocal = jornadaLocal;
        document.querySelector('.sidenav').style.display = '';
        document.querySelector('.main').style.display    = '';
        if (typeof toast === 'function') toast('Sin conexión — sesión recuperada de la memoria local', 'warning');
        await _finalizarInicializacion();
        return;
      }
    } catch (e) { /* localStorage inaccesible */ }
  }

  // Sin jornada activa y sin datos locales — flujo normal de selección
  await mostrarPantallaSeleccionCamion();
}

async function _finalizarInicializacion() {
  mostrarCargando(true);
  try {
    if (typeof renderTablaRemitos !== 'function') {
      console.error('❌ sigma.js no cargó correctamente');
      return;
    }
    await Promise.all([
      cargarRemitos(),
      cargarJornadas(),
      cargarServiciosDia(),
      actualizarPantallaJornadas(),
      cargarDashboard(),
    ]);
  } catch (err) {
    console.error('Error inicializando:', err);
  } finally {
    mostrarCargando(false);
  }
  if (PERFIL_USUARIO?.roles?.name === 'administracion') {
    const panel = document.getElementById('filtros-admin');
    if (panel) panel.style.display = 'block';
    await cargarChoferes();
  }
  await actualizarPantallaJornadas();
}

let _camionSelTmp  = null;
let _selCamionData = null;

async function mostrarPantallaSeleccionCamion() {
  document.querySelector('.sidenav').style.display = 'none';
  document.querySelector('.main').style.display    = 'none';

  let div = document.getElementById('pantalla-seleccion-camion');
  if (!div) {
    div = document.createElement('div');
    div.id = 'pantalla-seleccion-camion';
    document.body.insertBefore(div, document.body.firstChild);
  }

  const nombre = PERFIL_USUARIO?.full_name || 'Chofer';
  div.innerHTML = `
    <div class="sel-screen">
      <div class="sel-inner">
        <div class="sel-header">
          <div class="sel-logo">SIGMA</div>
          <div class="sel-sub">REMOLQUES</div>
          <div class="sel-welcome">Bienvenido, <strong>${nombre}</strong></div>
          <div class="sel-hint">Seleccioná el camión con el que vas a trabajar hoy</div>
        </div>
        <input id="sel-camion-search" class="form-input" type="text"
          placeholder="🔍 Buscar patente o número interno..."
          oninput="_filtrarSelCamion(this.value)"
          style="width:100%;box-sizing:border-box;margin-bottom:12px">
        <div id="lista-sel-camion" class="sel-list sel-list--grid">
          <div class="sel-empty">Cargando camiones...</div>
        </div>
      </div>
    </div>
    <div id="sel-camion-footer" class="sel-footer sel-footer--hidden">
      <button onclick="confirmarSeleccionCamion()" class="sel-btn">
        Continuar →
      </button>
    </div>`;

  div.style.display = 'block';

  const [camiones, { data: jornadasAbiertas }, { data: miJornada }] = await Promise.all([
    cargarCamiones(),
    _db.from('daily_logs').select('truck_id, driver_id, users(full_name)').eq('status', 'open'),
    _db.from('daily_logs')
      .select('log_id, truck_id, trucks(truck_id, plate, brand, model, current_km, numero_interno)')
      .eq('driver_id', USUARIO_ACTUAL.id)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const enUso = {};
  (jornadasAbiertas || []).forEach(j => { enUso[j.truck_id] = j.users?.full_name || 'otro chofer'; });

  const lista = document.getElementById('lista-sel-camion');
  if (!lista) return;

  // ── El conductor tiene una jornada abierta: mostrar aviso y bloquear selección ──
  if (miJornada?.trucks) {
    const t      = miJornada.trucks;
    const patente = t.plate || '—';
    const modelo  = [t.brand, t.model].filter(Boolean).join(' ');
    const interno = t.numero_interno ? ` · N° ${t.numero_interno}` : '';

    // Inyectar panel de aviso antes del buscador
    const hint = div.querySelector('.sel-hint');
    if (hint) hint.style.display = 'none';
    const search = document.getElementById('sel-camion-search');
    if (search) search.style.display = 'none';

    const aviso = document.createElement('div');
    aviso.id = 'sel-aviso-jornada';
    aviso.style.cssText = 'background:rgba(245,166,35,0.12);border:1.5px solid #f5a623;border-radius:10px;padding:18px 16px;margin-bottom:16px;';
    aviso.innerHTML = `
      <div style="font-size:13px;font-weight:800;color:#f5a623;margin-bottom:6px;">⚠️ Tenés una jornada abierta</div>
      <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:2px;">Camión: ${patente}${interno}</div>
      ${modelo ? `<div style="font-size:12px;color:#aaa;margin-bottom:12px;">${modelo}</div>` : '<div style="margin-bottom:12px;"></div>'}
      <div style="font-size:12px;color:#ccc;margin-bottom:14px;">No podés seleccionar otro camión hasta cerrar la jornada activa.</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button onclick="_continuarConJornadaActiva()"
          style="flex:1;min-width:140px;padding:11px 10px;background:#f5a623;color:#1a1a1a;font-weight:800;font-size:13px;border:none;border-radius:8px;cursor:pointer;">
          ✓ Continuar con ${patente}
        </button>
        <button onclick="_irACerrarJornada()"
          style="flex:1;min-width:140px;padding:11px 10px;background:rgba(239,68,68,0.15);color:#ef4444;font-weight:700;font-size:13px;border:1.5px solid rgba(239,68,68,0.4);border-radius:8px;cursor:pointer;">
          ■ Ir a Cerrar Jornada
        </button>
      </div>`;
    lista.before(aviso);

    // Guardar datos de la jornada para los botones
    window._jornadaActivaPendiente = { truck: t, logId: miJornada.log_id };

    // Mostrar las cards de todos los camiones pero todas bloqueadas
    lista.style.opacity = '0.35';
    lista.style.pointerEvents = 'none';
    lista.innerHTML = camiones.map(c => {
      const searchVal = [c.plate, c.numero_interno].filter(Boolean).join(' ').toLowerCase();
      return `<div id="selcard-${c.truck_id}" data-search="${searchVal}" class="sel-card sel-card--disabled">
        <div class="sel-card-top">
          <div>
            ${c.numero_interno ? `<div class="sel-card-interno">N° INTERNO ${c.numero_interno}</div>` : ''}
            <div class="sel-card-plate sel-card-plate--dim">${c.plate}</div>
            <div class="sel-card-model">${[c.brand, c.model].filter(Boolean).join(' ') || '—'}</div>
          </div>
          <span class="sel-card-check">🔒</span>
        </div>
        <div class="sel-card-badges">
          <span class="sel-badge sel-badge--km">🛣 ${c.current_km ? c.current_km.toLocaleString('es-AR') + ' km' : '—'}</span>
        </div>
      </div>`;
    }).join('');
    return;
  }

  if (!camiones.length) {
    lista.innerHTML = '<div class="sel-empty">No hay camiones activos disponibles.</div>';
    return;
  }

  const disponibles = camiones.filter(c => !enUso[c.truck_id]);
  const ocupados    = camiones.filter(c =>  enUso[c.truck_id]);
  const renderCard  = c => {
    const ocupado = enUso[c.truck_id];
    const searchVal = [c.plate, c.numero_interno].filter(Boolean).join(' ').toLowerCase();
    return `<div id="selcard-${c.truck_id}"
         data-search="${searchVal}"
         ${!ocupado ? `onclick="_elegirCamionCard(${c.truck_id})"` : ''}
         class="sel-card${ocupado ? ' sel-card--disabled' : ''}">
      <div class="sel-card-top">
        <div>
          ${c.numero_interno ? `<div class="sel-card-interno">N° INTERNO ${c.numero_interno}</div>` : ''}
          <div class="sel-card-plate${ocupado ? ' sel-card-plate--dim' : ''}">${c.plate}</div>
          <div class="sel-card-model">${[c.brand, c.model].filter(Boolean).join(' ') || 'Sin datos de modelo'}</div>
        </div>
        <span id="selcheck-${c.truck_id}" class="sel-card-check">○</span>
      </div>
      <div class="sel-card-badges">
        <span class="sel-badge sel-badge--km">🛣 ${c.current_km ? c.current_km.toLocaleString('es-AR') + ' km' : 'Sin km registrado'}</span>
        ${ocupado
          ? `<span class="sel-badge sel-badge--red">🔴 ${enUso[c.truck_id]} está utilizando actualmente este camión</span>`
          : `<span class="sel-badge sel-badge--green">🟢 Disponible</span>`}
      </div>
    </div>`;
  };
  lista.innerHTML = [...disponibles, ...ocupados].map(renderCard).join('');
  _selCamionData = camiones;
}

function _elegirCamionCard(truckId) {
  document.querySelectorAll('[id^="selcard-"]').forEach(el => el.classList.remove('sel-card--selected'));
  document.querySelectorAll('[id^="selcheck-"]').forEach(el => el.textContent = '○');
  const card  = document.getElementById(`selcard-${truckId}`);
  const check = document.getElementById(`selcheck-${truckId}`);
  if (card)  card.classList.add('sel-card--selected');
  if (check) check.textContent = '✅';
  _camionSelTmp = (_selCamionData || []).find(c => c.truck_id === truckId) || null;
  const footer = document.getElementById('sel-camion-footer');
  if (footer) footer.classList.remove('sel-footer--hidden');
}

function _filtrarSelCamion(q) {
  const term = (q || '').toLowerCase().trim();
  document.querySelectorAll('#lista-sel-camion [id^="selcard-"]').forEach(el => {
    const match = !term || (el.dataset.search || '').includes(term);
    el.style.display = match ? '' : 'none';
  });
}

async function confirmarSeleccionCamion() {
  if (!_camionSelTmp) return;
  _camionActual  = _camionSelTmp;
  _camionSelTmp  = null;
  const div = document.getElementById('pantalla-seleccion-camion');
  if (div) div.style.display = 'none';
  document.querySelector('.sidenav').style.display = '';
  document.querySelector('.main').style.display    = '';
  await _finalizarInicializacion();
}

async function _continuarConJornadaActiva() {
  const pendiente = window._jornadaActivaPendiente;
  if (!pendiente) return;
  _camionActual = pendiente.truck;
  window._jornadaActivaPendiente = null;
  const div = document.getElementById('pantalla-seleccion-camion');
  if (div) div.style.display = 'none';
  document.querySelector('.sidenav').style.display = '';
  document.querySelector('.main').style.display    = '';
  await _finalizarInicializacion();
}

async function _irACerrarJornada() {
  await _continuarConJornadaActiva();
  setTimeout(() => {
    document.getElementById('btn-finalizar-jornada')?.click();
  }, 1200);
}
// Nota: esta función es el punto de entrada principal después del login. Carga todos los datos necesarios para mostrar la app, y si el usuario es admin, muestra los filtros adicionales y carga la lista de choferes.

async function cargarChoferes() {
  const { data, error } = await _db
    .from('users')
    .select('user_id, full_name')
    .eq('role_id', 3);
  if (error || !data) return;
  const select = document.getElementById('filtro-chofer-input');
  if (!select) return;
  data.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.full_name;
    opt.textContent = u.full_name;
    select.appendChild(opt);
  });
}
// Nota: esta función se llama solo para usuarios admin, y carga la lista de choferes activos para mostrar en el filtro de choferes. Solo trae el nombre completo y el ID, ya que no se necesitan más datos para el filtro.


// ── LECTURA ───────────────────────────────────────────────────

// ── LECTURA ───────────────────────────────────────────────────

// ── LECTURA: REMITOS ──────────────────────────────────────────

async function cargarRemitos() {
  try {
    // 1. Identificamos el rol
    const esChofer = PERFIL_USUARIO?.roles?.name === 'chofer';

    // 2. Armamos la base de la consulta
    let query = _db
      .from('remitos')
      .select('*, users(full_name)')
      .order('created_at_device', { ascending: false })
      .limit(200);

    // 3. 🛠️ FIX: Si es chofer, filtramos estrictamente por su ID
    if (esChofer) {
      query = query.eq('driver_id', USUARIO_ACTUAL.id);
    }

    // Ejecutamos la consulta final
    const { data, error } = await query;

    // 🚨 EL DETECTOR DE FUGAS 🚨
    console.log("📥 Remitos que llegaron desde Supabase:", data);

    if (error) { 
      console.error('❌ Error Supabase en remitos:', error); 
      return; 
    }
    
    if (!data || data.length === 0) { 
      if (typeof renderTablaRemitos === 'function') renderTablaRemitos([]); 
      return; 
    }

    // El mapeo ahora está protegido. Si algo falla acá, lo sabremos.
    const mapped = data.map(r => ({
      nro:           r.nro_remito,
      fecha:         r.status === 'firmado'
                       ? formatearFecha(r.firmado_at || r.created_at_device)
                       : formatearFecha(r.created_at_device),
      nroSrv:        r.nro_servicio    || '',
      patente:       r.patente,
      marca:         r.marca_modelo    || '',
      cliente:       r.razon_social    || '',
      cuit:          r.cuit            || '',
      telefono:      r.telefono        || '',
      origen:        r.origen,
      destino:       r.destino,
      km:            String(r.km_reales     || '—'),
      peaje:         String(r.imp_peaje     || 0),
      excedente:     String(r.imp_excedente || 0),
      otros:         String(r.imp_otros     || 0),
      tipo:          r.tipo_servicio   || '—',
      pago: (() => {
        const p1 = r.pago_1_metodo ? capitalizar(r.pago_1_metodo) : null;
        const p2 = r.pago_2_metodo ? capitalizar(r.pago_2_metodo) : null;
        if (p1 && p2) return `${p1}+${p2}`;
        return p1 || '—';
      })(),
      estado:        r.status === 'firmado' ? 'firmado' : r.status === 'anulado' ? 'anulado' : 'pendiente',
      confirmaciones: armarConfirmaciones(r),
      observaciones: r.observaciones || null,
      firmaUrl:      r.firma_imagen_url || null,
      chofer:        r.users?.full_name || '—',
    }));
    
    console.log("✅ Mapeo exitoso. Datos listos para dibujar:", mapped);

    if (typeof renderTablaRemitos === 'function') {
      renderTablaRemitos(mapped);
      console.log("🎨 Función renderTablaRemitos ejecutada.");
    } else {
      console.error("❌ CRÍTICO: La función renderTablaRemitos no existe.");
    }

  } catch (err) {
    console.error("❌ CRÍTICO: El código crasheó al intentar leer o mapear los datos:", err);
  }
}
// Nota: esta función carga los remitos más recientes (hasta 200) y los mapea al formato que necesita la tabla. Incluye lógica para formatear fechas, mostrar métodos de pago combinados, y armar el texto de confirmaciones. Si hay un error o no hay remitos, muestra mensajes en la consola.


// ── LECTURA: JORNADAS Y SERVICIOS ─────────────────────────────

async function cargarJornadas() {
  try {
    const esChofer = PERFIL_USUARIO?.roles?.name === 'chofer';
    
    let q = _db.from('daily_logs')
               .select('*, trucks(plate, brand, model, current_km)')
               .order('log_date', { ascending: false })
               .limit(30);
               
    if (esChofer) q = q.eq('driver_id', USUARIO_ACTUAL.id);
    
    const { data, error } = await q;
    
    if (error) { 
      console.error('❌ Error Supabase en jornadas:', error); 
      return; 
    }
    
    if (!data || data.length === 0) {
      if (typeof renderHistorialJornadas === 'function') renderHistorialJornadas([]);
      return;
    }

    const mapped = data.map(j => ({
      fecha:    formatearFechaCorta(j.log_date),
      camion:   j.trucks?.plate || '—',
      kmInicio: j.km_inicio?.toLocaleString('es-AR') || '—',
      kmFinal:  j.km_final?.toLocaleString('es-AR')  || '—',
      kmRec:    j.km_recorridos?.toString()          || '—',
      horas:    calcularHoras(j.hora_inicio, j.hora_fin),
      taller:   j.in_workshop,
      estado:   j.status === 'open' ? 'abierta' : 'cerrada',
    }));

    if (typeof renderHistorialJornadas === 'function') {
      renderHistorialJornadas(mapped);
    }
    
  } catch (err) {
    console.error("❌ CRÍTICO: Error procesando el mapeo de jornadas:", err);
  }
}
// Nota: esta función carga las últimas 30 jornadas del usuario, incluyendo datos del camión. Luego mapea esos datos al formato que necesita la tabla de jornadas, con lógica para formatear fechas, calcular kilómetros recorridos y horas trabajadas.

async function cargarServiciosDia() {
  try {
    // 🛠️ FIX: Forzamos la zona horaria de Argentina para evitar el bug de las 21:00 hs (UTC)
    const hoy = new Date().toLocaleDateString('en-CA', { 
      timeZone: 'America/Argentina/Buenos_Aires' 
    });
    
    const { data, error } = await _db
      .from('remitos')
      .select('*')
      .eq('driver_id', USUARIO_ACTUAL.id)
      .gte('created_at_device', hoy + 'T00:00:00')
      .lte('created_at_device', hoy + 'T23:59:59')
      .order('created_at_device', { ascending: true });

    if (error) { 
      console.error('❌ Error Supabase en servicios del día:', error); 
      return; 
    }

    if (!data || data.length === 0) {
      if (typeof renderServiciosDia === 'function') renderServiciosDia([]);
      return;
    }

    const mapped = data.map((s, i) => ({
      num:     String(i + 1).padStart(2, '0'),
      nroSrv:  s.nro_servicio  || '—',
      patente: s.patente       || '—',
      tipo:    s.tipo_servicio || '—',
      origen:  s.origen        || '—',
      destino: s.destino       || '—',
      salida:  formatearFecha(s.created_at_device).split(' ')[1] || '—',
      km:        s.km_reales ? String(s.km_reales) : null,
      peaje:     s.imp_peaje     ? Number(s.imp_peaje).toLocaleString('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 }) : '—',
      excedente: s.imp_excedente ? Number(s.imp_excedente).toLocaleString('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 }) : '—',
      estado:    s.status === 'firmado' ? 'completado' : s.status === 'anulado' ? 'anulado' : 'en_progreso',
    }));

    if (typeof renderServiciosDia === 'function') {
      renderServiciosDia(mapped);
    }

  } catch (err) {
    console.error("❌ CRÍTICO: Error procesando el mapeo de servicios del día:", err);
  }
}
// Nota: esta función carga los servicios (remitos) creados por el usuario durante el día actual. Luego mapea esos datos al formato que necesita la tabla de servicios del día, con lógica para formatear fechas y mostrar un estado simplificado.


// ── GUARDAR REMITO ────────────────────────────────────────────

async function guardarRemitoCompleto(datosRemito) {
  try {
    _toast('Guardando remito...', 'info');

    // ── 1. Utilidad Matemática Segura (Bug $9.100) ────────────
    const parsearImporte = (val) => {
      if (!val) return 0;
      const limpio = String(val).replace(/\./g, '').replace(',', '.');
      return parseFloat(limpio) || 0;
    };

    // ── 2. Mantener Nro Existente o Generar Nuevo ─────────────
    // Si viene de un pendiente, respetamos SU número. Si es nuevo 100%, lo generamos.
    const _f = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const _r = Math.floor(Math.random() * 9000) + 1000;
    const nroFinal = datosRemito.nro || `REM-${_f}-${_r}`;

    // ── 3. Subida de Fotos ────────────────────────────────────
    const fotoUrls = [];
    const inputsFotos = document.querySelectorAll('#foto-grid input[type="file"]');
    for (const input of inputsFotos) {
      if (!input.files?.length) continue;
      const file = input.files[0];
      const nombre = `${nroFinal}_${Date.now()}.${file.name.split('.').pop()}`;
      const { error: ue } = await _db.storage.from('remitos').upload(nombre, file, { upsert: true });
      if (!ue) {
        const { data: ud } = _db.storage.from('remitos').getPublicUrl(nombre);
        fotoUrls.push(ud.publicUrl);
      }
    }

    // ── 4. Subida de Firma ────────────────────────────────────
    let firmaUrl = null;
    const canvas = document.getElementById('sig-canvas-firma') || document.getElementById('sig-canvas');
    // Asumo que tienes una variable global 'hasSig' controlando esto, si no, valida el canvas vacío
    if (canvas && typeof hasSig !== 'undefined' && hasSig) {
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const nombre = `firma_${nroFinal}_${Date.now()}.png`;
      const { error: fe } = await _db.storage.from('firmas').upload(nombre, blob, { contentType: 'image/png', upsert: true });
      if (!fe) {
        const { data: fd } = _db.storage.from('firmas').getPublicUrl(nombre);
        firmaUrl = fd.publicUrl;
      }
    }

    // ── 5. Parseo de Pago Mixto ───────────────────────────────
    const metodosValidos = ['efectivo', 'transferencia', 'tarjeta', 'app'];
    const pagos = (datosRemito.pago || '').split('+').map(p => p.trim().toLowerCase());
    const pago1 = metodosValidos.includes(pagos[0]) ? pagos[0] : null;
    const pago2 = pagos[1] && metodosValidos.includes(pagos[1]) ? pagos[1] : null;

    console.log('Enviando DTO a Supabase para:', nroFinal);

    // ── 6. Upsert Seguro en Supabase ──────────────────────────
    // Usamos UPSERT para actualizar el pendiente si ya existía, o crear uno nuevo.
    const { error } = await _db.from('remitos').upsert({
      nro_remito:           nroFinal,
      driver_id:            USUARIO_ACTUAL.id, // Inyección RLS
      log_id:               datosRemito.log_id         || null,
      nro_servicio:         datosRemito.nroSrv         || null,
      patente:              datosRemito.patente,
      marca_modelo:         datosRemito.marca          || null,
      razon_social:         datosRemito.cliente        || null,
      cuit:                 datosRemito.cuit           || null,
      telefono:             datosRemito.telefono       || null,
      tipo_servicio:        datosRemito.tipo,
      origen:               datosRemito.origen,
      destino:              datosRemito.destino,
      km_reales:            parseInt(datosRemito.km)   || null,
      
      // Aplicamos el parseo seguro a todos los montos
      imp_peaje:            parsearImporte(datosRemito.peaje),
      imp_excedente:        parsearImporte(datosRemito.excedente),
      imp_otros:            parsearImporte(datosRemito.otros),
      pago_1_monto:         parsearImporte(datosRemito.pago1Monto),
      pago_2_monto:         parsearImporte(datosRemito.pago2Monto),
      
      pago_1_metodo:        pago1,
      pago_2_metodo:        pago2,
      observaciones:        datosRemito.observaciones  || null,
      foto_urls:            fotoUrls.length ? fotoUrls : null,
      firma_imagen_url:     firmaUrl,
      firmado_at:           new Date().toISOString(),
      conformidad_servicio: datosRemito.confirmaciones.includes('Conformidad con el servicio'),
      conformidad_cargos:   datosRemito.confirmaciones.includes('Aceptación de cargos variables'),
      sin_danos:            datosRemito.confirmaciones.includes('Sin daños reportados'),
      conformidad_arrastre: datosRemito.confirmaciones.includes('Conformidad de Arrastre') || null,
      status:               'firmado',
      created_at_device:    new Date().toISOString(),
    }, { onConflict: 'nro_remito' }); // <-- La clave del Upsert

    if (error) { 
      console.error("❌ Error de inserción Supabase:", error);
      _toast('Error: ' + error.message, 'error'); 
      return false; 
    }

    await cargarRemitos();
    _toast(`Remito ${nroFinal} guardado ✓`, 'success');
    showRemitosView('lista');
    return true;

  } catch (err) {
    console.error('❌ Error inesperado en guardarRemitoCompleto:', err);
    _toast('Error inesperado al guardar', 'error');
    return false;
  }
}
// Nota: esta función maneja todo el proceso de guardar un remito: generar un número único, subir fotos y firma a Storage, validar métodos de pago, y finalmente insertar el registro en la tabla "remitos". Si algo falla, muestra un error específico. Al finalizar, recarga la lista de remitos y muestra un mensaje de éxito.


// ── GUARDAR JORNADA ───────────────────────────────────────────

async function guardarJornadaEnBD(datos) {
  const { error } = await _db.from('daily_logs').insert({
    driver_id: USUARIO_ACTUAL.id, log_date: datos.fecha,
    km_inicio: parseInt(datos.kmInicio), hora_inicio: datos.horaInicio,
    status: 'open', created_at_device: new Date().toISOString(),
  });
  if (error) { _toast('Error: ' + error.message, 'error'); return false; }
  await cargarJornadas();
  _toast('Jornada iniciada ✓', 'success');
  return true;
}
//Nota: esta función se llama al iniciar una jornada. Inserta un nuevo registro en la tabla "daily_logs" con el estado "open". Si hay un error, muestra un mensaje específico. Al finalizar, recarga la lista de jornadas y muestra un mensaje de éxito.

async function cerrarJornadaEnBD(logId, datos) {
  const { error } = await _db.from('daily_logs')
    .update({ km_final: parseInt(datos.kmFinal), hora_fin: datos.horaFin, status: 'closed' })
    .eq('log_id', logId);
  if (error) { _toast('Error: ' + error.message, 'error'); return false; }
  await cargarJornadas();
  _toast('Jornada cerrada ✓', 'success');
  return true;
}
// Nota: esta función se llama al cerrar una jornada. Actualiza el registro correspondiente en la tabla "daily_logs" con los kilómetros finales, hora de fin, y cambia el estado a "closed". Si hay un error, muestra un mensaje específico. Al finalizar, recarga la lista de jornadas y muestra un mensaje de éxito.


// ── HELPERS ───────────────────────────────────────────────────

function formatearFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yy   = String(d.getFullYear()).slice(-2);
  const hh   = String(d.getHours()).padStart(2, '0');
  const min  = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${min}`;
}
//Nota: esta función formatea una fecha ISO a un formato más legible "dd/mm/aa hh:mm". Si la fecha no es válida, devuelve "—".

function formatearFechaCorta(str) {
  if (!str) return '—';
  return new Date(str + 'T00:00:00')
    .toLocaleDateString('es-AR', { weekday:'short', day:'numeric', month:'short' });
}
//Nota: esta función formatea una fecha ISO (solo fecha) a un formato corto con día de la semana, día y mes (ej: "lun 14 mar"). Si la fecha no es válida, devuelve "—".


function calcularHoras(ini, fin) {
  if (!ini || !fin) return '—';
  const [h1,m1] = ini.split(':').map(Number);
  const [h2,m2] = fin.split(':').map(Number);
  const d = ((h2*60+m2)-(h1*60+m1))/60;
  return d > 0 ? d.toFixed(1) : '—';
}
//Nota: esta función calcula la cantidad de horas entre una hora de inicio y una hora de fin, dadas en formato "hh:mm". Si alguna de las horas no es válida o el resultado es negativo, devuelve "—".

function capitalizar(s) { return s ? s[0].toUpperCase() + s.slice(1) : '—'; }
//Nota: esta función capitaliza la primera letra de una cadena. Si la cadena es vacía o nula, devuelve "—".

function armarConfirmaciones(r) {
  const c = [];
  if (r.conformidad_servicio) c.push('Conformidad con el servicio');
  if (r.conformidad_cargos)   c.push('Aceptación de cargos variables');
  if (r.sin_danos)            c.push('Sin daños reportados');
  if (r.conformidad_arrastre) c.push('Conformidad de Arrastre');
  return c;
}
//Nota: esta función recibe un objeto remito y arma un array con las confirmaciones que aplican según los campos booleanos. Esto facilita mostrar las confirmaciones en la tabla o en el detalle del remito.


// ── LOGIN UI ──────────────────────────────────────────────────

function mostrarPantallaLogin() {
  document.querySelector('.sidenav').style.display = 'none';
  document.querySelector('.main').style.display    = 'none';
  if (!document.getElementById('pantalla-login')) {
    const div = document.createElement('div');
    div.id = 'pantalla-login';
    div.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);font-family:'DM Sans',sans-serif">
        <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:36px 40px;width:360px;max-width:90vw">
          <div style="text-align:center;margin-bottom:28px">
            <div style="font-family:'Bebas Neue';font-size:36px;letter-spacing:3px;color:var(--amber)">SIGMA</div>
            <div style="font-family:'Bebas Neue';font-size:18px;letter-spacing:2px;color:var(--muted)">REMOLQUES</div>
            <div style="font-size:12px;color:var(--muted);margin-top:8px">Iniciá sesión para continuar</div>
          </div>
          <div style="margin-bottom:14px">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Email</div>
            <input id="login-email" class="form-input" type="email" placeholder="tu@email.com" style="width:100%;box-sizing:border-box" onkeydown="if(event.key==='Enter')ejecutarLogin()">
          </div>
          <div style="margin-bottom:22px">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Contraseña</div>
            <input id="login-pass" class="form-input" type="password" placeholder="••••••••" style="width:100%;box-sizing:border-box" onkeydown="if(event.key==='Enter')ejecutarLogin()">
          </div>
          <button id="login-btn" class="btn btn-primary" onclick="ejecutarLogin()" style="width:100%;justify-content:center;padding:13px;font-size:14px;border-radius:8px">Ingresar →</button>
          <div id="login-error" style="display:none;margin-top:12px;padding:10px 14px;background:rgba(226,80,74,0.1);border:1px solid rgba(226,80,74,0.3);border-radius:7px;font-size:12px;color:var(--red);text-align:center"></div>
        </div>
      </div>`;
    document.body.insertBefore(div, document.body.firstChild);
  }
  document.getElementById('pantalla-login').style.display = 'block';
}
//Nota: esta función muestra la pantalla de login. Si el elemento ya existe, solo lo muestra. Si no, lo crea dinámicamente con HTML y lo inserta en el DOM. Mientras la pantalla de login está visible, oculta la barra lateral y el contenido principal.


function ocultarPantallaLogin() {
  const p = document.getElementById('pantalla-login');
  if (p) p.style.display = 'none';
  document.querySelector('.sidenav').style.display = '';
  document.querySelector('.main').style.display    = '';
}
//Nota: esta función oculta la pantalla de login y vuelve a mostrar la barra lateral y el contenido principal. Se llama después de un login exitoso para mostrar la app.

function mostrarErrorLogin(msg) {
  const e = document.getElementById('login-error');
  const b = document.getElementById('login-btn');
  if (e) { e.textContent = msg; e.style.display = 'block'; }
  if (b) { b.textContent = 'Ingresar →'; b.style.opacity = '1'; }
}
//Nota: esta función muestra un mensaje de error en la pantalla de login, y también restablece el botón de login a su estado original. Se llama cuando el login falla por credenciales incorrectas o por un error en la conexión.

async function ejecutarLogin() {
  const email = document.getElementById('login-email')?.value.trim();
  const pass  = document.getElementById('login-pass')?.value;
  const e = document.getElementById('login-error');
  const b = document.getElementById('login-btn');
  if (!email || !pass) { if(e){e.textContent='Completá email y contraseña';e.style.display='block';} return; }
  if (e) e.style.display = 'none';
  if (b) { b.textContent = 'Ingresando...'; b.style.opacity = '0.7'; }
  await loginUsuario(email, pass);
}
//Nota: esta función se llama al hacer clic en el botón de login o al presionar Enter en los campos de email o contraseña. Valida que ambos campos estén completos, muestra un mensaje de error si no lo están, y si todo está bien, llama a la función de loginUsuario para intentar iniciar sesión.


// ── INDICADOR DE CARGA ────────────────────────────────────────

function mostrarCargando(activo) {
  let el = document.getElementById('loading-overlay');
  if (activo) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'loading-overlay';
      el.style.cssText = 'position:fixed;inset:0;background:rgba(13,15,20,0.88);display:flex;align-items:center;justify-content:center;z-index:9999';
      el.innerHTML = `<div style="text-align:center">
        <div style="font-family:'Bebas Neue';font-size:26px;color:var(--amber);letter-spacing:2px;margin-bottom:8px">CARGANDO DATOS</div>
        <div style="font-size:12px;color:var(--muted)">Conectando con Supabase...</div>
      </div>`;
      document.body.appendChild(el);
    }
    el.style.display = 'flex';
  } else {
    if (el) el.style.display = 'none';
  }
}
//Nota: esta función muestra u oculta un overlay de carga que bloquea la interacción con la página. Se utiliza durante la inicialización de la app para indicar que se están cargando los datos desde Supabase.


// ── PUNTO DE ENTRADA ──────────────────────────────────────────
// Esperar a que sigma.js esté completamente cargado
// antes de inicializar la app
function esperarSigmaYArrancar() {
  if (typeof renderTablaRemitos === 'function' &&
      typeof renderHistorialJornadas === 'function' &&
      typeof renderServiciosDia === 'function') {
    // sigma.js está listo
    verificarSesion();
  } else {
    // Reintentar en 100ms
    setTimeout(esperarSigmaYArrancar, 100);
  }
}

window.addEventListener('load', () => {
  esperarSigmaYArrancar();
});
// Event delegation global — funciona para filas nuevas y existentes
document.addEventListener('click', e => {
  const card = e.target.closest('[data-rem]');
  if (!card) return;
  if (e.target.closest('.btn-ver-remito'))      { verRemitoModal(card); return; }
  if (e.target.closest('.btn-firmar-remito')) {
    let d = null;
    try { d = JSON.parse(card.getAttribute('data-rem')); } catch(_) {}
    completarRemitoPendiente(d);
    return;
  }
  if (e.target.closest('.btn-pdf-remito'))      { descargarRemitoPDF(card); return; }
  if (e.target.closest('.btn-whatsapp-remito')) { compartirRemitoPorWhatsApp(card); return; }
});


// Nota: este bloque de código espera a que sigma.js haya cargado sus funciones de renderizado antes de iniciar la app. También agrega un event listener global para manejar clicks en las filas de remitos, utilizando delegación de eventos para funcionar con filas dinámicas.


// ── JORNADAS ──────────────────────────────────────────────────

async function cargarCamiones() {
  const { data, error } = await _db
    .from('trucks')
    .select('truck_id, plate, brand, model, numero_interno, current_km, status')
    .eq('status', 'active')
    .order('numero_interno');
  if (error) { console.error('Error camiones:', error); return []; }
  return data || [];
}
//Nota: esta función carga la lista de camiones activos desde la tabla "trucks". Devuelve un array de objetos con los datos de cada camión. Si hay un error, muestra un mensaje en la consola y devuelve un array vacío.

async function iniciarJornada(datos) {
  try {
    // 1. Validar sesión
    if (!USUARIO_ACTUAL || !USUARIO_ACTUAL.id) {
      return { success: false, error: "Sesión no detectada. Volvé a iniciar sesión." };
    }

    // 2. Verificar jornadas del día: bloquear si hay una abierta, o si ya usó el mismo camión
    const hoy = new Date().toISOString().slice(0, 10);
    const fechaDisplay = new Date(hoy + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const { data: jornadasHoy } = await _db
      .from('daily_logs')
      .select('log_id, status, truck_id, trucks(plate)')
      .eq('driver_id', USUARIO_ACTUAL.id)
      .eq('log_date', hoy);

    const abierta = jornadasHoy?.find(j => j.status === 'open');
    if (abierta) {
      const patenteAbierta = abierta.trucks?.plate || '';
      const sufijo = patenteAbierta ? ` (${patenteAbierta})` : '';
      return { success: false, error: `Ya tenés una jornada activa en curso${sufijo}. Cerrala antes de iniciar otra.` };
    }

    const mismoCamion = jornadasHoy?.find(j => j.truck_id === datos.truckId);
    if (mismoCamion) {
      const patente = mismoCamion.trucks?.plate || datos.truckId;
      return { success: false, error: `Ya registraste tu jornada con el camión ${patente} el día ${fechaDisplay}.` };
    }

    // 3. La foto ya fue subida por la IA — fotoKmInicio es una URL pública
    const fotoUrl = (typeof datos.fotoKmInicio === 'string') ? datos.fotoKmInicio : null;

    // 4. Insertar en base de datos
    const payload = {
      driver_id:         USUARIO_ACTUAL.id,
      truck_id:          datos.truckId,
      patente_camion:    datos.patente,
      log_date:          hoy,
      km_inicio:         parseInt(datos.kmInicio),
      hora_inicio:       new Date().toTimeString().slice(0, 5),
      foto_km_inicio:    fotoUrl,
      status:            'open',
      created_at_device: new Date().toISOString(),
    };

    const { data, error } = await _db.from('daily_logs').insert(payload).select().single();

    if (error) throw new Error(error.message);

    // Persistir jornada en disco del dispositivo para sobrevivir reinicios sin red
    try {
      const jornadaLocal = {
        log_id:      data.log_id,
        truck_id:    data.truck_id,
        patente:     datos.patente,
        marca_modelo: datos.marcaModelo || null,
      };
      localStorage.setItem('sigma_jornada_activa', JSON.stringify(jornadaLocal));
    } catch (e) { /* localStorage no disponible — no crítico */ }

    // Retorna éxito explícito
    return { success: true, data: data };

  } catch (err) {
    console.error('[Iniciar Jornada] Fallo crítico:', err);
    return { success: false, error: err.message };
  }
}
// Nota: esta función maneja el proceso de iniciar una jornada. Valida que el usuario tenga una sesión activa, que no haya otra jornada abierta para el mismo día, y que no haya registrado otra jornada con el mismo camión. Luego sube la foto del km inicial a Storage, y finalmente inserta un nuevo registro en la tabla "daily_logs" con el estado "open". Devuelve un objeto con un campo "success" para indicar si la operación fue exitosa, y en caso de error, incluye un mensaje descriptivo.


async function cerrarJornada(logId, datos) {
  try {
    const { truckId, kmInicio, kmFinal, fotoKmFinal, inWorkshop, workshopDetail, notas, kmExcepcion = false } = datos;

    if (kmFinal < kmInicio && !kmExcepcion) {
      console.error(`[Cierre Jornada] KM inválido: kmFinal (${kmFinal}) < kmInicio (${kmInicio}). Log ID: ${logId}`);
      return false;
    }
    if (kmFinal < kmInicio && kmExcepcion) {
      console.warn(`[Cierre Jornada] Excepción de odómetro confirmada: kmFinal (${kmFinal}) < kmInicio (${kmInicio}). Log ID: ${logId}`);
    }
    let fotoUrl = null;
    if (fotoKmFinal) {
      if (typeof fotoKmFinal === 'string') {
        // Ya es una URL pública (subida previamente por subirFotoOdometro)
        fotoUrl = fotoKmFinal;
      } else {
        // Es un File/Blob — subirlo al storage
        const nombreArchivo = `km_final_${truckId}_${Date.now()}.jpg`;
        const { error: uploadError } = await _db.storage
          .from('remitos')
          .upload(nombreArchivo, fotoKmFinal, { upsert: true });
        if (uploadError) {
          console.error(`[Cierre Jornada] Fallo al subir foto: ${uploadError.message}`);
          return false;
        }
        fotoUrl = _db.storage.from('remitos').getPublicUrl(nombreArchivo).data.publicUrl;
      }
    }
  
    const { error: logError } = await _db.from('daily_logs').update({
      km_final:        kmFinal,
      foto_km_final:   fotoUrl,
      status:          'closed',
      hora_fin:        new Date().toTimeString().slice(0, 5),
      in_workshop:     inWorkshop,
      workshop_detail: workshopDetail,
      notas:           notas,
      km_excepcion:    kmExcepcion,
    }).eq('log_id', logId);

    if (logError) {
      console.error(`[Cierre Jornada] Fallo update log: ${logError.message}`);
      return false;
    }

    const { error: truckError } = await _db.from('trucks').update({
      current_km: kmFinal,
    }).eq('truck_id', truckId);

    if (truckError) {
      console.error(`[Cierre Jornada] Fallo update camión: ${truckError.message}. Intentando rollback de daily_logs...`);

      const { error: rollbackError } = await _db.from('daily_logs').update({
        status:    'open',
        km_final:  null,
        hora_fin:  null,
      }).eq('log_id', logId);

      if (rollbackError) {
        console.error(`[Cierre Jornada] ROLLBACK FALLIDO — log_id=${logId} quedó en estado 'closed' pero current_km del camión NO fue actualizado. Error rollback: ${rollbackError.message} | Error original camión: ${truckError.message}`);
      } else {
        console.warn(`[Cierre Jornada] Rollback exitoso: log_id=${logId} revertido a 'open'. Error original camión: ${truckError.message}`);
      }

      return false;
    }

    // Limpiar jornada del almacenamiento local al cerrar
    try { localStorage.removeItem('sigma_jornada_activa'); } catch (e) { /* no crítico */ }

    return true;

  } catch (error) {
    console.error('[Cierre Jornada] Error de ejecución:', error);
    return false;
  }
}
// Nota: esta función maneja el proceso de cerrar una jornada. Valida que los kilómetros finales sean mayores o iguales a los iniciales, sube la foto del km final a Storage, y luego actualiza el registro de la jornada en "daily_logs" con los datos finales, incluyendo el estado "closed". También actualiza el km actual del camión en la tabla "trucks". Devuelve true si todo fue exitoso, o false si hubo algún error en el proceso.

// Este bloque de funciones relacionadas con las jornadas incluye validaciones críticas para evitar inconsistencias en los datos, manejo de errores detallado, y asegura que tanto el registro de la jornada como la información del camión se mantengan sincronizados.


// ── COMBUSTIBLE ───────────────────────────────

async function cargarCombustible(truckId) {
  const { data, error } = await _db
    .from('fuel_records')
    .select('*')
    .eq('truck_id', truckId)
    .order('fuel_date', { ascending: false })
    .limit(30);
  if (error) { console.error('[Combustible] Error al cargar:', error.message); return []; }
  return data || [];
}

async function registrarCombustible(datos) {
  try {
    const { error } = await _db.from('fuel_records').insert(datos);
    if (error) {
      console.error('[Combustible] Error al insertar:', error.message);
      // Error de validación/DB → no tiene sentido reintentar
      return { ok: false, isValidation: true, errorMsg: error.message };
    }
    return { ok: true };
  } catch (err) {
    // Error de red/conexión → se puede reintentar
    console.error('[Combustible] Error de red:', err);
    return { ok: false, isValidation: false, errorMsg: err.message };
  }
}

// ── PLANES & SERVICES ────────────────────────

// ── PLANES & SERVICES (ARQUITECTURA MASTER-DETAIL) ────────────────────────

/**
 * 1. ADMINISTRACIÓN: Crea una regla global para toda la flota.
 * Ejemplo: "Cambio de Aceite" cada 40,000 km.
 */
async function crearPlanGlobal(datos) {
  try {
    const { error } = await _db.from('master_service_plans').insert(datos);
    if (error) {
      console.error('[Planes Globales] Error al crear:', error.message);
      return { ok: false, isValidation: true, errorMsg: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error('[Planes Globales] Error de red:', err);
    return { ok: false, isValidation: false, errorMsg: err.message };
  }
}

/**
 * 2. ADMINISTRACIÓN: Carga el catálogo de planes disponibles para asignar.
 */
async function cargarCatalogoPlanes() {
  const { data, error } = await _db
    .from('master_service_plans')
    .select('id, name, trigger_type, interval_km, interval_hours, alert_before_km')
    .order('name');
    
  if (error) {
    console.error('[Catálogo Planes] Error:', error.message);
    return [];
  }
  return data || [];
}

/**
 * 3. ASIGNACIÓN: Vincula un camión a un plan global.
 */
async function suscribirCamionAPlan(truckId, masterPlanId) {
  try {
    const { error } = await _db.from('truck_subscriptions').insert({
      truck_id: truckId,
      master_plan_id: masterPlanId,
      is_active: true
    });
    if (error) {
      console.error('[Suscripción] Error:', error.message);
      // Supabase lanzará error si viola la regla UNIQUE (ya está suscrito)
      return { ok: false, isValidation: true, errorMsg: "El camión ya tiene asignado este plan o hubo un error de validación." };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, isValidation: false, errorMsg: err.message };
  }
}

/**
 * 4. OPERACIÓN: Carga los planes de un camión específico y calcula su estado actual.
 * (Altamente optimizado: 0 over-fetching)
 */
async function cargarPlanesDetalleOptimizados(truckId, currentKmOverride = null) {
  // A. Traemos el KM actual del camión (o usamos el override para evitar race condition post-cierre)
  let currentKm;
  if (currentKmOverride !== null) {
    currentKm = currentKmOverride;
  } else {
    const truckRes = await _db.from('trucks').select('current_km').eq('truck_id', truckId).single();
    currentKm = truckRes.data?.current_km ?? null; // null si aún no hay odómetro registrado
  }

  // B. Traemos solo las suscripciones activas usando JOIN (Inner Join implícito en Supabase)
  const suscripciones = await _db.from('truck_subscriptions')
    .select(`
      is_active,
      master_plan_id,
      master_service_plans (id, name, trigger_type, interval_km, interval_hours, alert_before_km)
    `)
    .eq('truck_id', truckId)
    .eq('is_active', true);

  if (suscripciones.error || !suscripciones.data) {
    console.error('[Planes Detalle] Error:', suscripciones.error?.message);
    return { _error: true, message: suscripciones.error?.message || 'Sin datos' };
  }

  const planesAsignados = suscripciones.data.map(sub => sub.master_service_plans);

  // C. Consultamos estrictamente el ÚLTIMO log para cada plan asignado
  const planesConEstado = await Promise.all(planesAsignados.map(async (plan) => {
      const logRes = await _db.from('maintenance_logs')
          .select('next_due_km, next_due_hours, km_at_service, performed_at')
          .eq('truck_id', truckId)
          .eq('master_plan_id', plan.id) // Nota: Tu tabla maintenance_logs debe usar master_plan_id ahora
          .order('performed_at', { ascending: false })
          .limit(1) // <-- La clave del rendimiento
          .maybeSingle();

      const log = logRes.data;

      // Si no hay odómetro aún, no se puede calcular estado real
      if (currentKm === null) {
        return {
          plan_id: plan.id,
          name: plan.name,
          interval_km: plan.interval_km,
          interval_hours: plan.interval_hours,
          current_km: null,
          next_due_km: log?.next_due_km || null,
          next_due_hours: log?.next_due_hours || null,
          ultimo_km: log?.km_at_service || null,
          ultima_fecha: log?.performed_at || null,
          km_restantes: null,
          plan_estado: 'sin_odometro'
        };
      }

      const nextDueKm = log?.next_due_km || null;
      const kmRestantes = nextDueKm != null ? nextDueKm - currentKm : null;

      let plan_estado = 'sin_registro';
      if (nextDueKm != null) {
        if (currentKm >= nextDueKm) plan_estado = 'vencido';
        else if (kmRestantes <= (plan.alert_before_km || 500)) plan_estado = 'proximo';
        else plan_estado = 'al_dia';
      }

      return {
          // Mapeamos para mantener compatibilidad con tu renderPlanes en UI
          plan_id: plan.id, 
          name: plan.name,
          interval_km: plan.interval_km,
          interval_hours: plan.interval_hours,
          current_km: currentKm,
          next_due_km: nextDueKm,
          next_due_hours: log?.next_due_hours || null,
          ultimo_km: log?.km_at_service || null,
          ultima_fecha: log?.performed_at || null,
          km_restantes: kmRestantes,
          plan_estado
      };
  }));

  return planesConEstado;
}

/**
 * 5. HISTORIAL: Carga el historial de services de un camión.
 */
async function cargarHistorialServices(truckId) {
  const { data, error } = await _db
    .from('maintenance_logs')
    .select('maintenance_id, performed_at, km_at_service, next_due_km, cost, workshop_name, master_service_plans(name)')
    .eq('truck_id', truckId)
    .order('performed_at', { ascending: false })
    .limit(30);
  if (error) { console.error('[Historial Services] Error:', error.message); return []; }
  return data || [];
}

/**
 * 6. EJECUCIÓN: Registra que se realizó un service.
 */
async function registrarServiceOptimizado(datos) {
  try {
    // Asegúrate de que 'datos' envíe 'master_plan_id' y no el viejo 'plan_id'
    const { error } = await _db.from('maintenance_logs').insert(datos);
    if (error) {
      console.error('[Services] Error al insertar:', error.message);
      return { ok: false, isValidation: true, errorMsg: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error('[Services] Error de ejecución:', err);
    return { ok: false, isValidation: false, errorMsg: err.message };
  }
}

/**
 * 6. ASIGNACIÓN: Desactiva un plan para un camión específico
 */
async function desactivarSuscripcionPlan(truckId, masterPlanId) {
  try {
    const { error } = await _db.from('truck_subscriptions')
        .update({ is_active: false })
        .eq('truck_id', truckId)
        .eq('master_plan_id', masterPlanId);
        
    if (error) return { ok: false, isValidation: true, errorMsg: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, isValidation: false, errorMsg: err.message };
  }
}

// ── NEUMÁTICOS & FRENOS ───────────────────────

async function cargarUltimoControlNeumaticos(truckId) {
  const { data, error } = await _db
    .from('tire_checks')
    .select('*')
    .eq('truck_id', truckId)
    .order('check_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.error('[Neumáticos] Error al cargar:', error.message); return null; }
  return data;
}

async function registrarControlNeumaticos(datos) {
  try {
    const { error } = await _db.from('tire_checks').insert(datos);
    if (error) { console.error('[Neumáticos] Error al insertar:', error.message); return false; }
    return true;
  } catch (err) {
    console.error('[Neumáticos] Error de ejecución:', err);
    return false;
  }
}

async function cargarDatosChofer(userId, desde, truckId = null) {
  const hoy = new Date().toISOString().slice(0, 10);

  let jornadasQ = _db.from('daily_logs')
    .select('km_inicio, km_final, truck_id, log_date, log_id')
    .eq('driver_id', userId)
    .gte('log_date', desde)
    .eq('status', 'closed');
  if (truckId) jornadasQ = jornadasQ.eq('truck_id', truckId);

  let fuelQ = _db.from('fuel_records')
    .select('liters, total_cost, fuel_date, truck_id')
    .gte('fuel_date', desde);
  if (truckId) fuelQ = fuelQ.eq('truck_id', truckId);

  const [remitosRes, jornadasRes, fuelRes, rendicionRes, alertasRes, jornadaHoyRes] = await Promise.all([
    _db.from('remitos')
      .select('pago_1_metodo, pago_1_monto, pago_2_metodo, pago_2_monto, status, created_at_device, log_id, nro_remito, patente, origen, destino, imp_peaje, imp_excedente, imp_otros')
      .eq('driver_id', userId)
      .gte('created_at_device', desde + 'T00:00:00')
      .neq('status', 'anulado'),
    jornadasQ,
    fuelQ,
    _db.from('rendicion_cierre')
      .select('efectivo_declarado, efectivo_esperado, estado, fecha')
      .eq('driver_id', userId)
      .gte('fecha', desde)
      .neq('estado', 'rechazado'),
    _db.from('alertas_operativas')
      .select('tipo, diferencia_monto, fecha')
      .eq('driver_id', userId)
      .eq('estado', 'pendiente'),
    _db.from('daily_logs')
      .select('log_id, km_inicio, truck_id, log_date, trucks(plate, brand, model)')
      .eq('driver_id', userId)
      .eq('status', 'open')
      .eq('log_date', hoy)
      .maybeSingle(),
  ]);

  let remitos = remitosRes.data || [];
  if (truckId) {
    const logIds = new Set((jornadasRes.data || []).map(j => j.log_id).filter(Boolean));
    remitos = remitos.filter(r => logIds.has(r.log_id));
  }
  return {
    remitos,
    jornadas:   jornadasRes.data  || [],
    fuel:       fuelRes.data      || [],
    rendicion:  rendicionRes.data || [],
    alertas:    alertasRes.data   || [],
    jornadaHoy: jornadaHoyRes.data || null,
  };
}

async function cargarDatosNegocio(desde) {
  if (!desde) {
    const d0 = new Date();
    d0.setMonth(d0.getMonth() - 5);
    d0.setDate(1);
    desde = d0.toISOString().slice(0, 10);
  }

  const [remitosRes, fuelRes, jornadasRes, usuariosRes, alertas] = await Promise.all([
    _db.from('remitos')
      .select('driver_id, nro_remito, nro_servicio, patente, marca_modelo, razon_social, cuit, telefono, email_cliente, tipo_servicio, origen, destino, km_reales, imp_peaje, imp_excedente, imp_otros, imp_total_extras, pago_1_metodo, pago_1_monto, pago_2_metodo, pago_2_monto, conformidad_servicio, conformidad_cargos, sin_danos, cliente_presente, observaciones, status, created_at_device, log_id')
      .gte('created_at_device', desde + 'T00:00:00')
      .neq('status', 'anulado'),
    _db.from('fuel_records')
      .select('total_cost, fuel_date, truck_id, liters, price_per_liter, km_at_load, payment_method, payment_app, gas_station')
      .gte('fuel_date', desde),
    _db.from('daily_logs')
      .select('log_id, driver_id, km_inicio, km_final, log_date, truck_id, hora_inicio, hora_fin, in_workshop, workshop_detail, trucks(plate, brand, model)')
      .gte('log_date', desde)
      .eq('status', 'closed'),
    _db.from('users')
      .select('user_id, full_name')
      .eq('role_id', 3),
    cargarAlertasOperativas(),
  ]);

  return {
    remitos:  remitosRes.data  || [],
    fuel:     fuelRes.data     || [],
    jornadas: jornadasRes.data || [],
    usuarios: usuariosRes.data || [],
    alertas,
  };
}

async function cargarAlertasOperativas() {
  const { data, error } = await _db
    .from('alertas_operativas')
    .select('alerta_id, tipo, diferencia_monto, nota_chofer, estado, fecha, created_at, driver_id')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) { console.error('cargarAlertasOperativas:', error); return []; }
  return data || [];
}

async function cargarFlotaEnCurso() {
  const { data, error } = await _db
    .from('daily_logs')
    .select('log_id, driver_id, km_inicio, created_at_device, trucks(plate, brand, model)')
    .eq('status', 'open')
    .order('created_at_device', { ascending: false });
  if (error) { console.error('cargarFlotaEnCurso:', error); return []; }
  return data || [];
}

async function cargarJornadasAbiertas() {
  if (!USUARIO_ACTUAL?.id) return [];
  const { data, error } = await _db
    .from('daily_logs')
    .select('*, trucks(plate, brand, model)')
    .eq('driver_id', USUARIO_ACTUAL.id)
    .eq('status', 'open')
    .order('created_at_device', { ascending: false });
  if (error) { console.error('Error jornadas abiertas:', error); return []; }
  return data || [];
}

async function cargarResumenMes(userId, anio, mes) {
  // mes es 1-indexed (1=enero, 12=diciembre)
  const mesStr = String(mes).padStart(2, '0');
  const desde  = `${anio}-${mesStr}-01`;
  const hasta  = new Date(anio, mes, 0).toISOString().slice(0, 10); // último día del mes

  const { data, error } = await _db
    .from('v_driver_summary_month')
    .select('total_km, total_jornadas, total_servicios, total_anulados')
    .eq('user_id', userId)
    .gte('mes', desde)
    .lte('mes', hasta)
    .maybeSingle();

  if (error) { console.error('Error resumen mes:', error); return null; }
  return data ? {
    total_km:         data.total_km        || 0,
    total_jornadas:   data.total_jornadas  || 0,
    total_servicios:  data.total_servicios || 0,
    total_anulados:   data.total_anulados  || 0,
  } : { total_km: 0, total_jornadas: 0, total_servicios: 0, total_anulados: 0 };
}

// ── RENDICIÓN DE CIERRE ──────────────────────────────────────────────

async function obtenerResumenRendicion(driverId, fecha, truckId) {
  const [remitosRes, combustibleRes] = await Promise.all([
    _db.from('remitos')
      .select('nro_remito, tipo_servicio, pago_1_metodo, pago_1_monto, pago_2_metodo, pago_2_monto, status')
      .eq('driver_id', driverId)
      .gte('created_at_device', fecha + 'T00:00:00')
      .lte('created_at_device', fecha + 'T23:59:59')
      .neq('status', 'anulado'),
    truckId
      ? _db.from('fuel_records').select('total_cost').eq('truck_id', truckId).eq('fuel_date', fecha)
      : Promise.resolve({ data: [] }),
  ]);

  const remitos = remitosRes.data || [];
  const efectivoEsperado = remitos.reduce((sum, r) => {
    const p1 = r.pago_1_metodo === 'efectivo' ? (r.pago_1_monto || 0) : 0;
    const p2 = r.pago_2_metodo === 'efectivo' ? (r.pago_2_monto || 0) : 0;
    return sum + p1 + p2;
  }, 0);

  const gastosSistema = (combustibleRes.data || []).reduce((sum, f) => sum + (f.total_cost || 0), 0);

  return { remitos, efectivoEsperado, gastosSistema };
}

// ── MÓDULO DOCUMENTACIÓN ─────────────────────────────────────────────

async function cargarTruckDocs(truckId) {
  const { data, error } = await _db
    .from('v_truck_docs_status')
    .select('*')
    .eq('truck_id', truckId);
  if (error) { console.error('cargarTruckDocs:', error); throw error; }
  return data || [];
}

async function cargarDriverDocs(driverId) {
  const { data, error } = await _db
    .from('v_driver_docs_status')
    .select('*')
    .eq('driver_id', driverId);
  if (error) { console.error('cargarDriverDocs:', error); throw error; }
  return data || [];
}

async function cargarAllTruckDocs() {
  const { data, error } = await _db.from('v_truck_docs_status').select('*');
  if (error) { console.error('cargarAllTruckDocs:', error); throw error; }
  return data || [];
}

async function cargarAllDriverDocs() {
  const { data, error } = await _db.from('v_driver_docs_status').select('*');
  if (error) { console.error('cargarAllDriverDocs:', error); throw error; }
  return data || [];
}

async function cargarTodosLosChoferes() {
  const { data, error } = await _db
    .from('users')
    .select('user_id, full_name')
    .eq('role_id', 3)
    .order('full_name');
  if (error) { console.error('cargarTodosLosChoferes:', error); throw error; }
  return data || [];
}

async function cargarEmergencias() {
  const { data, error } = await _db
    .from('emergencias_config')
    .select('*')
    .eq('is_active', true)
    .order('category')
    .order('sort_order');
  if (error) { console.error('cargarEmergencias:', error); throw error; }
  return data || [];
}

async function subirArchivoDoc(storagePath, file) {
  const { data, error } = await _db.storage
    .from('docs')
    .upload(storagePath, file, { upsert: true });
  if (error) throw error;
  return storagePath;
}

async function obtenerSignedUrl(storagePathOrUrl) {
  // Normalizar: si recibe URL pública completa, extraer solo el path relativo
  let storagePath = storagePathOrUrl;
  const markerPublic = '/object/public/docs/';
  const markerSign   = '/object/sign/docs/';
  if (storagePath.includes(markerPublic)) {
    storagePath = decodeURIComponent(storagePath.split(markerPublic)[1].split('?')[0]);
  } else if (storagePath.includes(markerSign)) {
    storagePath = decodeURIComponent(storagePath.split(markerSign)[1].split('?')[0]);
  }
  const { data, error } = await _db.storage
    .from('docs')
    .createSignedUrl(storagePath, 600); // 10 minutos
  if (error) throw error;
  return data.signedUrl;
}

async function insertarTruckDoc(datos) {
  const { error } = await _db.from('truck_docs').insert(datos);
  if (error) throw error;
}

async function insertarDriverDoc(datos) {
  const { error } = await _db.from('driver_docs').insert(datos);
  if (error) throw error;
}

async function eliminarTruckDoc(docId) {
  const { error } = await _db.from('truck_docs').delete().eq('doc_id', docId);
  if (error) throw error;
}

async function eliminarDriverDoc(docId) {
  const { error } = await _db.from('driver_docs').delete().eq('driver_doc_id', docId);
  if (error) throw error;
}

async function guardarEmergenciaConfig(datos) {
  const { config_id, ...rest } = datos;
  if (config_id) {
    const { error } = await _db.from('emergencias_config')
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq('config_id', config_id);
    if (error) throw error;
  } else {
    const { error } = await _db.from('emergencias_config')
      .insert({ ...rest, created_by: USUARIO_ACTUAL?.id });
    if (error) throw error;
  }
}

async function eliminarEmergenciaConfig(configId) {
  const { error } = await _db.from('emergencias_config')
    .update({ is_active: false })
    .eq('config_id', configId);
  if (error) throw error;
}

async function obtenerTruckAsignado() {
  if (!PERFIL_USUARIO?.user_id) return null;
  const { data } = await _db
    .from('daily_logs')
    .select('truck_id')
    .eq('driver_id', PERFIL_USUARIO.user_id)
    .order('log_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.truck_id || null;
}
