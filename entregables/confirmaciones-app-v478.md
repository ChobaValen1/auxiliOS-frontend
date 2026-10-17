# Confirmaciones de edición dentro de AuxiliOS

Build de prueba: `etapa2-confirmaciones-v478-20261017`. Destino: rama `claude/auxilios-3zj57q`, proyecto Vercel `auxilios-frontend`. Producción no se promueve.

- Salir o cancelar el formulario de un particular usa un modal de AuxiliOS: «Seguir editando» / «Salir sin guardar», con el servicio identificado. Cerrar el aviso o pulsar Escape conserva los datos.
- Descartar correcciones administrativas o cerrar el panel de un remito usa el mismo componente. Cancelar conserva campos y motivo. Descartar la corrección vuelve al detalle; confirmar el cierre cierra el panel. No se guardan cambios ni se elimina el remito.
- Tarifas deja de recurrir a `window.confirm` si no está disponible su confirmador habitual. Usa el confirmador de AuxiliOS y, si tampoco está listo, conserva los datos y muestra un error: no continúa silenciosamente.
- Las confirmaciones de guardar cambios ya eran de la app y se mantienen. Las de salir de un servicio de prestadora también eran internas y se conservan. No se reemplaza globalmente `window.confirm`, porque otros flujos esperan una respuesta síncrona.
- No se abren avisos duplicados. Una respuesta tardía no cierra un formulario distinto ni otro remito abierto posteriormente. Un guardado en curso no se descarta por este flujo.
- La alerta al recargar, cerrar la pestaña o abandonar el sitio completo es la protección `beforeunload` del navegador. No se puede convertir en un modal de la app durante ese evento; se mantiene para evitar pérdida de cambios.

## Verificación

Sintaxis y seguridad correctas; cinco pruebas nuevas de cancelación, aceptación, contexto reemplazado, concurrencia, falta del componente y protección al abandonar la pestaña. El QA de primera etapa se amplió con formularios reales y datos/RPC simulados: salida del particular, conservar datos con Escape/Cancelar, confirmación duplicada, cierre de otro contexto impedido, cancelar/cerrar remitos y ausencia de diálogos nativos. Las pruebas de confirmación de guardado y calculadora siguen incluidas.

Suite completa: 901 pruebas, 897 correctas y los cuatro fallos previos de saltos de línea de Windows ya documentados. Sin nuevas regresiones identificadas.

Capturas de 1440 y 390 px: `output/etapa-1/salir-sin-guardar-desktop.png` y `salir-sin-guardar-mobile.png`, dentro de la carpeta principal del trabajo. Sin cambios de backend, migraciones ni escrituras sobre registros reales.
