# Модель данных

Источник истины — файлы в `supabase/migrations/`. Этот документ объясняет
намерение; при расхождении правы миграции, а документ нужно обновить.

## Таблицы

| Таблица | Назначение |
|---|---|
| `profiles` | Отображаемое имя и аватар. 1:1 с `auth.users` |
| `user_identities` | Контактные каналы: email, позже phone и telegram (ADR-003) |
| `pets` | Питомец. `timezone` нужен для расчёта напоминаний |
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

Схема формы не проверяется базой, валидация на клиенте через Zod.

```
feeding     { food: string, grams?: number }
symptom     { symptom: 'vomiting'|'diarrhea'|'refusal'|'lethargy'|'other',
              severity?: 1|2|3 }
medication  { name: string, dose?: string }
vaccination { vaccine: string, next_due?: date, clinic?: string }
vet_visit   { clinic?: string, doctor?: string, diagnosis?: string }
weight      { kg: number }
```

## Ключевой запрос продукта

Что питомец ел за 24 часа до эпизода рвоты:

```sql
select f.occurred_at, f.details ->> 'food' as food, f.details ->> 'grams' as grams
from events s
join events f
  on f.pet_id = s.pet_id
 and f.type = 'feeding'
 and f.occurred_at between s.occurred_at - interval '24 hours' and s.occurred_at
where s.id = :symptom_event_id
order by f.occurred_at desc;
```

## Известные ограничения

- Ротация VAPID-ключей делает недействительными все существующие подписки.
  Меняем только вместе с принудительной переподпиской устройств
- `used_count` в приглашениях инкрементируется в той же транзакции, что и вставка
  членства, но при `on conflict do nothing` (повторный приём тем же человеком)
  счётчик не растёт — это намеренно
- Мягкое удаление есть только у `pets` (`deleted_at`). События удаляются жёстко
