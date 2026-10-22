# AuxiliOS · Motion para la versión de prueba

Integración progresiva sobre `claude/auxilios-3zj57q`, base `c872369`.
No sustituye la aplicación por la demo React ni incorpora datos ilustrativos a sus pantallas.

## Arquitectura

La app existente es HTML/JS con algunas islas React 18 cargadas a demanda. No utiliza
Tailwind v4, TypeScript ni shadcn globalmente. Se conserva esa arquitectura: esta capa
se escribe en TypeScript y compila Motion 12.43.0 a un IIFE estático independiente.
No se instala una segunda versión de React ni un reset de Tailwind sobre los formularios.

El mismo motor de animación de la demo aprobada se aplica al DOM real:

- Menú con indicador móvil, expansión temporal por mouse/foco y navegación móvil flotante.
- Logo original, sin cambios en tokens, fuentes ni los colores oscuro/claro existentes.
- Entradas escalonadas de tarjetas, modales con resorte e indicador animado de filtros.
- Avisos apilados de altura variable, expansión táctil/teclado, cola de tres visibles,
  temporizadores coordinados y errores siempre expandidos hasta descartarlos.
- Botones `AxUI.busy` con deduplicación, estados, reintento y restauración de nodos originales.
  El formulario de particulares usa sus propios estados reales; no se altera su guardado.
- Revelado circular al elegir tema. Se conserva Oscuro/Claro/Sistema, almacenamiento por
  usuario y fallback inmediato cuando View Transitions no está disponible.
- Respeto de movimiento reducido, incluso al cambiar la preferencia del sistema.

No se modifica Supabase, auth, permisos, fórmulas, RPC, mapas ni datos. No se copian
las métricas, mapas ficticios o formularios simulados de la demo al producto.

## Compilación

Node 22.12+ (verificado con Node 24). Desde la raíz:

```sh
npm run build:motion
```

Los archivos en `ui/motion/` se versionan para conservar el despliegue estático actual.
Vercel no necesita detectar Vite ni cambiar su directorio de salida. La capa agrega
aproximadamente 10 KB comprimidos entre JS y CSS. Su CSS no redefine colores.

Documentación del motor: https://motion.dev/docs/animate y https://motion.dev/docs/spring.
Las interacciones adaptan la demo aprobada; no se presentan como los componentes
React originales de Aceternity o Magic UI instalados en la app legacy.

## Verificación

Requiere Playwright/Edge disponibles en el entorno:

```sh
node scripts/verify-motion.cjs
node scripts/verify-stage1.cjs --motion-scope
npm run check
```

`verify-motion.cjs --serve` abre una muestra aislada en `127.0.0.1:4875/__qa`.
Usa el menú y recursos reales con datos simulados; bloquea peticiones externas en QA.
No es la URL del producto ni se despliega como una página de la app.

Se verificaron escritorio, 390/320 px, teclado/foco, persistencia del tema, roles
ocultos, avisos/cola/pausa, errores, reintento, deduplicación y restauración del botón.
El recorrido real del formulario verificó calculadora, confirmaciones, cancelación,
error y guardado con RPC simuladas, también en 560/820 px.

Suite general: 1.000 pruebas ejecutadas; nueve fallos previos reproducidos en la base
mediante `scripts/motion-baseline.cjs` (lectura de Git, sin cambiar el checkout).
Se corrigió el fallo nuevo de cache/versionado y se volvió a verificar. No se declara
la suite general completamente verde. El recorrido histórico completo de stage1
tiene además un selector administrativo desactualizado (`data-aa-kind`); el alcance
`--motion-scope` se detiene antes de esa sección y pasa sin omitir las pantallas modificadas.

## Publicación y datos

Sólo preview, build `motion-v517-20261022`. No promover a producción.
La preview comparte base de datos con producción: las pruebas automáticas NO se hacen
contra esa base. Crear servicios/cobros desde la preview real sí afecta datos compartidos.
Reversión: revertir el commit de esta entrega en la rama de preview; no aplicar cambios de BD.
