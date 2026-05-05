# Config Panel Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the config panel layout (broken on desktop and mobile), complete CRUD on all tabs, and add logout.

**Architecture:** Pure frontend changes (HTML classes + CSS media query + JS functions) plus one DB migration to add `activo` column to `master_service_plans`. No new files — all changes go into existing `Index.html`, `sigma.css`, `sigma.js`, `supabase.js`.

**Tech Stack:** Vanilla JS, Supabase JS client (`_db` in supabase.js, `_db` also available in sigma.js via global), CSS custom properties, no build step.

---

## Files

| File | Changes |
|------|---------|
| `Index.html` | Add classes to sidebar divs; add `#btn-cerrar-sesion`; wrap tables in overflow containers |
| `sigma.css` | Add `@media (max-width: 680px)` block for config panel |
| `sigma.js` | Refactor `toggleEstadoVehiculo`; update `cargarTablaAdminFlota`, `cargarTablaAdminUsuarios`, `cargarTablaAdminPlanes`; add `abrirEditarUsuario`, `toggleEstadoUsuario`, `abrirEditarPlan`, `toggleEstadoPlan`; modify `guardarNuevoUsuario`, `guardarPlanGlobal` |
| `supabase.js` | Add `cerrarSesion()`; add `.eq('activo', true)` to `cargarCatalogoPlanes` |

---

## Task 1: DB Migration

**Files:** Supabase SQL Editor (manual step — no file edit)

- [ ] **Step 1: Run migration in Supabase**

Go to your Supabase project → SQL Editor → run:
```sql
ALTER TABLE master_service_plans ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;
```

Expected: "Success. No rows returned."

- [ ] **Step 2: Verify**

```sql
SELECT id, name, activo FROM master_service_plans LIMIT 5;
```

Expected: all rows show `activo = true`.

---

## Task 2: HTML — Sidebar classes + logout button

**Files:**
- Modify: `C:\Users\Remol\OneDrive\Desktop\ARCHIVOS VALENTIN\App_Sigma_Choferes\Index.html` lines ~1864-1926

- [ ] **Step 1: Add class `settings-sidebar` to the sidebar div**

Find:
```html
<div style="width: 250px; background: var(--bg-darker, #1a1d24); border-right: 1px solid var(--border); padding: 20px; display: flex; flex-direction: column; gap: 10px;">
```

Replace with:
```html
<div class="settings-sidebar" style="width: 250px; background: var(--bg-darker, #1a1d24); border-right: 1px solid var(--border); padding: 20px; display: flex; flex-direction: column; gap: 10px;">
```

- [ ] **Step 2: Add class `settings-header` to the title div**

Find:
```html
      <div style="margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid var(--border);">
        <h3 style="margin: 0; font-size: 16px;">⚙️ Configuración</h3>
        <span style="font-size: 11px; color: var(--muted);">Sigma Remolques</span>
      </div>
```

Replace with:
```html
      <div class="settings-header" style="margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid var(--border);">
        <h3 style="margin: 0; font-size: 16px;">⚙️ Configuración</h3>
        <button class="modal-close" onclick="closeModal('modal-settings')" style="display:none" id="btn-close-settings-mobile">×</button>
      </div>
```

- [ ] **Step 3: Wrap the bottom buttons in `settings-footer` and add logout**

Find:
```html
      <div style="flex-grow: 1;"></div>
      <button class="btn btn-ghost" style="width: 100%; color: var(--red);" onclick="closeModal('modal-settings')">Cerrar Panel</button>
```

