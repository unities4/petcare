-- 20260910110000_events_reminders.sql
-- Единая лента событий (ADR-007), напоминания и push-подписки (ADR-001).

-- ---------------------------------------------------------------- события ---

create type public.event_type as enum (
  'feeding', 'symptom', 'medication', 'vaccination',
  'vet_visit', 'weight', 'walk', 'note'
);

create table public.events (
  id          uuid primary key,            -- генерируется КЛИЕНТОМ, см. CLAUDE.md
  pet_id      uuid not null references public.pets (id) on delete cascade,
  author_id   uuid not null references auth.users (id),
  type        public.event_type not null,
  occurred_at timestamptz not null default now(),
  note        text,
  details     jsonb not null default '{}'::jsonb,
  photo_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Главный индекс: лента питомца и выборка «что ел за 24 ч до симптома».
create index events_pet_time_idx  on public.events (pet_id, occurred_at desc);
create index events_pet_type_idx  on public.events (pet_id, type, occurred_at desc);

comment on column public.events.details is
  'Форма зависит от type. feeding: {food, grams}. symptom: {symptom, severity}. '
  'medication: {name, dose}. vaccination: {vaccine, next_due}. weight: {kg}. '
  'Валидируется на клиенте (Zod), база форму не гарантирует.';

-- ------------------------------------------------------------ напоминания ---

create table public.reminders (
  id           uuid primary key default gen_random_uuid(),
  pet_id       uuid not null references public.pets (id) on delete cascade,
  kind         public.event_type not null default 'feeding',
  title        text not null,
  -- Простое расписание: время суток + дни недели (0=вс … 6=сб).
  -- Разовые напоминания: times_of_day пустой, заполнен next_run_at.
  times_of_day time[] not null default '{}',
  weekdays     smallint[] not null default '{0,1,2,3,4,5,6}',
  next_run_at  timestamptz,
  enabled      boolean not null default true,
  created_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now()
);

create index reminders_due_idx on public.reminders (next_run_at)
  where enabled and next_run_at is not null;

-- Журнал отправок: защита от дублей при перезапуске cron и материал для отладки.
create table public.notifications_log (
  id          uuid primary key default gen_random_uuid(),
  reminder_id uuid references public.reminders (id) on delete set null,
  pet_id      uuid references public.pets (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete cascade,
  scheduled_for timestamptz not null,
  sent_at     timestamptz not null default now(),
  status      text not null,               -- sent | failed | gone
  error       text,
  unique (reminder_id, user_id, scheduled_for)
);

-- ---------------------------------------------------------- push-подписки ---

create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index on public.push_subscriptions (user_id);

-- --------------------------------------------------------------------- RLS ---

alter table public.events             enable row level security;
alter table public.reminders          enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications_log  enable row level security;

-- События: читают все участники, пишет любой участник от своего имени,
-- правит автор или владелец. viewer только читает.
create policy events_select on public.events
  for select to authenticated using (public.is_pet_member(pet_id));

create policy events_insert on public.events
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.pet_members
                where pet_id = events.pet_id
                  and user_id = auth.uid()
                  and role in ('owner', 'caretaker'))
  );

create policy events_update on public.events
  for update to authenticated
  using (author_id = auth.uid() or public.is_pet_owner(pet_id))
  with check (author_id = auth.uid() or public.is_pet_owner(pet_id));

create policy events_delete on public.events
  for delete to authenticated
  using (author_id = auth.uid() or public.is_pet_owner(pet_id));

-- Напоминания: общие для питомца, меняет любой не-viewer.
create policy reminders_select on public.reminders
  for select to authenticated using (public.is_pet_member(pet_id));

create policy reminders_write on public.reminders
  for all to authenticated
  using (exists (select 1 from public.pet_members
                 where pet_id = reminders.pet_id
                   and user_id = auth.uid()
                   and role in ('owner', 'caretaker')))
  with check (exists (select 1 from public.pet_members
                      where pet_id = reminders.pet_id
                        and user_id = auth.uid()
                        and role in ('owner', 'caretaker')));

-- Push-подписки: строго свои.
create policy push_own on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Журнал: пользователь видит только свои отправки. Пишет service role.
create policy notifications_select on public.notifications_log
  for select to authenticated using (user_id = auth.uid());


-- DOWN:
-- drop table if exists public.push_subscriptions, public.notifications_log,
--   public.reminders, public.events;
-- drop type if exists public.event_type;
