-- AuxiliOS · ACTIVADO del chofer: alinear la restricción con los cuatro
-- motivos vigentes sin reinterpretar códigos históricos ya persistidos.

alter table public.operator_services
  drop constraint if exists operator_services_cancellation_reason_code_check;

alter table public.operator_services
  add constraint operator_services_cancellation_reason_code_check
  check (
    cancellation_reason_code is null
    or cancellation_reason_code in (
      -- Flujo vigente del chofer.
      'absent_or_not_towable',
      'provider',
      'us',
      'other',
      -- Históricos: se conservan sólo para no invalidar registros anteriores.
      'delay',
      'within_authorized_window',
      'cancelled_by_us',
      'client_or_provider'
    )
  ) not valid;

alter table public.operator_services
  validate constraint operator_services_cancellation_reason_code_check;
