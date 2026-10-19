# Tarifas de tercerizados y calculadora de particulares

Definición recibida el 17/10/2026: importes configurables por km y servicio, monto fijo y otros conceptos. Para particulares: movida, precio por km, peajes y adicionales, como en una prestadora.

Build de preview: `etapa2-calculadora-v477-20261017`. Rama autorizada: `claude/auxilios-3zj57q`.

## Separación de importes

El costo pactado con el tercerizado y el presupuesto al cliente son configuraciones independientes. No se infiere un porcentaje de comisión ni se iguala el precio de venta al costo. Una calculadora no registra pagos ni da un servicio por liquidado.

## Implementado en frontend de prueba

En Nuevo / Editar particular, junto a Presupuesto: «Calcular presupuesto». Importes editables para el servicio abierto:

- Movida + km de asfalto × tarifa + km de ripio × tarifa.
- Monto fijo, que reemplaza movida y km.
- Precio por servicio × cantidad, como alternativa al monto fijo o al cálculo por distancia.
- Peajes y adicionales identificados, con cantidad y precio unitario; se suman a la modalidad elegida.
- Desglose visible, validación de importes, hasta dos decimales monetarios y tres en cantidades. Las líneas se redondean a centavos y el presupuesto al peso, como el formulario actual. No agrega IVA, recargos, viaje de regreso ni radios cubiertos de forma implícita.

La distancia calculada en el formulario puede precargar los km al abrir la calculadora por primera vez; son editables y no cambian la ruta. Si se modifica la ruta después de abrir el cálculo, el operador debe revisar esos km. Si no hay distancia disponible, no se inventa.

«Usar presupuesto» sólo completa el campo, sin escribir en la base. No admite un presupuesto menor a lo ya cobrado. Al editar se mantiene la confirmación de cambios existente antes de guardar. Cerrar el cálculo no aplica el total. Los servicios cerrados no ofrecen esta nueva acción.

Esta entrega es un cálculo manual por servicio: no presenta sus valores como tarifas institucionales guardadas. El borrador y su desglose viven en el formulario abierto; únicamente el presupuesto total se guarda mediante el flujo existente al guardar el servicio. Los peajes y adicionales de la calculadora no se crean como conceptos operativos ni se suman una segunda vez al presupuesto.

## Próximo backend de prueba — todavía no implementado

Tarifario por proveedor tercerizado y tipo de servicio, con vigencia y moneda, modalidad km + servicio / por servicio / monto fijo, conceptos adicionales y reglas explícitas de peajes (incluidos o aparte). Registrar una copia de las condiciones pactadas en cada servicio para conservar acuerdos históricos aunque cambie el tarifario. El cálculo debe validarse en servidor y quedar separado del cobro al cliente.

Los accesos de usuarios externos requieren definir qué servicios y documentos pueden ver; no se reutilizan permisos de Administración. Registrar pagos al tercero, saldo pendiente y liquidación requiere movimientos auditados, sin marcar pagos automáticamente por asignación o finalización.

Para los particulares: tarifarios reutilizables por tipo de servicio, vigencia, movida, km, peajes y adicionales, con posibilidad de ajuste autorizado por servicio. Guardar el desglose aprobado para auditoría. La calculadora actual queda como primer paso y no sustituye esa configuración persistente.

Estos cambios requieren aislamiento del backend de prueba o autorización específica: la preview actual comparte Supabase con producción. No se aplicaron migraciones, cambios de roles ni escrituras de datos para esta entrega.

## Verificación

Pruebas unitarias del motor de cálculo y ampliación del QA de primera etapa con formulario real y RPC simuladas: presupuesto antes/después, desglose, cobro mínimo, cerrar sin aplicar, ausencia de escrituras automáticas, servicios cerrados y tamaños de escritorio/celular. Capturas en `output/etapa-1/calculadora-desktop.png` y `calculadora-mobile.png` de la carpeta principal del trabajo.

Sintaxis y seguridad correctas; seis pruebas nuevas del motor correctas. Suite completa: 896 pruebas, 892 correctas y los cuatro fallos previos de saltos de línea de Windows documentados en las entregas anteriores.
