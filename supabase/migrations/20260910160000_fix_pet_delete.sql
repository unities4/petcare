-- 20260910160000_fix_pet_delete.sql
-- Питомца было невозможно удалить.
--
-- `delete from pets` каскадит в `pet_members`, а триггер `ensure_last_owner`
-- на удалении членства видел, что уходит последний владелец, и поднимал
-- исключение. Защита срабатывала на том самом каскаде, ради которого удаление
-- и затевалось, — то есть политика pets_delete существовала, но не работала
-- никогда.

create or replace function public.ensure_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Питомца уже нет: это каскад от delete from pets, защищать некого.
  -- Родительская строка удаляется раньше, чем отрабатывают каскадные удаления,
  -- поэтому проверка достоверна.
  if not exists (select 1 from pets where id = old.pet_id) then
    return old;
  end if;

  if old.role = 'owner' and not exists (
    select 1 from pet_members
     where pet_id = old.pet_id
       and role = 'owner'
       and user_id <> old.user_id
  ) then
    raise exception 'Нельзя удалить последнего владельца питомца';
  end if;

  return old;
end;
$$;

-- DOWN: вернуть версию функции из 20260910100000_core.sql (без проверки
-- существования питомца). Учтите, что она снова сделает питомца неудаляемым.
