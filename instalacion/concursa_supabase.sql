-- ════════════════════════════════════════════════════════════════════
-- Concursa: Docente orientador · base de datos del ingreso web (Supabase)
-- Pega todo este archivo en Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar más de una vez sin perder datos.
--
-- Tablas (sin acceso directo desde internet; solo por las funciones):
--   estudiantes      documento, nombre, teléfono, clave cifrada (bcrypt), estado, ingresos
--   administradores  usuario y clave cifrada del administrador
--   contenido        contenido completo del curso, en partes
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.estudiantes (
  documento       text primary key,
  nombre          text not null default '',
  telefono        text not null default '',
  clave_hash      text not null,
  activo          boolean not null default true,
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now(),
  ultimo_ingreso  timestamptz,
  ingresos        integer not null default 0,
  fallos          integer not null default 0,
  bloqueado_hasta timestamptz
);

create table if not exists public.administradores (
  usuario         text primary key,
  clave_hash      text not null,
  fallos          integer not null default 0,
  bloqueado_hasta timestamptz,
  creado          timestamptz not null default now()
);

create table if not exists public.contenido (
  archivo text not null,
  parte   integer not null,
  datos   text not null,
  subido  timestamptz not null default now(),
  primary key (archivo, parte)
);

-- Nadie lee ni escribe las tablas directamente: seguridad por filas activa y sin políticas.
alter table public.estudiantes     enable row level security;
alter table public.administradores enable row level security;
alter table public.contenido       enable row level security;
revoke all on table public.estudiantes, public.administradores, public.contenido from anon, authenticated, public;

-- ───────── Utilidades internas ─────────
create or replace function public._norm_doc(p text) returns text
language sql immutable as $$ select upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g')) $$;

create or replace function public._hash(p text) returns text
language sql volatile set search_path = public, extensions as $$ select crypt(p, gen_salt('bf', 8)) $$;