Replace with:
```html
      <div style="flex-grow: 1;"></div>
      <div class="settings-footer" style="display: flex; flex-direction: column; gap: 6px;">
        <button class="btn btn-ghost" style="width: 100%;" onclick="closeModal('modal-settings')">Cerrar Panel</button>
        <button id="btn-cerrar-sesion" class="btn btn-ghost" style="width: 100%; color: var(--red);">🚪 Cerrar sesión</button>
      </div>
```

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\Remol\OneDrive\Desktop\ARCHIVOS VALENTIN\App_Sigma_Choferes"
git add Index.html
git commit -m "feat: sidebar classes + logout button en config panel"
```

---

## Task 3: CSS — Responsive layout

**Files:**
- Modify: `C:\Users\Remol\OneDrive\Desktop\ARCHIVOS VALENTIN\App_Sigma_Choferes\sigma.css` (append at end)

- [ ] **Step 1: Append the media query block**

Add at the very end of `sigma.css`:

```css
/* ── CONFIG PANEL RESPONSIVE ────────────────────────────── */
@media (max-width: 680px) {
  #modal-settings .modal-box {
    flex-direction: column;
    height: 100dvh;
    max-width: 100%;
    width: 100%;
    border-radius: 0;
    margin: 0;
  }

  #modal-settings .settings-sidebar {
    width: 100% !important;
    flex-direction: row !important;
    overflow-x: auto;
    border-right: none !important;
    border-bottom: 1px solid var(--border);
    padding: 0 8px !important;
    gap: 0 !important;
    flex-shrink: 0;
  }

  #modal-settings .settings-header {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 12px 16px !important;
    margin-bottom: 0 !important;
    padding-bottom: 12px !important;
    border-bottom: none !important;
  }

  #modal-settings .settings-header h3 { margin: 0; }
  #modal-settings #btn-close-settings-mobile { display: block !important; }

  #modal-settings .settings-footer {
    position: sticky;
    bottom: 0;
    background: var(--bg-darker, #1a1d24);
    border-top: 1px solid var(--border);
    flex-direction: column !important;
    gap: 6px !important;
    padding: 10px 12px !important;
    flex-shrink: 0;
  }

  #modal-settings .tab-config {
    white-space: nowrap;
    flex-shrink: 0;
    padding: 10px 14px;
    font-size: 12px;
    border-radius: 0;
    border-bottom: 2px solid transparent;
    border-left: none !important;
  }

  #modal-settings .tab-config.active {
    border-bottom: 2px solid var(--amber) !important;
    background: transparent !important;
    border-left: none !important;
  }

  #config-content-area {
    padding: 16px !important;
    flex: 1;
    overflow-y: auto;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add sigma.css
git commit -m "feat: config panel responsive - sidebar colapsa a tabs en mobile"
```

---

## Task 4: supabase.js — cerrarSesion + filtro activo en planes

**Files:**
- Modify: `C:\Users\Remol\OneDrive\Desktop\ARCHIVOS VALENTIN\App_Sigma_Choferes\supabase.js`

- [ ] **Step 1: Add `cerrarSesion` function**

Find the end of the file (or a logical block after `loginUsuario`). Search for `function loginUsuario` and insert AFTER the closing `}`:

```javascript
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
```

- [ ] **Step 2: Filter inactive plans in `cargarCatalogoPlanes`**

Find `cargarCatalogoPlanes` function. It contains a query like:
```javascript
.from('master_service_plans')
.select('id, name, trigger_type, interval_km, interval_hours, alert_before_km')
.order('name');
```

Add `.eq('activo', true)` before `.order('name')`:
```javascript
.from('master_service_plans')
.select('id, name, trigger_type, interval_km, interval_hours, alert_before_km')
.eq('activo', true)
.order('name');
```

- [ ] **Step 3: Commit**

```bash
git add supabase.js
git commit -m "feat: cerrarSesion + filtrar planes inactivos en catálogo"
```

---

## Task 5: sigma.js — Vehículos: guardia jornada + renombrar botón

**Files:**
- Modify: `C:\Users\Remol\OneDrive\Desktop\ARCHIVOS VALENTIN\App_Sigma_Choferes\sigma.js`

- [ ] **Step 1: Replace `toggleEstadoVehiculo` (currently lines ~7296-7311)**

Find:
```javascript
async function toggleEstadoVehiculo(truckId, estadoActual) {
    const nuevoEstado = estadoActual === 'active' ? 'inactive' : 'active';
    const accionTxt = nuevoEstado === 'active' ? 'activado' : 'suspendido';

    if (nuevoEstado === 'inactive' && !confirm('¿Estás seguro de que querés suspender esta unidad?')) return;

    toast('Actualizando estado...', 'success');
    const { error } = await _db.from('trucks').update({ status: nuevoEstado }).eq('truck_id', truckId);

    if (error) {
        toast(`Error: ${error.message}`, 'error');
    } else {
        toast(`Móvil ${accionTxt} correctamente`, 'success');
        cargarTablaAdminFlota(); // Recargamos la tabla para ver el cambio
    }
}
```

Replace with:
```javascript
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
```

- [ ] **Step 2: Update the status button in `cargarTablaAdminFlota` rows**

In `cargarTablaAdminFlota`, find the button:
```javascript
                            <button onclick="toggleEstadoVehiculo('${v.truck_id}', '${v.status}')" style="background: none; border: none; cursor: pointer; font-size: 16px;" title="${v.status === 'active' ? 'Suspender' : 'Activar'}">
                                ${v.status === 'active' ? '🛑' : '✅'}
                            </button>
