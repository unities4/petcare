-- 20260910130000_billing.sql
-- Заготовка монетизации (ADR-006). Таблицы создаём сразу, чтобы позже не ломать
-- схему, но проверку лимитов включаем отдельной миграцией в версии 0.3.

create table public.plans (
  code                  text primary key,          -- free | pro
  name                  text not null,
  price_cents           int  not null default 0,
  currency              text not null default 'EUR',
  max_pets              int,                       -- null = без ограничения
  max_members_per_pet   int,
  history_days          int,                       -- null = вся история
  max_reminders_per_pet int,
  features              jsonb not null default '{}'::jsonb,
  sort_order            int  not null default 0
);

insert into public.plans
  (code, name, price_cents, max_pets, max_members_per_pet,
   history_days, max_reminders_per_pet, features, sort_order)
values
  ('free', 'Бесплатный', 0, 1, 2, 90, 3,
   '{"photos": false, "export_pdf": false, "vet_records": false}', 0),
  ('pro',  'Pro',      299, null, null, null, null,
   '{"photos": true,  "export_pdf": true,  "vet_records": true}',  1);

create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null unique references auth.users (id) on delete cascade,
  plan_code                text not null references public.plans (code),
  status                   text not null default 'active'
                             check (status in ('active','trialing','past_due','canceled')),
  provider                 text,                  -- stripe | apple_iap | ...
  provider_customer_id     text,
  provider_subscription_id text,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index on public.subscriptions (provider_subscription_id);

-- Тариф пользователя: активная подписка или free.
create or replace function public.user_plan(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.plan_code from subscriptions s
      where s.user_id = p_user
        and s.status in ('active', 'trialing')
        and (s.current_period_end is null or s.current_period_end > now())
      limit 1),
    'free');
$$;

-- Тариф питомца — лучший среди его владельцев (ADR-006).
create or replace function public.pet_plan(p_pet uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.code
       from pet_members m
       join plans p on p.code = public.user_plan(m.user_id)
      where m.pet_id = p_pet and m.role = 'owner'
      order by p.sort_order desc
      limit 1),
    'free');
$$;

-- --------------------------------------------------------------------- RLS ---

alter table public.plans         enable row level security;
alter table public.subscriptions enable row level security;

create policy plans_read on public.plans
  for select to anon, authenticated using (true);

-- Свою подписку видно, но менять её клиент не может: пишет только вебхук
-- платёжного провайдера через service role.
create policy subscriptions_select on public.subscriptions
  for select to authenticated using (user_id = auth.uid());


-- DOWN:
-- drop function if exists public.pet_plan(uuid), public.user_plan(uuid);
-- drop table if exists public.subscriptions, public.plans;
