-- chat_ia.sql — capa de IA sobre el chat de preguntas frecuentes de BLOQE
--
-- Se corre DESPUES de datos_prueba.sql y chat_faq.sql, en el MISMO proyecto
-- de Supabase. Es aditivo e idempotente: se puede correr dos veces sin
-- romper nada y no borra ni cambia datos existentes.
--
-- Respeta lo que ya existe: usa la columna session_id de chat_conversaciones
-- y NO toca la función registrar_conversacion, que es la que sigue guardando
-- los reclamos y devoluciones con nombre y celular desde el formulario.
--
-- Pegar completo en el SQL Editor y tocar Run.

begin;

-- ---------------------------------------------------------------------------
-- 0. Verificación de que esta capa calza con lo que ya hay
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.faqs') is null
     or to_regclass('public.chat_conversaciones') is null then
    raise exception
      'Falta chat_faq.sql: no existen faqs y/o chat_conversaciones. Correr chat_faq.sql primero.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'chat_conversaciones'
       and column_name  = 'session_id'
  ) then
    raise exception
      'chat_conversaciones no tiene la columna session_id. Revisar que chat_faq.sql corrió completo.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Columnas nuevas en chat_conversaciones
--    Solo telemetría: de qué vino la respuesta, con qué modelo y qué costó.
--    session_id, pregunta, respuesta, nombre_cliente y celular_cliente ya
--    existen y no se tocan.
-- ---------------------------------------------------------------------------
alter table public.chat_conversaciones
  add column if not exists fuente         text,     -- 'faq' | 'ia' | 'limite'
  add column if not exists modelo         text,
  add column if not exists tokens_entrada integer,
  add column if not exists tokens_salida  integer;

-- ---------------------------------------------------------------------------
-- 2. Presupuesto de IA por visita
--    Dos topes: por hora (corta el bucle) y por sesión (corta el goteo).
--    Es independiente del límite de registros de registrar_conversacion.
-- ---------------------------------------------------------------------------
create table if not exists public.chat_limites_ia (
  session_id     text primary key,
  ventana_inicio timestamptz not null default now(),
  conteo         integer     not null default 0,   -- en la ventana actual
  total          integer     not null default 0,   -- desde que nació la sesión
  creado_en      timestamptz not null default now()
);

alter table public.chat_limites_ia enable row level security;
revoke all on public.chat_limites_ia from anon, authenticated;
-- Sin políticas: nadie entra con la clave pública. Solo la service_role, que
-- las ignora por diseño, y es la única que usa la Edge Function.

