-- Chat de preguntas frecuentes de BLOQE (sin IA).
-- Corre este archivo completo UNA vez en Supabase: SQL Editor -> pega -> Run.
-- Antes de correrlo, revisa el bloque "OJO" de la sección 2 (nombres de tus tablas).

-- ============================================================
-- 1) Preguntas frecuentes (Renato las edita desde Table Editor)
-- ============================================================
create table if not exists faqs (
  id bigint generated always as identity primary key,
  tipo text not null default 'texto'
    check (tipo in ('texto','productos','promociones','reservar',
                    'reclamo','devolucion','persona')),
  pregunta text not null,                   -- texto del botón
  palabras_clave text[] not null default '{}', -- sin tildes, en minúscula
  respuesta text,                           -- admite {lista} y {cierre}
  respuesta_sin_datos text,                 -- si no hay productos/promos
  en_menu boolean not null default false,   -- sale como botón al abrir el chat
  orden int not null default 100,
  activa boolean not null default true
);

alter table faqs enable row level security;
grant select on faqs to anon, authenticated;
drop policy if exists faqs_lectura_publica on faqs;
create policy faqs_lectura_publica on faqs
  for select to anon, authenticated using (activa);

-- ============================================================
-- 2) Datos públicos para el chat: productos abiertos y promociones
-- ============================================================
-- Las vistas muestran SOLO las columnas que el chat puede ver.
-- OJO: ajusta los nombres de tablas y columnas a los reales de BLOQE
-- (aquí se asume productos.nombre, productos.precio, productos.bloque_id,
-- bloques.id, bloques.estado = 'abierto' y bloques.fecha_cierre).
create or replace view v_productos_abiertos as
select p.nombre, p.precio, b.fecha_cierre
from productos p
join bloques b on b.id = p.bloque_id
where b.estado = 'abierto';

create table if not exists promociones (
  id bigint generated always as identity primary key,
  descripcion text not null,
  condiciones text,
  vigente_hasta date,                       -- vacío = sin fecha de término
  activa boolean not null default true
);
alter table promociones enable row level security;

create or replace view v_promociones_vigentes as
select descripcion, condiciones, vigente_hasta
from promociones
where activa and (vigente_hasta is null or vigente_hasta >= current_date);

grant select on v_productos_abiertos, v_promociones_vigentes
  to anon, authenticated;

-- ============================================================
-- 3) Registro de conversaciones y casos
-- ============================================================
create table if not exists chat_conversaciones (
  id bigint generated always as identity primary key,
  session_id text not null,                 -- identifica una visita al chat
  tipo text not null
    check (tipo in ('consulta','reserva','reclamo','devolucion',
                    'persona','sin_respuesta')),
  pregunta text not null,
  respuesta text,
  nombre_cliente text,                      -- solo reclamos y devoluciones
  celular_cliente text,
  atendido boolean not null default false,  -- Renato lo marca al revisarlo
  creado_en timestamptz not null default now()
);

create index if not exists chat_conv_sesion_idx
  on chat_conversaciones (session_id, creado_en desc);

-- Nadie con la clave pública puede leer ni escribir directo en la tabla:
alter table chat_conversaciones enable row level security;
revoke all on chat_conversaciones from anon, authenticated;

