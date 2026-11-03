-- Cardinal: queda solo «Hora de Trabajo / Espera» (linkeada a la movida); se deshabilita «Hora Trabajo».
update public.company_service_settings css set is_enabled=false
 from public.service_concepts sc
 where sc.concept_id=css.concept_id and sc.code='excess_work_hour'
   and css.company_id='431c5f7d-8bca-4afc-b634-8c871239e2d5' and css.is_enabled;
