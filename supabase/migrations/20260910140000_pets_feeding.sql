-- 20260910140000_pets_feeding.sql
-- Справочник пород (ADR-014), расширение профиля питомца,
-- периоды режима кормления (ADR-012).

-- ---------------------------------------------------------------- породы ---
-- Признанные и непризнанные лежат вместе, различаются флагом: мальтезе и
-- мальтипу одинаково выбираются из списка, разница только в recognized.
create table public.breeds (
  id         uuid primary key default gen_random_uuid(),
  species    public.pet_species not null,
  name_ru    text not null,
  name_en    text,
  recognized boolean not null default true,
  fci_group  smallint check (fci_group between 1 and 10),
  -- Синонимы для поиска: «мальтийская болонка» должна находить мальтезе.
  aliases    text[] not null default '{}',
  -- Популярные всплывают выше при пустом запросе. Меньше — выше.
  sort_order smallint not null default 100,
  created_at timestamptz not null default now(),
  unique (species, name_ru)
);

create index breeds_species_name_idx on public.breeds (species, sort_order, name_ru);

alter table public.breeds enable row level security;

-- Читают все вошедшие. Политик на запись нет намеренно (ADR-014): справочник
-- наполняется только миграциями, пользовательские значения идут в breed_custom.
create policy breeds_read on public.breeds
  for select to authenticated using (true);

-- --------------------------------------------------------------- питомец ---
-- Дата рождения почти всегда неточная: приют, «сказали года три». Точность
-- хранится рядом с датой, чтобы позже было видно, что день был выдуман.
create type public.birth_precision as enum ('day', 'month', 'year');
create type public.feeding_mode    as enum ('free', 'scheduled');

alter table public.pets
  add column breed_id        uuid references public.breeds (id),
  add column breed_custom    text,
  add column birth_precision public.birth_precision not null default 'day',
  add column neutered        boolean,
  add column neutered_on     date,
  add column feeding_mode    public.feeding_mode not null default 'scheduled',
  add column tracks_feedings boolean not null default true;

-- Порода либо из справочника, либо своя, либо неизвестна — но не две сразу.
alter table public.pets
  add constraint pets_breed_one_of check (breed_id is null or breed_custom is null);

-- В каркасе стояла чужая зона. Напоминания считаются от неё (ADR-001).
alter table public.pets alter column timezone set default 'Europe/Saratov';

-- ------------------------------------------- периоды режима кормления ---
-- Строка = «с такого-то момента такой корм, такая норма, столько приёмов».
-- Смена чего угодно закрывает период и открывает новый: перезапись полей
-- уничтожила бы дату смены корма, ради которой всё затевается (ADR-012).
create table public.feeding_plans (
  id                uuid primary key default gen_random_uuid(),
  pet_id            uuid not null references public.pets (id) on delete cascade,

  food_name         text not null,
  daily_norm_g      numeric(7,1) check (daily_norm_g > 0),

  -- null при свободном доступе: расписания нет и напоминать не о чем.
  meals_per_day     smallint check (meals_per_day between 1 and 6),
  times             time[],

  -- Для оценки остатка корма. Именно оценки: реальная порция гуляет.
  package_weight_g  numeric(8,1) check (package_weight_g > 0),
  package_opened_on date,

  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  created_by        uuid not null references auth.users (id) default auth.uid(),
  created_at        timestamptz not null default now(),

  constraint feeding_plans_period    check (ended_at is null or ended_at > started_at),
  constraint feeding_plans_times_len check (
    times is null or meals_per_day is null or array_length(times, 1) = meals_per_day
  )
);

create index feeding_plans_pet_idx on public.feeding_plans (pet_id, started_at desc);

-- Действующий период у питомца ровно один.
create unique index feeding_plans_current_idx
  on public.feeding_plans (pet_id) where ended_at is null;

-- Новый период сам закрывает предыдущий: иначе клиенту пришлось бы делать это
-- вторым запросом, и при обрыве связи у питомца оказалось бы два режима.
create or replace function public.close_previous_feeding_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.feeding_plans
     set ended_at = new.started_at
   where pet_id = new.pet_id
     and ended_at is null
     and id <> new.id;
  return new;
end;
$$;

create trigger feeding_plans_close_previous
  before insert on public.feeding_plans
  for each row execute function public.close_previous_feeding_plan();

-- ------------------------------------------------- проверка права записи ---
-- «Участник, который не viewer». В events и reminders это записано подзапросом
-- по pet_members трижды подряд; четвёртую копию заводить не хочется, а по ADR-008
-- stable security definer ещё и кешируется планировщиком в пределах запроса.
-- Существующие политики можно перевести на неё отдельной миграцией.
create or replace function public.is_pet_editor(p_pet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pet_members
     where pet_id = p_pet
       and user_id = auth.uid()
       and role in ('owner', 'caretaker')
  );
$$;

-- --------------------------------------------------------------------- RLS ---
alter table public.feeding_plans enable row level security;

create policy feeding_plans_select on public.feeding_plans
  for select to authenticated using (public.is_pet_member(pet_id));

-- viewer режим кормления не меняет.
create policy feeding_plans_insert on public.feeding_plans
  for insert to authenticated
  with check (public.is_pet_editor(pet_id) and created_by = auth.uid());

create policy feeding_plans_update on public.feeding_plans
  for update to authenticated
  using (public.is_pet_editor(pet_id))
  with check (public.is_pet_editor(pet_id));

create policy feeding_plans_delete on public.feeding_plans
  for delete to authenticated using (public.is_pet_owner(pet_id));

-- DOWN:
-- drop trigger if exists feeding_plans_close_previous on public.feeding_plans;
-- drop function if exists public.is_pet_editor(uuid);
-- drop function if exists public.close_previous_feeding_plan();
-- drop table if exists public.feeding_plans;
-- alter table public.pets drop constraint if exists pets_breed_one_of;
-- alter table public.pets alter column timezone set default 'Europe/Amsterdam';
-- alter table public.pets
--   drop column if exists tracks_feedings, drop column if exists feeding_mode,
--   drop column if exists neutered_on, drop column if exists neutered,
--   drop column if exists birth_precision, drop column if exists breed_custom,
--   drop column if exists breed_id;
-- drop type if exists public.feeding_mode, public.birth_precision;
-- drop table if exists public.breeds;
