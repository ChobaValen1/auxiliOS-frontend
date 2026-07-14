# Control de KM cargados a mano — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar el origen de los KM de jornada (IA vs manual), generar alertas revisables cuando el chofer carga a mano, y mostrar la comparación IA/chofer en Jornadas admin.

**Architecture:** 4 columnas nuevas en `daily_logs` capturadas por el frontend del chofer (online y offline vía outbox). Un trigger en Postgres genera la alerta `km_manual` en `alertas_operativas` (cubre sync offline tardío). Vistas admin: badge en lista de jornadas, comparación en detalle, y tarjetas con Aprobar/Rechazar en el centro de alertas.

**Tech Stack:** Vanilla JS (sigma.js / supabase.js), Supabase Postgres (proyecto `bcjcrlrrqfbipleiwkqi`, migrar vía MCP `apply_migration`), sin framework de tests → verificación manual + SQL.

**Spec:** `docs/superpowers/specs/2026-07-14-km-manual-control-design.md` · **Mockup aprobado:** `mockup_km_manual_control.html`

**Valores de origen:** `'ia' | 'manual_ia_fallo' | 'manual_editado' | 'manual_offline'` — NULL para jornadas viejas. Alerta SOLO para `manual_ia_fallo` y `manual_editado`.

---

### Task 1: Migración — columnas, tipo de alerta y trigger

**Files:**
- Create: `migrations/2026-07-14_km_manual_control.sql`
- Aplicar con MCP `apply_migration` (nombre: `km_manual_control`)

- [ ] **Step 1: Verificar si `alertas_operativas.rendicion_id` es NOT NULL**

Run (MCP `execute_sql`):
```sql
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name='alertas_operativas' AND column_name='rendicion_id';
```
Si `is_nullable = 'NO'`, la migración del Step 2 debe incluir
`ALTER TABLE alertas_operativas ALTER COLUMN rendicion_id DROP NOT NULL;`
(las alertas km_manual no tienen rendición asociada).

- [ ] **Step 2: Escribir el archivo de migración**

Contenido completo de `migrations/2026-07-14_km_manual_control.sql`:

```sql
-- 2026-07-14 · Control de KM cargados a mano (IA vs chofer)
-- Spec: docs/superpowers/specs/2026-07-14-km-manual-control-design.md

-- 1 · Trazabilidad en daily_logs
ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS km_inicio_ia     integer,
  ADD COLUMN IF NOT EXISTS km_inicio_origen text
    CHECK (km_inicio_origen IN ('ia','manual_ia_fallo','manual_editado','manual_offline')),
  ADD COLUMN IF NOT EXISTS km_final_ia      integer,
  ADD COLUMN IF NOT EXISTS km_final_origen  text
    CHECK (km_final_origen  IN ('ia','manual_ia_fallo','manual_editado','manual_offline'));

-- 2 · Soporte del tipo nuevo en alertas_operativas
ALTER TABLE alertas_operativas
  ADD COLUMN IF NOT EXISTS log_id  integer REFERENCES daily_logs(log_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS extremo text CHECK (extremo IN ('inicio','final'));

-- (solo si rendicion_id era NOT NULL — ver Step 1)
-- ALTER TABLE alertas_operativas ALTER COLUMN rendicion_id DROP NOT NULL;

ALTER TABLE alertas_operativas DROP CONSTRAINT alertas_operativas_tipo_check;
ALTER TABLE alertas_operativas ADD CONSTRAINT alertas_operativas_tipo_check
  CHECK (tipo IN ('diferencia_efectivo','gasto_no_registrado','sin_rendicion','km_manual'));

-- 3 · Trigger: alerta automática cuando el KM se cargó a mano
--     (no dispara para 'ia' ni 'manual_offline'; idempotente por log+extremo)
CREATE OR REPLACE FUNCTION public.tg_daily_logs_alerta_km_manual()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.km_inicio_origen IN ('manual_ia_fallo','manual_editado') THEN
    INSERT INTO alertas_operativas (driver_id, fecha, tipo, log_id, extremo, diferencia_monto, estado)
    SELECT NEW.driver_id, NEW.log_date, 'km_manual', NEW.log_id, 'inicio',
           CASE WHEN NEW.km_inicio_ia IS NOT NULL THEN NEW.km_inicio - NEW.km_inicio_ia END,
           'pendiente'
    WHERE NOT EXISTS (
      SELECT 1 FROM alertas_operativas
      WHERE log_id = NEW.log_id AND tipo = 'km_manual' AND extremo = 'inicio');
  END IF;

  IF NEW.km_final_origen IN ('manual_ia_fallo','manual_editado') THEN
    INSERT INTO alertas_operativas (driver_id, fecha, tipo, log_id, extremo, diferencia_monto, estado)
    SELECT NEW.driver_id, NEW.log_date, 'km_manual', NEW.log_id, 'final',
           CASE WHEN NEW.km_final_ia IS NOT NULL THEN NEW.km_final - NEW.km_final_ia END,
           'pendiente'
    WHERE NOT EXISTS (
      SELECT 1 FROM alertas_operativas
      WHERE log_id = NEW.log_id AND tipo = 'km_manual' AND extremo = 'final');
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_logs_alerta_km_manual ON public.daily_logs;
CREATE TRIGGER trg_daily_logs_alerta_km_manual
AFTER INSERT OR UPDATE OF km_inicio_origen, km_final_origen
ON public.daily_logs
FOR EACH ROW
EXECUTE FUNCTION public.tg_daily_logs_alerta_km_manual();
```

