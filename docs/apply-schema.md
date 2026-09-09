# Применение схемы через Dashboard

Путь без CLI и Docker: SQL вставляется руками в SQL Editor проекта на supabase.com.

## Порядок

Файлы применяются **строго в порядке имён**, каждый целиком, по одному:

1. `20260910100000_core.sql`
2. `20260910110000_events_reminders.sql`
3. `20260910120000_invitations.sql`
4. `20260910130000_billing.sql`

SQL Editor выполняет вставленный скрипт одной транзакцией: если хоть один
оператор упадёт, откатится весь файл целиком. Это удобно — частично применённой
миграции не получится.

Перед первым файлом выполните один раз блок учёта ниже, иначе через месяц вы не
вспомните, что уже залито.

## Учёт применённого

CLI ведёт такую таблицу сам. Без CLI заводим её руками:

```sql
create table if not exists public.applied_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now(),
  applied_by  text default current_user
);
alter table public.applied_migrations enable row level security;
-- политик нет: читает и пишет только service role / SQL Editor
```

После каждого успешно применённого файла:

```sql
insert into public.applied_migrations (version) values ('20260910100000_core');
```

Проверить, что где:

```sql
select version, applied_at from public.applied_migrations order by version;
```

И параллельно ставьте галочку в `CHANGELOG.md`. Две записи в разных местах — это
не дублирование: одна говорит, что лежит в базе, вторая — что лежит в git.

## Три известные проблемы

**1. Триггер на `auth.users`.** В файлах `core` и `invitations` создаются триггеры
на таблице схемы `auth`. Из SQL Editor это обычно проходит, но на части проектов
выдаёт `must be owner of relation users`. Если так — уберите два блока
`create trigger ... on auth.users` из файла, примените остальное, а логику
регистрации перенесите в Edge Function либо в Auth Hook (Dashboard → Authentication
→ Hooks). Схему это не меняет, меняется только точка вызова.

**2. `auth.uid()` в SQL Editor возвращает `null`.** Вы работаете под
привилегированной ролью, RLS не применяется вообще. Поэтому проверочные запросы
из README там не сработают напрямую, и, что важнее, **успешный запрос в SQL
Editor ничего не говорит о том, что политики верны**.

Чтобы проверить права по-настоящему, притворитесь пользователем:

```sql
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-000000000000',
                      'role', 'authenticated')::text, true);
  set local role authenticated;

  -- здесь ваши проверки, auth.uid() вернёт подставленный uuid
  select * from pets;

rollback;
```

Подставьте реальный uuid из `auth.users`. `rollback` в конце обязателен, чтобы
тестовые данные не осели в базе.

**3. Расширение `pgcrypto`.** Строка `create extension if not exists pgcrypto`
на свежих проектах Supabase обычно уже выполнена — оператор просто ничего не
сделает. Если выдаст ошибку про схему, включите расширение через
Dashboard → Database → Extensions и удалите эту строку из файла.

## Когда переходить на CLI

Как только начнёте править схему регулярно (а это случится на третьей-четвёртой
задаче). Переход безболезненный: файлы миграций уже лежат в нужной папке с
нужными именами, достаточно выполнить `supabase link` и один раз пометить
применённые версии через `supabase migration repair --status applied <version>`.
Ничего переписывать не придётся — ровно ради этого схема с самого начала живёт
в файлах, а не в кликах по интерфейсу.

## Настройки Auth, которые надо поменять руками

Dashboard → Authentication:

- **Providers → Email**: включён. Confirm email — включён
- **Email Templates → Magic Link**: поставьте `{{ .Token }}` первым и крупным,
  ссылку оставьте ниже как запасной вариант (ADR-002). Без этого правки
  пользователи на iPhone будут кликать ссылку и вылетать из приложения
- **URL Configuration**: добавьте адрес фронтенда в Redirect URLs, включая
  `http://localhost:5173` для разработки
