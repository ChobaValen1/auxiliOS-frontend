# Config Panel Redesign — Spec

## Objetivo

Corregir el layout del panel de configuración (roto en desktop y mobile), completar las operaciones CRUD en todos los tabs, y agregar el botón de cierre de sesión.

---

## 1. Layout Responsivo (Opción A — Sidebar colapsable)

### Desktop (≥ 680px)
El modal mantiene el layout de dos columnas: sidebar 250px a la izquierda + contenido a la derecha.

- `#modal-settings .modal-box`: `max-width: 900px; width: 95%; height: 85vh; flex-direction: row; overflow: hidden; padding: 0;`
- Sidebar: `width: 250px; flex-shrink: 0;`

### Mobile (< 680px)
El modal ocupa pantalla completa. El layout pasa a una columna vertical:

```
┌────────────────────────────────┐
│ ⚙️ Configuración          ✕   │  ← header sticky: título + botón cerrar
├────────────────────────────────┤
│ 🚛 Flota │👥 Pers │📐 Plan│🆘│  ← tabs con overflow-x: auto
├────────────────────────────────┤
│                                │
│   Contenido del tab activo     │  ← overflow-y: auto, flex: 1
│                                │
└────────────────────────────────┘
│ 🚪 Cerrar sesión               │  ← footer fijo abajo
└────────────────────────────────┘
```

**Cambios en `Index.html`:**
Agregar clases a los elementos del sidebar para que los media queries los apunten:
- `class="settings-sidebar"` → el div lateral
- `class="settings-header"` → el div con título "⚙️ Configuración"
- `class="settings-footer"` → el div con botones Cerrar Panel / Cerrar sesión

**CSS en `sigma.css` (agregar):**
```css
@media (max-width: 680px) {
  #modal-settings .modal-box {
    flex-direction: column;
    height: 100dvh;
    max-width: 100%;
    width: 100%;
    border-radius: 0;
    margin: 0;
  }

  /* El sidebar rota a barra de tabs horizontal */
  #modal-settings .settings-sidebar {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding: 0 8px;
    gap: 0;
    flex-shrink: 0;
    /* Ocultar solo el encabezado del sidebar — los tabs se conservan */
  }

  /* El header del sidebar se transforma en navbar sticky */
  #modal-settings .settings-header {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    margin-bottom: 0;
    padding-bottom: 12px;
  }

  /* El footer (Cerrar Panel + Cerrar sesión) se convierte en barra fija abajo */
  #modal-settings .settings-footer {
    position: sticky;
    bottom: 0;
    background: var(--bg-darker, #1a1d24);
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    flex-shrink: 0;
  }

  /* Tabs con texto corto y scroll horizontal */
  #modal-settings .tab-config {
    white-space: nowrap;
    flex-shrink: 0;
    padding: 10px 14px;
    font-size: 12px;
    border-radius: 0;
    border-bottom: 2px solid transparent;
  }

  #modal-settings .tab-config.active {
    border-bottom: 2px solid var(--amber);
    background: transparent;
    border-left: none;  /* override del estilo desktop que usa borde izquierdo */
  }

  #config-content-area {
    padding: 16px;
    flex: 1;
    overflow-y: auto;
  }
}
```

### Tablas internas — scroll horizontal
En `cargarTablaAdminFlota()` y `cargarTablaAdminUsuarios()` en `sigma.js`, envolver el `<table>` en:
```html
<div style="overflow-x: auto">
  <table ...>...</table>
</div>
```

---

## 2. Botón Cerrar Sesión

**Ubicación:**
- **Desktop:** al fondo del sidebar (settings-footer), debajo del botón "Cerrar Panel"
- **Mobile:** visible en el settings-footer fijo al pie de pantalla

**HTML a agregar en `Index.html`** (dentro del settings-footer):
```html
<button id="btn-cerrar-sesion" class="btn btn-ghost" style="width: 100%; color: var(--red);">
  🚪 Cerrar sesión
</button>
```

Usar `id` en lugar de `onclick` inline para evitar problemas de scope.

**Función en `supabase.js`:**
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

`finally { location.reload() }` garantiza que el usuario sea redirigido al login incluso si `signOut` falla por falta de conexión. Al recargar, `onAuthStateChange` detecta sesión nula y muestra el login.

---

## 3. CRUD — Vehículos

### Estado actual
- ✅ Create / Read / Update: ya implementados
- ✅ Baja lógica: `toggleEstadoVehiculo(truckId, status)` ya existe

### Cambio: guardia de jornada activa + renombrar botón

Antes de ejecutar la baja, verificar que el camión no tenga jornada abierta:

```javascript
async function toggleEstadoVehiculo(truckId, estadoActual) {
  if (estadoActual === 'active') {
    const { data } = await supabase
      .from('daily_logs')
      .select('log_id')
      .eq('truck_id', truckId)
      .eq('status', 'open')
      .maybeSingle();
    if (data) {
      alert('Este camión tiene una jornada abierta. Cerrá la jornada antes de darlo de baja.');
      return;
    }
  }
  const nuevoEstado = estadoActual === 'active' ? 'inactive' : 'active';
  await supabase.from('trucks').update({ status: nuevoEstado }).eq('truck_id', truckId);
  cargarTablaAdminFlota();
}
```

Renombrar el botón en la tabla:
- `status === 'active'` → `🚫 Dar de baja` (rojo suave)
- `status !== 'active'` → `✅ Reactivar` (verde suave)

