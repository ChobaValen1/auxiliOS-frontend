# Spec: Mobile UX — Mejoras en pantallas reducidas

**Fecha:** 2026-05-01  
**Alcance:** sigma.css, Index.html, sigma.js

---

## Objetivo

Mejorar la experiencia en mobile (≤600px) sin romper el comportamiento desktop. Cinco áreas: tablas con lista compacta + modal de detalle, grids responsivos, filtros del dashboard, grids internos de modales, y canvas de firma más grande.

---

## 1. Tablas → Lista compacta + modal de detalle

### Patrón general

En mobile (≤600px), las tablas con muchas columnas se reemplazan por:
- **Lista de filas compactas**: una línea por registro con la info más relevante y un chevron `›`
- **Modal de detalle** (`#modal-mobile-detalle`): al tocar una fila, se abre un modal reutilizable con todos los campos del registro

En desktop (>600px) no cambia nada — las tablas siguen siendo tablas.

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

Función JS: `_abrirDetalleMovil(titulo, htmlContent)` — setea `#mmd-titulo` y `#mmd-body`, luego abre el modal.

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

La función que renderiza `#tbody-historial-jornadas` en sigma.js debe agregar `onclick="_abrirDetalleJornada(this)"` a cada `<tr>` y almacenar los datos como `data-*` attributes en la fila.

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
