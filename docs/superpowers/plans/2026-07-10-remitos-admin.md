# Remitos admin: hub con KPIs + detalle completo editable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El admin ve KPIs sobre la lista de remitos existente y, al abrir un remito, un detalle con TODOS los campos de la base, editable por grupos con registro de cada cambio en `historial_ediciones`.

**Architecture:** Vanilla JS SPA sin build. Se reutiliza la lista de remitos existente (que el admin ya ve completa con filtros server-side); se agrega una franja de KPIs calculada con `fetchRemitosFiltrados` (ya existe). El detalle admin es un modal NUEVO (`modal-remito-admin`) renderizado dinámicamente desde una config de grupos; el modal actual del chofer (`modal-ver-remito`) no se toca. La edición hace `UPDATE remitos` + append a `historial_ediciones` (jsonb, default `[]`).

**Tech Stack:** Vanilla JS, Supabase JS client (`_db`), service worker con caché versionada.

**Testing:** NO hay framework de tests. Verificación manual en navegador (login admin/supervision/chofer) + `node --check` para sintaxis. Cada task tiene pasos de verificación.

**Spec:** `docs/superpowers/specs/2026-07-10-remitos-admin-design.md`
**Mockup aprobado:** `mockup_remitos_admin.html`

**Contexto clave del codebase (leer antes de empezar):**
- `supabase.js:465-498` — `_mapRemitoRow(r)`: mapea fila DB → objeto de UI (le falta `remito_id`)
- `supabase.js:514+` — `_buildRemitosQuery({filtros})`: select `*, users(full_name)`, filtros driverId/patente/tipoServicio/pagoMetodo/estado/periodo/buscar; chofer forzado a sus remitos
- `supabase.js:567-632` — `cargarRemitos(opts)`: paginada (50), llama `renderTablaRemitos` (sigma.js:6315)
- `supabase.js:638+` — `fetchRemitosFiltrados({filtros, max})`: trae hasta 5000 filas mapeadas con los mismos filtros — **usar esto para KPIs**
- `sigma.js:1555-1577` — `_leerFiltrosRemitosUI()` y `aplicarFiltrosRemitos()`
- `sigma.js:1782+` — `verRemitoModal(elemento)`: abre el modal actual leyendo `data-rem` (JSON del objeto mapeado)
- `sigma.js:265-267` — al entrar a la sección remitos: `showRemitosView('lista'); cargarRemitos();`
- `Index.html:3023-3141` — `modal-ver-remito` (NO tocar)
- `openModal(id)` / `closeModal(id)` / `toast(msg, tipo)` — globales
- Roles: `PERFIL_USUARIO?.roles?.name` → 'administracion' | 'supervision' | 'chofer'
- DB real: `imp_total_extras` es columna **GENERADA** (peaje+excedente+otros) → NUNCA incluirla en un UPDATE. `historial_ediciones` jsonb default `[]`. Métodos de pago en minúscula: 'efectivo','transferencia','tarjeta','app'.

---

### Task 1: Backend de datos en supabase.js — id en el mapeo, detalle completo y update con historial

**Files:**
- Modify: `supabase.js:465-498` (`_mapRemitoRow`)
- Modify: `supabase.js` — agregar 2 funciones después de `fetchRemitosFiltrados` (~línea 650)

- [ ] **Step 1: Agregar campos al mapeo de filas**

En `_mapRemitoRow` (supabase.js:466), agregar como PRIMERAS líneas del objeto retornado:

```javascript
    id:            r.remito_id,
    fotosCount:    Array.isArray(r.foto_urls) ? r.foto_urls.length : 0,
```

- [ ] **Step 2: Agregar función de detalle completo**

Después de `fetchRemitosFiltrados` (busca su cierre `}` ~línea 650), agregar:

```javascript
// ── Detalle completo de un remito (vista admin) ─────────────────
async function obtenerRemitoCompleto(remitoId) {
  const { data, error } = await _db
    .from('remitos')
    .select('*, users(full_name), daily_logs(log_date, trucks(numero_interno, plate))')
    .eq('remito_id', remitoId)
    .single();
  if (error) { console.error('❌ obtenerRemitoCompleto:', error); return null; }
  return data;
}

// Update de campos editados por admin + registro en historial_ediciones.
// `updates` = { col: nuevoValor }, `entradaHistorial` = objeto {fecha, user_id, user_nombre, cambios}.
async function actualizarRemitoAdmin(remitoId, updates, entradaHistorial, historialPrevio) {
  const historial = Array.isArray(historialPrevio) ? historialPrevio : [];
  const { error } = await _db
    .from('remitos')
    .update({ ...updates, historial_ediciones: [...historial, entradaHistorial] })
    .eq('remito_id', remitoId);
  if (error) { console.error('❌ actualizarRemitoAdmin:', error); return { ok: false, msg: error.message }; }
  return { ok: true };
}
```