- [ ] **Step 3: Aplicar con `apply_migration`** (descomentar el DROP NOT NULL si corresponde según Step 1)

- [ ] **Step 4: Probar el trigger con datos reales y revertir**

Run (MCP `execute_sql`, un batch):
```sql
-- tomar la última jornada cerrada
WITH j AS (SELECT log_id FROM daily_logs WHERE status='closed' ORDER BY log_date DESC LIMIT 1)
UPDATE daily_logs SET km_final_origen='manual_ia_fallo' WHERE log_id IN (SELECT log_id FROM j);
SELECT alerta_id, tipo, extremo, estado, diferencia_monto FROM alertas_operativas WHERE tipo='km_manual';
```
Expected: 1 fila `km_manual / final / pendiente / diferencia NULL`.

Luego revertir:
```sql
DELETE FROM alertas_operativas WHERE tipo='km_manual';
UPDATE daily_logs SET km_final_origen=NULL
WHERE log_id = (SELECT log_id FROM daily_logs WHERE km_final_origen='manual_ia_fallo' ORDER BY log_date DESC LIMIT 1);
```
Expected: 0 alertas km_manual; el UPDATE de reversión NO debe crear alerta nueva.

- [ ] **Step 5: Commit**
```bash
git add migrations/2026-07-14_km_manual_control.sql
git commit -m "feat(jornadas): columnas de origen de KM y alerta km_manual con trigger"
```

---

### Task 2: Captura en la app del chofer (sigma.js + supabase.js)

**Files:**
- Modify: `sigma.js:8127-8131` (globales), `sigma.js:8156-8161` y `sigma.js:8584-8591` (resets), `sigma.js:10881-11039` (`procesarFotoConIA`), `sigma.js:8651-8677` (`editarKmManual*`), `sigma.js:8432-8439` y `sigma.js:8378-8398` (confirmar inicio online/offline), `sigma.js:8864-8926` (cierre online/offline)
- Modify: `supabase.js:1307-1318` (`iniciarJornada` payload), `supabase.js:1376-1387` (`cerrarJornada` update)

- [ ] **Step 1: Globales nuevas** — después de `kmInicioExcepcion` (sigma.js:8131):

