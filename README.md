# PetCare

PWA для семьи, которая ведёт одну собаку: что съела, когда стало плохо, когда
пора кормить и давать таблетки. Главная платформа — iPhone, установленный на
домашний экран.

Зачем именно так и что осознанно не делаем — `docs/product.md`.

## Что в репозитории

```
CLAUDE.md                    конвенции проекта, читается Claude Code
CHANGELOG.md                 журнал версий и правила отката
docs/product.md              концепция, режим кормления, границы MVP, 7 задач
docs/data-model.md           схема, роли, правила доступа
docs/decisions.md            11 принятых решений с обоснованием (ADR)
docs/ios-pwa.md              ограничения iOS и чеклист проверки
docs/apply-schema.md         применение миграций через Dashboard, без CLI
supabase/migrations/         4 миграции: ядро, события, приглашения, тарифы
```

Фронтенда пока нет. Первая задача — установка на домашний экран и вход по коду.

## Подготовка (делается один раз, руками)

Разработка идёт локально, телефон подключается к dev-серверу по локальной сети,
база — облачная. Локального Docker и хостинга нет (ADR-009).

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

**4. Доступ с телефона.** Dev-сервер поднимается с `--host`, телефон должен быть
в той же сети. Адрес этой машины — `192.168.0.104`, то есть приложение откроется
на `http://192.168.0.104:5173`. Один раз понадобится разрешить входящие
подключения на этот порт в Windows Firewall.

Что по локальной сети **не** проверяется: Service Worker, офлайн и Web Push —
`http://192.168.x.x` не является secure context. Проверяется всё остальное,
включая установку на домашний экран, standalone-режим и вход по коду.

**5. Ключи для пушей.** Понадобятся в шестой задаче, вместе с настоящим HTTPS:
```bash
npx web-push generate-vapid-keys
```

## Команды на Windows

В PowerShell `npx` может падать с `Невозможно загрузить файл npx.ps1 ... выполнение
сценариев отключено`: это `ExecutionPolicy`, а не ошибка команды. Обходится вызовом
`npx.cmd` вместо `npx`, либо командами из Git Bash. Разрешать выполнение сценариев
целиком ради этого не нужно.

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
