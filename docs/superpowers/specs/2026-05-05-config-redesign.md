# Config Panel Redesign — Spec

## Objetivo

Corregir el layout del panel de configuración (roto en desktop y mobile), completar las operaciones CRUD en todos los tabs, y agregar el botón de cierre de sesión para el administrador.

---

## 1. Layout Responsivo (Opción A — Sidebar colapsable)

### Desktop (≥ 680px)
El modal mantiene el layout actual de dos columnas: sidebar 250px a la izquierda + contenido a la derecha. Se corrigen los estilos desalineados existentes.

- `#modal-settings .modal-box`: `max-width: 900px; width: 95%; height: 85vh; display: flex; flex-direction: row; overflow: hidden; padding: 0;`
- Sidebar: `width: 250px; flex-shrink: 0;`

### Mobile (< 680px)
El modal ocupa pantalla completa. El sidebar rota a una barra de tabs horizontales en la parte superior.

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
  #modal-settings .settings-sidebar {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding: 8px 10px;
    gap: 4px;
    flex-shrink: 0;
  }
  #modal-settings .settings-sidebar .tab-config {
    white-space: nowrap;
    flex-shrink: 0;
    padding: 8px 12px;
    font-size: 12px;
  }
  #modal-settings .settings-header {
    display: none; /* ocultar título en mobile, tabs son suficientes */
  }
  #modal-settings .settings-sidebar .settings-footer {
    display: none; /* botones Cerrar / Logout van en otro lugar en mobile */
  }
  #config-content-area {
    padding: 16px;
  }
}
```

### Tablas internas
Las tablas de Flota y Personal se envuelven en un `<div style="overflow-x: auto">` para que sean scrolleables horizontalmente en mobile.

Esto se aplica en `cargarTablaAdminFlota()` y `cargarTablaAdminUsuarios()` en `sigma.js`.

### Clases estructurales a agregar al HTML
Para que las media queries funcionen, los elementos del sidebar necesitan clases:
- `settings-sidebar` → el div del sidebar (actualmente sin clase)
- `settings-header` → el div del título "⚙️ Configuración"
- `settings-footer` → el div que contiene los botones "Cerrar Panel" y "Cerrar sesión"

---

## 2. Botón Cerrar Sesión

**Ubicación:** al fondo del sidebar, debajo de "Cerrar Panel".

**HTML a agregar** (dentro del sidebar, después del botón Cerrar Panel):
```html
<button class="btn btn-ghost" style="width: 100%; color: var(--red);"
  onclick="cerrarSesion()">🚪 Cerrar sesión</button>