```javascript
// Trazabilidad del odómetro: qué leyó la IA y de dónde salió el KM confirmado
let kmIaInicio     = null;  // lectura IA al abrir (null = no leyó)
let kmIaFinal      = null;  // lectura IA al cerrar
let kmOrigenInicio = null;  // 'ia' | 'manual_ia_fallo' | 'manual_editado' | 'manual_offline'
let kmOrigenFinal  = null;
```

- [ ] **Step 2: Resetear al abrir cada modal** — donde hoy se resetean `fotoKmInicio`/áreas (sigma.js:8156-8161 para inicio, 8584-8591 para cierre), agregar:

```javascript
// inicio (junto al reset de nj-*):
kmIaInicio = null; kmOrigenInicio = null;
// cierre (junto al reset de cj-*):
kmIaFinal = null; kmOrigenFinal = null;
```

- [ ] **Step 3: `procesarFotoConIA` — registrar origen en las 3 ramas**

a) Rama offline (sigma.js:10904-10915), antes del `return`:
```javascript
if (isInicio) { kmIaInicio = null; kmOrigenInicio = 'manual_offline'; }
else          { kmIaFinal  = null; kmOrigenFinal  = 'manual_offline'; }
```

b) Éxito IA — en la rama inicio (después de `fotoKmInicio = urlPublica;`, línea ~10952):
```javascript
kmIaInicio = kmDetectado; kmOrigenInicio = 'ia';
```
y en la rama cierre (después de `fotoKmFinal = urlPublica;`, línea ~10984):
```javascript
kmIaFinal = kmDetectado; kmOrigenFinal = 'ia';
```

c) `catch` (sigma.js:11028-11038) — marcar fallo Y habilitar el campo manual (hoy solo dice "Reintentar"):
```javascript
if (isInicio) { kmIaInicio = null; kmOrigenInicio = 'manual_ia_fallo'; }
else          { kmIaFinal  = null; kmOrigenFinal  = 'manual_ia_fallo'; }
const manualAreaErr = document.getElementById(isInicio ? 'nj-km-manual-area' : 'cj-km-manual-area');
if (manualAreaErr) manualAreaErr.style.display = 'block';
msgStatus.innerHTML = `<span style="color: var(--red);">❌ ${error.message} Podés reintentar la foto o cargar los KM a mano.</span>`;
```
(la línea existente `msgStatus.innerHTML = ...` se reemplaza por esta)

- [ ] **Step 4: Helper de resolución de origen** — agregar cerca de `editarKmManual` (sigma.js:~8650):

```javascript
// Decide el origen final del KM al confirmar la jornada:
// la IA leyó y el valor coincide → 'ia'; leyó y difiere → 'manual_editado';
// no leyó → queda el origen que marcó el flujo ('manual_ia_fallo'/'manual_offline').
function _kmResolverOrigen(kmIa, kmIngresado, origenActual) {
  if (origenActual === 'manual_offline') return 'manual_offline';
  if (kmIa != null) return parseInt(kmIngresado) === parseInt(kmIa) ? 'ia' : 'manual_editado';
  return origenActual;
}
```

- [ ] **Step 5: Enviar en la apertura** — en `confirmarNuevaJornada`:

Payload offline (sigma.js:8378-8389), agregar al objeto `payloadOffline`:
```javascript
kmInicioIa:     kmIaInicio,
kmInicioOrigen: _kmResolverOrigen(kmIaInicio, kmInicio, kmOrigenInicio),
```
Llamada online (sigma.js:8432-8439), agregar al objeto de `iniciarJornada({...})`:
```javascript
kmInicioIa:     kmIaInicio,
kmInicioOrigen: _kmResolverOrigen(kmIaInicio, kmInicio, kmOrigenInicio),
```

- [ ] **Step 6: Enviar en el cierre** — en el flujo de cierre:

