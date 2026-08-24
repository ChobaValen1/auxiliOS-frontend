# Facturación · Contrato de dominio V1

Este documento fija el contrato funcional de Facturación para cerrar el módulo sin volver a redefinir estados durante las fases siguientes.

## Frontera del dominio

La cotización y los valores almacenados en `operator_services` representan la economía aplicada al servicio durante su ciclo operativo. Facturación crea una segunda verdad, explícita e inmutable cuando se aprueba: `operator_service_billing`.

El flujo canónico es:

`servicio cerrado → revisión económica → cálculo/confirmación final → aprobación y lock → lote → factura`.

Las fases de lotes y factura se implementan sobre este contrato; no modifican el significado de los estados definidos aquí.

## Tres dimensiones independientes

### Elegibilidad (`eligibility`)

- `pending_review`: todavía no se resolvió si corresponde facturar.
- `billable`: corresponde facturar a la prestadora.
- `non_billable`: no corresponde facturar; el total financiero definitivo es cero.

### Modalidad (`billing_basis`)

- `full`: servicio completo según los valores económicos aplicados.
- `km`: reconocimiento parcial por kilómetros.
- `origin`: reconocimiento por llegada/origen.
- `movement`: reconocimiento por movida/activación.

La modalidad no es un estado de proceso. Los casos `km`, `origin` y `movement` requieren confirmación explícita de importes mientras no exista una regla comercial determinística común a todas las prestadoras.

### Estado de proceso (`process_status`)

- `pending`: editable desde Facturación; todavía no está congelado.
- `approved`: importe definitivo aprobado y bloqueado.
- `batched`: incorporado a un lote de facturación.
- `invoiced`: incorporado a una factura registrada.
- `voided`: registro invalidado por un flujo financiero explícito.

La Fase 1 implementa `pending` y `approved`. `batched`, `invoiced` y el flujo completo de `voided` son contratos reservados para las fases de lotes/factura.

## Compatibilidad con Fase 3B

`operator_service_closures.billing_status` queda temporalmente como campo legado para no romper la UI existente. La traducción es:

| Estado legado | eligibility | billing_basis |
| --- | --- | --- |
| `pending_review` | `pending_review` | `full` |
| `billable` | `billable` | `full` |
| `non_billable` | `non_billable` | `full` |
| `billable_km` | `billable` | `km` |
| `billable_origin` | `billable` | `origin` |
| `billable_movement` | `billable` | `movement` |

El RPC legado `review_operator_service_closure` debe mantener esa interfaz pero sincronizar siempre el registro financiero canónico.

## Importe definitivo

`estimated_total` y `company_estimated_total` no cambian de significado. Siguen siendo los valores aplicados al servicio y sirven como fuente inicial.

Los importes que utiliza Facturación viven exclusivamente en:

- `final_base_subtotal`
- `final_surcharge_total`
- `final_toll_total`
- `final_copay_total`
- `final_total`
- `company_final_total`

Para `billable/full`, el primer cálculo congela los valores aplicados actuales del servicio. Para `non_billable`, todos los importes definitivos son cero. Para modalidades parciales, los importes deben confirmarse explícitamente antes de aprobar.

## Snapshot y trazabilidad

Cada cálculo captura un `billing_snapshot` que incluye, como mínimo:

- identificación y contexto comercial del servicio;
- contrato, tarifario, base y categoría utilizados;
- `pricing_snapshot` del servicio;
- conceptos e importes aplicados;
- historial de reajustes de conceptos;
- peajes del servicio;
- cierre operativo, si existe;
- totales económicos vigentes en el momento de captura.

`operator_service_billing_revisions` conserva las versiones financieras relevantes (`calculated`, `amounts_confirmed`, `approved`, `reopened`).

## Invariantes

1. Cambiar un tarifario vigente no recalcula un servicio ya aprobado.
2. Aprobar Facturación bloquea modificaciones económicas del servicio, sus conceptos y sus peajes.
3. Para editar datos económicos de un servicio aprobado hay que ejecutar una reapertura explícita con motivo.
4. Una reapertura conserva la versión previamente aprobada antes de liberar el servicio.
5. Un servicio no puede tener más de un registro financiero canónico.
6. Un servicio en `batched` o `invoiced` no puede reabrirse desde el flujo de servicio; la corrección deberá resolverse desde el futuro dominio de lotes/facturas.
7. No se infieren importes para `km`, `origin` o `movement` si la regla comercial no está formalmente modelada.

## Permisos

- `administracion` y `facturacion`: calcular, confirmar importes, aprobar y reabrir mientras el servicio no esté loteado/facturado.
- `supervision`: lectura financiera.
- `operador` y `chofer`: no acceden al registro financiero canónico ni a sus importes mediante permisos directos.

## Definition of Done de Fase 1

La Fase 1 queda terminada cuando un servicio cerrado puede producir un registro financiero definitivo, auditable y bloqueable; el valor aprobado no puede modificarse silenciosamente; y el flujo legado de revisión económica queda sincronizado con este contrato sin romper su interfaz actual.