create or replace function public.chat_ia_registrar_uso(
  p_session      text,
  p_max_ventana  integer default 10,
  p_max_total    integer default 40
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio timestamptz;
  v_conteo integer;
  v_total  integer;
begin
  -- Mismo criterio de sesión que registrar_conversacion: entre 8 y 64 chars.
  if p_session is null or length(p_session) not between 8 and 64 then
    return jsonb_build_object('permitido', false, 'motivo', 'sesion_invalida');
  end if;

  insert into public.chat_limites_ia (session_id) values (p_session)
  on conflict (session_id) do nothing;

  select ventana_inicio, conteo, total
    into v_inicio, v_conteo, v_total
    from public.chat_limites_ia
   where session_id = p_session
     for update;

  if now() - v_inicio > interval '1 hour' then
    v_inicio := now();
    v_conteo := 0;
  end if;

  if v_total >= p_max_total then
    return jsonb_build_object('permitido', false, 'motivo', 'total');
  end if;

  if v_conteo >= p_max_ventana then
    return jsonb_build_object('permitido', false, 'motivo', 'ventana');
  end if;

  update public.chat_limites_ia
     set ventana_inicio = v_inicio,
         conteo         = v_conteo + 1,
         total          = v_total  + 1
   where session_id = p_session;

  return jsonb_build_object(
    'permitido',       true,
    'restantes_hora',  p_max_ventana - v_conteo - 1,
    'restantes_total', p_max_total   - v_total  - 1
  );
end $$;

-- ---------------------------------------------------------------------------
-- 3. Las preguntas frecuentes que la IA recibe en el prompt
--
--    Quedan fuera dos grupos, a propósito:
--      - tipo 'productos' y 'promociones', porque esos datos los trae la IA
--        con sus herramientas, en vivo y no de una plantilla.
--      - cualquier respuesta con {lista} o {cierre}, que son marcadores que
--        rellena la página. Si llegaran crudos al prompt, la IA los repetiría.
--
--    Renato sigue editando la tabla faqs igual que antes y la IA lo recoge
--    en la siguiente pregunta, sin publicar la web de nuevo.
-- ---------------------------------------------------------------------------
create or replace function public.chat_ia_faqs()
returns table (tipo text, pregunta text, respuesta text)
language sql
stable
security definer
set search_path = public
as $$
  select f.tipo, f.pregunta, f.respuesta
    from public.faqs f
   where f.activa
     and f.respuesta is not null
     and f.respuesta not like '%{%'
     and f.tipo not in ('productos', 'promociones')
   order by f.orden, f.pregunta;
$$;

-- ---------------------------------------------------------------------------
-- 4. Registro de un intercambio con la IA
--
--    Importante: aquí NUNCA se escribe tipo 'reclamo' ni 'devolucion'. Esos
--    los sigue creando el formulario de la página vía registrar_conversacion,
--    con nombre y celular. Si la IA los escribiera, la lista de casos
--    pendientes de Renato se llenaría de casos sin datos de contacto.
--    La IA solo escribe 'consulta', 'sin_respuesta' o 'persona'.
-- ---------------------------------------------------------------------------
create or replace function public.chat_ia_registrar(
  p_session   text,
  p_pregunta  text,
  p_respuesta text,
  p_tipo      text,
  p_fuente    text    default 'ia',
  p_modelo    text    default null,
  p_entrada   integer default null,
  p_salida    integer default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
begin
  if p_session is null or length(p_session) not between 8 and 64 then
    raise exception 'sesion invalida';
  end if;

  v_tipo := case
              when p_tipo in ('consulta', 'sin_respuesta', 'persona') then p_tipo
              else 'consulta'
            end;

  insert into public.chat_conversaciones
    (session_id, tipo, pregunta, respuesta, fuente, modelo, tokens_entrada, tokens_salida)
  values
    (p_session, v_tipo,
     left(coalesce(nullif(trim(p_pregunta), ''), '(vacío)'), 500),
     left(coalesce(p_respuesta, ''), 1000),
     p_fuente, p_modelo, p_entrada, p_salida);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Permisos: estas tres funciones son solo para la Edge Function
-- ---------------------------------------------------------------------------
revoke all on function public.chat_ia_registrar_uso(text, integer, integer) from public;
revoke all on function public.chat_ia_faqs()                                from public;
revoke all on function public.chat_ia_registrar(text, text, text, text, text, text, integer, integer) from public;

grant execute on function public.chat_ia_registrar_uso(text, integer, integer) to service_role;
grant execute on function public.chat_ia_faqs()                                to service_role;
grant execute on function public.chat_ia_registrar(text, text, text, text, text, text, integer, integer) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Verificación. Correr aparte, después del Run de arriba.
-- ---------------------------------------------------------------------------
-- -- Qué preguntas ve la IA (deben ser las de texto, reservar, reclamo,
-- -- devolucion y persona; NO las de productos ni promociones):
-- select tipo, pregunta from chat_ia_faqs();
--
-- -- El presupuesto responde:
-- select chat_ia_registrar_uso('prueba-de-sesion-1234');
-- select * from chat_limites_ia;
-- delete from chat_limites_ia where session_id = 'prueba-de-sesion-1234';
--
-- -- Cuánto está costando la IA y qué resolvió (después de probar la página):
-- select fuente, tipo, count(*),
--        sum(tokens_entrada) as entrada, sum(tokens_salida) as salida
--   from chat_conversaciones group by 1, 2 order by 1, 2;
--
-- -- Lo que la IA no pudo resolver, para agregar palabras clave o preguntas:
-- select pregunta, count(*) from chat_conversaciones
--  where tipo = 'sin_respuesta' group by 1 order by 2 desc;