- [ ] **Step 3: Verificar sintaxis**

Run: `node --check supabase.js` — Expected: sin salida (OK).

- [ ] **Step 4: Commit**

```bash
git add supabase.js
git commit -m "feat(remitos): id en mapeo, obtenerRemitoCompleto y actualizarRemitoAdmin"
```

---

### Task 2: HTML — franja de KPIs y modal de detalle admin

**Files:**
- Modify: `Index.html` — KPIs dentro de la vista `remitos-lista`, modal nuevo después de `modal-ver-remito` (línea ~3141)

- [ ] **Step 1: Ubicar la vista de lista**

Buscar en Index.html el elemento `id="remitos-lista"`. Los KPIs van como PRIMER hijo, antes de los filtros/tabla existentes.

- [ ] **Step 2: Agregar franja de KPIs (oculta por defecto)**

```html
<!-- KPIs de remitos: solo admin/supervisión (se muestra por JS) -->
<div id="remitos-kpis" style="display:none;gap:12px;flex-wrap:wrap;margin-bottom:14px">
  <div style="flex:1;min-width:140px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
    <div style="font-size:20px;font-weight:800" id="rkpi-cantidad">—</div>
    <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:2px">Remitos del período</div>
  </div>
  <div style="flex:1;min-width:140px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
    <div style="font-size:20px;font-weight:800" id="rkpi-facturado">—</div>
    <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:2px">Facturado</div>
  </div>
  <div style="flex:1;min-width:140px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
    <div style="font-size:20px;font-weight:800" id="rkpi-km">—</div>
    <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:2px">KM facturados</div>
  </div>
  <div style="flex:1;min-width:140px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
    <div style="font-size:20px;font-weight:800;color:var(--red)" id="rkpi-incompletos">—</div>
    <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:2px">Con datos incompletos</div>
  </div>
</div>
```

- [ ] **Step 3: Agregar el modal de detalle admin**

Inmediatamente después del cierre de `modal-ver-remito` (línea ~3141), agregar:

```html
<!-- Modal: detalle COMPLETO de remito para admin/supervisión -->
<div class="modal-backdrop" id="modal-remito-admin">
  <div class="modal-box wide" style="max-width:640px">
    <div class="modal-head">
      <div>
        <span class="modal-head-title" id="ra-titulo">📄 REMITO</span>
        <div style="font-size:11px;color:var(--muted2);margin-top:4px" id="ra-sub">—</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="pill" id="ra-estado-pill">—</span>
        <button class="modal-close" onclick="closeModal('modal-remito-admin')">×</button>
      </div>
    </div>
    <div class="modal-body" id="ra-body" style="max-height:70vh;overflow-y:auto"></div>
    <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeModal('modal-remito-admin')">Cerrar</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Verificar**

Abrir Index.html en navegador; en consola: `!!document.getElementById('modal-remito-admin') && !!document.getElementById('remitos-kpis')` → `true`. Sin errores de parseo.

- [ ] **Step 5: Commit**

```bash
git add Index.html
git commit -m "feat(remitos): HTML de KPIs admin y modal de detalle completo"
```

---

### Task 3: KPIs en sigma.js

**Files:**
- Modify: `sigma.js` — nueva función cerca de `renderTablaRemitos` (~línea 6310) + 2 llamadas de integración

- [ ] **Step 1: Agregar la función de KPIs**

Antes de `renderTablaRemitos` (sigma.js:6315), agregar:

```javascript
// ── KPIs de remitos (admin/supervisión) ─────────────────────────
// Usa fetchRemitosFiltrados (mismos filtros que la lista, sin paginar).
function _remitoIncompleto(r) {
  const sinFirma = r.estado !== 'anulado' && !r.firmaUrl;
  return !r.telefono || r.km === '—' || !r.fotosCount || sinFirma;
}

