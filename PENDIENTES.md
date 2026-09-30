# Pendientes

Lista de cambios que faltan hacer. Se tachan (o se borran) a medida que se hacen.

## Para hacer

- [ ] Control del camión · vista del chofer: checklist simple del día (neumáticos, frenos, combustible). Falta confirmar.
- [ ] Mantenimiento: pasar el móvil a taller desde un service vencido y bloquear asignaciones. Falta decidir: puede frenar a choferes en producción.

## Para confirmar

- [ ] DNI/CUIT en el alta de Particular: hoy acepta 8 u 11 dígitos. Confirmar si el DNI puede tener 7 o 9.
- [ ] "Si es Programado quiero que se pueda poner…": el mensaje quedó cortado, falta saber qué se quería agregar.
- [ ] Particular que el cliente no termina de pagar: hoy no se puede finalizar. ¿Hace falta una excepción de Administración, con motivo, para cerrarlo igual?

## Para probar con datos de QA

- [ ] Sistema visual en Servicios y en la lista del chofer: revisar en la vista previa la tabla (código fijo a la izquierda al desplazar), el menú ⋯, los filtros y, en el celular, las tarjetas. Los avisos de toda la app cambiaron: los de error quedan hasta cerrarlos.
- [ ] Particular asignado (móvil + "El de la jornada del móvil"), sin patente: Arribado y Finalizar sin arribo funcionan. El menú ⋯ ya no ofrece Activado.
- [ ] Planes base: en Control del camión → Planes base, marcar los planes de cada tipo y guardar. Revisar que cada móvil del tipo los tenga en su detalle.
- [ ] Subir documento (Camión) con una foto y un PDF reales de VTV o póliza: que complete vencimiento y número, y avise si la patente no coincide. No hace falta guardar.

- [ ] Editar un particular con el remito sin firmar (el caso con remito firmado ya se probó).
- [ ] Remito sin asignación marcado como Particular (AuxiliosQA) → Crear y finalizar desde Operaciones → Registrar cobro del saldo.
- [ ] Facturación → Particulares: Facturar uno y cerrar otro Sin factura.

## Hechos

- [x] Sistema visual aplicado: tokens y componentes en toda la app, avisos nuevos, Servicios (tabla, filtros, estados, menú y tarjetas en el celular) y la lista del chofer (tarjeta y hoja del servicio). La pantalla de Servicios ya no se ensancha de costado.
- [x] Firmar un remito saca el servicio de la lista del chofer (probado).
- [x] procesar-ticket con sesión: probado con una carga real.
- [x] Particular sin patente: Arribar y Finalizar ya no fallan (400). Un particular no puede quedar Activado.
- [x] Detalle del camión: fecha estimada de cada service (km por día de los últimos 30 días), rendimiento km/l por carga con aviso de consumo alto, y pestaña Historial.
- [x] Detalle del camión: encabezado con tipo, chofer y hora de inicio de la jornada, km actuales y km del mes; cuatro tarjetas de resumen y una pestaña por tema.
- [x] Planes base por tipo de camión (Control del camión → Planes base). Los móviles nuevos, o los que cambian de tipo, los reciben solos.
- [x] Se borraron las versiones anteriores de Control del camión: la grilla de tarjetas, las sub-pantallas de admin (Planes e Historial) y el decorador fleet-operational-status-v1.
- [x] procesar-ticket exige sesión (verify_jwt, v6). Antes cualquiera con la dirección podía usarla.
- [x] Documentación del camión: al elegir la foto o el PDF se lee el vencimiento, el número y el período (función leer-documento-camion).
- [x] Control del camión · detalle del móvil en una sola pantalla: Para resolver, Mantenimiento (planes, últimos services y gasto del año), Documentación (obligatorios que faltan), Combustible (cargas y gasto del mes) y Neumáticos y frenos (historial).
- [x] Flota: la columna Documentación detecta los obligatorios sin cargar.
- [x] Control del camión: un solo título, toda la flota en una tabla (estado, chofer, km, neumáticos y frenos, combustible, service, documentación), filtros por estado y color sólo para alertas.
- [x] Jornadas: Jornadas anuladas en la misma fila de los filtros y buscador más angosto.
- [x] Chofer liberado al firmar el remito (sin edición posterior del chofer).