```

Replace with:
```javascript
                            <button onclick="toggleEstadoVehiculo('${v.truck_id}', '${v.status}')"
                              style="font-size:11px;padding:5px 10px;border-radius:5px;cursor:pointer;border:1px solid;${v.status === 'active' ? 'background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.3)' : 'background:rgba(34,197,94,0.1);color:#22c55e;border-color:rgba(34,197,94,0.3)'}">
                              ${v.status === 'active' ? '🚫 Dar de baja' : '✅ Reactivar'}
                            </button>
```

- [ ] **Step 3: Wrap the flota table in overflow-x: auto**

In `cargarTablaAdminFlota`, find:
```javascript
    contenedor.innerHTML = `
        <div style="background: var(--bg-darker); border: 1px solid var(--border); border-radius: 8px; overflow: hidden;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
```

Replace:
```javascript
    contenedor.innerHTML = `
        <div style="overflow-x: auto">
        <div style="background: var(--bg-darker); border: 1px solid var(--border); border-radius: 8px; overflow: hidden;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
```

And close the extra div after `</table>`:
Find `        </div>\n    \`;\n}` at the end of `cargarTablaAdminFlota` and replace with:
```javascript
        </div>
        </div>
    `;
}
```

- [ ] **Step 4: Commit**

```bash
git add sigma.js
git commit -m "feat: vehículos - guardia jornada en baja + botón 'Dar de baja/Reactivar'"
```

---

## Task 6: sigma.js — Personal: Editar + Dar de baja

**Files:**
- Modify: `C:\Users\Remol\OneDrive\Desktop\ARCHIVOS VALENTIN\App_Sigma_Choferes\sigma.js`

- [ ] **Step 1: Declare global `usuarioEditandoId` near `vehiculoEditandoId`**

Find the line:
```javascript
let vehiculoEditandoId = null;
```

Add after it:
```javascript
let usuarioEditandoId = null;
```

- [ ] **Step 2: Add `abrirEditarUsuario` and `toggleEstadoUsuario` after `cargarTablaAdminUsuarios`**

Find the closing `}` of `cargarTablaAdminUsuarios` (after line ~7451) and insert:

```javascript
function abrirEditarUsuario(userId) {
  const u = _usuariosCache?.find(x => x.user_id === userId);
  if (!u) { toast('No se encontró el usuario', 'error'); return; }
  usuarioEditandoId = userId;
  document.getElementById('nu-nombre').value    = u.full_name || '';
  document.getElementById('nu-telefono').value  = u.phone || '';
  document.getElementById('nu-rol').value       = u.role || 'chofer';
  document.getElementById('nu-licencia').value  = u.license_number || '';
  document.getElementById('nu-vencimiento').value = u.license_expiry || '';
  // email y legajo son de solo lectura en edición
  const emailEl = document.getElementById('nu-email');
  const legajoEl = document.getElementById('nu-legajo');
  if (emailEl) { emailEl.value = u.email || ''; emailEl.disabled = true; }
  if (legajoEl) { legajoEl.value = u.dni || ''; legajoEl.disabled = true; }
  const titulo = document.querySelector('#modal-nuevo-usuario .modal-head-title');
  if (titulo) titulo.textContent = '✏️ Editar Personal';
  const btnGuardar = document.getElementById('btn-guardar-usuario');
  if (btnGuardar) btnGuardar.textContent = '💾 Actualizar';
  if (typeof toggleLicenciaSection === 'function') toggleLicenciaSection();
  const modal = document.getElementById('modal-nuevo-usuario');
  if (modal) { document.body.appendChild(modal); modal.style.zIndex = '10000000'; }
  openModal('modal-nuevo-usuario');
}

