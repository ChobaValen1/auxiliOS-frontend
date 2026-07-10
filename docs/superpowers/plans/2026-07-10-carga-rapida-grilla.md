# Carga rápida por rango (Grilla) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botón "⚡ Carga rápida" en la Grilla que asigna un chofer a un móvil por un rango de fechas (con francos semanales) en un solo upsert.

**Architecture:** Vanilla JS SPA sin build. El modal vive en `Index.html` (patrón `modal-backdrop`/`modal-box` existente), la lógica en `sigma.js` junto al resto de la grilla (~línea 16000). Guarda con upsert a `asignaciones_grilla` con `onConflict: 'fecha,truck_id'`, igual que `copiarSemanaGrilla()`. Sin cambios de esquema.

**Tech Stack:** Vanilla JS, Supabase JS client (`_db`), service worker con caché versionada.

**Testing:** El proyecto NO tiene framework de tests. La verificación es manual en navegador (abrir `Index.html` servido por Vercel dev o file://, login admin). Cada task incluye pasos de verificación manual.

**Spec:** `docs/superpowers/specs/2026-07-10-carga-rapida-grilla-design.md`
**Mockup aprobado:** `mockup_carga_masiva_grilla.html` (Opción A)

**Contexto clave del codebase (leer antes de empezar):**
- `sigma.js:15410-15435` — estado global de grilla y helpers de fecha: `_grillaMesKey` ('YYYY-MM' visible), `_grillaTrucks`, `_grillaChoferes`, `_grillaEsAdmin()`, `_gIso(d)`, `_gDate(iso)`, `_gHoyIso()`, `_gSumarDias(iso,n)`, `_gDDbarraMM(iso)`
- `sigma.js:16005-16040` — `copiarSemanaGrilla()`: patrón de upsert a seguir
- `sigma.js:352` `closeModal(id)` / `sigma.js:3818` `openModal(id)` — manejo de modales
- `Index.html:2554-2561` — topbar de grilla con botones existentes
- `Index.html:2606-2624` — modal `modal-grilla-celda`: patrón de modal a seguir
- `toast(msg, tipo)` — notificaciones ('error', 'info', o sin tipo para éxito)

---

### Task 1: Botón y modal en Index.html

**Files:**
- Modify: `Index.html:2559` (agregar botón tras `grilla-btn-copiar-mes`)
- Modify: `Index.html:2624` (agregar modal tras `modal-grilla-celda`)

- [ ] **Step 1: Agregar el botón en la topbar de la grilla**

En `Index.html`, dentro de `<div class="grilla-controls">` (línea ~2556), después del botón `grilla-btn-copiar-mes`, agregar:

```html
      <button class="btn" id="grilla-btn-carga-rapida" style="display:none" onclick="abrirModalCargaRapida()">⚡ Carga rápida</button>
```

- [ ] **Step 2: Agregar el modal**

En `Index.html`, inmediatamente después del cierre del modal `modal-grilla-celda` (línea ~2624, después de su `</div>` final), agregar:

```html
<!-- Modal: carga rápida por rango (solo admin) -->
<div class="modal-backdrop" id="modal-carga-rapida">
  <div class="modal-box" style="max-width:400px">
    <div class="modal-head">
      <div>
        <span class="modal-head-title">⚡ Carga rápida</span>
        <div style="font-size:11px;color:var(--muted2);margin-top:4px">Asigná un chofer a un móvil por varios días de una vez</div>
      </div>
      <button class="modal-close" onclick="closeModal('modal-carga-rapida')">×</button>
    </div>
    <div class="modal-body">
      <div style="display:flex;gap:10px">
        <div class="form-group" style="flex:1">
          <label class="form-label">Chofer</label>
          <select class="form-input" id="cr-chofer" onchange="_cargaRapidaPreview()"></select>
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label">Móvil</label>
          <select class="form-input" id="cr-movil" onchange="_cargaRapidaPreview()"></select>
        </div>
      </div>
      <div style="display:flex;gap:10px">
        <div class="form-group" style="flex:1">
          <label class="form-label">Desde</label>
          <input class="form-input" type="date" id="cr-desde" onchange="_cargaRapidaPreview()">
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label">Hasta</label>
          <input class="form-input" type="date" id="cr-hasta" onchange="_cargaRapidaPreview()">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Días de franco (tocá para marcar)</label>
        <div id="cr-francos" style="display:flex;gap:6px;flex-wrap:wrap"></div>
      </div>
      <div id="cr-preview" style="background:var(--bg-darker);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--muted);line-height:1.7">—</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal('modal-carga-rapida')">Cancelar</button>
      <button class="btn btn-primary" id="cr-btn-confirmar" onclick="guardarCargaRapida()" disabled>Cargar</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Verificar sintaxis HTML**

Run: abrir `Index.html` en el navegador y en consola: `typeof document.getElementById('modal-carga-rapida')`
Expected: `"object"` (no null), sin errores de parseo en consola.

- [ ] **Step 4: Commit**

```bash
git add Index.html
git commit -m "feat(grilla): botón y modal de carga rápida (HTML)"
```

---

### Task 2: Lógica del modal en sigma.js — abrir, pills de franco y preview

**Files:**
- Modify: `sigma.js` — agregar bloque nuevo después de `copiarMesGrilla()` (~línea 16090)
- Modify: `sigma.js:15484-15485` — mostrar el botón a admin en `initGrilla()`

- [ ] **Step 1: Mostrar el botón solo a admin en initGrilla()**

En `sigma.js`, en `initGrilla()`, después del bloque de `btnCopiarMes` (línea ~15485), agregar:

```javascript
  const btnCargaRapida = document.getElementById('grilla-btn-carga-rapida');
  if (btnCargaRapida) btnCargaRapida.style.display = _grillaEsAdmin() ? '' : 'none';
```

- [ ] **Step 2: Agregar estado, apertura del modal y pills**

En `sigma.js`, después del cierre de `copiarMesGrilla()` (~línea 16090), agregar:

```javascript
// ── Carga rápida por rango ──────────────────────────────────────
// Asigna un chofer a un móvil por un rango de fechas en un solo upsert,
// con francos semanales opcionales. Solo admin.

let _cargaRapidaFrancos = new Set(); // índices 0=Lun … 6=Dom

function abrirModalCargaRapida() {
  if (!_grillaEsAdmin()) return;

  const selChofer = document.getElementById('cr-chofer');
  selChofer.innerHTML = '<option value="">Elegí un chofer…</option>' +
    _grillaChoferes.map(c => `<option value="${c.user_id}">${c.full_name}</option>`).join('');

  const selMovil = document.getElementById('cr-movil');
  selMovil.innerHTML = '<option value="">Elegí un móvil…</option>' +
    _grillaTrucks.map(t => `<option value="${t.truck_id}">${t.numero_interno || t.plate}</option>`).join('');

  // Rango por defecto: hoy (si el mes visible es el actual) o día 1 del mes visible → fin de mes
  const hoy = _gHoyIso();
  const [y, m] = _grillaMesKey.split('-').map(Number);
  const finMes = _gIso(new Date(y, m, 0, 12));
  document.getElementById('cr-desde').value = hoy.slice(0, 7) === _grillaMesKey ? hoy : `${_grillaMesKey}-01`;
  document.getElementById('cr-hasta').value = finMes;

  _cargaRapidaFrancos = new Set();
  const cont = document.getElementById('cr-francos');
  const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  cont.innerHTML = dias.map((d, i) =>
    `<span class="cr-dia-pill" data-dia="${i}" onclick="_cargaRapidaToggleFranco(${i})"
       style="padding:7px 0;width:42px;text-align:center;border:1px solid var(--border);border-radius:8px;font-size:12px;cursor:pointer;color:var(--muted);user-select:none">${d}</span>`
  ).join('');

  _cargaRapidaPreview();
  openModal('modal-carga-rapida');
}

function _cargaRapidaToggleFranco(dia) {
  if (_cargaRapidaFrancos.has(dia)) _cargaRapidaFrancos.delete(dia);
  else _cargaRapidaFrancos.add(dia);
  const pill = document.querySelector(`#cr-francos [data-dia="${dia}"]`);
  if (pill) {
    const activo = _cargaRapidaFrancos.has(dia);
    pill.style.background   = activo ? 'rgba(139,148,158,0.15)' : '';
    pill.style.borderStyle  = activo ? 'dashed' : 'solid';
    pill.style.color        = activo ? 'var(--text)' : 'var(--muted)';
    pill.style.fontWeight   = activo ? '700' : '400';
  }
  _cargaRapidaPreview();
}

// Genera las filas del rango actual del modal. Devuelve null si el form es inválido.
function _cargaRapidaFilas() {
  const choferId = document.getElementById('cr-chofer').value;
  const truckId  = document.getElementById('cr-movil').value;
  const desde    = document.getElementById('cr-desde').value;
  const hasta    = document.getElementById('cr-hasta').value;
  if (!choferId || !truckId || !desde || !hasta || desde > hasta) return null;

  const filas = [];
  let iso = desde;
  while (iso <= hasta) {
    if (filas.length >= 62) return null; // rango máximo: 62 días
    const diaIdx = (_gDate(iso).getDay() + 6) % 7; // 0 = Lun
    const esFranco = _cargaRapidaFrancos.has(diaIdx);
    filas.push({
      fecha: iso,
      truck_id: parseInt(truckId),
      driver_id: esFranco ? null : choferId,
      estado: esFranco ? 'franco' : 'asignado',
    });
    iso = _gSumarDias(iso, 1);
  }
  return filas;
}

function _cargaRapidaPreview() {
  const box = document.getElementById('cr-preview');
  const btn = document.getElementById('cr-btn-confirmar');
  const desde = document.getElementById('cr-desde').value;
  const hasta = document.getElementById('cr-hasta').value;

  const filas = _cargaRapidaFilas();
  if (!filas) {
    btn.disabled = true;
    btn.textContent = 'Cargar';
    if (desde && hasta && desde > hasta) box.textContent = '⚠ La fecha "Desde" tiene que ser anterior a "Hasta".';
    else if (desde && hasta && _gSumarDias(desde, 61) < hasta) box.textContent = '⚠ El rango no puede superar los 62 días. Cargalo en dos tandas.';
    else box.textContent = 'Completá chofer, móvil y fechas para ver el resumen.';
    return;
  }

  const choferNombre = document.getElementById('cr-chofer').selectedOptions[0].textContent;
  const movilNombre  = document.getElementById('cr-movil').selectedOptions[0].textContent;
  const francos = filas.filter(f => f.estado === 'franco').length;
  const diasNombres = ['lunes','martes','miércoles','jueves','viernes','sábados','domingos'];
  const francosTxt = _cargaRapidaFrancos.size
    ? `, con franco los ${[..._cargaRapidaFrancos].sort().map(i => diasNombres[i]).join(', ')} (${francos} días)`
    : '';

  box.innerHTML = `Se van a cargar <b style="color:var(--text)">${filas.length} días</b>: ` +
    `<b style="color:var(--text)">${choferNombre}</b> en el móvil <b style="color:var(--text)">${movilNombre}</b> ` +
    `del <b style="color:var(--text)">${_gDDbarraMM(desde)}</b> al <b style="color:var(--text)">${_gDDbarraMM(hasta)}</b>${francosTxt}.<br>` +
    `⚠ Los días que ya tenían algo cargado se pisan.`;
  btn.disabled = false;
  btn.textContent = `Cargar ${filas.length} días`;
}
```

**Nota XSS:** `full_name`, `numero_interno` y `plate` son datos internos cargados por admin, y el mismo patrón de interpolación ya se usa en toda la grilla existente. No introducir sanitización nueva solo acá.

- [ ] **Step 3: Verificar en navegador**

Con login admin, ir a Grilla:
1. Se ve el botón "⚡ Carga rápida" → click abre el modal
2. Selects poblados con choferes y móviles reales
3. Desde/Hasta con defaults correctos (hoy → fin de mes visible)
4. Tocar "Dom" lo marca (fondo gris, borde punteado); tocarlo de nuevo lo desmarca
5. Con todo completo, el preview dice "Se van a cargar X días…" y el botón dice "Cargar X días"
6. Poner Desde > Hasta → botón deshabilitado y aviso en el preview
7. Login como chofer → el botón NO aparece

- [ ] **Step 4: Commit**

```bash
git add sigma.js
git commit -m "feat(grilla): modal de carga rápida — apertura, francos y preview"
```

---

### Task 3: Guardado (upsert) y refresco

**Files:**
- Modify: `sigma.js` — agregar `guardarCargaRapida()` a continuación del bloque del Task 2

- [ ] **Step 1: Agregar la función de guardado**

Después de `_cargaRapidaPreview()`, agregar:

```javascript
async function guardarCargaRapida() {
  if (!_grillaEsAdmin()) return;
  const filas = _cargaRapidaFilas();
  if (!filas) return;

  const btn = document.getElementById('cr-btn-confirmar');
  btn.disabled = true;
  btn.textContent = 'Guardando…';

  const { error } = await _db.from('asignaciones_grilla')
    .upsert(filas, { onConflict: 'fecha,truck_id' });

  if (error) {
    console.error('Error en carga rápida:', error);
    toast('No se pudo guardar: ' + error.message, 'error');
    btn.disabled = false;
    _cargaRapidaPreview();
    return;
  }

  toast(`${filas.length} días cargados ✓`);
  closeModal('modal-carga-rapida');
  await cargarGrilla();
}
```

- [ ] **Step 2: Verificar en navegador (caso feliz)**

Login admin → Grilla → ⚡ Carga rápida:
1. Chofer Pablo, un móvil, rango de 7 días con franco domingo → "Cargar 7 días"
2. Confirmar → toast "7 días cargados ✓", modal se cierra, la grilla muestra los chips (Pablo Lun-Sáb, Franco Dom)
3. Repetir sobre el mismo rango con otro chofer → pisa los días (upsert)
4. Verificar en la tabla: los días franco tienen `driver_id` null y `estado` 'franco'

- [ ] **Step 3: Verificar caso de error**

En consola: desconectar red (DevTools → Network → Offline) y confirmar una carga.
Expected: toast de error, el modal NO se cierra, el botón vuelve a "Cargar X días".

- [ ] **Step 4: Commit**

```bash
git add sigma.js
git commit -m "feat(grilla): carga rápida — guardado con upsert y refresco"
```

---

### Task 4: Bump de service worker y deploy

**Files:**
- Modify: `sw.js:1`

- [ ] **Step 1: Subir versión de caché**

En `sw.js` línea 1, cambiar la versión actual (v81 al momento de escribir el plan) por:

```javascript
const CACHE_NAME = 'auxilios-v82'; // v82: carga rápida por rango en la grilla
```

- [ ] **Step 2: Verificación final completa**

Recorrido completo en navegador como admin: abrir modal → cargar un mes entero de un móvil (ej. 1 al 31 con francos domingo) → verificar grilla → editar una celda individual (sigue funcionando) → "Copiar semana" sigue funcionando. Como chofer: la grilla se ve normal y sin botón nuevo.

- [ ] **Step 3: Commit y push (deploy automático a Vercel)**

```bash
git add sw.js
git commit -m "chore(sw): bump caché v82 — carga rápida grilla"
git push
```

Expected: Vercel despliega automáticamente desde main.

---

## Self-review

- **Cobertura de spec:** botón admin-only (T1/T2), modal con 4 campos (T1), preview en vivo (T2), francos por día de semana (T2), upsert único con onConflict (T3), validaciones desde≤hasta y 62 días (T2 `_cargaRapidaFilas`), refresco + toast (T3), sin cambios de DB ✓, SW bump (T4).
- **Sin placeholders:** todo el código está completo en los steps.
- **Consistencia de nombres:** `abrirModalCargaRapida`, `_cargaRapidaToggleFranco`, `_cargaRapidaFilas`, `_cargaRapidaPreview`, `guardarCargaRapida` — usados de forma consistente entre HTML y JS.