async function actualizarKpisRemitos() {
  const rol = PERFIL_USUARIO?.roles?.name;
  const cont = document.getElementById('remitos-kpis');
  if (!cont) return;
  if (rol !== 'administracion' && rol !== 'supervision') { cont.style.display = 'none'; return; }
  cont.style.display = 'flex';

  const filas = await fetchRemitosFiltrados({ filtros: window._remitosFiltros || {} });
  const activos = filas.filter(r => r.estado !== 'anulado');

  const facturado = activos.reduce((s, r) =>
    s + (parseInt(r.peaje) || 0) + (parseInt(r.excedente) || 0) + (parseInt(r.otros) || 0), 0);
  const km = activos.reduce((s, r) => s + (parseInt(r.km) || 0), 0);
  const incompletos = activos.filter(_remitoIncompleto).length;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('rkpi-cantidad',    activos.length);
  set('rkpi-facturado',   '$ ' + facturado.toLocaleString('es-AR'));
  set('rkpi-km',          km.toLocaleString('es-AR') + ' km');
  set('rkpi-incompletos', incompletos);
}
```

**Nota:** "Facturado" = suma de extras (peaje+excedente+otros). Los montos de pago (`pago_1_monto`/`pago_2_monto`) no están en el mapeo de la lista; si el dueño quisiera el total cobrado, es un cambio posterior.

- [ ] **Step 2: Integrar las llamadas**

(a) En sigma.js:265-267, dentro del `if (name === 'remitos')`, después de `cargarRemitos();` agregar:

```javascript
    actualizarKpisRemitos();
```

(b) En `aplicarFiltrosRemitos()` (sigma.js:1570-1577), después de la llamada a `cargarRemitos(...)` agregar:

```javascript
  actualizarKpisRemitos();
```

- [ ] **Step 3: Verificar**

`node --check sigma.js` OK. En navegador como admin: entrar a Remitos → se ven 4 KPIs con números coherentes; cambiar un filtro (ej. estado) → KPIs se actualizan. Como chofer: los KPIs NO aparecen.

- [ ] **Step 4: Commit**

```bash
git add sigma.js
git commit -m "feat(remitos): KPIs del período para admin/supervisión"
```

---

### Task 4: Detalle completo — render de solo lectura

**Files:**
- Modify: `sigma.js` — bloque nuevo después de `verRemitoModal` (busca su cierre, ~línea 1900) + intercepción en `verRemitoModal`

- [ ] **Step 1: Interceptar la apertura para admin/supervisión**

En `verRemitoModal(elemento)` (sigma.js:1782), inmediatamente después de obtener `d` y validar que no sea null (después del bloque `if (!d) {...}`), agregar:

```javascript
    // Admin/supervisión ven el detalle completo en su propio modal
    const _rol = PERFIL_USUario?.roles?.name;
    if ((_rol === 'administracion' || _rol === 'supervision') && d.id) {
      abrirDetalleRemitoAdmin(d.id);
      return;
    }
```

**OJO:** `PERFIL_USUario` de arriba es un typo intencional para que lo detectes: escribí `PERFIL_USUARIO` (todo mayúsculas) en el código real.

- [ ] **Step 2: Agregar config de grupos y render**

Después del cierre de `verRemitoModal`, agregar:

```javascript
// ═══════════════════════════════════════════════════════════════
// DETALLE COMPLETO DE REMITO (admin/supervisión) + edición por grupos
// ═══════════════════════════════════════════════════════════════

let _raRemito = null;        // fila completa de la DB del remito abierto
let _raGrupoEditando = null; // id del grupo en modo edición (uno a la vez)

const _RA_PAGOS = ['', 'efectivo', 'transferencia', 'tarjeta', 'app'];