async function toggleEstadoUsuario(userId, estadoActual) {
  if (estadoActual === 'activo') {
    const { data } = await _db.from('daily_logs').select('log_id').eq('driver_id', userId).eq('status', 'open').maybeSingle();
    if (data) {
      alert('Este chofer tiene una jornada abierta. Cerrá la jornada antes de darlo de baja.');
      return;
    }
    if (!confirm('¿Dar de baja a este usuario? Sus datos se conservan.')) return;
  }
  const nuevoEstado = estadoActual === 'activo' ? 'inactivo' : 'activo';
  const { error } = await _db.from('users').update({ status: nuevoEstado }).eq('user_id', userId);
  if (error) { toast(`Error: ${error.message}`, 'error'); return; }
  toast(nuevoEstado === 'activo' ? 'Usuario reactivado' : 'Usuario dado de baja', 'success');
  cargarTablaAdminUsuarios();
}
```

- [ ] **Step 3: Update `cargarTablaAdminUsuarios` to store cache + add Edit/baja buttons**

In `cargarTablaAdminUsuarios`, find:
```javascript
  const { data: usuarios, error } = await _db
    .from('users')
    .select('*')
    .order('full_name', { ascending: true });
```

Replace with:
```javascript
  const { data: usuarios, error } = await _db
    .from('users')
    .select('*')
    .order('full_name', { ascending: true });
  if (usuarios) window._usuariosCache = usuarios;
```

Then find the existing `<td>` with the 🔑 button:
```javascript
          <td style="padding: 12px;">
            <button class="btn btn-ghost" style="font-size:11px;padding:5px 10px;white-space:nowrap"
              onclick="abrirResetPassword('${u.user_id}','${u.full_name.replace(/'/g,"\\'")}')">
              🔑 Contraseña
            </button>
          </td>
```

Replace with:
```javascript
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
```

Also wrap the table in overflow-x. Find:
```javascript
  contenedor.innerHTML = `
    <table style="width: 100%; border-collapse: collapse; text-align: left;">
```
Replace with:
```javascript
  contenedor.innerHTML = `<div style="overflow-x:auto"><table style="width: 100%; border-collapse: collapse; text-align: left;">
```
And find the closing:
```javascript
    </table>
```
that ends `cargarTablaAdminUsuarios` and replace with:
```javascript
    </table></div>
