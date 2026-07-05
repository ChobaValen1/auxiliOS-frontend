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

async function loginUsuario(email, password) {
  const { data, error } = await _db.auth.signInWithPassword({ email, password });
  if (error) return false;
  USUARIO_ACTUAL = data.user;
  await cargarPerfilUsuario();
  await inicializarApp();
  return true;
}
// Nota: esta función no solo hace login, sino que también carga el perfil y arranca la app. Devuelve true si el login fue exitoso, false en caso de error.

async function cerrarSesion() {
  try {
    await _db.auth.signOut();
  } catch (e) {
    console.error('Error al cerrar sesión:', e.message);
  } finally {
    location.reload();
  }
}
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-cerrar-sesion');
  if (btn) btn.addEventListener('click', cerrarSesion);
});


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
        
        // 1. Toast ajustado a 4 segundos (4000 ms)
        if (typeof toast === 'function') {
          toast(`🚛 Jornada activa — Camión ${patente}${modelo ? ' · ' + modelo : ''}. No podés cambiar de camión hasta cerrar la jornada.`, 'warning', 4000);
        }
        
        // 2. Banner temporal en la parte superior
        let banner = document.getElementById('banner-jornada-activa');
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'banner-jornada-activa';
          // Se agrega transition para un fade-out suave
          banner.style.cssText = 'position:sticky;top:0;z-index:9999;background:#f5a623;color:#1a1a1a;padding:7px 16px;text-align:center;font-size:12px;font-weight:700;letter-spacing:0.3px;transition: opacity 0.5s ease;';
          document.querySelector('.main')?.prepend(banner);
        }
        banner.textContent = `⚠️ Jornada activa · Camión ${patente}${modelo ? ' · ' + modelo : ''} · No podés cambiar de camión hasta cerrar la jornada`;

        // 3. Remover el banner a los 4 segundos
        setTimeout(() => {
          if (banner && banner.parentNode) {
            banner.style.opacity = '0'; // Inicia el fade-out
            setTimeout(() => banner.remove(), 500); // Lo quita del DOM tras la animación
          }
        }, 4000);
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
      cargarServiciosDia(),
      actualizarPantallaJornadas(), // ya invoca cargarJornadas + cargarJornadasAbiertas + cargarResumenMesPantalla
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

  // Nav "Sueldos": visible sólo para admin/supervisor
  const rolActual = PERFIL_USUARIO?.roles?.name;
  const navSueldos = document.getElementById('nav-sueldos');
  if (navSueldos) {
    navSueldos.style.display = (rolActual === 'administracion' || rolActual === 'supervision') ? '' : 'none';
  }

  const navJornadasAdmin = document.getElementById('nav-jornadas-admin');
  if (navJornadasAdmin) {
    navJornadasAdmin.style.display = (rolActual === 'administracion' || rolActual === 'supervision') ? '' : 'none';
  }
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
    opt.value = u.user_id;
    opt.textContent = u.full_name;
    select.appendChild(opt);
  });
}
// Nota: esta función se llama solo para usuarios admin, y carga la lista de choferes activos para mostrar en el filtro de choferes. Solo trae el nombre completo y el ID, ya que no se necesitan más datos para el filtro.


// ── LECTURA ───────────────────────────────────────────────────

// ── LECTURA ───────────────────────────────────────────────────

// ── LECTURA: REMITOS ──────────────────────────────────────────

// Estado de filtros/paginación para remitos (server-side)
window._remitosFiltros = window._remitosFiltros || {};
window._remitosPagina = window._remitosPagina || 1;
window._REMITOS_PAGE_SIZE = window._REMITOS_PAGE_SIZE || 50;
window._remitosTotal = window._remitosTotal || 0;

function _mapRemitoRow(r) {
  return {
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
    createdAt:     r.created_at_device || null,
    firmadoAt:     r.firmado_at        || null,
  };
}

// Escapa caracteres problemáticos para PostgREST or/ilike (%, coma, paréntesis)
function _escPostgrest(s) {
  return String(s).replace(/[,()%]/g, '');
}

