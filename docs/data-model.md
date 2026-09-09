# Модель данных

Источник истины — файлы в `supabase/migrations/`. Этот документ объясняет
намерение; при расхождении правы миграции, а документ нужно обновить.

## Таблицы

| Таблица | Назначение |
|---|---|
| `profiles` | Отображаемое имя и аватар. 1:1 с `auth.users` |
| `user_identities` | Контактные каналы: email, позже phone и telegram (ADR-003) |
| `pets` | Питомец. `timezone` нужен для расчёта напоминаний. `feeding_mode`, `tracks_feedings` |
| `feeding_plans` | Периоды режима кормления: корм, норма, приёмы, окна, пачка (ADR-012) |
| `pet_members` | Кто и с какой ролью ведёт питомца |
| `pet_invitations` | Приглашения: ссылка, QR, email. Хранится хеш токена |
| `events` | Единая лента: кормления, симптомы, лекарства и прочее (ADR-007) |
| `reminders` | Расписания напоминаний |
| `push_subscriptions` | Устройства пользователя для Web Push |
| `notifications_log` | Журнал отправок, защита от повторов |
| `plans`, `subscriptions` | Тарифы и подписки, включаются в 0.3 (ADR-006) |

## Роли

`owner` — всё, включая управление участниками и удаление питомца.
`caretaker` — записи и напоминания, без управления участниками.
`viewer` — только чтение.

У питомца всегда есть минимум один владелец: триггер `pet_members_last_owner`
не даст удалить последнего.

## Правила доступа

Всё построено вокруг `is_pet_member(pet_id)` и `is_pet_owner(pet_id)` (ADR-008).

- `pets` — читают участники, меняют владельцы
- `events` — читают участники; пишут owner и caretaker; правит автор или владелец
- `pet_members` — **нет политики INSERT**, членство создаётся только функцией
  `accept_invitation`. Удалить может владелец или сам участник (выход)
- `push_subscriptions` — строго свои строки
- `subscriptions` — чтение своих, запись только через service role из вебхука

## Функции

| Функция | Кто вызывает | Что делает |
|---|---|---|
| `create_invitation(pet, role, channel, email, ttl, max_uses)` | владелец | Создаёт приглашение, **возвращает сырой токен один раз** |
| `peek_invitation(token)` | кто угодно, включая анонимов | Имя питомца и валидность — для экрана `/join` |
| `accept_invitation(token)` | авторизованный | Проверяет токен и создаёт членство |
| `user_plan(user)` / `pet_plan(pet)` | внутренние | Действующий тариф |

## Поле `events.details`

Схема формы не проверяется базой, валидация на клиенте через Zod. Отклонения от
рутины — это `feeding` с другим `kind`, а не отдельные типы событий (ADR-011).

```
feeding     { kind: 'meal'|'treat'|'table'|'scavenged'|'other_food'|'skipped',
              food?: string, grams?: number }
symptom     { symptom: <код из списка ниже>, severity?: 1|2|3, detail?: string }
medication  { name: string, dose?: string }
vaccination { vaccine: string, next_due?: date, clinic?: string }
vet_visit   { clinic?: string, doctor?: string, diagnosis?: string }
weight      { kg: number }
```

## Ключевой запрос продукта

Что питомец ел за 24 часа до эпизода рвоты:

```sql
select f.occurred_at,
       f.details ->> 'kind'  as kind,      -- meal | treat | table | scavenged
       f.details ->> 'food'  as food,
       f.details ->> 'grams' as grams
from events s
join events f
  on f.pet_id = s.pet_id
 and f.type = 'feeding'
 and f.occurred_at between s.occurred_at - interval '24 hours' and s.occurred_at
where s.id = :symptom_event_id
order by f.occurred_at desc;
```

`kind = 'skipped'` — это пропущенное плановое кормление, то есть отсутствие еды.
В выборку «что съел» оно не идёт, но на линии дневника показывается: «не ела
двенадцать часов» — тоже факт, объясняющий эпизод. Запросу нужен явный фильтр.

Новый подтип попадает в этот запрос сам собой — фильтр идёт по `type`, а не по
`kind`. В интерфейсе строки с `kind <> 'meal'` выделяются: именно они объясняют
эпизод, а `meal` — фон.

## Коды симптомов

Набор живёт в клиенте, база хранит строку. Расширяется без миграции (ADR-007).

```
ЖКТ         vomiting_food | vomiting_bile | vomiting_foam | vomiting_blood
            diarrhea | constipation | refusal | bloating | drooling | regurgitation
Кожа и уши  itching | redness | paw_licking | head_shaking | ear_discharge | hair_loss
Общее       lethargy | thirst | limping | cough | tearing | trembling
Прочее      other  (обязательно поле detail)
```

Кожа и уши — не для полноты списка: зуд, лапы и уши составляют типичную внешнюю
картину пищевой непереносимости у собак.

## Расхождения с текущими миграциями

Здесь то, что решено в ADR, но ещё не залито в схему. Закрывается миграцией в
соответствующей задаче, не правкой применённых файлов.

- **`feeding_plans`** — таблицы нет вовсе (ADR-012). Нужна в задаче 2. Поля:
  `pet_id`, `food_name`, `daily_norm_g`, `meals_per_day`, `times time[]`,
  `package_weight_g`, `package_opened_on`, `started_at`, `ended_at`
- **`pets.feeding_mode`** (`free` / `scheduled`) и **`pets.tracks_feedings`** —
  тоже задача 2
- **`pets.timezone`** — в миграции стоит default `'Europe/Amsterdam'`. Проверьте,
  что это ваша зона: от неё считаются напоминания (ADR-001). Меняется при
  создании питомца, но правильный default избавит от сюрприза

## Две ловушки, найденные на практике

**Создать питомца и прочитать его одним запросом нельзя.** Политика `pets_select`
требует членства, членство создаёт триггер `on_pet_created` (`after insert`), а
`is_pet_member` помечена `stable` и видит снимок на начало запроса, где строки
членства ещё нет. Любой `insert ... returning` падает на RLS. Поэтому `id`
питомца генерируется на клиенте и вставка идёт без возврата строки — заодно
повтор запроса становится безопасным. Добавлять `created_by = auth.uid()` в
политику чтения нельзя: тогда удалённый из питомца создатель продолжит его видеть.

**Питомец был неудаляем** (исправлено миграцией `20260910160000_fix_pet_delete`).
`delete from pets` каскадит в `pet_members`, и триггер `ensure_last_owner`
срабатывал на том самом каскаде, ради которого удаление затевалось. Теперь
триггер пропускает случай, когда питомца уже нет.

## Известные ограничения

- Ротация VAPID-ключей делает недействительными все существующие подписки.
  Меняем только вместе с принудительной переподпиской устройств
- `used_count` в приглашениях инкрементируется в той же транзакции, что и вставка
  членства, но при `on conflict do nothing` (повторный приём тем же человеком)
  счётчик не растёт — это намеренно
- Мягкое удаление есть только у `pets` (`deleted_at`). События удаляются жёстко