```

**Función en `supabase.js`:**
```javascript
async function cerrarSesion() {
  await _db.auth.signOut();
  location.reload();
}
```

`location.reload()` hace que al recargar, el listener de `onAuthStateChange` detecte que no hay sesión y muestre el login.

---

## 3. CRUD — Vehículos

### Estado actual
- ✅ Create: `openNuevoVehiculoModal()` / `guardarNuevoVehiculo()`
- ✅ Read: `cargarTablaAdminFlota()`
- ✅ Update: `abrirEditarVehiculo(truckId)`
- 🔄 Baja lógica: `toggleEstadoVehiculo(truckId, status)` ya existe

### Cambio
Solo renombrar el botón de estado en la tabla. Actualmente el botón dice "Activar/Desactivar". Reemplazar por:
- Si `status === 'active'` → botón `🚫 Dar de baja` (color rojo suave)
- Si `status === 'inactive'` → botón `✅ Reactivar` (color verde suave)

No se agrega lógica nueva. Solo UI.

---

## 4. CRUD — Personal (usuarios)

### Estado actual
- ✅ Create: `openNuevoUsuarioModal()` / `guardarNuevoUsuario()`
- ✅ Read: `cargarTablaAdminUsuarios()`
- ❌ Update: no existe
- ❌ Baja lógica: no existe

### 4.1 Editar usuario

**Botón en la fila:** `✏️ Editar` → llama a `abrirEditarUsuario(userId)`.

**Función `abrirEditarUsuario(userId)`:**
- Busca el usuario en el array `usuarios` (ya cargado en memoria)
- Pre-llena el `modal-nuevo-usuario` con los datos existentes
- Cambia el título a "Editar Personal"
- Guarda `usuarioEditandoId = userId`

**Campos editables** (no incluye email ni contraseña):
- `full_name`, `phone`, `role`, `license_number`, `license_expiry`, `status`

**Función `guardarNuevoUsuario()` (modificar):**
- Si `usuarioEditandoId` está seteado → `supabase.from('users').update({...}).eq('user_id', usuarioEditandoId)`
- Si no → flujo de creación actual (sin cambios)
- Tras guardar: limpiar `usuarioEditandoId`, cerrar modal, recargar tabla

### 4.2 Dar de baja / Reactivar

**Botón en la fila:**
- Si `status === 'activo'` → `🚫 Dar de baja`
- Si `status !== 'activo'` → `✅ Reactivar`

**Función `toggleEstadoUsuario(userId, estadoActual)`:**
```javascript
async function toggleEstadoUsuario(userId, estadoActual) {
  const nuevoEstado = estadoActual === 'activo' ? 'inactivo' : 'activo';
  await supabase.from('users').update({ status: nuevoEstado }).eq('user_id', userId);
  cargarTablaAdminUsuarios();
}
```

El usuario inactivo sigue apareciendo en la tabla de configuración (para poder reactivarlo), pero no aparece en los selectores operativos de la app (chofer asignado a jornada, etc.).

---

## 5. CRUD — Planes Maestros

### Estado actual
- ✅ Create: `openAdminPlanModal()` / `guardarPlanGlobal()`
- ✅ Read: `cargarTablaAdminPlanes()`
- ❌ Update: no existe
- ❌ Delete: no existe

### 5.1 Editar plan

**Botón en la fila:** `✏️ Editar` → llama a `abrirEditarPlan(planId)`.

**Función `abrirEditarPlan(planId)`:**
- Busca el plan en el array cargado
- Pre-llena el modal existente `modal-crear-plan-global`
- Cambia el título a "Editar Plan Maestro"
- Guarda `planEditandoId = planId`

**Función `guardarPlanGlobal()` (modificar):**
- Si `planEditandoId` está seteado → `supabase.from('master_service_plans').update({...}).eq('id', planEditandoId)`
- Si no → insert actual (sin cambios)
- Tras guardar: limpiar `planEditandoId`, cerrar modal, recargar tabla

### 5.2 Eliminar plan (delete real)

**Botón en la fila:** `🗑️ Eliminar` (rojo suave)

**Función `eliminarPlanMaestro(planId)`:**
```javascript
async function eliminarPlanMaestro(planId) {
  if (!confirm('¿Eliminar este plan? Esta acción no se puede deshacer.')) return;
  await supabase.from('master_service_plans').delete().eq('id', planId);
  cargarTablaAdminPlanes();
}
```

---

## 6. Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `Index.html` | Agregar clases `settings-sidebar`, `settings-header`, `settings-footer` al sidebar; agregar botón "Cerrar sesión"; envolver tablas en `overflow-x:auto` |
| `sigma.css` | Agregar media query `@media (max-width: 680px)` para layout responsivo |
| `sigma.js` | `cargarTablaAdminFlota` (renombrar botón estado), `cargarTablaAdminUsuarios` (agregar botones Editar + baja lógica, `overflow-x:auto`), `cargarTablaAdminPlanes` (agregar botones Editar + Eliminar), funciones `abrirEditarUsuario`, `toggleEstadoUsuario`, `abrirEditarPlan`, `eliminarPlanMaestro`; modificar `guardarNuevoUsuario` y `guardarPlanGlobal` para modo edición |
| `supabase.js` | Agregar función `cerrarSesion()` |

---

## Lo que NO cambia

- Tab Emergencias: ya tiene CRUD completo
- El flujo de creación de usuarios (backend `/api/create-user`) — sin tocar
- Supabase Auth: no se edita email ni contraseña desde este panel (solo desde reset password)
- La lógica de `toggleEstadoVehiculo` para vehículos — solo cambia el label del botón
