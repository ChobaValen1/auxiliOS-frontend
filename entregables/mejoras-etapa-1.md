# Primera etapa de mejoras — revisión en preview

Fecha: 17/10/2026. Build: `etapa1-v475-20261017`.
Destino autorizado: rama `claude/auxilios-3zj57q`, proyecto Vercel `auxilios-frontend`.

## Cambios para revisar

- Editar un servicio de prestadora o particular muestra una confirmación con los valores anteriores y nuevos. Volver a editar, cerrar o presionar Escape conserva el formulario sin guardar.
- El motivo obligatorio de edición se reemplaza por la confirmación. Se envía una nota automática y se conserva la auditoría y la validación de permisos del backend.
- La asignación y su cambio de estado aparecen en el mismo resumen que los demás cambios.
- Los servicios con preparación de remito iniciada o borrador pendiente muestran un aviso ámbar. Desaparece al recibir la firma, finalizar o anular. Usa los datos disponibles en las consultas existentes y el refresco habitual de Servicios; no indica que el chofer esté escribiendo en tiempo real.
- En Editar particular aparece Registrar cobro cuando hay saldo y el servicio sigue abierto. Si hay modificaciones, primero se confirman y guardan. Cancelar o fallar ese guardado no abre el cobro.
- Las cantidades de conceptos por hora y los excedentes Hora Trabajo / Hora Espera se cargan en minutos, con equivalencia legible. El precio se conserva por hora, así como las cantidades que recibe el backend. Ejemplo: 30 min a $12.000/h = $6.000.
- Colores, tipografía, botones, bordes y estados usan los componentes y tokens existentes de AuxiliOS.

No se aplicaron migraciones ni cambios al backend. La publicación de esta entrega se limita al frontend de preview; producción requiere aprobación posterior.

## Verificación

- Comprobaciones de sintaxis y seguridad: correctas.
- Suite Node: 885 pruebas, 881 correctas y 4 fallos reproducidos en la base original `f9a8122` en Windows. Son aserciones previas sensibles a saltos de línea en las pruebas de detalle de camión, formulario compacto y panel de remitos. No se modificó su implementación.
- QA de navegador con módulos reales y RPC simuladas: confirmación, cancelación, Escape, error y reintento, conversión en input y change, preservación de importes, edición administrativa, acceso al cobro con cambios pendientes y ocultamiento en servicios cerrados. Revisado en escritorio de 1440 px y móvil de 390 px.
- Las pruebas de interfaz no registran cobros ni editan servicios reales. Falta la revisión del usuario en el enlace de preview con sus casos operativos.

## Recorrido de revisión sugerido

1. Editar un servicio y cambiar Observaciones. Guardar, revisar Antes / Después y volver a editar.
2. Volver a guardar y confirmar. Verificar los datos y el historial.
3. Revisar un servicio con remito pendiente y otro ya firmado.
4. Cargar 15, 30 y 60 minutos de espera o trabajo y comprobar el total al precio por hora.
5. Editar un particular con saldo y abrir Registrar cobro. Probar también cancelar una modificación antes de abrirlo.
6. Aprobar la entrega o indicar ajustes visuales y funcionales antes de promover a producción.
