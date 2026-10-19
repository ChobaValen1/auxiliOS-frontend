# Particular compacto y Sin costo · v481

## Alcance y publicación

- Interfaz: únicamente Preview, rama `claude/auxilios-3zj57q`. Sin publicar el frontend en producción.
- Backend: el usuario autorizó expresamente ajustar la base compartida `sigma-remolques` para Sin costo.
- Migración aplicada por Supabase: `20261017235104_particulares_sin_costo_v1`. El SQL reproducible está en `migrations/`; los originales están en `entregables/rollback/particulares-sin-costo.sql`.
- No se modificaron servicios existentes ni se crearon servicios/pagos de prueba en la base compartida.

## Cambios

- Ancho máximo de 1180 a 1298 px (+10%). Primera columna compacta, sin ocultar campos: cliente; vehículo/tipo/base; recorrido A/B y horario; observaciones; asignación y Pinacars.
- Calculadora en el extremo superior derecho de Presupuesto, con icono y acento ámbar. Sigue siendo una herramienta modal de la app.
- Medio de pago en lista desplegable. Factura comparte la fila en escritorio; los controles se adaptan a tamaños pequeños.
- Precio total, anticipo/pagos registrados y saldo separados. Se corrige la actualización del saldo al editar un servicio que ya tiene pagos.
- Desglose desplegable al aplicar un cálculo. Es un borrador de la sesión: sólo el precio total se persiste; cambiar manualmente el total descarta ese desglose.
- Sin costo explícito: gentileza de la empresa, presupuesto $0, saldo $0, sin depósito ni pagos ficticios. Al desmarcarlo se restaura el importe que se estaba editando.
- No permite volver gratuito un servicio con cobros registrados ni modificar uno ya facturado. Los servicios normales siguen exigiendo presupuesto positivo.
- Se conserva la marca en `pricing_snapshot.no_charge` y se recupera al editar. No se cambiaron firmas de las RPC, roles ni permisos de ejecución.

## Verificación

- 50 pruebas focalizadas aprobadas (incluyen SQL real en Postgres local/PGlite, roles, importes, alta, corrección, ingreso y facturación).
- Suite completa: 912 pruebas, 908 aprobadas; mismos 4 fallos previos por expectativas LF sobre archivos CRLF de Windows, ajenos a estos cambios.
- QA de navegador con módulos/estilos reales y RPC simuladas: formulario completo visible a 1544×692, total/anticipo/saldo visibles con seña, anchos 320/390/560/820/1224, factura, programación, calculadora, Escape, medios de pago, edición histórica y alta Sin costo.
- Sintaxis y controles de seguridad aprobados. Comparación de funciones desplegadas: coinciden con el SQL probado; ACL sin cambios.
- Revisión Supabase antes/después: ninguna alerta nueva; se mantienen las 212 observaciones previas, fuera de alcance. Referencia: https://supabase.com/docs/guides/database/database-linter