const _RA_GRUPOS = [
  { id: 'servicio', titulo: '🚗 Servicio', editable: true, campos: [
    { col: 'nro_servicio',   label: 'Nro de servicio', tipo: 'text' },
    { col: 'tipo_servicio',  label: 'Tipo de servicio', tipo: 'text' },
    { col: 'patente',        label: 'Patente', tipo: 'text' },
    { col: 'marca_modelo',   label: 'Marca / modelo', tipo: 'text' },
    { col: 'cliente_presente', label: 'Cliente presente', tipo: 'bool' },
  ]},
  { id: 'cliente', titulo: '👤 Cliente', editable: true, campos: [
    { col: 'razon_social',  label: 'Razón social', tipo: 'text' },
    { col: 'cuit',          label: 'CUIT', tipo: 'text' },
    { col: 'telefono',      label: 'Teléfono', tipo: 'text' },
    { col: 'email_cliente', label: 'Email', tipo: 'text' },
  ]},
  { id: 'recorrido', titulo: '📍 Recorrido', editable: true, campos: [
    { col: 'origen',    label: 'Origen', tipo: 'text' },
    { col: 'destino',   label: 'Destino', tipo: 'text' },
    { col: 'km_reales', label: 'KM reales del servicio', tipo: 'number' },
  ]},
  { id: 'importes', titulo: '💳 Importes y pago', editable: true, campos: [
    { col: 'imp_peaje',     label: 'Peaje', tipo: 'number' },
    { col: 'imp_excedente', label: 'Excedente', tipo: 'number' },
    { col: 'imp_otros',     label: 'Otros', tipo: 'number' },
    { col: 'imp_total_extras', label: 'Total extras', tipo: 'number', soloLectura: true },
    { col: 'pago_1_metodo', label: 'Pago 1 — método', tipo: 'pago' },
    { col: 'pago_1_monto',  label: 'Pago 1 — monto', tipo: 'number' },
    { col: 'pago_2_metodo', label: 'Pago 2 — método', tipo: 'pago' },
    { col: 'pago_2_monto',  label: 'Pago 2 — monto', tipo: 'number' },
  ]},
  { id: 'conformidades', titulo: '☑️ Conformidades', editable: true, campos: [
    { col: 'conformidad_servicio', label: 'Conformidad del servicio', tipo: 'bool' },
    { col: 'conformidad_cargos',   label: 'Conformidad de cargos', tipo: 'bool' },
    { col: 'sin_danos',            label: 'Sin daños', tipo: 'bool' },
    { col: 'conformidad_arrastre', label: 'Conformidad de arrastre', tipo: 'bool' },
  ]},
  { id: 'observaciones', titulo: '📝 Observaciones', editable: true, campos: [
    { col: 'observaciones', label: 'Observaciones', tipo: 'textarea' },
  ]},
];

function _raEsAdmin() { return PERFIL_USUARIO?.roles?.name === 'administracion'; }