Payload offline (sigma.js:8864-8874), agregar a `payloadOffline`:
```javascript
kmFinalIa:     kmIaFinal,
kmFinalOrigen: _kmResolverOrigen(kmIaFinal, kmFinal, kmOrigenFinal),
```
Llamada online (sigma.js:8917-8926), agregar al objeto de `cerrarJornada(logIdCierre, {...})`:
```javascript
kmFinalIa:     kmIaFinal,
kmFinalOrigen: _kmResolverOrigen(kmIaFinal, kmFinal, kmOrigenFinal),
```

- [ ] **Step 7: Persistir en supabase.js**

`iniciarJornada` — agregar al `payload` del insert (supabase.js:1307-1318):
```javascript
km_inicio_ia:     datos.kmInicioIa ?? null,
km_inicio_origen: datos.kmInicioOrigen || null,
```
`cerrarJornada` — agregar al `.update({...})` (supabase.js:1376-1387):
```javascript
km_final_ia:     datos.kmFinalIa ?? null,
km_final_origen: datos.kmFinalOrigen || null,
```
Nota: `cerrarJornada` recibe `datos` desestructurado — verificar que use `datos.kmFinalIa` con el nombre real del parámetro dentro de la función. Los handlers del outbox (`offline.js:5382-5421`) hacen pass-through del payload, no requieren cambios.

- [ ] **Step 8: Verificación manual mínima** — servir la app (`Index.html`), como chofer: abrir jornada con foto que la IA lea bien → en SQL `SELECT km_inicio_ia, km_inicio_origen FROM daily_logs ORDER BY log_id DESC LIMIT 1;` → Expected: valor y `'ia'`. No debe haber alerta km_manual.

- [ ] **Step 9: Commit**
```bash
git add sigma.js supabase.js
git commit -m "feat(jornadas): capturar origen del KM (IA vs manual) en apertura y cierre"
```

---

### Task 3: Vistas admin — badge en lista y comparación en detalle

**Files:**
- Modify: `supabase.js:3198-3207` (`cargarJornadasAdmin` select), `supabase.js:3371-3382` (`cargarDetalleJornadaAdmin` select)
- Modify: `sigma.js:15454-15547` (`_jadminRenderFila`), `sigma.js:15691-15696` (odomCard en `_jadminRenderDetalle`)

- [ ] **Step 1: Agregar columnas a las dos queries** — en ambos `.select()` de daily_logs sumar:
```
km_inicio_ia, km_inicio_origen, km_final_ia, km_final_origen,
```
Verificar si `_jadminRenderFila` recibe filas mapeadas (buscar dónde `cargarJornadasAdmin` transforma `logs` en `r.chofer_nombre` etc.) y propagar los 4 campos en ese mapeo.

- [ ] **Step 2: Badge en la celda KM de la fila** — en `_jadminRenderFila`, antes del `return`, calcular:

```javascript
// Origen del KM: peor caso entre inicio y final
const _orgs = [r.km_inicio_origen, r.km_final_origen];
let origenBadge = '';
if (_orgs.includes('manual_ia_fallo') || _orgs.includes('manual_editado')) {
  origenBadge = '<span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700;background:rgba(245,166,35,0.12);color:var(--amber)">✏️ A MANO</span>';
} else if (_orgs.includes('manual_offline')) {
  origenBadge = '<span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700;background:rgba(133,144,171,0.15);color:var(--muted2)">📴</span>';
}
```
y en la celda KM (línea 15538) cambiar:
```javascript
<td class="right"><span class="${kmCls}">${kmTxt}</span>${origenBadge}</td>
```
(Se usa la celda KM existente en vez de una columna nueva para no tocar los headers de la tabla — misma información que el mockup.)

- [ ] **Step 3: Comparación en la tarjeta Odómetro del detalle** — en `_jadminRenderDetalle`, antes de `const odomCard = ...` (sigma.js:15691), agregar:

