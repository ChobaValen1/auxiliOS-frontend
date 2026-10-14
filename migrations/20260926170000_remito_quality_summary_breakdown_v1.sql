-- Calidad y cobros: desglose completo de cada respuesta en alertas y comentarios
-- (puntualidad, trato, recomendaría y control de cobro, además de la general).
-- 'comentarios' pasa a traer todas las respuestas recientes, con o sin comentario.

do $migration$
declare v_sql text; v_before text;
begin
  select pg_get_functiondef('public.get_remito_quality_summary_v1(date,date)'::regprocedure) into v_sql;
  v_before := v_sql;
  v_sql := replace(v_sql, $a$'rating_general', a.rating_general, 'comentario', a.comentario, 'mala', a.mala,$a$,
                          $a$'rating_general', a.rating_general, 'rating_puntualidad', a.rating_puntualidad, 'rating_trato', a.rating_trato,
        'recomendaria', a.recomendaria, 'cobro_confirmado', a.cobro_confirmado, 'comentario', a.comentario, 'mala', a.mala,$a$);
  v_sql := replace(v_sql, $a$'rating_general', b.rating_general, 'comentario', b.comentario, 'respondida_at', b.created_at) c$a$,
                          $a$'rating_general', b.rating_general, 'rating_puntualidad', b.rating_puntualidad, 'rating_trato', b.rating_trato,
                                  'recomendaria', b.recomendaria, 'cobro_confirmado', b.cobro_confirmado, 'cobro_informado', b.cobro_informado, 'cobrado', b.cobrado,
                                  'comentario', b.comentario, 'respondida_at', b.created_at) c$a$);
  v_sql := replace(v_sql, 'where b.comentario is not null order by b.created_at desc limit 30', 'where b.survey_id is not null order by b.created_at desc limit 50');
  if v_sql = v_before or position($a$'rating_puntualidad', a.rating_puntualidad$a$ in v_sql) = 0 or position($a$'rating_puntualidad', b.rating_puntualidad$a$ in v_sql) = 0 or position('where b.survey_id is not null order by b.created_at desc limit 50' in v_sql) = 0 then
    raise exception 'get_remito_quality_summary_v1: no se encontraron los puntos de reemplazo';
  end if;
  execute v_sql;
end
$migration$;