-- La página solo puede registrar a través de esta función, que valida los
-- datos y limita el volumen (30 registros / 10 min por visita y 500 / hora
-- en total) para evitar spam.
create or replace function registrar_conversacion(
  p_session text,
  p_tipo text,
  p_pregunta text,
  p_respuesta text default null,
  p_nombre text default null,
  p_celular text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sesion int;
  v_hora int;
begin
  if p_tipo not in ('consulta','reserva','reclamo','devolucion',
                    'persona','sin_respuesta') then
    raise exception 'tipo invalido';
  end if;
  if p_session is null or length(p_session) not between 8 and 64 then
    raise exception 'sesion invalida';
  end if;
  if length(coalesce(p_pregunta, '')) not between 1 and 500 then
    raise exception 'pregunta invalida';
  end if;
  if p_tipo in ('reclamo','devolucion') then
    if length(trim(coalesce(p_nombre, ''))) not between 2 and 80
       or coalesce(p_celular, '') !~ '^[0-9]{9,15}$' then
      raise exception 'datos de contacto invalidos';
    end if;
  end if;

  select count(*) into v_sesion from chat_conversaciones
    where session_id = p_session and creado_en > now() - interval '10 minutes';
  select count(*) into v_hora from chat_conversaciones
    where creado_en > now() - interval '1 hour';
  if v_sesion >= 30 or v_hora >= 500 then
    raise exception 'limite de uso';
  end if;

  insert into chat_conversaciones
    (session_id, tipo, pregunta, respuesta, nombre_cliente, celular_cliente)
  values
    (p_session, p_tipo, left(p_pregunta, 500), left(p_respuesta, 1000),
     left(trim(p_nombre), 80), p_celular);
end;
$$;

revoke all on function registrar_conversacion(text,text,text,text,text,text)
  from public;
grant execute on function registrar_conversacion(text,text,text,text,text,text)
  to anon, authenticated;

-- ============================================================
-- 4) Preguntas iniciales (correr una sola vez; luego se editan en la tabla)
-- ============================================================
-- Palabras clave: sin tildes y en minúscula. Una palabra clave coincide si el
-- mensaje del cliente tiene una palabra que EMPIEZA igual ("demora" sirve para
-- "demoran" o "demorará").
insert into faqs
  (tipo, pregunta, palabras_clave, respuesta, respuesta_sin_datos, en_menu, orden)
values
('texto', '¿Cuánto demora mi pedido?',
 array['demora','demoran','demorar','tarda','tardan','entrega','entregan','plazo',
       'cuando llega','cuando me llega'],
 'En promedio, desde que se publica el bloque hasta la entrega pasan 4.5 días.',
 null, true, 10),
('texto', '¿Cómo se paga?',
 array['pago','pagar','pagan','paga','yape','efectivo','tarjeta','saldo'],
 'La reserva se paga por Yape o en efectivo y el saldo contra entrega.',
 null, true, 20),
('texto', '¿Los productos son originales?',
 array['original','originales','replica','replicas','falso','falsos','autentico',
       'autenticos','oficial','oficiales'],
 'Sí. Todos los productos se compran directamente a distribuidores oficiales, '
 'por lo que son originales.',
 null, true, 30),
('productos', '¿Qué productos hay ahora?',
 array['productos','producto','bloque','bloques','disponible','disponibles',
       'venden','catalogo'],
 'Estos son los productos con bloque abierto: {lista}. '
 'El próximo cierre es el {cierre}.',
 'Por ahora no hay bloques abiertos. Pronto publicaremos nuevos.', true, 40),
('promociones', '¿Hay promociones?',
 array['promocion','promociones','descuento','descuentos','oferta','ofertas','cupon'],
 'Estas son las promociones vigentes: {lista}.',
 'Por ahora no tenemos promociones vigentes.', true, 50),
('reservar', 'Quiero reservar',
 array['reservar','separar','apartar','quiero comprar','quiero pedir'],
 '¿Cuál producto quieres reservar?',
 'Por ahora no hay bloques abiertos para reservar.', true, 60),
('reclamo', 'Tengo un problema con mi pedido',
 array['reclamo','reclamar','queja','mal estado','danado','roto','defectuoso',
       'incompleto','no llego','equivocado'],
 'Lamento lo ocurrido. Déjame tu nombre y celular y el equipo revisará tu caso.',
 null, true, 70),
('devolucion', 'Quiero una devolución',
 array['devolucion','devoluciones','devolver','devuelvan','devuelvo','reembolso',
       'mi dinero','estafa','estafadores','fraude','denuncia','denunciar','indecopi',
       'abogado','demandar'],
 'Lamento lo ocurrido. Déjame tu nombre y celular y derivaré tu caso a Renato '
 'para que se comunique contigo.',
 null, false, 80),
('persona', 'Hablar con Renato',
 array['una persona','con alguien','humano','asesor','renato','hablar con',
       'atencion al cliente'],
 'Claro, te llevo a WhatsApp para que hables con Renato.',
 null, true, 90);

-- ============================================================
-- 5) Para revisar (Table Editor o SQL Editor)
-- ============================================================
-- Casos pendientes:
--   select creado_en, tipo, nombre_cliente, celular_cliente, pregunta
--   from chat_conversaciones
--   where tipo in ('reclamo','devolucion') and not atendido
--   order by creado_en desc;
-- Preguntas que el chat no entendió (para agregar palabras clave o preguntas):
--   select pregunta, count(*) from chat_conversaciones
--   where tipo = 'sin_respuesta' group by pregunta order by count(*) desc;
