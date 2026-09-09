-- 20260910100000_core.sql
-- Базовая схема: профили, контактные каналы, питомцы, участники, RLS.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- профили ---

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_path  text,
  locale       text        not null default 'ru',
  created_at   timestamptz not null default now()
);

-- Контактные каналы. Email сейчас, телефон и Telegram позже (ADR-003).
create table public.user_identities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  channel     text not null check (channel in ('email', 'phone', 'telegram')),
  value       text not null,
  verified_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (channel, value)
);

create index on public.user_identities (user_id);

-- --------------------------------------------------------------- питомцы ---

create type public.pet_role    as enum ('owner', 'caretaker', 'viewer');
create type public.pet_species as enum ('dog', 'cat', 'other');

create table public.pets (
  id         uuid primary key default gen_random_uuid(),
  name       text             not null,
  species    public.pet_species not null default 'dog',
  breed      text,
  birth_date date,
  sex        text check (sex in ('male', 'female', 'unknown')),
  photo_path text,
  timezone   text not null default 'Europe/Amsterdam',  -- ADR-001
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.pet_members (
  pet_id     uuid not null references public.pets (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.pet_role not null default 'caretaker',
  created_at timestamptz not null default now(),
  primary key (pet_id, user_id)
);

create index on public.pet_members (user_id);

-- ------------------------------------------------- функции проверки прав ---
-- ADR-008: обязательно security definer + фиксированный search_path,
-- иначе политика на pet_members рекурсивно вызывает саму себя.

create or replace function public.is_pet_member(p_pet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pet_members
    where pet_id = p_pet and user_id = auth.uid()
  );
$$;

create or replace function public.is_pet_owner(p_pet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pet_members
    where pet_id = p_pet and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ---------------------------------------------------------------- триггеры ---

-- Профиль и email-идентичность создаются автоматически при регистрации.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name',
                           split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  if new.email is not null then
    insert into user_identities (user_id, channel, value, verified_at)
    values (new.id, 'email', lower(new.email), new.email_confirmed_at)
    on conflict (channel, value) do update set user_id     = excluded.user_id,
                                               verified_at = excluded.verified_at;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Создатель питомца сразу становится владельцем.
create or replace function public.handle_new_pet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into pet_members (pet_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_pet_created
  after insert on public.pets
  for each row execute function public.handle_new_pet();

-- У питомца всегда должен остаться хотя бы один владелец.
create or replace function public.ensure_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'owner' and not exists (
    select 1 from pet_members
    where pet_id = old.pet_id and role = 'owner' and user_id <> old.user_id
  ) then
    raise exception 'Нельзя удалить последнего владельца питомца';
  end if;
  return old;
end;
$$;

create trigger pet_members_last_owner
  before delete on public.pet_members
  for each row execute function public.ensure_last_owner();

-- --------------------------------------------------------------------- RLS ---

alter table public.profiles        enable row level security;
alter table public.user_identities enable row level security;
alter table public.pets            enable row level security;
alter table public.pet_members     enable row level security;

-- Профиль: свой — полностью; чужой — видно, только если делите питомца.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from pet_members m1
      join pet_members m2 on m1.pet_id = m2.pet_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id
    )
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Контакты видит только владелец. Пишет их триггер / служебные функции.
create policy identities_select on public.user_identities
  for select to authenticated using (user_id = auth.uid());

-- Питомец: видят участники, меняют владельцы.
create policy pets_select on public.pets
  for select to authenticated
  using (deleted_at is null and public.is_pet_member(id));

create policy pets_insert on public.pets
  for insert to authenticated with check (created_by = auth.uid());

create policy pets_update on public.pets
  for update to authenticated
  using (public.is_pet_owner(id)) with check (public.is_pet_owner(id));

create policy pets_delete on public.pets
  for delete to authenticated using (public.is_pet_owner(id));

-- Членство: видят участники. INSERT-политики нет намеренно — членство
-- создаётся только через accept_invitation (см. следующую миграцию).
create policy members_select on public.pet_members
  for select to authenticated using (public.is_pet_member(pet_id));

create policy members_update on public.pet_members
  for update to authenticated
  using (public.is_pet_owner(pet_id)) with check (public.is_pet_owner(pet_id));

-- Владелец может удалить любого; любой может выйти сам.
create policy members_delete on public.pet_members
  for delete to authenticated
  using (public.is_pet_owner(pet_id) or user_id = auth.uid());


-- DOWN:
-- drop trigger if exists pet_members_last_owner on public.pet_members;
-- drop trigger if exists on_pet_created on public.pets;
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop function if exists public.ensure_last_owner, public.handle_new_pet,
--   public.handle_new_user, public.is_pet_owner, public.is_pet_member;
-- drop table if exists public.pet_members, public.pets,
--   public.user_identities, public.profiles;
-- drop type if exists public.pet_species, public.pet_role;