-- Verifica al administrador; 5 fallos seguidos bloquean 10 minutos.
create or replace function public._admin_ok(p_usuario text, p_clave text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare a public.administradores;
begin
  select * into a from public.administradores where usuario = lower(trim(p_usuario));
  if not found then return 'Usuario o clave de administrador incorrectos.'; end if;
  if a.bloqueado_hasta is not null and a.bloqueado_hasta > now() then
    return 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.';
  end if;
  if crypt(coalesce(p_clave, ''), a.clave_hash) <> a.clave_hash then
    update public.administradores set fallos = fallos + 1,
      bloqueado_hasta = case when fallos + 1 >= 5 then now() + interval '10 minutes' else null end
      where usuario = a.usuario;
    return 'Usuario o clave de administrador incorrectos.';
  end if;
  update public.administradores set fallos = 0, bloqueado_hasta = null where usuario = a.usuario;
  return null;
end $$;

-- Verifica al estudiante; 5 fallos seguidos bloquean 10 minutos.
create or replace function public._estudiante_ok(p_documento text, p_clave text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare e public.estudiantes; d text := public._norm_doc(p_documento);
begin
  select * into e from public.estudiantes where documento = d;
  if not found then return json_build_object('ok', false, 'error', 'Documento o clave incorrectos.'); end if;
  if e.bloqueado_hasta is not null and e.bloqueado_hasta > now() then
    return json_build_object('ok', false, 'error', 'Demasiados intentos. Espera 10 minutos y vuelve a intentarlo.');
  end if;
  if crypt(coalesce(p_clave, ''), e.clave_hash) <> e.clave_hash then
    update public.estudiantes set fallos = fallos + 1,
      bloqueado_hasta = case when fallos + 1 >= 5 then now() + interval '10 minutes' else null end
      where documento = d;
    return json_build_object('ok', false, 'error', 'Documento o clave incorrectos.');
  end if;
  if not e.activo then return json_build_object('ok', false, 'error', 'Tu acceso está desactivado. Escribe al administrador del curso.'); end if;
  update public.estudiantes set fallos = 0, bloqueado_hasta = null where documento = d;
  return json_build_object('ok', true, 'documento', e.documento, 'nombre', e.nombre);
end $$;

create or replace function public._archivo(p_archivo text) returns text
language sql stable security definer set search_path = public as $$
  select string_agg(datos, '' order by parte) from public.contenido where archivo = p_archivo
$$;

-- ───────── Estudiantes ─────────
-- Ingreso: devuelve el nombre y los archivos de datos del curso (js/...).
create or replace function public.estudiante_ingresar(p_documento text, p_clave text) returns json
language plpgsql security definer set search_path = public as $$
declare v json; archivos json;
begin
  v := public._estudiante_ok(p_documento, p_clave);
  if not (v->>'ok')::boolean then return v; end if;
  update public.estudiantes set ultimo_ingreso = now(), ingresos = ingresos + 1 where documento = v->>'documento';
  select json_object_agg(t.archivo, t.texto) into archivos from (
    select c.archivo, string_agg(c.datos, '' order by c.parte) as texto from public.contenido c
    where c.archivo like 'js/%' group by c.archivo) t;
  if archivos is null then return json_build_object('ok', false, 'error', 'El contenido del curso aún no está cargado. Avisa al administrador.'); end if;
  return json_build_object('ok', true, 'documento', v->>'documento', 'nombre', v->>'nombre', 'datos', archivos);
end $$;

-- Un documento técnico (docs/...), solo con documento y clave válidos.
create or replace function public.estudiante_archivo(p_documento text, p_clave text, p_archivo text) returns json
language plpgsql security definer set search_path = public as $$
declare v json; t text;
begin
  v := public._estudiante_ok(p_documento, p_clave);
  if not (v->>'ok')::boolean then return v; end if;
  t := public._archivo(p_archivo);
  if t is null then return json_build_object('ok', false, 'error', 'Documento no disponible.'); end if;
  return json_build_object('ok', true, 'texto', t);
end $$;

-- ───────── Administración ─────────
create or replace function public.admin_estado() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('hay_admin', exists(select 1 from public.administradores))
$$;

-- Solo funciona mientras no exista ningún administrador.
create or replace function public.admin_inicial(p_usuario text, p_clave text) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  if exists(select 1 from public.administradores) then return json_build_object('ok', false, 'error', 'Ya existe un administrador.'); end if;
  if length(coalesce(trim(p_usuario), '')) < 3 or length(coalesce(p_clave, '')) < 8 then
    return json_build_object('ok', false, 'error', 'El usuario necesita 3 caracteres y la clave al menos 8.');
  end if;
  insert into public.administradores (usuario, clave_hash) values (lower(trim(p_usuario)), public._hash(p_clave));
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_ingresar(p_usuario text, p_clave text) returns json
language plpgsql security definer set search_path = public as $$
declare err text := public._admin_ok(p_usuario, p_clave);
begin
  if err is not null then return json_build_object('ok', false, 'error', err); end if;
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_cambiar_clave(p_usuario text, p_clave text, p_nueva text) returns json
language plpgsql security definer set search_path = public as $$
declare err text := public._admin_ok(p_usuario, p_clave);
begin
  if err is not null then return json_build_object('ok', false, 'error', err); end if;
  if length(coalesce(p_nueva, '')) < 8 then return json_build_object('ok', false, 'error', 'La nueva clave necesita al menos 8 caracteres.'); end if;
  update public.administradores set clave_hash = public._hash(p_nueva) where usuario = lower(trim(p_usuario));
  return json_build_object('ok', true);
end $$;

-- Asigna (o cambia) la clave de un documento. Cada documento tiene una sola clave.
create or replace function public.admin_asignar(p_usuario text, p_clave text, p_documento text, p_nombre text, p_telefono text, p_clave_estudiante text) returns json
language plpgsql security definer set search_path = public as $$
declare err text := public._admin_ok(p_usuario, p_clave); d text := public._norm_doc(p_documento); nuevo boolean;
begin
  if err is not null then return json_build_object('ok', false, 'error', err); end if;
  if length(d) < 5 then return json_build_object('ok', false, 'error', 'Revisa el número de documento.'); end if;
  if length(coalesce(p_clave_estudiante, '')) < 6 then return json_build_object('ok', false, 'error', 'La clave del estudiante necesita al menos 6 caracteres.'); end if;
  nuevo := not exists(select 1 from public.estudiantes where documento = d);
  insert into public.estudiantes (documento, nombre, telefono, clave_hash)
    values (d, trim(coalesce(p_nombre, '')), regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g'), public._hash(p_clave_estudiante))
  on conflict (documento) do update set
    nombre = case when trim(coalesce(p_nombre, '')) = '' then estudiantes.nombre else trim(p_nombre) end,
    telefono = case when coalesce(p_telefono, '') = '' then estudiantes.telefono else regexp_replace(p_telefono, '[^0-9]', '', 'g') end,
    clave_hash = excluded.clave_hash, activo = true, fallos = 0, bloqueado_hasta = null, actualizado = now();
  return json_build_object('ok', true, 'documento', d, 'nuevo', nuevo);
end $$;

create or replace function public.admin_estudiantes(p_usuario text, p_clave text) returns json
language plpgsql security definer set search_path = public as $$
declare err text := public._admin_ok(p_usuario, p_clave); lista json;
begin
  if err is not null then return json_build_object('ok', false, 'error', err); end if;
  select coalesce(json_agg(json_build_object('documento', documento, 'nombre', nombre, 'telefono', telefono, 'activo', activo,
    'creado', creado, 'actualizado', actualizado, 'ultimo_ingreso', ultimo_ingreso, 'ingresos', ingresos) order by creado desc), '[]'::json)
    into lista from public.estudiantes;
  return json_build_object('ok', true, 'estudiantes', lista);
end $$;

create or replace function public.admin_activar(p_usuario text, p_clave text, p_documento text, p_activo boolean) returns json
language plpgsql security definer set search_path = public as $$
declare err text := public._admin_ok(p_usuario, p_clave);
begin
  if err is not null then return json_build_object('ok', false, 'error', err); end if;
  update public.estudiantes set activo = p_activo, actualizado = now() where documento = public._norm_doc(p_documento);
  return json_build_object('ok', found);
end $$;

create or replace function public.admin_eliminar(p_usuario text, p_clave text, p_documento text) returns json
language plpgsql security definer set search_path = public as $$
declare err text := public._admin_ok(p_usuario, p_clave);
begin
  if err is not null then return json_build_object('ok', false, 'error', err); end if;
  delete from public.estudiantes where documento = public._norm_doc(p_documento);
  return json_build_object('ok', found);
end $$;

-- Respaldo completo de estudiantes (con claves cifradas, para poder restaurar).
create or replace function public.admin_respaldo(p_usuario text, p_clave text) returns json
language plpgsql security definer set search_path = public as $$
declare err text := public._admin_ok(p_usuario, p_clave); lista json;
begin
  if err is not null then return json_build_object('ok', false, 'error', err); end if;
  select coalesce(json_agg(row_to_json(e) order by creado), '[]'::json) into lista
    from (select documento, nombre, telefono, clave_hash, activo, creado, actualizado, ultimo_ingreso, ingresos from public.estudiantes) e;
  return json_build_object('ok', true, 'formato', 'concursa-estudiantes-v1', 'fecha', now(), 'estudiantes', lista);
end $$;

-- Restaura un respaldo: agrega los documentos que falten y no toca los que ya existen.
create or replace function public.admin_restaurar(p_usuario text, p_clave text, p_estudiantes json) returns json
language plpgsql security definer set search_path = public as $$
declare err text := public._admin_ok(p_usuario, p_clave); n integer;
begin
  if err is not null then return json_build_object('ok', false, 'error', err); end if;
  with ins as (
    insert into public.estudiantes (documento, nombre, telefono, clave_hash, activo, creado, actualizado, ultimo_ingreso, ingresos)
    select public._norm_doc(x->>'documento'), coalesce(x->>'nombre', ''), coalesce(x->>'telefono', ''), x->>'clave_hash',
           coalesce((x->>'activo')::boolean, true), coalesce((x->>'creado')::timestamptz, now()), now(),
           (x->>'ultimo_ingreso')::timestamptz, coalesce((x->>'ingresos')::integer, 0)
    from json_array_elements(p_estudiantes) x
    where coalesce(x->>'clave_hash', '') like '$2%' and length(public._norm_doc(x->>'documento')) >= 5
    on conflict (documento) do nothing returning 1)
  select count(*) into n from ins;
  return json_build_object('ok', true, 'agregados', n);
end $$;

-- Carga del contenido del curso, por partes (parte 0 reemplaza el archivo completo).
create or replace function public.admin_subir(p_usuario text, p_clave text, p_archivo text, p_parte integer, p_datos text) returns json
language plpgsql security definer set search_path = public as $$
declare err text := public._admin_ok(p_usuario, p_clave);
begin
  if err is not null then return json_build_object('ok', false, 'error', err); end if;
  if p_archivo !~ '^(js|docs)/[A-Za-z0-9_.-]+$' then return json_build_object('ok', false, 'error', 'Nombre de archivo no válido.'); end if;
  if p_parte = 0 then delete from public.contenido where archivo = p_archivo; end if;
  insert into public.contenido (archivo, parte, datos) values (p_archivo, p_parte, p_datos)
    on conflict (archivo, parte) do update set datos = excluded.datos, subido = now();
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_contenido(p_usuario text, p_clave text) returns json
language plpgsql security definer set search_path = public as $$
declare err text := public._admin_ok(p_usuario, p_clave); lista json;
begin
  if err is not null then return json_build_object('ok', false, 'error', err); end if;
  select coalesce(json_agg(json_build_object('archivo', archivo, 'partes', partes, 'caracteres', tam, 'subido', subido) order by archivo), '[]'::json)
    into lista from (select archivo, count(*) partes, sum(length(datos)) tam, max(subido) subido from public.contenido group by archivo) t;
  return json_build_object('ok', true, 'archivos', lista);
end $$;

-- ───────── Permisos ─────────
-- Las funciones internas no se pueden llamar desde internet; las públicas sí (verifican clave).
revoke execute on function public._norm_doc(text), public._hash(text), public._admin_ok(text, text),
  public._estudiante_ok(text, text), public._archivo(text) from public, anon, authenticated;
grant execute on function
  public.estudiante_ingresar(text, text), public.estudiante_archivo(text, text, text),
  public.admin_estado(), public.admin_inicial(text, text), public.admin_ingresar(text, text),
  public.admin_cambiar_clave(text, text, text),
  public.admin_asignar(text, text, text, text, text, text), public.admin_estudiantes(text, text),
  public.admin_activar(text, text, text, boolean), public.admin_eliminar(text, text, text),
  public.admin_respaldo(text, text), public.admin_restaurar(text, text, json),
  public.admin_subir(text, text, text, integer, text), public.admin_contenido(text, text)
  to anon;
