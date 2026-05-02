# Spec: Mobile UX — Mejoras en pantallas reducidas

**Fecha:** 2026-05-01  
**Alcance:** sigma.css, Index.html, sigma.js

---

## Objetivo

Mejorar la experiencia en mobile (≤600px) sin romper el comportamiento desktop. Cinco áreas: tablas con lista compacta + modal de detalle, grids responsivos, filtros del dashboard, grids internos de modales, y canvas de firma más grande.

---

## 1. Tablas → Lista compacta + modal de detalle

### Patrón general — Hybrid render (igual que Remitos)

El proyecto ya usa el patrón `.desktop-only` / `.mobile-only` para la tabla de Remitos. Se aplica el mismo approach a las tres tablas restantes:

- La función JS que renderiza cada tabla genera **dos salidas en paralelo**:
  1. Un `<tr>` normal para la tabla de desktop (sin `onclick`)
  2. Un `<div>` de lista compacta para mobile (con `onclick` para abrir el modal)
- El CSS existente (`.desktop-only { display:none }` / `.mobile-only { display:block }` a ≤767px) controla cuál es visible
- El `onclick` vive **solo** en los `<div>` del mobile list — los `<tr>` de desktop no tienen onclick, eliminando el edge case de que el modal se abra en desktop por accidente

**Guard clause en `_abrirDetalleMovil` (defensa en profundidad):**
```javascript
function _abrirDetalleMovil(titulo, htmlContent) {
  if (window.innerWidth > 600) return;
  // ...
}
```

### Modal reutilizable `#modal-mobile-detalle`

Un único modal en Index.html con estructura:
```html
<div class="modal-backdrop" id="modal-mobile-detalle">
  <div class="modal-box">
    <div class="modal-head">
      <span class="modal-head-title" id="mmd-titulo">—</span>
      <button class="modal-close" onclick="closeModal('modal-mobile-detalle')">×</button>
    </div>
    <div class="modal-body" id="mmd-body"></div>
  </div>
</div>
```

Función JS: `_abrirDetalleMovil(titulo, htmlContent)` — guard clause de ancho, setea `#mmd-titulo` y `#mmd-body`, luego llama `openModal('modal-mobile-detalle')`.

### 1.1 Tabla: Historial de jornadas (`#tbody-historial-jornadas`)

**Fila compacta** (lo que se ve en la lista):
```
[border-left color estado] Fecha · N° Móvil (PATENTE)        [pill Estado] ›
```

**Modal de detalle** (al tocar la fila):
```
Header: Fecha · N° Móvil (PATENTE) — pill Estado

Grid 2 columnas:
  KM Inicio: XXX.XXX    |  Taller: Sí/No
  KM Final:  XXX.XXX    |  Hs Totales: XXh XXm

Recorrido: XXX.XXX km   (full width, destacado en verde)
```

Color del borde izquierdo por estado:
- Cerrada → `#4ade80` (verde)
- Abierta → `#f59e0b` (naranja)
- Anulada → `#ef4444` (rojo)

La función que renderiza jornadas genera en paralelo un contenedor `#mobile-jornadas-list` (`.mobile-only`) con `<div>` items que tienen `onclick="_abrirDetalleJornada(data)"`. El `<tbody>` existente mantiene `.desktop-only`.

### 1.2 Tabla: Viajes del día (`#tbody-servicios-dia`)

**Fila compacta:**
```
[border-left azul] N°XXXXX · PATENTE — Origen → Destino (truncado)    [pill Estado] ›
```

**Modal de detalle:**
```
Header: N°XXXXX · PATENTE · Tipo de servicio — pill Estado

Ruta destacada:
  Origen          →          Destino

Grid 2 columnas:
  Salida: HH:MM    |  KM: XXX km
  Peaje: $X.XXX    |  Excedente: —
```

Color del borde izquierdo por estado:
- Completado → `#4ade80`
- En curso → `#f59e0b`
- Anulado → `#ef4444`

La función que renderiza viajes genera en paralelo un contenedor `#mobile-viajes-list` (`.mobile-only`). El `<tbody>` existente mantiene `.desktop-only`.

### 1.3 Tabla: Historial de services (`#tbody-services`)

**Fila compacta:**
```
[border-left verde] Fecha · Nombre del service    KM: XXX.XXX ›
```

**Modal de detalle:**
```
Header: Nombre del service — Fecha

Grid 2 columnas:
  KM al service: XXX.XXX  |  Taller: Nombre
  Costo: $X.XXX           |  Próximo: XXX.XXX km
```

La función que renderiza services genera en paralelo un contenedor `#mobile-services-list` (`.mobile-only`). El `<tbody id="tbody-services">` mantiene `.desktop-only`.

---

## 2. Grids responsivos

Agregar al final de sigma.css dentro del bloque `@media (max-width: 600px)` (o crear uno nuevo si no existe a esa medida):

```css
@media (max-width: 600px) {
  .grid-2,
  .grid-3,
  .grid-4 {
    grid-template-columns: 1fr !important;
  }
}
```

---

## 3. Filtros del Dashboard

Tres fixes en sigma.css dentro de `@media (max-width: 767px)`:

```css
.dash-period-row {
  flex-wrap: wrap;
  gap: 6px;
}
.dash-filter-row {
  flex-wrap: wrap;
  gap: 6px;
}
.dash-filter-dd {
  min-width: min(220px, calc(100vw - 32px));
}
.dash-filter-btn {
  min-width: 140px;
}
```

---

## 4. Grids internos de modales

Los modales de Combustible, Service y Neumáticos tienen grids `1fr 1fr` hardcodeados como `style="display:grid;grid-template-columns:1fr 1fr;gap:12px"`. En mobile estos quedan muy angostos.

**Fix:**
1. Agregar clase `.form-grid-2` en sigma.css:
```css
.form-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 480px) {
  .form-grid-2 {
    grid-template-columns: 1fr;
  }
}
```

2. Reemplazar los `style="display:grid;grid-template-columns:1fr 1fr;gap:12px"` inline en Index.html por `class="form-grid-2"` en:
   - Modal combustible: grid de Litros + Precio/litro
   - Modal service: grid de Fecha + KM al realizar
   - Modal neumáticos: grid de Estado neumáticos + PSI

---

## 5. Canvas de firma (Remito)

En sigma.css, dentro del bloque `@media (max-width: 767px)`, actualizar:

```css
#sig-canvas {
  height: 200px !important;
}
#sig-canvas-firma {
  height: 200px !important;
}
```

(Actualmente están en 160px y 180px respectivamente — insuficiente para firmar con el dedo.)

---

## 6. Fuera de alcance

- No se modifica la lógica de DB ni supabase.js.
- No se cambia el comportamiento en desktop (>600px) en ninguna tabla.
- No se rediseña la navegación principal ni el bottom nav.
- No se agregan gestos de swipe.
- El modal `#modal-mobile-detalle` es solo de lectura — no tiene botones de acción.