// Dado 'YYYY-MM-DD', devuelve el día siguiente 'YYYY-MM-DD'.
// Usar como cota superior EXCLUSIVA (.lt) en filtros de created_at_device.
function _nextDay(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function _buildRemitosQuery({ filtros = {}, forCount = false } = {}) {
  const esChofer = PERFIL_USUARIO?.roles?.name === 'chofer';
  let q = _db
    .from('remitos')
    .select('*, users(full_name)', { count: 'exact' })
    .order('created_at_device', { ascending: false });

  if (esChofer) {
    q = q.eq('driver_id', USUARIO_ACTUAL.id);
  } else if (filtros.driverId) {
    q = q.eq('driver_id', filtros.driverId);
  }

  if (filtros.patente) {
    q = q.ilike('patente', `%${_escPostgrest(filtros.patente)}%`);
  }
  if (filtros.tipoServicio) {
    q = q.eq('tipo_servicio', filtros.tipoServicio);
  }
  if (filtros.pagoMetodo) {
    const p = filtros.pagoMetodo.toLowerCase();
    q = q.or(`pago_1_metodo.eq.${p},pago_2_metodo.eq.${p}`);
  }
  if (filtros.estado && filtros.estado !== 'todos') {
    q = q.eq('status', filtros.estado);
  }

  if (filtros.periodo === 'mes') {
    // Primer día del mes actual en horario AR (-03:00), no en UTC.
    const hoyAR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
    const [y, m] = hoyAR.split('-');
    q = q.gte('created_at_device', `${y}-${m}-01T00:00:00-03:00`);
  } else if (filtros.periodo === 'dia' && filtros.diaEspecifico) {
    const d = filtros.diaEspecifico;
    q = q.gte('created_at_device', `${d}T00:00:00-03:00`)
         .lt ('created_at_device', `${_nextDay(d)}T00:00:00-03:00`);
  } else if (filtros.periodo === 'rango' && filtros.desde && filtros.hasta) {
    q = q.gte('created_at_device', `${filtros.desde}T00:00:00-03:00`)
         .lt ('created_at_device', `${_nextDay(filtros.hasta)}T00:00:00-03:00`);
  }

  if (filtros.buscar) {
    const b = _escPostgrest(filtros.buscar).trim();
    if (b) {
      q = q.or(
        `nro_remito.ilike.%${b}%,razon_social.ilike.%${b}%,cuit.ilike.%${b}%,telefono.ilike.%${b}%,origen.ilike.%${b}%,destino.ilike.%${b}%,nro_servicio.ilike.%${b}%,patente.ilike.%${b}%`
      );
    }
  }

  return q;
}

async function cargarRemitos(opts = {}) {
  try {
    const page     = opts.page     ?? window._remitosPagina ?? 1;
    const pageSize = opts.pageSize ?? window._REMITOS_PAGE_SIZE;
    const filtros  = opts.filtros  ?? window._remitosFiltros ?? {};

    window._remitosPagina  = page;
    window._remitosFiltros = filtros;

    let query = _buildRemitosQuery({ filtros });
    const start = (page - 1) * pageSize;
    const end   = start + pageSize - 1;
    query = query.range(start, end);

    const { data, error, count } = await query;
    if (error) {
      console.error('❌ Error Supabase remitos:', error);
      if (typeof renderTablaRemitos === 'function') renderTablaRemitos([]);
      return;
    }

    window._remitosTotal = count ?? 0;

    const mapped = (data || []).map(_mapRemitoRow);
    if (typeof renderTablaRemitos === 'function') renderTablaRemitos(mapped);
    if (typeof renderRemitosPagination === 'function') renderRemitosPagination();
    if (typeof actualizarInfoFiltroRemitos === 'function') actualizarInfoFiltroRemitos();
  } catch (err) {
    console.error("❌ CRÍTICO cargarRemitos:", err);
  }
}

async function fetchRemitosFiltrados({ filtros, max = 5000 } = {}) {
  const f = filtros ?? window._remitosFiltros ?? {};
  let query = _buildRemitosQuery({ filtros: f });
  query = query.range(0, Math.max(0, max - 1));
  const { data, error } = await query;
  if (error) { console.error('❌ fetchRemitosFiltrados:', error); return []; }
  return (data || []).map(_mapRemitoRow);
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
      .gte('created_at_device', hoy + 'T00:00:00-03:00')
      .lte('created_at_device', hoy + 'T23:59:59.999-03:00')
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

// Arma el registro de la tabla remitos a partir de los datos del wizard.
// Única fuente para el camino online y el offline (outbox).
function _remitoDbDesdeDatos(datosRemito, nroFinal, parsearImporte, pago1, pago2, fotoUrls, firmaUrl) {
  return {
    nro_remito:           nroFinal,
    driver_id:            USUARIO_ACTUAL.id,
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
    imp_peaje:            parsearImporte(datosRemito.peaje),
    imp_excedente:        parsearImporte(datosRemito.excedente),
    imp_otros:            parsearImporte(datosRemito.otros),
    pago_1_monto:         parsearImporte(datosRemito.pago1Monto),
    pago_2_monto:         parsearImporte(datosRemito.pago2Monto),
    pago_1_metodo:        pago1,
    pago_2_metodo:        pago2,
    observaciones:        datosRemito.observaciones  || null,
    foto_urls:            (fotoUrls && fotoUrls.length) ? fotoUrls : null,
    firma_imagen_url:     firmaUrl || null,
    firmado_at:           new Date().toISOString(),
    conformidad_servicio: datosRemito.confirmaciones.includes('Conformidad con el servicio'),
    conformidad_cargos:   datosRemito.confirmaciones.includes('Aceptación de cargos variables'),
    sin_danos:            datosRemito.confirmaciones.includes('Sin daños reportados'),
    conformidad_arrastre: datosRemito.confirmaciones.includes('Conformidad de Arrastre') || null,
    status:               'firmado',
    created_at_device:    new Date().toISOString(),
  };
}

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

    // ── 3. Parseo de Pago Mixto ───────────────────────────────
    const metodosValidos = ['efectivo', 'transferencia', 'tarjeta', 'app'];
    const pagos = (datosRemito.pago || '').split('+').map(p => p.trim().toLowerCase());
    const pago1 = metodosValidos.includes(pagos[0]) ? pagos[0] : null;
    const pago2 = pagos[1] && metodosValidos.includes(pagos[1]) ? pagos[1] : null;

    // ── 4. Recolectar firma y fotos (sin subirlas todavía) ────
    let firmaDataURL = datosRemito.firmaDataURL || null;
    if (!firmaDataURL) {
      const canvas = document.getElementById('sig-canvas');
      if (canvas && typeof hasSig !== 'undefined' && hasSig) {
        firmaDataURL = canvas.toDataURL('image/png');
      }
    }
    const archivosFotos = [];
    for (const input of document.querySelectorAll('#foto-grid input[type="file"]')) {
      if (input.files?.length) archivosFotos.push(input.files[0]);
    }

    // ── 5. SIN CONEXIÓN → outbox (fotos y firma quedan en el teléfono) ──
    if (!navigator.onLine && typeof obAdd === 'function') {
      const remitoOffline = _remitoDbDesdeDatos(datosRemito, nroFinal, parsearImporte, pago1, pago2, null, null);
      const blobs = {};
      if (firmaDataURL) blobs.firma = firmaDataURL;
      archivosFotos.forEach((f, i) => { blobs['foto_' + i] = f; });
      await obAdd({
        tipo: 'remito_completo',
        payload: remitoOffline,
        blobs: Object.keys(blobs).length ? blobs : null,
        dependeDe: (typeof remitoOffline.log_id === 'string' && remitoOffline.log_id.startsWith('TMP-')) ? remitoOffline.log_id : null,
      });
      _toast(`Remito ${nroFinal} guardado en el teléfono — se sincroniza cuando haya señal 📴`, 'success');
      try { showRemitosView('lista'); } catch (e) { /* vista puede no estar disponible offline */ }
      return true;
    }

    // ── 5b. ONLINE: Subida de Fotos ───────────────────────────
    const fotoUrls = [];
    for (const file of archivosFotos) {
      const nombre = `${nroFinal}_${Date.now()}.${file.name.split('.').pop()}`;
      const { error: ue } = await _db.storage.from('remitos').upload(nombre, file, { upsert: true });
      if (!ue) {
        const { data: ud } = _db.storage.from('remitos').getPublicUrl(nombre);
        fotoUrls.push(ud.publicUrl);
      }
    }

    // ── 5c. ONLINE: Subida de Firma ───────────────────────────
    let firmaUrl = null;
    if (firmaDataURL) {
      try {
        const blob = await (await fetch(firmaDataURL)).blob();
        const nombre = `firma_${nroFinal}_${Date.now()}.png`;
        const { error: fe } = await _db.storage.from('firmas').upload(nombre, blob, { contentType: 'image/png', upsert: true });
        if (!fe) {
          const { data: fd } = _db.storage.from('firmas').getPublicUrl(nombre);
          firmaUrl = fd.publicUrl;
        } else {
          console.warn('⚠️ No se pudo subir la firma:', fe.message);
          _toast('Firma guardada localmente (no se pudo subir): ' + fe.message, 'warn');
        }
      } catch (upErr) {
        console.warn('⚠️ Error procesando firma:', upErr);
      }
    }

    console.log('Enviando DTO a Supabase para:', nroFinal);

    // ── 6. Upsert Seguro en Supabase ──────────────────────────
    // Usamos UPSERT para actualizar el pendiente si ya existía, o crear uno nuevo.
    const { error } = await _db.from('remitos').upsert(
      _remitoDbDesdeDatos(datosRemito, nroFinal, parsearImporte, pago1, pago2, fotoUrls, firmaUrl),
      { onConflict: 'nro_remito' }
    );

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
  let mins = (h2*60+m2) - (h1*60+m1);
  if (mins < 0) mins += 24*60; // turno cruza medianoche
  const d = mins / 60;
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
      <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;background:var(--bg);font-family:'DM Sans',sans-serif;padding:20px;box-sizing:border-box">
        <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:36px 32px;width:360px;max-width:100%;box-sizing:border-box">
          <div style="text-align:center;margin-bottom:28px">
            <img src="/assets/logo-auxilios-main.png" alt="AuxiliOS" style="max-width:180px;height:auto;display:block;margin:0 auto 12px" onerror="this.style.display='none';document.getElementById('login-title-fallback').style.display='block'">
            <div id="login-title-fallback" style="display:none;font-family:'Bebas Neue';font-size:32px;letter-spacing:3px;color:var(--amber)">AuxiliOS</div>
            <div style="font-size:12px;color:var(--muted);margin-top:6px">Iniciá sesión para continuar</div>
          </div>
          <div style="margin-bottom:14px">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Email o DNI</div>
            <input id="login-identifier" class="form-input" type="text" placeholder="tu@email.com o 30123456" style="width:100%;box-sizing:border-box" onkeydown="if(event.key==='Enter')ejecutarLogin()">
          </div>
          <div style="margin-bottom:22px">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Contraseña</div>
            <div style="position:relative">
              <input id="login-pass" class="form-input" type="password" placeholder="••••••••" style="width:100%;box-sizing:border-box;padding-right:42px" onkeydown="if(event.key==='Enter')ejecutarLogin()">
              <button type="button" onclick="toggleLoginPassword()" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;padding:4px;line-height:1" id="login-pass-toggle">👁</button>
            </div>
          </div>
          <button id="login-btn" class="btn btn-primary" onclick="ejecutarLogin()" style="width:100%;justify-content:center;padding:13px;font-size:14px;border-radius:8px">Ingresar →</button>
          <div id="login-error" style="display:none;margin-top:12px;padding:10px 14px;background:rgba(226,80,74,0.1);border:1px solid rgba(226,80,74,0.3);border-radius:7px;font-size:12px;color:var(--red);text-align:center"></div>
        </div>
      </div>`;
    document.body.insertBefore(div, document.body.firstChild);
  }
  document.getElementById('pantalla-login').style.display = 'block';
  _checkLoginLock();
}
//Nota: esta función muestra la pantalla de login. Si el elemento ya existe, solo lo muestra. Si no, lo crea dinámicamente con HTML y lo inserta en el DOM. Mientras la pantalla de login está visible, oculta la barra lateral y el contenido principal.

function toggleLoginPassword() {
  const input = document.getElementById('login-pass');
  const btn   = document.getElementById('login-pass-toggle');
  if (!input) return;
  if (input.type === 'password') { input.type = 'text'; if (btn) btn.textContent = '🙈'; }
  else                           { input.type = 'password'; if (btn) btn.textContent = '👁'; }
}

// ── RATE LIMITING LOGIN ───────────────────────────────────────
const _LOGIN_MAX  = 5;
const _LOGIN_LOCK = 15 * 60 * 1000; // 15 minutos

function _loginAttempts()   { return parseInt(localStorage.getItem('sigma_login_attempts')    || '0'); }
function _loginLockedUntil(){ return parseInt(localStorage.getItem('sigma_login_locked_until')|| '0'); }
function _resetLoginAttempts() {
  localStorage.removeItem('sigma_login_attempts');
  localStorage.removeItem('sigma_login_locked_until');
}
function _incrementLoginAttempts() {
  const n = _loginAttempts() + 1;
  localStorage.setItem('sigma_login_attempts', n);
  if (n >= _LOGIN_MAX) localStorage.setItem('sigma_login_locked_until', Date.now() + _LOGIN_LOCK);
  return n;
}
function _checkLoginLock() {
  const until = _loginLockedUntil();
  const btn = document.getElementById('login-btn');
  const e   = document.getElementById('login-error');
  if (until && Date.now() < until) {
    const mins = Math.ceil((until - Date.now()) / 60000);
    if (e) { e.textContent = `Demasiados intentos. Intentá de nuevo en ${mins} minuto${mins !== 1 ? 's' : ''}.`; e.style.display = 'block'; }
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
    return true;
  }
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  return false;
}

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
  if (_checkLoginLock()) return;

  const identifier = document.getElementById('login-identifier')?.value.trim();
  const pass       = document.getElementById('login-pass')?.value;
  const e          = document.getElementById('login-error');
  const b          = document.getElementById('login-btn');

  if (!identifier || !pass) {
    if (e) { e.textContent = 'Completá todos los campos'; e.style.display = 'block'; }
    return;
  }
  if (e) e.style.display = 'none';
  if (b) { b.textContent = 'Ingresando...'; b.style.opacity = '0.7'; b.disabled = true; }

  let email = identifier;

  // Si no es email, buscar por DNI en el backend
  if (!identifier.includes('@')) {
    if (!/^\d{6,10}$/.test(identifier)) {
      if (e) { e.textContent = 'El DNI debe contener solo números (6 a 10 dígitos).'; e.style.display = 'block'; }
      if (b) { b.textContent = 'Ingresar →'; b.style.opacity = '1'; b.disabled = false; }
      return;
    }
    try {
      const res  = await fetch(`${ENV.API_BASE_URL}/api/email-by-dni`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dni: identifier })
      });
      const data = await res.json();
      if (!res.ok || !data.email) {
        _handleLoginFail('No encontramos una cuenta con ese DNI.', b, e);
        return;
      }
      email = data.email;
    } catch (_) {
      _handleLoginFail('Error de conexión. Verificá tu internet.', b, e);
      return;
    }
  }

  let ok = false;
  try {
    ok = await loginUsuario(email, pass);
  } catch (_) {
    _handleLoginFail('Error inesperado. Intentá de nuevo.', b, e);
    return;
  }
  if (ok) {
    _resetLoginAttempts();
  } else {
    _handleLoginFail('Contraseña incorrecta.', b, e);
  }
}

function _handleLoginFail(msg, btn, errorEl) {
  _incrementLoginAttempts();
  if (btn) { btn.textContent = 'Ingresar →'; btn.style.opacity = '1'; btn.disabled = false; }
  if (!_checkLoginLock()) {
    const remaining = _LOGIN_MAX - _loginAttempts();
    const text = remaining > 0 ? `${msg} Intentos restantes: ${remaining}.` : msg;
    if (errorEl) { errorEl.textContent = text; errorEl.style.display = 'block'; }
  }
}
//Nota: esta función se llama al hacer clic en el botón de login o al presionar Enter en los campos de email/DNI o contraseña. Valida que ambos campos estén completos, aplica rate limiting, y si el identificador no es un email, consulta el backend para obtener el email por DNI.


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
    // La fecha puede venir en datos (sync offline: fecha del evento real);
    // si no viene, se usa la de hoy (flujo online, comportamiento original).
    const hoy = datos.logDate || new Date().toISOString().slice(0, 10);
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
      hora_inicio:       datos.horaInicio || new Date().toTimeString().slice(0, 5),
      foto_km_inicio:    fotoUrl,
      grilla_motivo:     datos.grillaMotivo || null,
      status:            'open',
      created_at_device: datos.createdAtDevice || new Date().toISOString(),
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
    const { truckId, kmInicio, kmFinal, fotoKmFinal, inWorkshop, workshopDetail, notas, kmExcepcion = false, horaFin = null } = datos;

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
      // horaFin puede venir en datos (sync offline: hora del evento real);
      // si no viene, se usa la actual (flujo online, comportamiento original).
      hora_fin:        horaFin || new Date().toTimeString().slice(0, 5),
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
    .eq('activo', true)
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
          trigger_type: plan.trigger_type,
          interval_km: plan.interval_km,
          interval_hours: plan.interval_hours,
          alert_before_km: plan.alert_before_km,
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
          trigger_type: plan.trigger_type,
          interval_km: plan.interval_km,
          interval_hours: plan.interval_hours,
          alert_before_km: plan.alert_before_km,
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
 * 5c. MANTENIMIENTO FLOTA: recorre camiones activos y agrega planes pendientes.
 * Admin/supervisor. Ordena por prioridad (vencido → próximo).
 */
async function cargarMantenimientoFlota() {
  const { data: trucks, error } = await _db
    .from('trucks')
    .select('truck_id, plate, numero_interno, current_km, status')
    .eq('status', 'active')
    .order('numero_interno', { ascending: true });
  if (error) { console.error('[Mantenimiento Flota] error:', error.message); return []; }

  const items = [];
  await Promise.all((trucks || []).map(async (t) => {
    try {
      const planes = await cargarPlanesDetalleOptimizados(t.truck_id, t.current_km);
      if (!Array.isArray(planes)) return;
      planes.forEach(p => {
        if (p.plan_estado === 'vencido' || p.plan_estado === 'proximo') {
          items.push({
            truck_id: t.truck_id,
            plate: t.plate,
            numero_interno: t.numero_interno,
            current_km: t.current_km,
            plan_name: p.name,
            next_due_km: p.next_due_km,
            km_restantes: p.km_restantes,
            ultimo_km: p.ultimo_km,
            ultima_fecha: p.ultima_fecha,
            estado: p.plan_estado,
          });
        }
      });
    } catch (err) {
      console.warn('[Mantenimiento Flota] truck error', t.truck_id, err);
    }
  }));

  items.sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === 'vencido' ? -1 : 1;
    return (a.km_restantes || 0) - (b.km_restantes || 0);
  });
  return items;
}

/**
 * 5b. TIMELINE CAMIÓN: eventos combinados (jornadas + combustible + services).
 * Admin/supervisor. Retorna array normalizado ordenado por fecha desc.
 */
async function cargarTimelineCamion(truckId, { desde = null, limit = 60 } = {}) {
  if (!truckId) return { truck: null, eventos: [], stats: { jornadas: 0, litros: 0, gastoFuel: 0, services: 0, gastoServ: 0 } };

  const truckPromise = _db.from('trucks').select('*').eq('truck_id', truckId).single();

  let jQ = _db.from('daily_logs')
     .select('log_id, log_date, km_inicio, km_final, status, driver_id, users(full_name)')
     .eq('truck_id', truckId)
     .order('log_date', { ascending: false })
     .limit(limit);
  let fQ = _db.from('fuel_records')
     .select('fuel_record_id, fuel_date, liters, total_cost, gas_station, payment_method, driver_id, users(full_name)')
     .eq('truck_id', truckId)
     .order('fuel_date', { ascending: false })
     .limit(limit);
  let mQ = _db.from('maintenance_logs')
     .select('maintenance_id, performed_at, km_at_service, next_due_km, cost, workshop_name, master_service_plans(name)')
     .eq('truck_id', truckId)
     .order('performed_at', { ascending: false })
     .limit(limit);

  if (desde) {
    jQ = jQ.gte('log_date', desde);
    fQ = fQ.gte('fuel_date', desde);
    mQ = mQ.gte('performed_at', desde);
  }

  const [truckRes, jRes, fRes, mRes] = await Promise.all([truckPromise, jQ, fQ, mQ]);

  const truck = truckRes.data || null;
  const jornadas = jRes.data || [];
  const fuel     = fRes.data || [];
  const servs    = mRes.data || [];

  const eventos = [];
  jornadas.forEach(j => {
    const km = (j.km_final || 0) - (j.km_inicio || 0);
    eventos.push({
      tipo: 'jornada',
      fecha: j.log_date,
      titulo: `Jornada ${j.status === 'open' ? '(abierta)' : ''}`.trim(),
      detalle: `${j.users?.full_name || 'Chofer'} · ${(j.km_inicio||0).toLocaleString('es-AR')} → ${(j.km_final||0).toLocaleString('es-AR')} km`,
      valor: km > 0 ? `+${km.toLocaleString('es-AR')} km` : (j.status === 'open' ? 'en curso' : ''),
      valorColor: null,
      raw: j,
    });
  });
  fuel.forEach(f => {
    eventos.push({
      tipo: 'combustible',
      fecha: f.fuel_date,
      titulo: 'Combustible',
      detalle: `${f.users?.full_name || 'Chofer'} · ${f.gas_station || 's/ estación'} · ${(f.liters||0).toFixed(1)} L · ${f.payment_method || ''}`,
      valor: '-$' + Math.round(f.total_cost || 0).toLocaleString('es-AR'),
      valorColor: '#ef4444',
      raw: f,
    });
  });
  servs.forEach(s => {
    eventos.push({
      tipo: 'service',
      fecha: s.performed_at,
      titulo: s.master_service_plans?.name || 'Service',
      detalle: `${s.workshop_name || 's/ taller'} · ${(s.km_at_service||0).toLocaleString('es-AR')} km${s.next_due_km ? ' · próx ' + s.next_due_km.toLocaleString('es-AR') : ''}`,
      valor: s.cost ? '-$' + Math.round(s.cost).toLocaleString('es-AR') : '',
      valorColor: '#ef4444',
      raw: s,
    });
  });

  eventos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  const stats = {
    jornadas:  jornadas.length,
    litros:    fuel.reduce((s, f) => s + (f.liters || 0), 0),
    gastoFuel: fuel.reduce((s, f) => s + (f.total_cost || 0), 0),
    services:  servs.length,
    gastoServ: servs.reduce((s, x) => s + (x.cost || 0), 0),
  };

  return { truck, eventos, stats };
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
    .select('km_inicio, km_final, truck_id, log_date, log_id, status')
    .eq('driver_id', userId)
    .gte('log_date', desde)
    .in('status', ['open', 'closed']);
  if (truckId) jornadasQ = jornadasQ.eq('truck_id', truckId);

  let fuelQ = _db.from('fuel_records')
    .select('liters, total_cost, fuel_date, truck_id, payment_method')
    .gte('fuel_date', desde);
  if (truckId) fuelQ = fuelQ.eq('truck_id', truckId);

  const [remitosRes, jornadasRes, fuelRes, rendicionRes, alertasRes, jornadaHoyRes] = await Promise.all([
    _db.from('remitos')
      .select('pago_1_metodo, pago_1_monto, pago_2_metodo, pago_2_monto, status, created_at_device, log_id, nro_remito, patente, origen, destino, imp_peaje, imp_excedente, imp_otros')
      .eq('driver_id', userId)
      .gte('created_at_device', desde + 'T00:00:00-03:00')
      .neq('status', 'anulado'),
    jornadasQ,
    fuelQ,
    _db.from('rendicion_cierre')
      .select('efectivo_declarado, efectivo_esperado, gastos_extra, motivo_extra:motivo_gastos_extra, estado, fecha')
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
      .gte('created_at_device', desde + 'T00:00:00-03:00')
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

// Comparativo: fetch mínimo para KPIs de un rango [desde, hasta] (chofer)
async function cargarComparativoChofer(userId, desde, hasta, truckId = null) {
  if (!userId || !desde || !hasta) return { remitos: [], jornadas: [], fuel: [], rendicion: [] };

  let jornadasQ = _db.from('daily_logs')
    .select('km_inicio, km_final, truck_id, log_date, log_id')
    .eq('driver_id', userId)
    .gte('log_date', desde).lte('log_date', hasta)
    .in('status', ['open', 'closed']);
  if (truckId) jornadasQ = jornadasQ.eq('truck_id', truckId);

  let fuelQ = _db.from('fuel_records')
    .select('liters, total_cost, truck_id, payment_method, fuel_date')
    .gte('fuel_date', desde).lte('fuel_date', hasta);
  if (truckId) fuelQ = fuelQ.eq('truck_id', truckId);

  const [remitosRes, jornadasRes, fuelRes, rendicionRes] = await Promise.all([
    _db.from('remitos')
      .select('pago_1_metodo, pago_1_monto, pago_2_metodo, pago_2_monto, log_id, created_at_device')
      .eq('driver_id', userId)
      .gte('created_at_device', desde + 'T00:00:00-03:00')
      .lt ('created_at_device', _nextDay(hasta) + 'T00:00:00-03:00')
      .neq('status', 'anulado'),
    jornadasQ,
    fuelQ,
    _db.from('rendicion_cierre')
      .select('efectivo_declarado, gastos_extra, fecha')
      .eq('driver_id', userId)
      .gte('fecha', desde).lte('fecha', hasta)
      .neq('estado', 'rechazado'),
  ]);

  let remitos = remitosRes.data || [];
  if (truckId) {
    const logIds = new Set((jornadasRes.data || []).map(j => j.log_id).filter(Boolean));
    remitos = remitos.filter(r => logIds.has(r.log_id));
  }
  return {
    remitos,
    jornadas: jornadasRes.data || [],
    fuel:     fuelRes.data     || [],
    rendicion: rendicionRes.data || [],
  };
}

// Comparativo: fetch mínimo para KPIs de un rango [desde, hasta] (negocio, todos los choferes)
async function cargarComparativoNegocio(desde, hasta) {
  if (!desde || !hasta) return { remitos: [], jornadas: [], fuel: [] };

  const [remitosRes, jornadasRes, fuelRes] = await Promise.all([
    _db.from('remitos')
      .select('driver_id, log_id, pago_1_metodo, pago_1_monto, pago_2_metodo, pago_2_monto, created_at_device')
      .gte('created_at_device', desde + 'T00:00:00-03:00')
      .lt ('created_at_device', _nextDay(hasta) + 'T00:00:00-03:00')
      .neq('status', 'anulado'),
    _db.from('daily_logs')
      .select('driver_id, truck_id, log_id, km_inicio, km_final, log_date')
      .gte('log_date', desde).lte('log_date', hasta)
      .eq('status', 'closed'),
    _db.from('fuel_records')
      .select('truck_id, liters, total_cost, fuel_date')
      .gte('fuel_date', desde).lte('fuel_date', hasta),
  ]);

  return {
    remitos:  remitosRes.data  || [],
    jornadas: jornadasRes.data || [],
    fuel:     fuelRes.data     || [],
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

// Referencias posibles para un cumplimiento — remitos del chofer en el período.
// Devuelve arrays únicos de patentes, socios, nros de servicio.
async function cargarRefsCumplimiento(driverId, yyyymm) {
  if (!driverId || !yyyymm) return { patentes: [], socios: [], servicios: [] };
  const { desdeTs, hastaTsExclusive } = _payrollRangoMes(yyyymm);
  const { data, error } = await _db.from('remitos')
    .select('patente, razon_social, nro_servicio')
    .eq('driver_id', driverId)
    .neq('status', 'anulado')
    .gte('created_at_device', desdeTs)
    .lt('created_at_device', hastaTsExclusive);
  if (error) { console.error('[cargarRefsCumplimiento]', error.message); return { patentes: [], socios: [], servicios: [] }; }
  const uniq = arr => [...new Set(arr.filter(v => v && String(v).trim()))].sort();
  return {
    patentes:  uniq((data || []).map(r => r.patente)),
    socios:    uniq((data || []).map(r => r.razon_social)),
    servicios: uniq((data || []).map(r => r.nro_servicio)),
  };
}

// Rendiciones de un período yyyymm — para módulo Sueldos.
// Devuelve rendiciones + faltante calculado por cada una y agregado por chofer.
// faltante = max(0, efectivo_esperado - efectivo_declarado - gastos_extra)
// sobrante = max(0, efectivo_declarado + gastos_extra - efectivo_esperado)
async function cargarRendicionesPeriodo(yyyymm, driverId = null) {
  if (!yyyymm) return { rendiciones: [], porChofer: {} };
  const { desde, hastaExclusive } = _payrollRangoMes(yyyymm);

  let q = _db.from('rendicion_cierre')
    .select('rendicion_id, log_id, driver_id, fecha, efectivo_declarado, efectivo_esperado, gastos_extra, estado, admin_status')
    .neq('estado', 'rechazado')
    .gte('fecha', desde)
    .lt('fecha', hastaExclusive)
    .order('fecha', { ascending: true });
  if (driverId) q = q.eq('driver_id', driverId);

  const [rendRes, usuariosRes] = await Promise.all([
    q,
    _db.from('users').select('user_id, full_name').eq('role_id', 3),
  ]);
  if (rendRes.error) { console.error('cargarRendicionesPeriodo:', rendRes.error); return { rendiciones: [], porChofer: {} }; }
  const mapU = {};
  (usuariosRes.data || []).forEach(u => { mapU[u.user_id] = u.full_name; });

  const rendiciones = (rendRes.data || []).map(r => {
    const declarado = Number(r.efectivo_declarado) || 0;
    const esperado  = Number(r.efectivo_esperado)  || 0;
    const gastos    = Number(r.gastos_extra)       || 0;
    const diff = declarado + gastos - esperado; // + sobra, - falta
    return {
      ...r,
      chofer_nombre: mapU[r.driver_id] || '—',
      _diff: diff,
      _faltante: diff < 0 ? -diff : 0,
      _sobrante: diff > 0 ?  diff : 0,
    };
  });

  const porChofer = {};
  rendiciones.forEach(r => {
    const k = r.driver_id;
    if (!porChofer[k]) porChofer[k] = { driver_id: k, chofer_nombre: r.chofer_nombre, faltante: 0, sobrante: 0, neto: 0, descuento: 0, cant: 0 };
    porChofer[k].faltante += r._faltante;
    porChofer[k].sobrante += r._sobrante;
    porChofer[k].neto     += r._diff;
    porChofer[k].cant += 1;
  });
  // Descuento alineado con la liquidación: faltante NETO del mes con tolerancia
  Object.values(porChofer).forEach(c => {
    const faltNeto = Math.max(0, -c.neto);
    c.descuento = faltNeto >= PAYROLL_TOLERANCIA_RENDICION ? faltNeto : 0;
  });
  return { rendiciones, porChofer };
}

// Detalle día-por-día del mes para PDF de rendición mensual.
// Agrega: remitos (fact_total + efectivo), combustible en efectivo, rendición del día.
async function cargarRendicionMensualDetalle(driverId, yyyymm) {
  if (!driverId || !yyyymm) return null;
  const { desde, hastaExclusive, desdeTs, hastaTsExclusive } = _payrollRangoMes(yyyymm);

  const [choferRes, remitosRes, fuelRes, rendRes, jornadasRes] = await Promise.all([
    _db.from('users').select('user_id, full_name, legajo').eq('user_id', driverId).single(),
    _db.from('remitos')
      .select('created_at_device, pago_1_metodo, pago_1_monto, pago_2_metodo, pago_2_monto, nro_servicio, nro_remito, patente, imp_peaje, imp_excedente, imp_otros, log_id')
      .eq('driver_id', driverId)
      .gte('created_at_device', desdeTs)
      .lt ('created_at_device', hastaTsExclusive)
      .neq('status', 'anulado'),
    _db.from('daily_logs')
      .select('log_id, log_date, truck_id')
      .eq('driver_id', driverId)
      .gte('log_date', desde).lt('log_date', hastaExclusive),
    _db.from('rendicion_cierre')
      .select('fecha, efectivo_declarado, efectivo_esperado, gastos_extra, motivo_gastos_extra, admin_status')
      .eq('driver_id', driverId)
      .neq('estado', 'rechazado')
      .gte('fecha', desde).lt('fecha', hastaExclusive),
    _db.from('fuel_records')
      .select('fuel_date, total_cost, payment_method, truck_id, gas_station, liters')
      .gte('fuel_date', desde).lt('fuel_date', hastaExclusive),
  ]);

  const chofer = choferRes.data || { full_name: '—', legajo: null };
  const truckIds = new Set((fuelRes.data || []).map(j => j.truck_id).filter(Boolean));
  // Filtrar combustible sólo de los camiones que este chofer usó ese mes.
  const misTrucks = new Set((jornadasRes.data || []).map(j => j.truck_id).filter(Boolean));
  const fuelDelChofer = (fuelRes.data || []).filter(f =>
    misTrucks.has(f.truck_id) && f.payment_method === 'efectivo'
  );

  // Bucket por día (YYYY-MM-DD en AR)
  const porDia = {};
  const bucket = (d) => {
    if (!porDia[d]) porDia[d] = { fecha: d, fact_total: 0, efectivo: 0, combustible: 0, gastos_extra: 0, rendicion_estado: null };
    return porDia[d];
  };

  const _fechaAR = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  const _esEfectivo = (m) => m === 'efectivo';

  (remitosRes.data || []).forEach(r => {
    const d = _fechaAR(r.created_at_device);
    const b = bucket(d);
    const m1 = Number(r.pago_1_monto) || 0;
    const m2 = Number(r.pago_2_monto) || 0;
    b.fact_total += m1 + m2;
    if (_esEfectivo(r.pago_1_metodo)) b.efectivo += m1;
    if (_esEfectivo(r.pago_2_metodo)) b.efectivo += m2;
  });

  fuelDelChofer.forEach(f => {
    const b = bucket(f.fuel_date);
    b.combustible += Number(f.total_cost) || 0;
  });

  (rendRes.data || []).forEach(r => {
    const b = bucket(r.fecha);
    b.gastos_extra += Number(r.gastos_extra) || 0;
    b.rendicion_estado = r.admin_status || 'pendiente';
  });

  const dias = Object.values(porDia)
    .map(b => ({ ...b, a_rendir: b.efectivo - b.combustible - b.gastos_extra }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const totales = dias.reduce((t, d) => ({
    fact_total:   t.fact_total   + d.fact_total,
    efectivo:     t.efectivo     + d.efectivo,
    combustible:  t.combustible  + d.combustible,
    gastos_extra: t.gastos_extra + d.gastos_extra,
    a_rendir:     t.a_rendir     + d.a_rendir,
  }), { fact_total: 0, efectivo: 0, combustible: 0, gastos_extra: 0, a_rendir: 0 });

  // ── Móvil por jornada/fecha (para servicios y gastos) ──
  const logToTruck = {}, fechaToTruck = {};
  (jornadasRes.data || []).forEach(j => {
    logToTruck[j.log_id] = j.truck_id;
    fechaToTruck[j.log_date] = j.truck_id;
  });
  let trucksMap = {};
  if (misTrucks.size) {
    const tRes = await _db.from('trucks')
      .select('truck_id, numero_interno, plate')
      .in('truck_id', [...misTrucks]);
    (tRes.data || []).forEach(t => {
      trucksMap[t.truck_id] = t.numero_interno || t.plate || String(t.truck_id);
    });
  }
  const movilDe = (truckId) => trucksMap[truckId] || '—';

  // ── Servicios con importe en efectivo (una fila por concepto) ──
  const servicios = [];
  (remitosRes.data || []).forEach(r => {
    const m1 = Number(r.pago_1_monto) || 0;
    const m2 = Number(r.pago_2_monto) || 0;
    const ef = (_esEfectivo(r.pago_1_metodo) ? m1 : 0) + (_esEfectivo(r.pago_2_metodo) ? m2 : 0);
    if (ef <= 0) return;
    const fecha = _fechaAR(r.created_at_device);
    const base = {
      fecha,
      movil: movilDe(logToTruck[r.log_id] ?? fechaToTruck[fecha]),
      nro_servicio: r.nro_servicio || r.nro_remito || '—',
      patente: r.patente || '—',
    };
    const total = m1 + m2;
    const peaje = Number(r.imp_peaje) || 0;
    const exc   = Number(r.imp_excedente) || 0;
    const otros = Number(r.imp_otros) || 0;
    const serv  = total - peaje - exc - otros;
    if (ef >= total - 0.01 && serv >= 0) {
      // Pagado 100% en efectivo → desglose por concepto
      if (serv  > 0) servicios.push({ ...base, concepto: 'Servicio',  importe: serv });
      if (peaje > 0) servicios.push({ ...base, concepto: 'Peaje',     importe: peaje });
      if (exc   > 0) servicios.push({ ...base, concepto: 'Excedente', importe: exc });
      if (otros > 0) servicios.push({ ...base, concepto: 'Otro',      importe: otros });
    } else {
      // Pago mixto: no se puede atribuir concepto → una sola fila por la parte en efectivo
      servicios.push({ ...base, concepto: 'Servicio', importe: ef });
    }
  });
  servicios.sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.nro_servicio).localeCompare(String(b.nro_servicio)));

  // ── Gastos en efectivo (combustible + gastos extra declarados) ──
  const gastos = [];
  fuelDelChofer.forEach(f => {
    gastos.push({
      fecha: f.fuel_date,
      movil: movilDe(f.truck_id),
      tipo: 'Combustible',
      obs: [f.gas_station, f.liters ? Number(f.liters).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' L' : null].filter(Boolean).join(' — ') || '—',
      importe: Number(f.total_cost) || 0,
    });
  });
  (rendRes.data || []).forEach(r => {
    const g = Number(r.gastos_extra) || 0;
    if (g <= 0) return;
    gastos.push({
      fecha: r.fecha,
      movil: movilDe(fechaToTruck[r.fecha]),
      tipo: 'Gasto extra',
      obs: r.motivo_gastos_extra || '—',
      importe: g,
    });
  });
  gastos.sort((a, b) => a.fecha.localeCompare(b.fecha));

  // ── Diferencia de arqueo del mes (misma fórmula que el hub admin) ──
  const arqueo = (rendRes.data || []).reduce((a, r) => {
    const decl = Number(r.efectivo_declarado) || 0;
    const esp  = Number(r.efectivo_esperado)  || 0;
    const g    = Number(r.gastos_extra)       || 0;
    a.declarado += decl;
    a.esperado  += esp;
    a.diff      += decl + g - esp; // + sobra, − falta
    return a;
  }, { declarado: 0, esperado: 0, diff: 0 });

  return { chofer, dias, totales, servicios, gastos, arqueo, periodo_yyyymm: yyyymm };
}

// Listado de rendiciones para el hub admin — incluye nombre del chofer y estado admin
async function cargarRendicionesAdmin({ desde = null, hasta = null, driverId = null, status = null, limit = 200 } = {}) {
  let q = _db.from('rendicion_cierre')
    .select('rendicion_id, log_id, driver_id, fecha, efectivo_declarado, efectivo_esperado, gastos_extra, motivo_extra:motivo_gastos_extra, notas:notas_chofer, estado, admin_status, admin_by, admin_at, admin_nota, created_at')
    .neq('estado', 'rechazado')
    .order('fecha', { ascending: false })
    .limit(limit);
  if (desde)    q = q.gte('fecha', desde);
  if (hasta)    q = q.lte('fecha', hasta);
  if (driverId) q = q.eq('driver_id', driverId);
  if (status)   q = q.eq('admin_status', status);

  const [rendRes, usuariosRes] = await Promise.all([
    q,
    _db.from('users').select('user_id, full_name').eq('role_id', 3),
  ]);
  if (rendRes.error) { console.error('cargarRendicionesAdmin:', rendRes.error); return { rendiciones: [], usuarios: [] }; }
  const usuarios = usuariosRes.data || [];
  const mapU = {};
  usuarios.forEach(u => { mapU[u.user_id] = u.full_name; });
  const rendiciones = (rendRes.data || []).map(r => ({ ...r, chofer_nombre: mapU[r.driver_id] || '—' }));
  return { rendiciones, usuarios };
}

// Detalle de una rendición: remitos efectivo + gastos combustible/extra del día
async function cargarDetalleRendicion(logId) {
  if (!logId) return { remitos: [], fuel: [], rendicion: null };
  const rendicionRes = await _db.from('rendicion_cierre')
    .select('*')
    .eq('log_id', logId)
    .maybeSingle();
  const rendicion = rendicionRes.data;
  if (!rendicion) return { remitos: [], fuel: [], rendicion: null };

  const [remitosRes, jornadaRes] = await Promise.all([
    _db.from('remitos')
      .select('nro_remito, patente, origen, destino, pago_1_metodo, pago_1_monto, pago_2_metodo, pago_2_monto, created_at_device')
      .eq('log_id', logId)
      .neq('status', 'anulado'),
    _db.from('daily_logs')
      .select('truck_id, log_date, driver_id, trucks(plate)')
      .eq('log_id', logId)
      .maybeSingle(),
  ]);
  const jornada = jornadaRes.data;
  let fuel = [];
  if (jornada?.truck_id && jornada?.log_date) {
    const fuelRes = await _db.from('fuel_records')
      .select('liters, total_cost, payment_method, gas_station, fuel_date')
      .eq('truck_id', jornada.truck_id)
      .eq('fuel_date', jornada.log_date);
    fuel = fuelRes.data || [];
  }
  return {
    remitos: remitosRes.data || [],
    fuel,
    rendicion,
    jornada,
  };
}

// Actualiza el estado admin (aprobar/observar) de una rendición
async function actualizarAdminRendicion(rendicionId, { admin_status, admin_nota = null }) {
  if (!rendicionId || !USUARIO_ACTUAL?.id) return { error: 'Falta rendición o usuario' };
  const payload = {
    admin_status,
    admin_by:   USUARIO_ACTUAL.id,
    admin_at:   new Date().toISOString(),
    admin_nota,
  };
  const { data, error } = await _db.from('rendicion_cierre')
    .update(payload)
    .eq('rendicion_id', rendicionId)
    .select()
    .maybeSingle();
  if (error) { console.error('actualizarAdminRendicion:', error); return { error }; }
  return { data };
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

async function cargarAlertasPersonales() {
  if (!USUARIO_ACTUAL?.id) return [];
  const uid = USUARIO_ACTUAL.id;
  const hoyISO = new Date().toISOString().slice(0, 10);
  const alertas = [];

  const [jornadasRes, remitosRes, docsRes, rendRes] = await Promise.allSettled([
    _db.from('daily_logs')
       .select('log_id, log_date, trucks(plate)')
       .eq('driver_id', uid).eq('status', 'open')
       .lt('log_date', hoyISO)
       .order('log_date', { ascending: true }),
    _db.from('remitos')
       .select('remito_id, created_at_device', { count: 'exact', head: false })
       .eq('driver_id', uid).eq('status', 'pendiente')
       .lt('created_at_device', hoyISO)
       .limit(1),
    _db.from('v_driver_docs_status')
       .select('doc_type, expiry_date, status')
       .eq('driver_id', uid)
       .in('status', ['vencido', 'proximo']),
    _db.from('rendicion_cierre')
       .select('rendicion_id, fecha, admin_status, admin_nota')
       .eq('driver_id', uid)
       .eq('admin_status', 'observada')
       .order('fecha', { ascending: false })
       .limit(5),
  ]);

  if (jornadasRes.status === 'fulfilled' && jornadasRes.value.data?.length) {
    jornadasRes.value.data.forEach(j => {
      const plate = j.trucks?.plate || 's/ patente';
      alertas.push({
        sev: 'critico',
        icon: '🕒',
        title: 'Jornada sin cerrar',
        detail: `${j.log_date} — ${plate}`,
        cta: 'Ir a Registro',
        target: 'registro',
      });
    });
  }

  if (docsRes.status === 'fulfilled' && docsRes.value.data?.length) {
    docsRes.value.data.forEach(d => {
      alertas.push({
        sev: d.status === 'vencido' ? 'critico' : 'advertencia',
        icon: d.status === 'vencido' ? '⛔' : '⚠️',
        title: d.status === 'vencido' ? 'Documento vencido' : 'Documento por vencer',
        detail: `${d.doc_type}${d.expiry_date ? ' — ' + d.expiry_date : ''}`,
        cta: 'Ver documentos',
        target: 'documentos',
        tab: 'chofer',
      });
    });
  }

  if (remitosRes.status === 'fulfilled') {
    const total = remitosRes.value.count || 0;
    if (total > 0) {
      alertas.push({
        sev: 'advertencia',
        icon: '📝',
        title: 'Remitos sin firmar',
        detail: `${total} remito(s) pendiente(s) de días anteriores`,
        cta: 'Ver remitos',
        target: 'remitos',
        filtro: 'pendiente',
      });
    }
  }

  if (rendRes.status === 'fulfilled' && rendRes.value.data?.length) {
    rendRes.value.data.forEach(r => {
      alertas.push({
        sev: 'advertencia',
        icon: '💬',
        title: 'Rendición observada',
        detail: `${r.fecha} — ${(r.admin_nota || '').slice(0, 60)}${(r.admin_nota||'').length > 60 ? '…' : ''}`,
        cta: 'Ver detalle',
        target: 'dashboard',
      });
    });
  }

  try {
    const openJ = jornadasRes.status === 'fulfilled' ? jornadasRes.value.data?.[0] : null;
    const openTruckId = openJ?.log_id
      ? (await _db.from('daily_logs').select('truck_id').eq('log_id', openJ.log_id).maybeSingle()).data?.truck_id
      : (await _db.from('daily_logs').select('truck_id').eq('driver_id', uid).eq('status', 'open').limit(1).maybeSingle()).data?.truck_id;
    if (openTruckId && typeof cargarPlanesDetalleOptimizados === 'function') {
      const planes = await cargarPlanesDetalleOptimizados(openTruckId);
      if (Array.isArray(planes)) {
        planes.forEach(p => {
          if (p.plan_estado === 'vencido' || p.plan_estado === 'proximo') {
            alertas.push({
              sev: p.plan_estado === 'vencido' ? 'critico' : 'advertencia',
              icon: '🔧',
              title: p.plan_estado === 'vencido' ? 'Service vencido' : 'Service próximo',
              detail: `${p.name} · ${p.km_restantes != null ? Math.abs(p.km_restantes).toLocaleString('es-AR') + ' km ' + (p.km_restantes < 0 ? 'excedidos' : 'restantes') : 'sin registro'}`,
              cta: 'Ver camión',
              target: 'camion',
            });
          }
        });
      }
    }
  } catch (err) {
    console.warn('[Alertas mantenimiento chofer] error:', err);
  }

  alertas.sort((a, b) => (a.sev === 'critico' ? 0 : 1) - (b.sev === 'critico' ? 0 : 1));
  return alertas;
}

async function cargarResumenMes(userId, anio, mes) {
  // mes es 1-indexed (1=enero, 12=diciembre)
  // Si userId es null/undefined, agrega la flota completa (admin/supervisor)
  const mesStr = String(mes).padStart(2, '0');
  const desde  = `${anio}-${mesStr}-01`;
  const hasta  = new Date(anio, mes, 0).toISOString().slice(0, 10); // último día del mes

  let q = _db
    .from('v_driver_summary_month')
    .select('total_km, total_jornadas, total_servicios, total_anulados, user_id')
    .gte('mes', desde)
    .lte('mes', hasta);
  if (userId) q = q.eq('user_id', userId);

  const { data, error } = await q;
  if (error) { console.error('Error resumen mes:', error); return null; }
  const rows = data || [];
  const agg = rows.reduce((acc, r) => ({
    total_km:        acc.total_km        + (r.total_km        || 0),
    total_jornadas:  acc.total_jornadas  + (r.total_jornadas  || 0),
    total_servicios: acc.total_servicios + (r.total_servicios || 0),
    total_anulados:  acc.total_anulados  + (r.total_anulados  || 0),
  }), { total_km: 0, total_jornadas: 0, total_servicios: 0, total_anulados: 0 });
  return agg;
}

// ── RENDICIÓN DE CIERRE ──────────────────────────────────────────────

async function obtenerResumenRendicion(driverId, fecha, truckId) {
  const [remitosRes, combustibleRes] = await Promise.all([
    _db.from('remitos')
      .select('nro_remito, tipo_servicio, pago_1_metodo, pago_1_monto, pago_2_metodo, pago_2_monto, status')
      .eq('driver_id', driverId)
      .gte('created_at_device', fecha + 'T00:00:00-03:00')
      .lte('created_at_device', fecha + 'T23:59:59.999-03:00')
      .neq('status', 'anulado'),
    truckId
      ? _db.from('fuel_records').select('total_cost, payment_method').eq('truck_id', truckId).eq('fuel_date', fecha)
      : Promise.resolve({ data: [] }),
  ]);

  const remitos = remitosRes.data || [];
  const efectivoEsperado = remitos.reduce((sum, r) => {
    const p1 = r.pago_1_metodo === 'efectivo' ? (r.pago_1_monto || 0) : 0;
    const p2 = r.pago_2_metodo === 'efectivo' ? (r.pago_2_monto || 0) : 0;
    return sum + p1 + p2;
  }, 0);

  // Solo el combustible pagado en efectivo descuenta del cash esperado.
  // Apps (YPF/SHELL/etc) van por contrato a 15 días y no afectan la caja diaria.
  const gastosSistema = (combustibleRes.data || [])
    .filter(f => f.payment_method === 'efectivo')
    .reduce((sum, f) => sum + (f.total_cost || 0), 0);

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

// ── PAYROLL ────────────────────────────────────────────────
// Módulo liquidación de sueldos (admin/supervisor).
// 4 tablas: payroll_objetivos, payroll_settings, payroll_liquidaciones,
// payroll_objetivo_cumplimientos.

// ── Helpers de período ──
// Tolerancia (ARS) por debajo de la cual una diferencia de rendición se considera "OK"
// y NO se descuenta del recibo. Debe coincidir con el umbral visual del semáforo (sigma.js).
const PAYROLL_TOLERANCIA_RENDICION = 500;

function _payrollRangoMes(yyyymm) {
  // yyyymm INT (ej. 202607) → rangos de mes con cotas superiores EXCLUSIVAS.
  //   desde / hastaExclusive → para columnas DATE (log_date, fecha).
  //   desdeTs / hastaTsExclusive → para columnas TIMESTAMPTZ (created_at_device).
  // Todos los rangos referencian al mismo instante (medianoche AR = -03:00),
  // así garantizamos que un mismo día pertenezca al mismo mes en todas las tablas.
  const anio = Math.floor(yyyymm / 100);
  const mes  = yyyymm % 100;
  const mm = String(mes).padStart(2, '0');
  const anioNext = mes === 12 ? anio + 1 : anio;
  const mesNext  = mes === 12 ? 1 : mes + 1;
  const mmNext = String(mesNext).padStart(2, '0');
  const desde            = `${anio}-${mm}-01`;
  const hastaExclusive   = `${anioNext}-${mmNext}-01`;
  const desdeTs          = `${desde}T00:00:00-03:00`;
  const hastaTsExclusive = `${hastaExclusive}T00:00:00-03:00`;
  // "hasta" (inclusivo, último día del mes) se conserva para consumidores externos.
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const hasta = `${anio}-${mm}-${String(ultimoDia).padStart(2, '0')}`;
  return { desde, hasta, hastaExclusive, desdeTs, hastaTsExclusive };
}

// ── Objetivos (catálogo) ──
async function cargarObjetivos() {
  const { data, error } = await _db
    .from('payroll_objetivos')
    .select('objetivo_id, nombre, tipo, valor, descripcion, activo, created_at')
    .eq('activo', true)
    .order('nombre', { ascending: true });
  if (error) { console.error('[Payroll cargarObjetivos]', error.message); return []; }
  return data || [];
}

async function crearObjetivo({ nombre, tipo, valor, descripcion = null, activo = true }) {
  const { data, error } = await _db
    .from('payroll_objetivos')
    .insert({ nombre, tipo, valor, descripcion, activo })
    .select()
    .maybeSingle();
  if (error) { console.error('[Payroll crearObjetivo]', error.message); return { ok: false, error }; }
  return { ok: true, data };
}

async function actualizarObjetivo(objetivoId, patch) {
  const { data, error } = await _db
    .from('payroll_objetivos')
    .update(patch)
    .eq('objetivo_id', objetivoId)
    .select()
    .maybeSingle();
  if (error) { console.error('[Payroll actualizarObjetivo]', error.message); return { ok: false, error }; }
  return { ok: true, data };
}

async function toggleObjetivoActivo(objetivoId, activo) {
  return actualizarObjetivo(objetivoId, { activo });
}

// ── Esquema salarial por chofer ──
async function cargarPayrollSettingsChofer(driverId) {
  if (!driverId) return null;
  const { data, error } = await _db
    .from('payroll_settings')
    .select('user_id, sueldo_basico, valor_km, valor_servicio, bono_presentismo, updated_at')
    .eq('user_id', driverId)
    .maybeSingle();
  if (error) { console.error('[Payroll cargarPayrollSettingsChofer]', error.message); return null; }
  return data || null;
}

async function cargarPayrollSettingsFlota() {
  // LEFT JOIN manual: choferes activos + (opcional) su esquema.
  const [usersRes, settingsRes] = await Promise.all([
    _db.from('users')
      .select('user_id, full_name, legajo, is_active')
      .eq('role_id', 3)
      .eq('is_active', true)
      .order('full_name', { ascending: true }),
    _db.from('payroll_settings')
      .select('user_id, sueldo_basico, valor_km, valor_servicio, bono_presentismo, updated_at'),
  ]);
  if (usersRes.error)    { console.error('[Payroll cargarPayrollSettingsFlota] users', usersRes.error.message); return []; }
  if (settingsRes.error) { console.error('[Payroll cargarPayrollSettingsFlota] settings', settingsRes.error.message); /* seguimos con [] */ }
  const mapSet = {};
  (settingsRes.data || []).forEach(s => { mapSet[s.user_id] = s; });
  return (usersRes.data || []).map(u => ({
    user_id:          u.user_id,
    full_name:        u.full_name,
    legajo:           u.legajo,
    settings:         mapSet[u.user_id] || null,
    sueldo_basico:    mapSet[u.user_id]?.sueldo_basico    ?? null,
    valor_km:         mapSet[u.user_id]?.valor_km         ?? null,
    valor_servicio:   mapSet[u.user_id]?.valor_servicio   ?? null,
    bono_presentismo: mapSet[u.user_id]?.bono_presentismo ?? null,
  }));
}

// Aplicar esquema salarial masivo a todos los choferes activos.
// Los campos undefined/null NO se pisan (se preservan los del chofer).
// Si onlySinEsquema=true, solo actualiza choferes sin fila en payroll_settings.
async function guardarPayrollSettingsMasivo(patch, { onlySinEsquema = false } = {}) {
  const flota = await cargarPayrollSettingsFlota();
  const target = onlySinEsquema ? flota.filter(f => !f.settings) : flota;
  if (!target.length) return { ok: true, actualizados: 0, insertados: 0, total: 0 };
  const nowIso = new Date().toISOString();
  const rows = target.map(c => {
    const base = c.settings || {};
    return {
      user_id: c.user_id,
      sueldo_basico:    patch.sueldo_basico    != null ? Number(patch.sueldo_basico)    : (Number(base.sueldo_basico)    || 0),
      valor_km:         patch.valor_km         != null ? Number(patch.valor_km)         : (Number(base.valor_km)         || 0),
      valor_servicio:   patch.valor_servicio   != null ? Number(patch.valor_servicio)   : (Number(base.valor_servicio)   || 0),
      bono_presentismo: patch.bono_presentismo != null ? Number(patch.bono_presentismo) : (Number(base.bono_presentismo) || 0),
      updated_at:       nowIso,
    };
  });
  const { error } = await _db.from('payroll_settings').upsert(rows, { onConflict: 'user_id' });
  if (error) { console.error('[Payroll guardarPayrollSettingsMasivo]', error.message); return { ok: false, error }; }
  const insertados = target.filter(c => !c.settings).length;
  return { ok: true, actualizados: target.length - insertados, insertados, total: target.length };
}

async function guardarPayrollSettings(driverId, { sueldo_basico, valor_km, valor_servicio, bono_presentismo }) {
  if (!driverId) return { ok: false, error: 'Falta driverId' };
  const payload = {
    user_id: driverId,
    sueldo_basico:    Number(sueldo_basico)    || 0,
    valor_km:         Number(valor_km)         || 0,
    valor_servicio:   Number(valor_servicio)   || 0,
    bono_presentismo: Number(bono_presentismo) || 0,
    updated_at:       new Date().toISOString(),
  };
  const { data, error } = await _db
    .from('payroll_settings')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .maybeSingle();
  if (error) { console.error('[Payroll guardarPayrollSettings]', error.message); return { ok: false, error }; }
  return { ok: true, data };
}

// ── Liquidaciones ──
// Alias explícitos para poder JOINear la misma tabla users tres veces (chofer,
// admin generador, admin pagador) sin colisión de nombres en PostgREST.
const _LIQ_SELECT_FIELDS = `
  liquidacion_id, driver_id, periodo_yyyymm,
  jornadas, km_total, servicios,
  sueldo_basico, adic_km, adic_serv,
  presentismo_paga, bono_presentismo, bonos_objetivos,
  ajuste_rendiciones, total, estado,
  valor_km_snapshot, valor_servicio_snapshot, bono_presentismo_snapshot,
  generada_by, generada_at,
  aprobada_by, aprobada_at,
  pagada_by, pagada_at, pagada_metodo,
  notas, created_at,
  chofer:users!driver_id(full_name, legajo),
  generador:users!generada_by(full_name),
  aprobador:users!aprobada_by(full_name),
  pagador:users!pagada_by(full_name)
`.trim();

function _mapLiquidacionRow(l) {
  return {
    ...l,
    chofer_nombre:     l.chofer?.full_name    || '—',
    chofer_legajo:     l.chofer?.legajo       || null,
    generador_nombre:  l.generador?.full_name || null,
    aprobador_nombre:  l.aprobador?.full_name || null,
    pagador_nombre:    l.pagador?.full_name   || null,
  };
}

async function cargarLiquidacionesMes(yyyymm) {
  const { data, error } = await _db
    .from('payroll_liquidaciones')
    .select(_LIQ_SELECT_FIELDS)
    .eq('periodo_yyyymm', yyyymm)
    .order('created_at', { ascending: false });
  if (error) { console.error('[Payroll cargarLiquidacionesMes]', error.message); return []; }
  return (data || []).map(_mapLiquidacionRow);
}

async function cargarLiquidacionHistorial({ anio = null, driverId = null, limit = 200 } = {}) {
  let q = _db.from('payroll_liquidaciones')
    .select(_LIQ_SELECT_FIELDS)
    .order('periodo_yyyymm', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (anio)     q = q.gte('periodo_yyyymm', anio * 100 + 1).lte('periodo_yyyymm', anio * 100 + 12);
  if (driverId) q = q.eq('driver_id', driverId);
  const { data, error } = await q;
  if (error) { console.error('[Payroll cargarLiquidacionHistorial]', error.message); return []; }
  return (data || []).map(_mapLiquidacionRow);
}

async function actualizarEstadoLiquidacion(liquidacionId, { estado, notas = null, pagada_metodo = null }) {
  if (!liquidacionId) return { ok: false, error: 'Falta liquidacionId' };
  const patch = { estado };
  if (notas !== null) patch.notas = notas;
  const nowIso = new Date().toISOString();
  if (estado === 'aprobada') {
    patch.aprobada_by = PERFIL_USUARIO?.user_id || null;
    patch.aprobada_at = nowIso;
  }
  if (estado === 'pagada') {
    patch.pagada_at     = nowIso;
    patch.pagada_by     = PERFIL_USUARIO?.user_id || null;
    patch.pagada_metodo = pagada_metodo;
  }
  const { data, error } = await _db
    .from('payroll_liquidaciones')
    .update(patch)
    .eq('liquidacion_id', liquidacionId)
    .select()
    .maybeSingle();
  if (error) { console.error('[Payroll actualizarEstadoLiquidacion]', error.message); return { ok: false, error }; }
  return { ok: true, data };
}

// ── Cumplimientos de objetivos ──
async function cargarCumplimientos(driverId, yyyymm) {
  if (!driverId || !yyyymm) return [];
  const { data, error } = await _db
    .from('payroll_objetivo_cumplimientos')
    .select('cumplimiento_id, objetivo_id, driver_id, periodo_yyyymm, fecha, cantidad, bonus_calculado, ref_tipo, ref_id, cargado_by, created_at, payroll_objetivos(nombre, tipo, valor)')
    .eq('driver_id', driverId)
    .eq('periodo_yyyymm', yyyymm)
    .order('fecha', { ascending: true });
  if (error) { console.error('[Payroll cargarCumplimientos]', error.message); return []; }
  return data || [];
}

async function crearCumplimiento({ objetivo_id, driver_id, periodo_yyyymm, fecha, cantidad, bonus_calculado, ref_tipo = 'manual', ref_id = null }) {
  const payload = {
    objetivo_id,
    driver_id,
    periodo_yyyymm,
    fecha:           fecha || new Date().toISOString().slice(0,10),
    cantidad:        Number(cantidad) || 0,
    bonus_calculado: Number(bonus_calculado) || 0,
    ref_tipo,
    ref_id,
    cargado_by:      USUARIO_ACTUAL?.id || null,
  };
  const { data, error } = await _db
    .from('payroll_objetivo_cumplimientos')
    .insert(payload)
    .select()
    .maybeSingle();
  if (error) { console.error('[Payroll crearCumplimiento]', error.message); return { ok: false, error }; }
  return { ok: true, data };
}

async function borrarCumplimiento(cumplimientoId) {
  if (!cumplimientoId) return { ok: false, error: 'Falta cumplimientoId' };
  const { error } = await _db
    .from('payroll_objetivo_cumplimientos')
    .delete()
    .eq('cumplimiento_id', cumplimientoId);
  if (error) { console.error('[Payroll borrarCumplimiento]', error.message); return { ok: false, error }; }
  return { ok: true };
}

// ── Generación de liquidaciones del mes ──
async function generarLiquidacionesMes(yyyymm) {
  if (!yyyymm) return { ok: false, error: 'Falta yyyymm' };
  const { desde, hastaExclusive, desdeTs, hastaTsExclusive } = _payrollRangoMes(yyyymm);

  // Choferes con esquema (LEFT JOIN via 2 queries)
  const flota = await cargarPayrollSettingsFlota();
  const conEsquema = (flota || []).filter(f => f.settings);
  if (conEsquema.length === 0) {
    return { ok: true, creadas: 0, actualizadas: 0, saltadas: 0, detalle: [], nota: 'Ningún chofer tiene payroll_settings cargado' };
  }

  let creadas = 0, actualizadas = 0, saltadas = 0;
  const detalle = [];

  for (const chofer of conEsquema) {
    const driverId = chofer.user_id;
    const s = chofer.settings;

    // Query paralela: jornadas cerradas + remitos finalizados + cumplimientos + incidents.
    // Nota: remitos usa status IN ('pendiente','firmado','anulado'). Interpretamos
    // "finalizado" del mockup como los remitos ya firmados (no pendientes, no anulados).
    const [jornadasRes, remitosRes, cumplRes, incidRes, rendRes] = await Promise.all([
      _db.from('daily_logs')
        .select('log_id, log_date, km_inicio, km_final, status')
        .eq('driver_id', driverId)
        .eq('status', 'closed')
        .gte('log_date', desde)
        .lt('log_date', hastaExclusive),
      _db.from('remitos')
        .select('remito_id, created_at_device, status')
        .eq('driver_id', driverId)
        .eq('status', 'firmado')
        .gte('created_at_device', desdeTs)
        .lt('created_at_device', hastaTsExclusive),
      _db.from('payroll_objetivo_cumplimientos')
        .select('bonus_calculado')
        .eq('driver_id', driverId)
        .eq('periodo_yyyymm', yyyymm),
      _db.from('incidents')
        .select('incident_id, created_at_device')
        .eq('driver_id', driverId)
        .gte('created_at_device', desdeTs)
        .lt('created_at_device', hastaTsExclusive),
      _db.from('rendicion_cierre')
        .select('efectivo_declarado, efectivo_esperado, gastos_extra, estado')
        .eq('driver_id', driverId)
        .neq('estado', 'rechazado')
        .gte('fecha', desde)
        .lt('fecha', hastaExclusive),
    ]);

    if (jornadasRes.error || remitosRes.error || cumplRes.error || incidRes.error || rendRes.error) {
      console.error('[Payroll generarLiquidaciones] error chofer', driverId,
        jornadasRes.error || remitosRes.error || cumplRes.error || incidRes.error || rendRes.error);
      detalle.push({ driverId, error: true });
      continue;
    }

    const jornadas = jornadasRes.data || [];
    const remitos  = remitosRes.data  || [];
    const cumpl    = cumplRes.data    || [];
    const incid    = incidRes.data    || [];
    const rendiciones = rendRes.data  || [];

    const km_total = jornadas.reduce((sum, j) => {
      const ki = Number(j.km_inicio) || 0;
      const kf = Number(j.km_final)  || 0;
      return sum + Math.max(0, kf - ki);
    }, 0);
    const servicios = remitos.length;
    const jornadasCount = jornadas.length;

    // Presentismo: sin incidents y con al menos una jornada.
    const presentismo_paga = (incid.length === 0 && jornadasCount > 0);

    const sueldo_basico    = Number(s.sueldo_basico)    || 0;
    const valor_km         = Number(s.valor_km)         || 0;
    const valor_servicio   = Number(s.valor_servicio)   || 0;
    const bono_presentismo = Number(s.bono_presentismo) || 0;

    const adic_km   = km_total  * valor_km;
    const adic_serv = servicios * valor_servicio;
    const bonos_objetivos = cumpl.reduce((sum, c) => sum + (Number(c.bonus_calculado) || 0), 0);

    // Arqueo NETO mensual (alineado con el PDF de rendición mensual):
    // diff_mes = Σ (declarado + gastos_extra − esperado). Sobrantes compensan faltantes.
    // Solo descuenta el faltante neto del mes si supera la tolerancia.
    const diffMes = rendiciones.reduce((sum, r) => {
      const declarado = Number(r.efectivo_declarado) || 0;
      const esperado  = Number(r.efectivo_esperado)  || 0;
      const gastos    = Number(r.gastos_extra)       || 0;
      return sum + (declarado + gastos - esperado);
    }, 0);
    const faltanteNeto = Math.max(0, -diffMes);
    const ajuste_rendiciones_calc = faltanteNeto >= PAYROLL_TOLERANCIA_RENDICION ? faltanteNeto : 0;

    // ¿Existe ya la liquidación? Si está 'pagada', NO pisamos.
    // Si está 'aprobada' → congelamos ajuste_rendiciones (snapshot).
    const existRes = await _db.from('payroll_liquidaciones')
      .select('liquidacion_id, estado, ajuste_rendiciones')
      .eq('driver_id', driverId)
      .eq('periodo_yyyymm', yyyymm)
      .maybeSingle();

    if (existRes.error) {
      console.error('[Payroll generarLiquidaciones] check exist', existRes.error.message);
      detalle.push({ driverId, error: true });
      continue;
    }

    if (existRes.data && existRes.data.estado === 'pagada') {
      saltadas++;
      detalle.push({ driverId, accion: 'saltada', motivo: 'pagada' });
      continue;
    }

    // Snapshot: si ya está aprobada, se preserva el ajuste guardado; si no, se recalcula.
    const ajuste_rendiciones = (existRes.data && existRes.data.estado === 'aprobada')
      ? (Number(existRes.data.ajuste_rendiciones) || 0)
      : ajuste_rendiciones_calc;

    const bruto =
      sueldo_basico +
      adic_km +
      adic_serv +
      (presentismo_paga ? bono_presentismo : 0) +
      bonos_objetivos;

    const total = Math.max(0, bruto - ajuste_rendiciones);

    const payload = {
      driver_id:        driverId,
      periodo_yyyymm:   yyyymm,
      jornadas:         jornadasCount,
      km_total,
      servicios,
      sueldo_basico,
      adic_km,
      adic_serv,
      presentismo_paga,
      bono_presentismo: presentismo_paga ? bono_presentismo : 0,
      bonos_objetivos,
      ajuste_rendiciones,
      total,
      // Trazabilidad: snapshots del esquema salarial en el momento de generar,
      // + quién y cuándo se emitió. Al reimprimir el recibo se puede reconstruir
      // la fórmula exacta ($/km, $/servicio) aunque el esquema cambie después.
      valor_km_snapshot:         valor_km,
      valor_servicio_snapshot:   valor_servicio,
      bono_presentismo_snapshot: bono_presentismo,
      generada_by:               PERFIL_USUARIO?.user_id || null,
      generada_at:               new Date().toISOString(),
    };

    if (existRes.data) {
      // update
      const { error: updErr } = await _db.from('payroll_liquidaciones')
        .update(payload)
        .eq('liquidacion_id', existRes.data.liquidacion_id);
      if (updErr) {
        console.error('[Payroll generarLiquidaciones] update', updErr.message);
        detalle.push({ driverId, error: true });
        continue;
      }
      actualizadas++;
      detalle.push({ driverId, accion: 'actualizada', total });
    } else {
      // insert
      const { error: insErr } = await _db.from('payroll_liquidaciones')
        .insert({ ...payload, estado: 'pendiente' });
      if (insErr) {
        console.error('[Payroll generarLiquidaciones] insert', insErr.message);
        detalle.push({ driverId, error: true });
        continue;
      }
      creadas++;
      detalle.push({ driverId, accion: 'creada', total });
    }
  }

  return { ok: true, creadas, actualizadas, saltadas, detalle };
}

// ── Cruce efectivos vs. rendicion_cierre ──
async function cargarEfectivosValidacion(driverId, yyyymm) {
  if (!driverId || !yyyymm) return [];
  const { desde, hastaExclusive, desdeTs, hastaTsExclusive } = _payrollRangoMes(yyyymm);

  const [remitosRes, rendRes] = await Promise.all([
    _db.from('remitos')
      .select('remito_id, nro_remito, created_at_device, pago_1_metodo, pago_1_monto, pago_2_metodo, pago_2_monto, status')
      .eq('driver_id', driverId)
      .neq('status', 'anulado')
      .gte('created_at_device', desdeTs)
      .lt('created_at_device', hastaTsExclusive),
    _db.from('rendicion_cierre')
      .select('rendicion_id, fecha, efectivo_declarado, efectivo_esperado, estado')
      .eq('driver_id', driverId)
      .gte('fecha', desde)
      .lt('fecha', hastaExclusive)
      .neq('estado', 'rechazado'),
  ]);
  if (remitosRes.error) { console.error('[Payroll cargarEfectivosValidacion] remitos', remitosRes.error.message); return []; }
  if (rendRes.error)    { console.error('[Payroll cargarEfectivosValidacion] rend',    rendRes.error.message); return []; }

  const remitos = remitosRes.data || [];
  const rendiciones = rendRes.data || [];

  // Filtrar remitos con algún cobro en efectivo
  const efectivos = remitos
    .map(r => {
      let monto = 0;
      if (r.pago_1_metodo === 'efectivo') monto += Number(r.pago_1_monto) || 0;
      if (r.pago_2_metodo === 'efectivo') monto += Number(r.pago_2_monto) || 0;
      const fecha = (r.created_at_device || '').slice(0, 10);
      return { remito_id: r.remito_id, nro_remito: r.nro_remito, fecha, monto };
    })
    .filter(x => x.monto > 0);

  // Agrupar remitos-efectivo por día → calculado del día
  const calcPorDia = {};
  efectivos.forEach(e => {
    calcPorDia[e.fecha] = (calcPorDia[e.fecha] || 0) + e.monto;
  });

  // Rendiciones por día
  const rendPorDia = {};
  rendiciones.forEach(r => {
    rendPorDia[r.fecha] = (rendPorDia[r.fecha] || 0) + (Number(r.efectivo_declarado) || 0);
  });

  const TOLERANCIA = 50;
  const items = [];
  Object.keys(calcPorDia).sort().forEach(fecha => {
    const calculado = calcPorDia[fecha];
    const declarado = rendPorDia[fecha];
    const remitosDelDia = efectivos.filter(e => e.fecha === fecha);
    const concepto = remitosDelDia.length === 1
      ? `Efectivo remito ${remitosDelDia[0].nro_remito}`
      : `Efectivo ${remitosDelDia.length} remitos`;

    if (declarado === undefined || declarado === null) {
      items.push({ fecha, concepto, calculado, declarado: null, delta: -calculado, estado: 'err' });
      return;
    }
    const delta = declarado - calculado;
    let estado = 'ok';
    if (Math.abs(delta) <= TOLERANCIA) estado = 'ok';
    else if (delta < 0)                estado = 'warn';
    else                                estado = 'ok'; // sobra: no marca alerta
    items.push({ fecha, concepto, calculado, declarado, delta, estado });
  });

  return items;
}

// ═══════════════════════════════════════════════════════════════════
// JORNADAS · VISTA ADMIN
// Listado consolidado de la flota con filtros, KPIs y detalle enriquecido.
// ═══════════════════════════════════════════════════════════════════

const _JORNADAS_ADMIN_TOLERANCIA_RENDICION = 500;

function _horasEntre(hi, hf) {
  if (!hi || !hf) return 0;
  const [h1, m1] = hi.split(':').map(Number);
  const [h2, m2] = hf.split(':').map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60; // cruza medianoche
  return mins / 60;
}

async function cargarJornadasAdmin(filtros = {}) {
  const {
    desde       = null,   // 'YYYY-MM-DD'
    hasta       = null,   // 'YYYY-MM-DD' inclusive
    driverId    = null,
    truckId     = null,
    estado      = null,   // 'open' | 'closed'
    q           = '',
    offset      = 0,
    limit       = 20,
    orderBy     = 'log_date',
    orderAsc    = false,
  } = filtros;

  let query = _db
    .from('daily_logs')
    .select(`
      log_id, driver_id, truck_id, log_date,
      km_inicio, km_final, km_recorridos,
      hora_inicio, hora_fin,
      in_workshop, workshop_detail,
      foto_km_inicio, foto_km_final,
      status, notas, created_at_device,
      chofer:users!driver_id(user_id, full_name, legajo),
      truck:trucks!truck_id(truck_id, plate, numero_interno, brand, model)
    `, { count: 'exact' })
    .order(orderBy, { ascending: orderAsc })
    .order('hora_inicio', { ascending: false })
    .range(offset, offset + limit - 1);

  if (desde)    query = query.gte('log_date', desde);
  if (hasta)    query = query.lte('log_date', hasta);
  if (driverId) query = query.eq('driver_id', driverId);
  if (truckId)  query = query.eq('truck_id', truckId);
  if (estado)   query = query.eq('status', estado);

  const { data: logs, error, count } = await query;
  if (error) { console.error('cargarJornadasAdmin:', error); return { data: [], total: 0 }; }

  const logIds = (logs || []).map(l => l.log_id);
  if (!logIds.length) return { data: [], total: count || 0 };

  const driverIds = [...new Set(logs.map(l => l.driver_id))];
  const truckIds  = [...new Set(logs.map(l => l.truck_id))];
  const fechaMin  = logs.reduce((m, l) => l.log_date < m ? l.log_date : m, logs[0].log_date);
  const fechaMax  = logs.reduce((m, l) => l.log_date > m ? l.log_date : m, logs[0].log_date);

  // Índice truck|fecha → log_id, para correlacionar fuel_records/tire_checks/rendicion
  // cuando esas tablas guardan datos sin log_id (caso real: chofer inserta sin log_id).
  const truckFechaToLogId = {};
  logs.forEach(l => { truckFechaToLogId[`${l.truck_id}|${l.log_date}`] = l.log_id; });

  const [remitosRes, incRes, fuelRes, tireRes, rendRes] = await Promise.all([
    // Servicios = remitos (la tabla trips no se usa)
    _db.from('remitos').select('log_id, status').in('log_id', logIds).neq('status', 'anulado'),
    _db.from('incidents').select('log_id, severity, type').in('log_id', logIds),
    // Fuel: correlacionar por truck_id + fuel_date (log_id suele venir NULL)
    _db.from('fuel_records')
       .select('log_id, truck_id, fuel_date, total_cost, liters')
       .in('truck_id', truckIds)
       .gte('fuel_date', fechaMin)
       .lte('fuel_date', fechaMax),
    // Tire: idem
    _db.from('tire_checks')
       .select('log_id, truck_id, check_date')
       .in('truck_id', truckIds)
       .gte('check_date', fechaMin)
       .lte('check_date', fechaMax),
    _db.from('rendicion_cierre')
       .select('driver_id, fecha, efectivo_declarado, efectivo_esperado, gastos_extra, admin_status')
       .in('driver_id', driverIds)
       .gte('fecha', fechaMin)
       .lte('fecha', fechaMax),
  ]);

  const cnt = {};
  logIds.forEach(id => cnt[id] = { servicios: 0, incidentes: 0, incGrave: false, combustible: 0, litros: 0, revision: false });

  const resolverLogId = (r, fechaField) => {
    if (r.log_id && cnt[r.log_id]) return r.log_id;
    return truckFechaToLogId[`${r.truck_id}|${r[fechaField]}`] || null;
  };

  (remitosRes.data || []).forEach(r => { if (cnt[r.log_id]) cnt[r.log_id].servicios++; });
  (incRes.data     || []).forEach(r => {
    if (!cnt[r.log_id]) return;
    cnt[r.log_id].incidentes++;
    if (r.severity === 'grave') cnt[r.log_id].incGrave = true;
  });
  (fuelRes.data    || []).forEach(r => {
    const lid = resolverLogId(r, 'fuel_date');
    if (!lid || !cnt[lid]) return;
    cnt[lid].combustible++;
    cnt[lid].litros += Number(r.liters) || 0;
  });
  (tireRes.data    || []).forEach(r => {
    const lid = resolverLogId(r, 'check_date');
    if (!lid || !cnt[lid]) return;
    cnt[lid].revision = true;
  });

  const rendMap = {};
  (rendRes.data || []).forEach(r => { rendMap[`${r.driver_id}|${r.fecha}`] = r; });

  const rows = (logs || []).map(l => {
    const c = cnt[l.log_id] || {};
    const rend = rendMap[`${l.driver_id}|${l.log_date}`];
    let rendInfo = null;
    if (rend) {
      const declarado = Number(rend.efectivo_declarado) || 0;
      const esperado  = Number(rend.efectivo_esperado)  || 0;
      const gastos    = Number(rend.gastos_extra)       || 0;
      const diff = declarado - (esperado - gastos);
      let estadoR = 'ok';
      if (diff < -_JORNADAS_ADMIN_TOLERANCIA_RENDICION) estadoR = 'faltante';
      else if (diff > _JORNADAS_ADMIN_TOLERANCIA_RENDICION) estadoR = 'sobrante';
      rendInfo = { estado: estadoR, diff, declarado, esperado, gastos, admin_status: rend.admin_status };
    }

    return {
      log_id:       l.log_id,
      driver_id:    l.driver_id,
      truck_id:     l.truck_id,
      log_date:     l.log_date,
      km_inicio:    l.km_inicio,
      km_final:     l.km_final,
      km_recorridos: l.km_recorridos,
      hora_inicio:  l.hora_inicio,
      hora_fin:     l.hora_fin,
      horas:        _horasEntre(l.hora_inicio, l.hora_fin),
      in_workshop:  l.in_workshop,
      status:       l.status,
      foto_km_inicio: l.foto_km_inicio,
      foto_km_final:  l.foto_km_final,
      chofer_nombre: l.chofer?.full_name || '—',
      chofer_legajo: l.chofer?.legajo || null,
      truck_plate:  l.truck?.plate || '—',
      truck_movil:  l.truck?.numero_interno || null,
      truck_marca:  [l.truck?.brand, l.truck?.model].filter(Boolean).join(' ') || null,
      servicios:    c.servicios || 0,
      incidentes:   c.incidentes || 0,
      inc_grave:    c.incGrave || false,
      combustible:  c.combustible || 0,
      revision:     c.revision || false,
      rendicion:    rendInfo,
    };
  });

  return { data: rows, total: count || 0 };
}

async function cargarKpisJornadasAdmin(filtros = {}) {
  const { desde = null, hasta = null, driverId = null, truckId = null } = filtros;

  const withRange = (q) => {
    if (desde)    q = q.gte('log_date', desde);
    if (hasta)    q = q.lte('log_date', hasta);
    if (driverId) q = q.eq('driver_id', driverId);
    if (truckId)  q = q.eq('truck_id', truckId);
    return q;
  };

  const [abiertasRes, choferesRes, mesRes, tallerRes] = await Promise.all([
    _db.from('daily_logs').select('log_id', { count: 'exact', head: true }).eq('status', 'open'),
    _db.from('users').select('user_id, roles!inner(name)', { count: 'exact', head: true }).eq('roles.name', 'chofer'),
    withRange(_db.from('daily_logs').select('log_id, km_recorridos, hora_inicio, hora_fin, in_workshop')),
    withRange(_db.from('daily_logs').select('log_id', { count: 'exact', head: true }).eq('in_workshop', true)),
  ]);

  const jornadas = mesRes.data || [];
  const kmTotal    = jornadas.reduce((s, j) => s + (Number(j.km_recorridos) || 0), 0);
  const horasTotal = jornadas.reduce((s, j) => s + _horasEntre(j.hora_inicio, j.hora_fin), 0);

  return {
    abiertasAhora: abiertasRes.count || 0,
    choferesActivos: choferesRes.count || 0,
    jornadasPeriodo: jornadas.length,
    kmTotalPeriodo: kmTotal,
    horasTotalPeriodo: horasTotal,
    tallerPeriodo: tallerRes.count || 0,
    promKmJornada:   jornadas.length ? Math.round(kmTotal / jornadas.length)   : 0,
    promHorasJornada: jornadas.length ? (horasTotal / jornadas.length).toFixed(1) : '0',
    pctTaller: jornadas.length ? ((tallerRes.count || 0) / jornadas.length * 100).toFixed(1) : '0',
  };
}

async function cargarDetalleJornadaAdmin(logId) {
  if (!logId) return null;

  const { data: log, error: logErr } = await _db
    .from('daily_logs')
    .select(`
      log_id, driver_id, truck_id, log_date,
      km_inicio, km_final, km_recorridos, km_excepcion,
      hora_inicio, hora_fin,
      in_workshop, workshop_detail,
      foto_km_inicio, foto_km_final,
      status, notas, created_at_device,
      chofer:users!driver_id(user_id, full_name, legajo),
      truck:trucks!truck_id(truck_id, plate, numero_interno, brand, model)
    `)
    .eq('log_id', logId)
    .single();

  if (logErr || !log) { console.error('cargarDetalleJornadaAdmin:', logErr); return null; }

  // Fuel y tire pueden guardarse con log_id=NULL — filtramos por truck_id + fecha.
  const [remitosRes, incRes, fuelRes, tireRes, rendRes] = await Promise.all([
    _db.from('remitos')
       .select(`
         remito_id, nro_remito, nro_servicio, tipo_servicio, patente, marca_modelo,
         razon_social, origen, destino, km_reales,
         imp_peaje, imp_excedente, imp_otros, imp_total_extras,
         pago_1_metodo, pago_1_monto, pago_2_metodo, pago_2_monto,
         foto_urls, firma_imagen_url, firmado_at,
         conformidad_servicio, conformidad_cargos, sin_danos, conformidad_arrastre,
         status, created_at_device
       `)
       .eq('log_id', logId)
       .neq('status', 'anulado')
       .order('created_at_device', { ascending: true }),
    _db.from('incidents')
       .select('incident_id, type, severity, description, location, photo_urls, created_at_device')
       .eq('log_id', logId)
       .order('created_at_device', { ascending: true }),
    _db.from('fuel_records')
       .select('fuel_id, log_id, liters, price_per_liter, total_cost, km_at_load, payment_method, payment_app, gas_station, fuel_date, created_at_device')
       .eq('truck_id', log.truck_id)
       .eq('fuel_date', log.log_date),
    _db.from('tire_checks')
       .select('check_id, log_id, tire_condition, brake_condition, pressure_psi, notes, check_date, created_at')
       .eq('truck_id', log.truck_id)
       .eq('check_date', log.log_date)
       .order('created_at', { ascending: false })
       .limit(1),
    _db.from('rendicion_cierre')
       .select('*')
       .eq('driver_id', log.driver_id)
       .eq('fecha', log.log_date)
       .maybeSingle(),
  ]);

  let rendicionInfo = null;
  if (rendRes.data) {
    const r = rendRes.data;
    const declarado = Number(r.efectivo_declarado) || 0;
    const esperado  = Number(r.efectivo_esperado)  || 0;
    const gastos    = Number(r.gastos_extra)       || 0;
    const diff = declarado - (esperado - gastos);
    let estadoR = 'ok';
    if (diff < -_JORNADAS_ADMIN_TOLERANCIA_RENDICION) estadoR = 'faltante';
    else if (diff > _JORNADAS_ADMIN_TOLERANCIA_RENDICION) estadoR = 'sobrante';
    rendicionInfo = { ...r, diff, estado: estadoR };
  }

  // Mapear remitos → forma esperada por el renderer del modal (origin/destination/km_traveled)
  const trips = (remitosRes.data || []).map(r => {
    const p1 = Number(r.pago_1_monto) || 0;
    const p2 = Number(r.pago_2_monto) || 0;
    const extras = Number(r.imp_total_extras) || 0;
    return {
      trip_id:              r.remito_id,
      nro_remito:           r.nro_remito,
      nro_servicio:         r.nro_servicio || r.nro_remito,
      tipo_servicio:        r.tipo_servicio,
      origin:               r.origen,
      destination:          r.destino,
      patente:              r.patente,
      marca_modelo:         r.marca_modelo,
      razon_social:         r.razon_social,
      km_traveled:          r.km_reales,
      imp_peaje:            Number(r.imp_peaje) || 0,
      imp_excedente:        Number(r.imp_excedente) || 0,
      imp_otros:            Number(r.imp_otros) || 0,
      imp_total_extras:     extras,
      pago_1_metodo:        r.pago_1_metodo,
      pago_1_monto:         p1,
      pago_2_metodo:        r.pago_2_metodo,
      pago_2_monto:         p2,
      importe_total:        p1 + p2,
      foto_urls:            r.foto_urls || [],
      firma_imagen_url:     r.firma_imagen_url,
      firmado_at:           r.firmado_at,
      conformidad_servicio: !!r.conformidad_servicio,
      conformidad_cargos:   !!r.conformidad_cargos,
      sin_danos:            !!r.sin_danos,
      conformidad_arrastre: r.conformidad_arrastre,
      status:               r.status,
      fecha_hora_inicio:    r.created_at_device,
      fecha_hora_fin:       null,
    };
  });

  return {
    log,
    trips,
    incidents:    incRes.data   || [],
    fuel_records: fuelRes.data  || [],
    tire_check:   tireRes.data?.[0] || null,
    rendicion:    rendicionInfo,
  };
}

async function cargarChoferesFlotaAdmin() {
  const { data, error } = await _db
    .from('users')
    .select('user_id, full_name, legajo, roles!inner(name)')
    .eq('roles.name', 'chofer')
    .order('full_name', { ascending: true });
  if (error) { console.error('cargarChoferesFlotaAdmin:', error); return []; }
  return data || [];
}