```javascript
const _kmCmpBloque = (extremo, origen, kmIa, kmChofer) => {
  if (!origen || origen === 'ia') return '';
  const lbl = extremo === 'inicio' ? 'KM inicio' : 'KM final';
  const esOffline = origen === 'manual_offline';
  const iaTxt = kmIa != null
    ? Number(kmIa).toLocaleString('es-AR') + ' km'
    : (esOffline ? '— sin conexión al momento de la carga' : '— no pudo leer la foto');
  const diff = (kmIa != null && kmChofer != null) ? kmChofer - kmIa : null;
  const borde = esOffline ? 'var(--border2)' : 'rgba(245,166,35,0.45)';
  const fondo = esOffline ? 'rgba(255,255,255,0.02)' : 'rgba(245,166,35,0.12)';
  const titulo = esOffline
    ? `📴 ${lbl} cargado a mano por falta de señal`
    : `⚠ ${lbl} modificado manualmente`;
  const tituloColor = esOffline ? 'var(--muted2)' : 'var(--amber)';
  return `
    <div style="border:1px solid ${borde};background:${fondo};border-radius:8px;padding:10px 12px;margin-top:10px">
      <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:${tituloColor};margin-bottom:8px">${titulo}</div>
      <div style="display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0">
        <span style="color:var(--muted2)">Resultado generado por IA</span>
        <span style="font-family:'DM Mono',monospace;font-weight:600">${iaTxt}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0">
        <span style="color:var(--muted2)">Resultado generado por chofer</span>
        <span style="font-family:'DM Mono',monospace;font-weight:600">${kmChofer != null ? Number(kmChofer).toLocaleString('es-AR') + ' km' : '—'}</span>
      </div>
      ${diff != null ? `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0">
        <span style="color:var(--muted2)">Diferencia</span>
        <span style="font-family:'DM Mono',monospace;font-weight:600;color:var(--amber)">${diff > 0 ? '+' : ''}${diff.toLocaleString('es-AR')} km</span>
      </div>` : ''}
    </div>`;
};
const kmCmpHtml = _kmCmpBloque('inicio', log.km_inicio_origen, log.km_inicio_ia, log.km_inicio)
                + _kmCmpBloque('final',  log.km_final_origen,  log.km_final_ia,  log.km_final);
```
y en `odomCard` agregar `${kmCmpHtml}` después de `<div class="jd-fotos">${fotoIni}${fotoFin}</div>`.

- [ ] **Step 4: Verificar en navegador** — con la jornada de prueba del Task 1 (o simulando `UPDATE daily_logs SET km_final_origen='manual_editado', km_final_ia = km_final - 62 WHERE log_id = <última cerrada>;`): la lista muestra `✏️ A MANO` y el detalle muestra el bloque con IA, chofer y diferencia `+62 km`. Revertir el UPDATE de prueba (origen NULL, ia NULL) y borrar la alerta generada.

- [ ] **Step 5: Commit**
```bash
git add sigma.js supabase.js
git commit -m "feat(jornadas): badge de origen de KM en lista y comparación IA vs chofer en detalle"
```

---

### Task 4: Centro de alertas — tipo km_manual con Aprobar/Rechazar

**Files:**
- Modify: `supabase.js` (junto a `cargarAlertasOperativas`, línea ~1980)
- Modify: `sigma.js:3418` (mapa TIPO), `sigma.js:~17231` (`_alxRender`) y sección de fetch `_alxFetch*` (~16980)

- [ ] **Step 1: Funciones de datos en supabase.js** (después de `cargarAlertasOperativas`):

