# Facturación · Contrato de dominio V1

Este documento fija el contrato funcional de Facturación sobre el flujo que ya está desplegado. No reemplaza `operator_services.billing_status`, `operator_service_billing_revisions` ni las facturas existentes: los consolida detrás de una verdad financiera canónica.

## Frontera del dominio

El servicio conserva su economía operativa en `operator_services` y `pricing_snapshot`. Facturación materializa el valor definitivo en `operator_service_billing`.

El flujo canónico queda:

`servicio cerrado → pendiente → cálculo/confirmación → aprobado y bloqueado → lote/factura → facturado`.

En el flujo productivo actual, `reviewed` representa la aprobación financiera y `invoiced` representa el servicio ya incorporado a una factura.

## Tres dimensiones independientes

### Elegibilidad (`eligibility`)

- `pending_review`: todavía no se resolvió si corresponde facturar.
- `billable`: corresponde facturar a la prestadora.
- `non_billable`: no corresponde facturar; el total financiero definitivo es cero.

### Modalidad (`billing_basis`)

- `full`: servicio completo.
- `km`: reconocimiento parcial por kilómetros.
- `origin`: reconocimiento por llegada/origen.
- `movement`: reconocimiento por movida/activación.

La modalidad no es un estado. `km`, `origin` y `movement` requieren confirmación explícita del importe mientras no exista una regla determinística común a todas las prestadoras.

### Estado de proceso (`process_status`)

- `pending`: editable desde Facturación.
- `approved`: importe definitivo aprobado y bloqueado.
- `batched`: reservado para agrupación previa a factura.
- `invoiced`: incorporado a una factura.
- `voided`: fuera del circuito financiero activo.

## Compatibilidad con los estados ya desplegados

`operator_services.billing_status` se mantiene como interfaz legacy/productiva:

| Estado productivo | Estado canónico |
| --- | --- |
| `not_ready` | fuera del escritorio / `voided` |
| `pending` | `pending` |
| `reviewed` | `approved` |
| `invoiced` | `invoiced` |
| `excluded` | `approved` + `non_billable` |

Los cierres excepcionales siguen usando `operator_service_closures.billing_status` y se traducen así:

| Estado de cierre | eligibility | billing_basis |
| --- | --- | --- |
| `pending_review` | `pending_review` | `full` |
| `billable` | `billable` | `full` |
| `non_billable` | `non_billable` | `full` |
| `billable_km` | `billable` | `km` |
| `billable_origin` | `billable` | `origin` |
| `billable_movement` | `billable` | `movement` |

`operator_service_billing_revisions` sigue siendo la bitácora histórica compatible con el escritorio desplegado. `operator_service_billing` es el ledger 1:1 que determina cuál de esas versiones está vigente y si está bloqueada.

## Importe definitivo

`estimated_total` y `company_estimated_total` mantienen su significado operativo/compatible. Facturación usa exclusivamente:

- `final_base_subtotal`
- `final_surcharge_total`
- `final_toll_total`
- `final_copay_total`
- `final_total`
- `company_final_total`

Para un servicio completo se toma el Billing Quote vigente al momento de revisión si el motor V2 está disponible; en instalaciones anteriores se utiliza el valor aplicado almacenado. Al aprobar, ese resultado queda congelado.

Para `non_billable`, los importes definitivos son cero. Para modalidades parciales, Facturación debe confirmar el desglose antes de aprobar.

## Snapshot y trazabilidad

El `billing_snapshot` congela contexto comercial, contrato/tarifario/base, conceptos, reajustes, peajes, cierre operativo y la cotización utilizada. La revisión histórica desplegada no se elimina: cada aprobación, confirmación o reapertura deja además una entrada compatible en `operator_service_billing_revisions`.

## Invariantes

1. Un servicio `reviewed/approved` no puede modificar silenciosamente contrato, tarifa, conceptos, kilómetros, peajes ni importes.
2. Para cambiar datos económicos aprobados hay que ejecutar una reapertura explícita con motivo.
3. Un servicio no puede pasar de `pending` a `invoiced`: primero debe quedar `reviewed/approved`.
4. Si la cotización cambia entre revisión y factura, el cambio es rechazado; la factura no puede sustituir silenciosamente el valor aprobado.
5. Un servicio tiene un único registro financiero canónico (`service_id` único).
6. Los servicios ya `invoiced` no pueden reabrirse desde el flujo del servicio.
7. Las facturas históricas y `operator_invoice_services.service_snapshot/quote_snapshot` se preservan.
8. No se infieren importes para `km`, `origin` o `movement` sin una regla formal o confirmación explícita.

## Permisos

- `administracion` y `facturacion`: calcular, confirmar, aprobar y reabrir mientras el servicio no esté facturado/loteado.
- `supervision`: lectura financiera.
- `operador` y `chofer`: sin escritura sobre el ledger financiero.

## Definition of Done de Fase 1

Fase 1 queda terminada cuando el estado productivo existente se puede reflejar sin pérdida en `operator_service_billing`, `reviewed` produce un lock financiero real, una reapertura es obligatoria para editar, `invoiced` exige aprobación previa y los servicios/facturas históricos se backfillean sin recalcular ni duplicar facturación.
