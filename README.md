# PetCare

PWA для совместного ухода за питомцем. Кормления, симптомы, здоровье, напоминания.

## Что в каркасе

```
CLAUDE.md                    конвенции проекта, читается Claude Code
CHANGELOG.md                 журнал версий и правила отката
docs/product.md              сценарии, границы MVP, дорожная карта
docs/data-model.md           схема, роли, правила доступа
docs/decisions.md            8 принятых решений с обоснованием (ADR)
docs/ios-pwa.md              ограничения iOS и чеклист проверки
supabase/migrations/         4 миграции: ядро, события, приглашения, тарифы
```

Фронтенда пока нет — это следующий шаг.

## Запуск с нуля

```bash
# 1. Инструменты
npm install -g supabase
supabase login

# 2. Локальная база (нужен Docker)
supabase init          # если ещё нет supabase/config.toml
supabase start
supabase db reset      # применит все миграции из supabase/migrations

# 3. Проект в облаке — создайте на supabase.com, затем
supabase link --project-ref <ref>
supabase db push

# 4. Типы для фронтенда
supabase gen types typescript --local > src/lib/database.types.ts

# 5. Ключи для пушей (понадобятся в 5-й задаче)
npx web-push generate-vapid-keys
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
```

В настройках Auth проекта: включить Email provider, **выключить** «Confirm email»
не нужно, а вот шаблон письма стоит отредактировать так, чтобы 6-значный код
`{{ .Token }}` шёл первым и крупным (ADR-002).

## Проверка, что схема жива

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

## Первые задачи

Порядок в `docs/product.md`. Начните с 1 и 2: вход и приглашения. Каждая задача —
план, код, проверка на телефоне, коммит, запись в `CHANGELOG.md`.

Стек фронтенда для первой задачи:

```bash
npm create vite@latest . -- --template react-ts
npm i @supabase/supabase-js @tanstack/react-query
npm i -D vite-plugin-pwa
```
