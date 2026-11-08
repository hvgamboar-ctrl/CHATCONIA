-- datos_prueba.sql: datos de EJEMPLO para probar el chat en un proyecto de
-- Supabase de prueba. Los productos, precios y fechas son inventados.
--
-- Orden de ejecución en el SQL Editor:
--   1) este archivo   2) chat_faq.sql
--
-- IMPORTANTE: no lo corras en el Supabase real de BLOQE. Si ya existen las
-- tablas productos o bloques, este archivo se detiene sin cambiar nada.
do $$
begin
  if to_regclass('public.productos') is not null
     or to_regclass('public.bloques') is not null then
    raise exception 'Ya existen las tablas productos o bloques. Este archivo es solo para un proyecto de prueba vacío.';
  end if;
end $$;

create table bloques (
  id bigint generated always as identity primary key,
  nombre text not null,
  estado text not null default 'abierto',      -- abierto o cerrado
  fecha_cierre date
);

create table productos (
  id bigint generated always as identity primary key,
  nombre text not null,
  precio numeric(10,2) not null,
  bloque_id bigint references bloques (id),
  costo_interno numeric(10,2)                  -- dato interno: el chat NO debe verlo
);

alter table bloques enable row level security;
alter table productos enable row level security;

insert into bloques (nombre, estado, fecha_cierre) values
  ('Bloque barbería',    'abierto', current_date + 9),
  ('Bloque suplementos', 'abierto', current_date + 5),
  ('Bloque anterior',    'cerrado', current_date - 20);

insert into productos (nombre, precio, bloque_id, costo_interno) values
  ('Cera de barbería Muk',       38.00, 1,  24.00),
  ('Creatina Optimum Nutrition', 129.00, 2, 95.00),
  ('Whey Gold Standard',         189.00, 3, 150.00);   -- bloque cerrado: no debe aparecer

-- Misma definición que en chat_faq.sql (allí se omite si ya existe).
create table if not exists promociones (
  id bigint generated always as identity primary key,
  descripcion text not null,
  condiciones text,
  vigente_hasta date,
  activa boolean not null default true
);
alter table promociones enable row level security;

insert into promociones (descripcion, condiciones, vigente_hasta, activa) values
  ('10% de descuento en tu segunda reserva', 'válido hasta fin de mes',
   (date_trunc('month', current_date) + interval '1 month - 1 day')::date, true),
  ('Promoción vencida de prueba', null, current_date - 5, true),      -- no debe aparecer
  ('Promoción apagada de prueba', null, null, false);                  -- no debe aparecer
