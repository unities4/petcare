# PetCare

PWA для семьи, которая ведёт одну собаку: что съела, когда стало плохо, когда
пора кормить и давать таблетки. Главная платформа — iPhone, установленный на
домашний экран.

Зачем именно так и что осознанно не делаем — `docs/product.md`.

## Что в репозитории

```
CLAUDE.md                    конвенции проекта, читается Claude Code
CHANGELOG.md                 журнал версий и правила отката
docs/product.md              концепция, границы MVP, порядок задач
docs/data-model.md           схема, роли, правила доступа
docs/decisions.md            11 принятых решений с обоснованием (ADR)
docs/ios-pwa.md              ограничения iOS и чеклист проверки
docs/apply-schema.md         применение миграций через Dashboard, без CLI
supabase/migrations/         4 миграции: ядро, события, приглашения, тарифы
```

Фронтенда пока нет. Первая задача — установка на домашний экран и вход по коду.

## Подготовка (делается один раз, руками)

Разработка идёт против облачной базы и публичного HTTPS-адреса с самого начала —
иначе ничего нельзя проверить на телефоне (ADR-009). Локальный Docker не нужен.

**1. Проект Supabase.** На supabase.com создайте проект (регион поближе,
например Frankfurt). Запишите из Settings → API: `Project URL` и ключ `anon`.
Ключ `service_role` не нужен нигде, кроме серверных функций, — на клиент он не
попадает никогда.

**2. Схема.** Примените четыре файла из `supabase/migrations/` по порядку имён —
через SQL Editor по инструкции `docs/apply-schema.md`. Там же блок учёта
применённых версий; заведите его до первого файла.

**3. Настройки Auth.** Dashboard → Authentication:
- Providers → Email включён, Confirm email включён
- Email Templates → Magic Link: поставьте `{{ .Token }}` первым и крупно, ссылку
  оставьте ниже запасным вариантом. Без этой правки пользователи на iPhone будут
  кликать ссылку и вылетать из приложения (ADR-002)
- URL Configuration → Redirect URLs: добавьте `http://localhost:5173` и адрес
  будущего деплоя

**4. Хостинг.** vercel.com → Add New Project → импорт этого репозитория с GitHub.
Пока собирать нечего, поэтому проект можно создать и после первой задачи, но
GitHub-репозиторий стоит завести сразу.

**5. Ключи для пушей.** Понадобятся только в пятой задаче:
```bash
npx web-push generate-vapid-keys
```

## Проверка, что схема жива

После шага 2, в SQL Editor:

```sql
-- под первым пользователем
insert into pets (name, created_by) values ('Барсик', auth.uid());
select * from pet_members;                      -- должна быть строка с role=owner
select * from create_invitation(:pet_id, 'caretaker', 'link');
-- под вторым пользователем
select * from peek_invitation(:token);
select accept_invitation(:token);
select * from pets;                             -- питомец виден
```

Если второй пользователь видит питомца до принятия приглашения — сломан RLS,
дальше не идём.

## Стек

Vite + React + TypeScript, `vite-plugin-pwa` (Workbox), TanStack Query.
Supabase: Postgres + RLS, Auth (email OTP), Storage, Edge Functions.
Напоминания: `pg_cron` + `pg_net` → Edge Function → Web Push (VAPID).