function _raEscape(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Valor legible de un campo (solo lectura). Vacío → "— sin cargar" en rojo.
function _raValorHTML(campo, r) {
  const v = r[campo.col];
  const vacioHTML = '<span style="color:var(--red);font-style:italic;font-weight:400">— sin cargar</span>';
  if (campo.tipo === 'bool') {
    if (v === true)  return '<span style="color:var(--green);font-weight:600">✓ Sí</span>';
    if (v === false) return '<span style="color:var(--red);font-weight:600">✗ No</span>';
    return vacioHTML;
  }
  if (v === null || v === undefined || v === '') return vacioHTML;
  if (campo.tipo === 'number') {
    const n = Number(v);
    return campo.col.startsWith('imp_') || campo.col.endsWith('_monto')
      ? '$ ' + n.toLocaleString('es-AR')
      : n.toLocaleString('es-AR') + (campo.col === 'km_reales' ? ' km' : '');
  }
  if (campo.tipo === 'pago') return _raEscape(String(v).charAt(0).toUpperCase() + String(v).slice(1));
  return _raEscape(v);
}

// Input de edición para un campo
function _raInputHTML(campo, r) {
  const v = r[campo.col];
  const idInput = `ra-in-${campo.col}`;
  const base = 'width:100%;background:var(--bg);color:var(--text);border:1px solid var(--border2);border-radius:7px;padding:8px 10px;font-size:12px;font-family:inherit';
  if (campo.tipo === 'bool') {
    return `<select id="${idInput}" style="${base}">
      <option value="" ${v === null || v === undefined ? 'selected' : ''}>—</option>
      <option value="true" ${v === true ? 'selected' : ''}>Sí</option>
      <option value="false" ${v === false ? 'selected' : ''}>No</option>
    </select>`;
  }
  if (campo.tipo === 'pago') {
    return `<select id="${idInput}" style="${base}">` +
      _RA_PAGOS.map(p => `<option value="${p}" ${String(v || '') === p ? 'selected' : ''}>${p ? p.charAt(0).toUpperCase() + p.slice(1) : '— sin pago'}</option>`).join('') +
      `</select>`;
  }
  if (campo.tipo === 'textarea') {
    return `<textarea id="${idInput}" rows="3" style="${base};resize:vertical">${_raEscape(v)}</textarea>`;
  }
  if (campo.tipo === 'number') {
    return `<input id="${idInput}" type="number" value="${v ?? ''}" style="${base}">`;
  }
  return `<input id="${idInput}" type="text" value="${_raEscape(v)}" style="${base}">`;
}

function _raGrupoHTML(g, r) {
  const editando = _raGrupoEditando === g.id;
  const btnEditar = g.editable && _raEsAdmin() && !editando
    ? `<button class="btn btn-ghost" style="padding:2px 10px;font-size:10px" onclick="_raEditar('${g.id}')">✏️ Editar</button>` : '';
  const botonesEdicion = editando
    ? `<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
         <button class="btn btn-ghost" style="font-size:11px" onclick="_raCancelar()">Cancelar</button>
         <button class="btn btn-primary" style="font-size:11px" onclick="_raGuardar('${g.id}')">Guardar</button>
       </div>` : '';

  const filas = g.campos.map(c => {
    const esEditable = editando && !c.soloLectura;
    return `<span style="color:var(--muted)">${c.label}</span>
            <span style="font-weight:600">${esEditable ? _raInputHTML(c, r) : _raValorHTML(c, r)}</span>`;
  }).join('');

  return `
    <div style="margin-bottom:18px" id="ra-grupo-${g.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding-bottom:5px;margin-bottom:8px">
        <span style="font-size:10px;color:var(--amber);text-transform:uppercase;letter-spacing:1.5px;font-weight:700">${g.titulo}</span>
        ${btnEditar}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;font-size:12px">${filas}</div>
      ${botonesEdicion}
    </div>`;
}

function _raFotosHTML(r) {
  const fotos = Array.isArray(r.foto_urls) ? r.foto_urls : [];
  const cuerpo = fotos.length
    ? `<div style="display:flex;gap:8px;flex-wrap:wrap">` + fotos.map(u =>
        `<img src="${_raEscape(u)}" onclick="window.open('${_raEscape(u)}','_blank')"
           style="width:74px;height:74px;object-fit:cover;border-radius:8px;border:1px solid var(--border2);cursor:pointer">`).join('') + `</div>`
    : '<span style="color:var(--red);font-style:italic;font-size:12px">— sin fotos cargadas</span>';
  return `
    <div style="margin-bottom:18px">
      <div style="font-size:10px;color:var(--amber);text-transform:uppercase;letter-spacing:1.5px;font-weight:700;border-bottom:1px solid var(--border);padding-bottom:5px;margin-bottom:8px">📷 Fotos del servicio (${fotos.length})</div>
      ${cuerpo}
    </div>`;
}

function _raFirmaHTML(r) {
  const cuerpo = r.firma_imagen_url
    ? `<img src="${_raEscape(r.firma_imagen_url)}" style="max-width:240px;background:#fff;border-radius:8px;padding:6px">
       <div style="font-size:11px;color:var(--muted);margin-top:6px">Firmado el ${r.firmado_at ? formatearFecha(r.firmado_at) : '—'}</div>`
    : '<span style="color:var(--red);font-style:italic;font-size:12px">— sin firma</span>';
  return `
    <div style="margin-bottom:18px">
      <div style="font-size:10px;color:var(--amber);text-transform:uppercase;letter-spacing:1.5px;font-weight:700;border-bottom:1px solid var(--border);padding-bottom:5px;margin-bottom:8px">✍️ Firma del cliente</div>
      ${cuerpo}
    </div>`;
}

function _raTrazabilidadHTML(r) {
  const hist = Array.isArray(r.historial_ediciones) ? r.historial_ediciones : [];
  const ediciones = hist.length
    ? hist.map(h => {
        const cambios = (h.cambios || []).map(c =>
          `<b>${_raEscape(c.campo)}</b>: ${_raEscape(c.antes ?? '—')} → ${_raEscape(c.despues ?? '—')}`).join(' · ');
        return `✏️ ${h.fecha ? formatearFecha(h.fecha) : '—'} — <b>${_raEscape(h.user_nombre || '¿?')}</b>: ${cambios}`;
      }).join('<br>')
    : 'Sin ediciones registradas';
  return `
    <div style="margin-bottom:6px">
      <div style="font-size:10px;color:var(--amber);text-transform:uppercase;letter-spacing:1.5px;font-weight:700;border-bottom:1px solid var(--border);padding-bottom:5px;margin-bottom:8px">🕓 Trazabilidad</div>
      <div style="font-size:11px;color:var(--muted);line-height:1.9">
        📱 Creado en el dispositivo: <b style="color:var(--text)">${r.created_at_device ? formatearFecha(r.created_at_device) : '—'}</b><br>
        ☁️ Recibido en el servidor: <b style="color:var(--text)">${r.received_at ? formatearFecha(r.received_at) : (r.created_at ? formatearFecha(r.created_at) : '—')}</b>${r.sync_status ? ` (${_raEscape(r.sync_status)})` : ''}<br>
        ${ediciones}
      </div>
    </div>`;
}

function _raRender() {
  const r = _raRemito;
  if (!r) return;

  document.getElementById('ra-titulo').textContent = `📄 ${r.nro_remito || '—'}`;
  const movil = r.daily_logs?.trucks ? ` · Móvil ${r.daily_logs.trucks.numero_interno || r.daily_logs.trucks.plate}` : '';
  const jornada = r.daily_logs?.log_date ? ` · Jornada del ${r.daily_logs.log_date.split('-').reverse().join('/')}` : '';
  document.getElementById('ra-sub').textContent =
    `Cargado por ${r.users?.full_name || '—'}${jornada}${movil}`;

  const pill = document.getElementById('ra-estado-pill');
  const est = r.status === 'firmado' ? ['pill-green', '✓ Firmado'] : r.status === 'anulado' ? ['pill-red', '🚫 Anulado'] : ['pill-amber', '⏳ Pendiente'];
  pill.className = `pill ${est[0]}`;
  pill.textContent = est[1];

  document.getElementById('ra-body').innerHTML =
    `<div style="padding:18px 22px">` +
    _RA_GRUPOS.map(g => _raGrupoHTML(g, r)).join('') +
    _raFotosHTML(r) +
    _raFirmaHTML(r) +
    _raTrazabilidadHTML(r) +
    `</div>`;
}

async function abrirDetalleRemitoAdmin(remitoId) {
  const r = await obtenerRemitoCompleto(remitoId);
  if (!r) { toast('No se pudo cargar el remito', 'error'); return; }
  _raRemito = r;
  _raGrupoEditando = null;
  _raRender();
  openModal('modal-remito-admin');
}
```

- [ ] **Step 3: Verificar**

`node --check sigma.js` OK. En navegador como admin: Remitos → clic "Ver" en un remito → se abre el modal nuevo con TODOS los grupos; teléfono/email vacíos se ven en rojo "— sin cargar"; fotos como miniaturas (clic abre en pestaña); firma visible; trazabilidad con fechas. Como chofer: clic "Ver" abre el modal VIEJO de siempre. Como supervisión: modal nuevo pero SIN botones ✏️ Editar.

- [ ] **Step 4: Commit**

```bash
git add sigma.js
git commit -m "feat(remitos): detalle completo admin con campos vacíos visibles"
```

---

### Task 5: Edición por grupos con historial

**Files:**
- Modify: `sigma.js` — agregar 3 funciones a continuación de `abrirDetalleRemitoAdmin`

- [ ] **Step 1: Agregar editar/cancelar/guardar**

```javascript
function _raEditar(grupoId) {
  if (!_raEsAdmin()) return;
  _raGrupoEditando = grupoId;
  _raRender();
}

function _raCancelar() {
  _raGrupoEditando = null;
  _raRender();
}

// Lee el valor tipado de un input de edición
function _raLeerInput(campo) {
  const el = document.getElementById(`ra-in-${campo.col}`);
  if (!el) return undefined;
  const raw = el.value;
  if (campo.tipo === 'bool')   return raw === '' ? null : raw === 'true';
  if (campo.tipo === 'number') return raw === '' ? null : Number(raw);
  if (campo.tipo === 'pago')   return raw === '' ? null : raw;
  return raw.trim() === '' ? null : raw.trim();
}

async function _raGuardar(grupoId) {
  if (!_raEsAdmin() || !_raRemito) return;
  const grupo = _RA_GRUPOS.find(g => g.id === grupoId);
  if (!grupo) return;

  // Diff: solo campos que cambiaron
  const updates = {};
  const cambios = [];
  grupo.campos.filter(c => !c.soloLectura).forEach(c => {
    const nuevo = _raLeerInput(c);
    if (nuevo === undefined) return;
    const actual = _raRemito[c.col] ?? null;
    const iguales = (c.tipo === 'number')
      ? Number(actual ?? NaN) === Number(nuevo ?? NaN) || (actual === null && nuevo === null)
      : actual === nuevo;
    if (!iguales) {
      updates[c.col] = nuevo;
      cambios.push({ campo: c.col, antes: actual, despues: nuevo });
    }
  });

  if (!cambios.length) { _raCancelar(); return; }

  const entrada = {
    fecha: new Date().toISOString(),
    user_id: USUARIO_ACTUAL?.id || null,
    user_nombre: PERFIL_USUARIO?.full_name || '—',
    cambios,
  };

  const res = await actualizarRemitoAdmin(_raRemito.remito_id, updates, entrada, _raRemito.historial_ediciones);
  if (!res.ok) { toast('No se pudo guardar: ' + res.msg, 'error'); return; }

  toast('Cambios guardados ✓');
  _raGrupoEditando = null;
  // Recargar el remito completo (imp_total_extras es columna generada: se recalcula en la DB)
  const r = await obtenerRemitoCompleto(_raRemito.remito_id);
  if (r) _raRemito = r;
  _raRender();
  // Refrescar lista y KPIs de fondo
  if (typeof cargarRemitos === 'function') cargarRemitos();
  if (typeof actualizarKpisRemitos === 'function') actualizarKpisRemitos();
}
```

- [ ] **Step 2: Verificar en navegador (admin)**

1. Abrir detalle → ✏️ Editar en "Cliente" → cargar un teléfono → Guardar → toast, el campo deja de estar en rojo
2. Trazabilidad ahora muestra la edición: fecha, tu nombre, `telefono: — → <valor>`
3. Editar "Importes": cambiar peaje → Total extras se recalcula solo (columna generada)
4. Editar sin cambiar nada → Guardar → vuelve a lectura sin registrar edición
5. Editar km_reales → Guardar → la fila de la lista de fondo se actualiza
6. Como supervisión: no hay botones Editar

- [ ] **Step 3: Verificar sintaxis y commit**

```bash
node --check sigma.js
git add sigma.js
git commit -m "feat(remitos): edición por grupos con registro en historial_ediciones"
```

---

### Task 6: Bump SW y deploy

**Files:**
- Modify: `sw.js:1`

- [ ] **Step 1: Subir versión**

```javascript
const CACHE_NAME = 'auxilios-v83'; // v83: remitos admin — KPIs y detalle completo editable
```

(si la versión actual ya no es v82, subir a la siguiente)

- [ ] **Step 2: Verificación final**

Recorrido completo como admin (KPIs + detalle + edición + trazabilidad), supervisión (ve todo, no edita) y chofer (pantalla y modal viejos intactos, wizard de remito funciona).

- [ ] **Step 3: Commit y push (deploy Vercel)**

```bash
git add sw.js
git commit -m "chore(sw): bump caché v83 — remitos admin"
git push
```

---

## Self-review

- **Cobertura de spec:** KPIs (T3), filtros ya existentes se reutilizan ✓, detalle con todos los grupos (T4), vacíos en rojo (T4 `_raValorHTML`), grupos editables exactos —Servicio/Cliente/Recorrido/Importes/Conformidades/Observaciones— y NO editables —Fotos/Firma/Trazabilidad— (config `_RA_GRUPOS` + render estático), historial con quién/cuándo/antes→después (T5), `imp_total_extras` nunca se escribe (soloLectura + excluido del diff), permisos admin/supervision/chofer (T3 KPIs, T4 intercepción y `_raEsAdmin`), SW bump (T6).
- **Placeholders:** ninguno; todo el código está en los steps.
- **Consistencia:** `obtenerRemitoCompleto`/`actualizarRemitoAdmin` (T1) usados en T4/T5; ids HTML `ra-*`/`rkpi-*` (T2) usados en T3/T4; `_raRemito.remito_id` viene del select `*` de T1.
- **Nota:** la fila de la tabla ya llega con `id` (T1 Step 1) — la intercepción de T4 depende de eso.