```

- [ ] **Step 4: Modify `guardarNuevoUsuario` to support edit mode**

In `guardarNuevoUsuario`, after the validation block and before the `fetch` call, find:
```javascript
  let resp, data;
  try {
    resp = await fetch('http://localhost:3000/api/create-user', {
```

Replace the entire try/catch and response handling with:
```javascript
  let resp, data;

  if (usuarioEditandoId) {
    // MODO EDICIÓN — solo actualiza tabla users, no toca Supabase Auth
    const licencia  = document.getElementById('nu-licencia')?.value.trim() || null;
    const vencimiento = document.getElementById('nu-vencimiento')?.value || null;
    const { error } = await _db.from('users').update({
      full_name: nombre, phone: tel || null, role: rol,
      license_number: licencia, license_expiry: vencimiento
    }).eq('user_id', usuarioEditandoId);
    btn.textContent = '💾 Crear Usuario';
    btn.style.pointerEvents = 'auto';
    // Re-enable fields
    const emailEl = document.getElementById('nu-email');
    const legajoEl = document.getElementById('nu-legajo');
    if (emailEl) emailEl.disabled = false;
    if (legajoEl) legajoEl.disabled = false;
    usuarioEditandoId = null;
    if (error) { toast(`Error: ${error.message}`, 'error'); return; }
    toast('Usuario actualizado', 'success');
    closeModal('modal-nuevo-usuario');
    cargarTablaAdminUsuarios();
    return;
  }

  try {
    resp = await fetch(`${ENV.API_BASE_URL}/api/create-user`, {
```

Also update the URL in the existing fetch from `http://localhost:3000/api/create-user` to `${ENV.API_BASE_URL}/api/create-user` (if not already done).

Also update `openNuevoUsuarioModal` to reset `usuarioEditandoId` and re-enable fields:

Find:
```javascript
function openNuevoUsuarioModal() {
  ['nu-nombre', 'nu-legajo', 'nu-email', 'nu-telefono', 'nu-licencia', 'nu-vencimiento'].forEach(id => {
```

Replace with:
```javascript
function openNuevoUsuarioModal() {
  usuarioEditandoId = null;
  const emailEl = document.getElementById('nu-email');
  const legajoEl = document.getElementById('nu-legajo');
  if (emailEl) emailEl.disabled = false;
  if (legajoEl) legajoEl.disabled = false;
  const titulo = document.querySelector('#modal-nuevo-usuario .modal-head-title');
  if (titulo) titulo.textContent = '👤 Alta de Personal';
  const btnGuardar = document.getElementById('btn-guardar-usuario');
  if (btnGuardar) btnGuardar.textContent = '💾 Crear Usuario';
  ['nu-nombre', 'nu-legajo', 'nu-email', 'nu-telefono', 'nu-licencia', 'nu-vencimiento'].forEach(id => {
```

- [ ] **Step 5: Commit**

```bash
git add sigma.js
git commit -m "feat: personal - editar + dar de baja/reactivar con guardia de jornada"
```

---

## Task 7: sigma.js — Planes: Editar + Dar de baja

**Files:**
- Modify: `C:\Users\Remol\OneDrive\Desktop\ARCHIVOS VALENTIN\App_Sigma_Choferes\sigma.js`

- [ ] **Step 1: Declare global `planEditandoId` near `vehiculoEditandoId`**

Find:
```javascript
let vehiculoEditandoId = null;
```

Add after it (if not already added from Task 6):
```javascript
let planEditandoId = null;
```

- [ ] **Step 2: Add `abrirEditarPlan` and `toggleEstadoPlan` after `cargarTablaAdminPlanes`**

Find the closing `}` of `cargarTablaAdminPlanes` (line ~7162) and insert:

```javascript
function abrirEditarPlan(planId) {
  const p = window._planesCache?.find(x => x.id === planId);
  if (!p) { toast('No se encontró el plan', 'error'); return; }
  planEditandoId = planId;
  document.getElementById('mg-nombre').value = p.name || '';
  document.getElementById('mg-tipo').value   = p.trigger_type || 'km';
  document.getElementById('mg-km').value     = p.interval_km || '';
  document.getElementById('mg-hs').value     = p.interval_hours || '';
  document.getElementById('mg-alerta').value = p.alert_before_km || 500;
  if (typeof toggleAdminPlanFields === 'function') toggleAdminPlanFields();
  const titulo = document.querySelector('#modal-crear-plan-global .modal-head-title');
  if (titulo) titulo.textContent = '✏️ Editar Plan Maestro';
  const btn = document.getElementById('btn-guardar-global');
  if (btn) btn.textContent = '💾 Actualizar Plan';
  openAdminPlanModal();
}

async function toggleEstadoPlan(planId, estaActivo) {
  const accion = estaActivo ? 'dar de baja' : 'reactivar';
  if (!confirm(`¿Querés ${accion} este plan?`)) return;
  const { error } = await _db.from('master_service_plans').update({ activo: !estaActivo }).eq('id', planId);
  if (error) { toast(`Error: ${error.message}`, 'error'); return; }
  toast(estaActivo ? 'Plan dado de baja' : 'Plan reactivado', 'success');
  cargarTablaAdminPlanes();
}
```

- [ ] **Step 3: Update `cargarTablaAdminPlanes` to show Editar + baja buttons and cache**

Replace the entire `contenedor.innerHTML` assignment in `cargarTablaAdminPlanes` with:

```javascript
  if (planes) window._planesCache = planes;

  contenedor.innerHTML = `<div style="overflow-x:auto">
    <table style="width: 100%; border-collapse: collapse; text-align: left;">
      <tr style="border-bottom: 1px solid var(--border); color: var(--muted); font-size: 12px;">
        <th style="padding: 10px;">Nombre del Plan</th>
        <th style="padding: 10px;">Cadencia</th>
        <th style="padding: 10px;">Alerta</th>
        <th style="padding: 10px;"></th>
      </tr>
      ${planes.map(p => `
        <tr style="border-bottom: 1px solid var(--border); font-size: 14px;">
          <td style="padding: 12px; font-weight: 600;">${p.name}</td>
          <td style="padding: 12px;">${p.interval_km ? `${p.interval_km.toLocaleString()} km` : `${p.interval_hours} hs`}</td>
          <td style="padding: 12px; color: var(--amber);">${p.alert_before_km} km antes</td>
          <td style="padding: 12px;">
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost" style="font-size:11px;padding:5px 10px"
                onclick="abrirEditarPlan(${p.id})">✏️ Editar</button>
              <button style="font-size:11px;padding:5px 10px;border-radius:5px;cursor:pointer;border:1px solid;${p.activo !== false ? 'background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.3)' : 'background:rgba(34,197,94,0.1);color:#22c55e;border-color:rgba(34,197,94,0.3)'}"
                onclick="toggleEstadoPlan(${p.id}, ${p.activo !== false})">
                ${p.activo !== false ? '🚫 Dar de baja' : '✅ Reactivar'}
              </button>
            </div>
          </td>
        </tr>
      `).join('')}
    </table></div>
  `;
```

Note: `cargarCatalogoPlanes()` now filters `activo = true`, so inactive plans won't appear here unless we include them. Change the query in `cargarTablaAdminPlanes` to NOT filter by activo (show all plans in the admin table):

In `cargarTablaAdminPlanes`, find:
```javascript
  const planes = await cargarCatalogoPlanes();
```

Replace with (direct query without the `activo` filter, so admin sees all):
```javascript
  const { data: planes, error: planesError } = await _db
    .from('master_service_plans')
    .select('id, name, trigger_type, interval_km, interval_hours, alert_before_km, activo')
    .order('name');
  if (planesError) { contenedor.innerHTML = `<div style="color:var(--red)">Error: ${planesError.message}</div>`; return; }
```

- [ ] **Step 4: Modify `guardarPlanGlobal` to support edit mode**

In `guardarPlanGlobal` (line ~341), find:
```javascript
  // Llamamos a Supabase (La función que creamos en el paso anterior)
  const resultado = await crearPlanGlobal(datos);

  if (btn) { btn.textContent = '💾 Guardar en Catálogo'; btn.style.pointerEvents = 'auto'; }

  if (resultado.ok) {
    toast('Plan maestro agregado al catálogo exitosamente', 'success');
    closeModal('modal-crear-plan-global');
  } else {
    toast(`Error al guardar: ${resultado.errorMsg}`, 'error');
  }
}
```

Replace with:
```javascript
  if (planEditandoId) {
    const { error } = await _db.from('master_service_plans').update(datos).eq('id', planEditandoId);
    if (btn) { btn.textContent = '💾 Guardar en Catálogo'; btn.style.pointerEvents = 'auto'; }
    planEditandoId = null;
    if (error) { toast(`Error: ${error.message}`, 'error'); return; }
    toast('Plan actualizado', 'success');
  } else {
    const resultado = await crearPlanGlobal(datos);
    if (btn) { btn.textContent = '💾 Guardar en Catálogo'; btn.style.pointerEvents = 'auto'; }
    if (!resultado.ok) { toast(`Error al guardar: ${resultado.errorMsg}`, 'error'); return; }
    toast('Plan maestro agregado al catálogo exitosamente', 'success');
  }
  closeModal('modal-crear-plan-global');
  cargarTablaAdminPlanes();
}
```

Also reset `planEditandoId` in `openAdminPlanModal`. Find that function and add `planEditandoId = null;` at the start, plus reset the modal title and button text:

Find `function openAdminPlanModal` and add at the start of the function body:
```javascript
  planEditandoId = null;
  const titulo = document.querySelector('#modal-crear-plan-global .modal-head-title');
  if (titulo) titulo.textContent = '📐 Nuevo Plan Maestro de Service';
  const btn = document.getElementById('btn-guardar-global');
  if (btn) btn.textContent = '💾 Guardar en Catálogo';
```

- [ ] **Step 5: Commit and push all**

```bash
git add sigma.js supabase.js
git commit -m "feat: planes maestros - editar + dar de baja lógica"
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ Layout responsivo mobile (Task 2, 3)
- ✅ Logout button (Task 2, 4)
- ✅ Vehículos: guardia jornada + botón renombrado (Task 5)
- ✅ Personal: Editar + baja lógica (Task 6)
- ✅ Planes: Editar + baja lógica (Task 7)
- ✅ DB migration activo column (Task 1)
- ✅ `cargarCatalogoPlanes` filtra activo=true (Task 4)

**Type consistency:**
- `_usuariosCache` → set in `cargarTablaAdminUsuarios`, read in `abrirEditarUsuario` ✅
- `_planesCache` → set in `cargarTablaAdminPlanes`, read in `abrirEditarPlan` ✅
- `usuarioEditandoId` → declared, set in `abrirEditarUsuario`, checked in `guardarNuevoUsuario`, cleared after save ✅
- `planEditandoId` → declared, set in `abrirEditarPlan`, checked in `guardarPlanGlobal`, cleared after save ✅
