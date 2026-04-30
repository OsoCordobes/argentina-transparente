-- ARGOS — Sprint 3 — Schema de casos persistentes
--
-- Aplica con: supabase db push  (o pegar en el SQL Editor de Supabase)
--
-- Modelo: un usuario (auth.users de Supabase) puede tener múltiples casos.
-- Cada caso es una "carpeta de investigación" con bookmarks tipados de:
--   - entidades (proveedores) por nombre
--   - contratos por hash
--   - directores por nombre
--   - señales por id (FK lógica al señales_cache de DuckDB; replicada acá
--     para que el caso siga siendo legible si la cache se regenera)
-- Más notas markdown libres del investigador.
--
-- RLS: cada usuario solo ve sus propios casos. No hay sharing en MVP.

-- ─── Casos ────────────────────────────────────────────────────────────────────
create table if not exists public.casos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  titulo       text not null,
  descripcion  text,
  estado       text not null default 'abierto'
               check (estado in ('abierto', 'cerrado', 'archivado')),
  creado_en    timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists casos_user_idx on public.casos(user_id);

-- ─── Bookmarks tipados ────────────────────────────────────────────────────────
create table if not exists public.caso_entidades (
  id          uuid primary key default gen_random_uuid(),
  caso_id     uuid not null references public.casos(id) on delete cascade,
  nombre      text not null,
  cuit        text,
  municipio   text,
  agregado_en timestamptz not null default now(),
  unique (caso_id, nombre)
);
create index if not exists caso_entidades_caso_idx on public.caso_entidades(caso_id);

create table if not exists public.caso_contratos (
  id          uuid primary key default gen_random_uuid(),
  caso_id     uuid not null references public.casos(id) on delete cascade,
  hash        text not null,
  proveedor   text not null,
  monto       numeric not null,
  anio        integer not null,
  tipo        text not null,
  area        text,
  fuente_url  text,
  agregado_en timestamptz not null default now(),
  unique (caso_id, hash)
);
create index if not exists caso_contratos_caso_idx on public.caso_contratos(caso_id);

create table if not exists public.caso_directores (
  id          uuid primary key default gen_random_uuid(),
  caso_id     uuid not null references public.casos(id) on delete cascade,
  nombre      text not null,
  empresas    text[] default '{}',
  agregado_en timestamptz not null default now(),
  unique (caso_id, nombre)
);
create index if not exists caso_directores_caso_idx on public.caso_directores(caso_id);

create table if not exists public.caso_senales (
  id          uuid primary key default gen_random_uuid(),
  caso_id     uuid not null references public.casos(id) on delete cascade,
  -- ID de señal en DuckDB (señales_cache.id). NO es FK porque la base de
  -- señales puede regenerarse; se replica el contenido para legibilidad.
  senal_id    text not null,
  tipologia   text not null,
  titulo      text not null,
  resumen     text,
  score       integer,
  severidad   text check (severidad in ('grave','moderada','leve')),
  cuits       text[] default '{}',
  evidencia   jsonb default '[]'::jsonb,
  legal       jsonb default '{}'::jsonb,
  agregado_en timestamptz not null default now(),
  unique (caso_id, senal_id)
);
create index if not exists caso_senales_caso_idx on public.caso_senales(caso_id);

-- ─── Notas markdown ───────────────────────────────────────────────────────────
create table if not exists public.caso_notas (
  caso_id      uuid primary key references public.casos(id) on delete cascade,
  contenido    text not null default '',
  actualizado_en timestamptz not null default now()
);

-- ─── Triggers ────────────────────────────────────────────────────────────────-
create or replace function public.tocar_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists casos_tocar on public.casos;
create trigger casos_tocar before update on public.casos
  for each row execute function public.tocar_actualizado();

drop trigger if exists caso_notas_tocar on public.caso_notas;
create trigger caso_notas_tocar before update on public.caso_notas
  for each row execute function public.tocar_actualizado();

-- ─── Row Level Security ──────────────────────────────────────────────────────-
alter table public.casos             enable row level security;
alter table public.caso_entidades    enable row level security;
alter table public.caso_contratos    enable row level security;
alter table public.caso_directores   enable row level security;
alter table public.caso_senales      enable row level security;
alter table public.caso_notas        enable row level security;

-- Casos: el dueño hace todo
drop policy if exists "casos owner all" on public.casos;
create policy "casos owner all" on public.casos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Helper: el caso pertenece al usuario actual
drop function if exists public.es_dueño_de_caso(uuid);
create or replace function public.es_dueño_de_caso(p_caso_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.casos c
    where c.id = p_caso_id and c.user_id = auth.uid()
  );
$$;

-- Bookmarks: solo si el caso es del usuario
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'caso_entidades','caso_contratos','caso_directores','caso_senales','caso_notas'
  ]) loop
    execute format('drop policy if exists "%I owner all" on public.%I', t, t);
    execute format(
      'create policy "%I owner all" on public.%I '
      'for all using (public.es_dueño_de_caso(caso_id)) '
      'with check (public.es_dueño_de_caso(caso_id))',
      t, t
    );
  end loop;
end $$;