```javascript
// Alertas de KM cargado a mano, con datos de jornada para mostrar la comparación.
async function cargarAlertasKmManual() {
  const { data: alertas, error } = await _db.from('alertas_operativas')
    .select('alerta_id, driver_id, fecha, log_id, extremo, diferencia_monto, estado, created_at')
    .eq('tipo', 'km_manual').eq('estado', 'pendiente')
    .order('created_at', { ascending: false }).limit(50);
  if (error) { console.error('cargarAlertasKmManual:', error); return []; }
  if (!alertas?.length) return [];

  const logIds = [...new Set(alertas.map(a => a.log_id).filter(Boolean))];
  const [logsRes, usersRes] = await Promise.all([
    _db.from('daily_logs')
      .select('log_id, km_inicio, km_final, km_inicio_ia, km_final_ia, patente_camion, truck:trucks!truck_id(plate, numero_interno)')
      .in('log_id', logIds),
    _db.from('users').select('user_id, full_name').in('user_id', [...new Set(alertas.map(a => a.driver_id))]),
  ]);
  const logsMap = {}; (logsRes.data || []).forEach(l => { logsMap[l.log_id] = l; });
  const uMap = {};    (usersRes.data || []).forEach(u => { uMap[u.user_id] = u.full_name; });

  return alertas.map(a => {
    const l = logsMap[a.log_id] || {};
    const esInicio = a.extremo === 'inicio';
    return {
      ...a,
      chofer_nombre: uMap[a.driver_id] || '—',
      patente:  l.truck?.plate || l.patente_camion || '—',
      movil:    l.truck?.numero_interno || null,
      km_ia:     esInicio ? l.km_inicio_ia : l.km_final_ia,
      km_chofer: esInicio ? l.km_inicio    : l.km_final,
    };
  });
}

// Aprueba o rechaza una alerta km_manual con nota obligatoria.
async function resolverAlertaKmManual(alertaId, estado, nota) {
  const { error } = await _db.from('alertas_operativas').update({
    estado,                       // 'aprobado' | 'rechazado'
    nota_resolucion: nota,
    resuelto_por: USUARIO_ACTUAL?.id || null,
    resuelto_at:  new Date().toISOString(),
  }).eq('alerta_id', alertaId);
  if (error) { console.error('resolverAlertaKmManual:', error); return false; }
  return true;
}
```

- [ ] **Step 2: Etiqueta del tipo nuevo** — sigma.js:3418, agregar al mapa TIPO:
```javascript
km_manual: '✏️ KM cargado a mano',
```

- [ ] **Step 3: Sección en el centro de alertas** — leer `_alxRender` (sigma.js ~17150-17300) y las funciones `_alxFetch*` para seguir el patrón existente. Agregar un fetch `cargarAlertasKmManual()` al conjunto de datos del centro, y renderizar cada alerta como tarjeta (mismo estilo que el mockup):