---

## 4. CRUD — Personal (usuarios)

### 4.1 Editar usuario

**Botón en la fila:** `✏️ Editar` → llama a `abrirEditarUsuario(userId)`.

**`abrirEditarUsuario(userId)`:**
- Busca el usuario en el array `usuarios` ya cargado en memoria
- Pre-llena el modal `modal-nuevo-usuario` con los datos existentes
- Cambia el título a "Editar Personal"
- Setea global `usuarioEditandoId = userId`

**Campos editables** (nunca email ni contraseña desde este formulario):
`full_name`, `phone`, `role`, `license_number`, `license_expiry`, `status`

**Modificar `guardarNuevoUsuario()`:**
```javascript
if (usuarioEditandoId) {
  // modo edición
  const { error } = await supabase
    .from('users')
    .update({ full_name, phone, role, license_number, license_expiry, status })
    .eq('user_id', usuarioEditandoId);
  if (error) { /* mostrar error */ return; }
  usuarioEditandoId = null;
} else {
  // modo creación — flujo actual sin cambios
}
closeModal('modal-nuevo-usuario');
cargarTablaAdminUsuarios();
```

### 4.2 Dar de baja / Reactivar

**Función `toggleEstadoUsuario(userId, estadoActual)`:**
```javascript
async function toggleEstadoUsuario(userId, estadoActual) {
  if (estadoActual === 'activo') {
    const { data } = await supabase
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
  await supabase.from('users').update({ status: nuevoEstado }).eq('user_id', userId);
  cargarTablaAdminUsuarios();
}
```

**Botón en la fila:**
- `status === 'activo'` → `🚫 Dar de baja` (rojo suave)
- `status !== 'activo'` → `✅ Reactivar` (verde suave)

El usuario inactivo sigue apareciendo en la tabla de config (para poder reactivarlo), pero NO aparece en los selectores operativos.

---

## 5. CRUD — Planes Maestros

> **Nota arquitectónica:** `master_service_plans` es referenciada por `service_plans` (suscripciones por camión) y por `maintenance_logs`. Un DELETE físico violaría la integridad referencial o, si hay `ON DELETE CASCADE`, borraría historial de mantenimiento. Por eso se implementa **baja lógica** igual que usuarios y vehículos, agregando una columna `activo`.

### 5.0 Migración de esquema requerida

Ejecutar en Supabase SQL Editor antes del deploy:
```sql
ALTER TABLE master_service_plans ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;
```

### 5.1 Editar plan

**Botón en la fila:** `✏️ Editar` → llama a `abrirEditarPlan(planId)`.

**`abrirEditarPlan(planId)`:**
- Busca el plan en el array cargado
- Pre-llena el modal `modal-crear-plan-global` con los datos existentes
- Cambia el título a "Editar Plan Maestro"
- Setea global `planEditandoId = planId`

**Modificar `guardarPlanGlobal()`:**
```javascript
if (planEditandoId) {
  const { error } = await _db
    .from('master_service_plans')
    .update({ name, trigger_type, interval_km, interval_hours, alert_before_km })
    .eq('id', planEditandoId);
  if (error) { /* mostrar error */ return; }
  planEditandoId = null;
} else {
  // insert actual — sin cambios
}
cargarTablaAdminPlanes();
```

### 5.2 Dar de baja / Reactivar plan

**Función `toggleEstadoPlan(planId, estaActivo)`:**
```javascript
async function toggleEstadoPlan(planId, estaActivo) {
  await _db
    .from('master_service_plans')
    .update({ activo: !estaActivo })
    .eq('id', planId);
  cargarTablaAdminPlanes();
}
```

**Botón en la fila:**
- `activo === true` → `🚫 Dar de baja` (rojo suave)
- `activo === false` → `✅ Reactivar` (verde suave)

Los planes inactivos no aparecen en los selectores de asignación de service a camiones.

**Modificar `cargarCatalogoPlanes()` en `supabase.js`:**
Agregar `.eq('activo', true)` al query para filtrar planes inactivos en las vistas operativas.

---

## 6. Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `Index.html` | Agregar clases `settings-sidebar`, `settings-header`, `settings-footer`; botón `#btn-cerrar-sesion`; `overflow-x:auto` en tablas |
| `sigma.css` | Media query `@media (max-width: 680px)` completa |
| `sigma.js` | `cargarTablaAdminFlota` (botón baja renombrado), `cargarTablaAdminUsuarios` (botones Editar + baja, overflow-x:auto), `cargarTablaAdminPlanes` (botones Editar + baja); funciones `abrirEditarUsuario`, `toggleEstadoUsuario`, `abrirEditarPlan`, `toggleEstadoPlan`; modificar `guardarNuevoUsuario` y `guardarPlanGlobal` para modo edición; refactorizar `toggleEstadoVehiculo` con guardia de jornada |
| `supabase.js` | Función `cerrarSesion()` + event listener en `DOMContentLoaded`; modificar `cargarCatalogoPlanes()` para filtrar `activo = true` |
| Supabase SQL | `ALTER TABLE master_service_plans ADD COLUMN activo BOOLEAN DEFAULT true` |

---

## Lo que NO cambia

- Tab Emergencias: ya tiene CRUD completo
- Flujo de creación de usuarios (backend `/api/create-user`)
- Supabase Auth: no se edita email desde este panel
