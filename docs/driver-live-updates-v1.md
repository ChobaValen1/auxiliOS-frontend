# Actualización automática de asignaciones del chofer

El puente del chofer se suscribe a INSERT y UPDATE de `driver_service_updates`, filtrados por su usuario. Cada fila contiene solamente UUID, revisión y fecha; los datos del servicio siguen llegando por `get_driver_operator_queue_v4`, que valida la asignación y oculta información comercial.

El disparador de `operator_services` incrementa la revisión al asignar, reasignar o modificar el estado y los datos operativos relevantes. Una reasignación señala al chofer anterior y al nuevo. Las revisiones se guardan en la misma transacción: no hay aviso de una operación revertida. Los clientes solo tienen SELECT y RLS limita la lectura al propio chofer; no pueden insertar, modificar ni borrar señales.

Los eventos próximos se agrupan antes de consultar. Una señal durante una lectura agenda otra consulta para no perder la última asignación. Se actualizan la cola, el indicador y el aviso de servicio nuevo, también desde Historial. No cambia la pantalla ni reinicia el formulario del remito.

Se conserva la consulta cada 10 segundos como respaldo. Al recuperar foco, visibilidad, conexión o una suscripción, se consulta nuevamente la cola. En segundo plano no se dispara la consulta completa por cada señal. Los canales anteriores se eliminan y sus callbacks se ignoran; cada reconexión usa un nombre nuevo para no reutilizar una suscripción que todavía se está cerrando.

Validación: PostgreSQL aislado con publicación, disparador y RLS; pruebas del cliente para eventos agrupados, Historial, reconexión y lecturas simultáneas; Chromium con transporte simulado y formulario real del puente, verificando que se conserva el texto del remito. La publicación y permisos se verificaron también en la base compartida.