```javascript
function _alxCardKmManual(a) {
  const kmIaTxt = a.km_ia != null
    ? `la IA leyó <span style="font-family:'DM Mono',monospace">${Number(a.km_ia).toLocaleString('es-AR')}</span>`
    : 'la IA <strong>no pudo leer la foto</strong>';
  const diffTxt = (a.km_ia != null && a.km_chofer != null)
    ? ` (<span style="color:var(--amber)">${a.km_chofer - a.km_ia > 0 ? '+' : ''}${(a.km_chofer - a.km_ia).toLocaleString('es-AR')} km</span>)` : '';
  const lbl = a.extremo === 'inicio' ? 'KM inicio' : 'KM final';
  return `
    <div style="background:var(--panel);border:1px solid rgba(245,166,35,0.4);border-left:4px solid var(--amber);border-radius:10px;padding:12px 14px;margin-bottom:10px" id="alx-km-${a.alerta_id}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:12px;font-weight:700;color:var(--amber)">✏️ KM cargado a mano</span>
        <span style="font-size:11px;color:var(--muted2)">${formatearFecha(a.fecha)}</span>
      </div>
      <div style="font-size:12.5px;line-height:1.5;margin:6px 0 10px">
        <strong>${_escHtml(a.chofer_nombre)}</strong> · ${_escHtml(a.patente)}${a.movil ? ' #' + _escHtml(a.movil) : ''}<br>
        ${lbl}: ${kmIaTxt} y el chofer cargó <span style="font-family:'DM Mono',monospace">${a.km_chofer != null ? Number(a.km_chofer).toLocaleString('es-AR') : '—'}</span>${diffTxt}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost" style="font-size:11.5px" onclick="abrirDetalleJornadaAdmin(${a.log_id})">Ver jornada</button>
        <button class="btn" style="font-size:11.5px;background:rgba(39,196,122,0.12);color:var(--green);border:1px solid rgba(39,196,122,0.4)" onclick="_alxResolverKm('${a.alerta_id}','aprobado')">✓ Aprobar</button>
        <button class="btn" style="font-size:11.5px;background:rgba(226,80,74,0.12);color:var(--red);border:1px solid rgba(226,80,74,0.4)" onclick="_alxResolverKm('${a.alerta_id}','rechazado')">✕ Rechazar</button>
      </div>
      <div style="margin-top:10px">
        <input id="alx-km-nota-${a.alerta_id}" placeholder="Nota de revisión (obligatoria)…"
          style="width:100%;background:var(--bg);border:1px solid var(--border2);border-radius:7px;padding:8px 10px;color:var(--text);font-size:12px;font-family:inherit">
      </div>
    </div>`;
}

async function _alxResolverKm(alertaId, estado) {
  const nota = document.getElementById(`alx-km-nota-${alertaId}`)?.value?.trim();
  if (!nota) { toast('Escribí la nota de revisión antes de resolver', 'error'); return; }
  const ok = await resolverAlertaKmManual(alertaId, estado, nota);
  if (!ok) { toast('No se pudo guardar la resolución', 'error'); return; }
  toast(estado === 'aprobado' ? 'Alerta aprobada ✓' : 'Alerta rechazada', 'success');
  document.getElementById(`alx-km-${alertaId}`)?.remove();
}
```
Integración: dentro de `_alxRender`, sumar una sección "KM cargados a mano" que mapee `alertasKm.map(_alxCardKmManual).join('')`, siguiendo el markup de las secciones existentes del centro. Si el centro usa contadores/badges por sección, sumar el contador correspondiente.

- [ ] **Step 4: Verificar en navegador** — recrear una alerta de prueba (`UPDATE daily_logs SET km_final_origen='manual_editado', km_final_ia = km_final - 62 WHERE log_id = <última cerrada>;`), abrir el centro de alertas como admin: aparece la tarjeta; Aprobar sin nota → error; con nota → desaparece y en SQL queda `estado='aprobado'` con nota y resuelto_por. Revertir datos de prueba (origen NULL, ia NULL, DELETE de la alerta).

- [ ] **Step 5: Commit**
```bash
git add sigma.js supabase.js
git commit -m "feat(alertas): tipo km_manual con revisión aprobar/rechazar y nota obligatoria"
```

---

### Task 5: Cache del service worker + deploy + verificación E2E

**Files:**
- Modify: `sw.js` (constante de versión del cache, hoy ~v92)

- [ ] **Step 1: Bump del cache** — en `sw.js`, incrementar la versión del cache en 1 (buscar `const CACHE` o similar al inicio del archivo).

- [ ] **Step 2: Commit y push**
```bash
git add sw.js
git commit -m "chore: bump cache service worker por control de KM manual"
git push
```

- [ ] **Step 3: Verificación E2E (manual, producción)** — checklist de la spec:
1. Jornada con IA OK → sin alerta, sin badge ✏️.
2. Foto ilegible (foto de cualquier cosa) → se habilita el campo manual, al confirmar aparece alerta y comparación en el detalle.
3. IA lee y el chofer corrige con "editar" → alerta con diferencia en km.
4. Modo avión → badge 📴 al sincronizar, sin alerta.
5. Aprobar/rechazar con nota → estado y nota quedan en la base.

Reportar resultados al usuario antes de dar por cerrada la feature.
