# Pendientes

Lista de cambios que faltan hacer. Se tachan (o se borran) a medida que se hacen.

## Para hacer

- [ ] Control del camión · vista del chofer: checklist simple del día (neumáticos, frenos, combustible). Falta confirmar.
- [ ] Mantenimiento: planes base por tipo de camión (se aplican a todos los móviles de una vez). Falta confirmar.
- [ ] Mantenimiento: pasar el móvil a taller desde un service vencido y bloquear asignaciones. Falta decidir: puede frenar a choferes en producción.
- [ ] Documentación: leer el vencimiento desde la foto del documento (como el ticket de combustible). Falta confirmar.

## Para confirmar

- [ ] DNI/CUIT en el alta de Particular: hoy acepta 8 u 11 dígitos. Confirmar si el DNI puede tener 7 o 9.
- [ ] "Si es Programado quiero que se pueda poner…": el mensaje quedó cortado, falta saber qué se quería agregar.
- [ ] Particular que el cliente no termina de pagar: hoy no se puede finalizar. ¿Hace falta una excepción de Administración, con motivo, para cerrarlo igual?

## Para probar con datos de QA

- [ ] AuxiliosQA firma un remito → el servicio desaparece de su lista y se le puede asignar otro servicio enseguida.

- [ ] Editar un particular con el remito sin firmar (el caso con remito firmado ya se probó).
- [ ] Remito sin asignación marcado como Particular (AuxiliosQA) → Crear y finalizar desde Operaciones → Registrar cobro del saldo.
- [ ] Facturación → Particulares: Facturar uno y cerrar otro Sin factura.

## Hechos

- [x] Control del camión · detalle del móvil en una sola pantalla: Para resolver, Mantenimiento (planes, últimos services y gasto del año), Documentación (obligatorios que faltan), Combustible (cargas y gasto del mes) y Neumáticos y frenos (historial).
- [x] Flota: la columna Documentación detecta los obligatorios sin cargar.
- [x] Control del camión: un solo título, toda la flota en una tabla (estado, chofer, km, neumáticos y frenos, combustible, service, documentación), filtros por estado y color sólo para alertas.
- [x] Jornadas: Jornadas anuladas en la misma fila de los filtros y buscador más angosto.
- [x] Chofer liberado al firmar el remito (sin edición posterior del chofer).
