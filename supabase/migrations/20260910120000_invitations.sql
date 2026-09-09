-- 20260910120000_invitations.sql
-- Приглашения: ссылка, QR и email — один механизм (ADR-004, ADR-005).
-- В базе лежит только SHA-256 токена, сам токен показывается один раз.

create table public.pet_invitations (
  id           uuid primary key default gen_random_uuid(),
  pet_id       uuid not null references public.pets (id) on delete cascade,
  role         public.pet_role not null default 'caretaker',
  token_hash   text not null unique,
  channel      text not null check (channel in ('link', 'qr', 'email')),
  target_email text,                       -- null для открытой ссылки/QR
  created_by   uuid not null references auth.users (id),
  max_uses     int  not null default 1 check (max_uses between 1 and 50),
  used_count   int  not null default 0,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index invitations_pet_idx   on public.pet_invitations (pet_id);
create index invitations_email_idx on public.pet_invitations (target_email)
  where target_email is not null;

alter table public.pet_invitations enable row level security;

-- Список своих приглашений видит владелец. Токен там уже хеш, показать нечего.
create policy invitations_select on public.pet_invitations
  for select to authenticated using (public.is_pet_owner(pet_id));

-- Отозвать приглашение.
create policy invitations_update on public.pet_invitations
  for update to authenticated
  using (public.is_pet_owner(pet_id)) with check (public.is_pet_owner(pet_id));

-- ------------------------------------------------------ создание приглашения ---

create or replace function public.create_invitation(
  p_pet      uuid,
  p_role     public.pet_role default 'caretaker',
  p_channel  text            default 'link',
  p_email    text            default null,
  p_ttl      interval        default '7 days',
  p_max_uses int             default 1
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not public.is_pet_owner(p_pet) then
    raise exception 'Только владелец может приглашать участников';
  end if;

  if p_channel = 'email' and p_email is null then
    raise exception 'Для приглашения по email нужен адрес';
  end if;

  if p_role = 'owner' then
    raise exception 'Роль owner назначается отдельно, не через приглашение';
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  return query
  insert into pet_invitations (pet_id, role, token_hash, channel,
                               target_email, created_by, max_uses, expires_at)
  values (p_pet, p_role, encode(sha256(v_token::bytea), 'hex'), p_channel,
          nullif(lower(trim(p_email)), ''), auth.uid(), p_max_uses, now() + p_ttl)
  returning pet_invitations.id, v_token, pet_invitations.expires_at;
end;
$$;

-- --------------------------------------------------- предпросмотр по токену ---
-- Чтобы на экране /join показать «Вас приглашают ухаживать за Барсиком»
-- ещё до авторизации. Отдаёт минимум данных.

create or replace function public.peek_invitation(p_token text)
returns table (pet_name text, pet_photo_path text, role public.pet_role,
               inviter_name text, valid boolean)
language sql
security definer
set search_path = public
as $$
  select p.name,
         p.photo_path,
         i.role,
         pr.display_name,
         (i.revoked_at is null
          and i.expires_at > now()
          and i.used_count < i.max_uses)
  from pet_invitations i
  join pets p       on p.id = i.pet_id
  left join profiles pr on pr.id = i.created_by
  where i.token_hash = encode(sha256(p_token::bytea), 'hex');
$$;

grant execute on function public.peek_invitation(text) to anon, authenticated;

-- ------------------------------------------------------- приём приглашения ---

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv   pet_invitations%rowtype;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Нужно войти в аккаунт';
  end if;

  select * into v_inv from pet_invitations
  where token_hash = encode(sha256(p_token::bytea), 'hex')
  for update;

  if not found then
    raise exception 'Приглашение не найдено';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'Приглашение отозвано';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'Срок действия приглашения истёк';
  end if;
  if v_inv.used_count >= v_inv.max_uses then
    raise exception 'Приглашение уже использовано';
  end if;

  -- Адресное приглашение принимает только его адресат.
  if v_inv.target_email is not null then
    select lower(email) into v_email from auth.users where id = auth.uid();
    if v_email is distinct from v_inv.target_email then
      raise exception 'Это приглашение выписано на другой адрес';
    end if;
  end if;

  insert into pet_members (pet_id, user_id, role)
  values (v_inv.pet_id, auth.uid(), v_inv.role)
  on conflict (pet_id, user_id) do nothing;

  if found then
    update pet_invitations set used_count = used_count + 1 where id = v_inv.id;
  end if;

  return v_inv.pet_id;
end;
$$;

grant execute on function public.accept_invitation(text) to authenticated;

-- ------------------------------- автоматический приём при регистрации по email ---
-- Случай: человеку прислали приглашение на почту, но он зарегистрировался сам,
-- не переходя по ссылке. Работает только для подтверждённой почты (ADR-005).

create or replace function public.claim_email_invitations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or new.email_confirmed_at is null then
    return new;
  end if;

  with claimed as (
    select id, pet_id, role from pet_invitations
    where target_email = lower(new.email)
      and revoked_at is null
      and expires_at > now()
      and used_count < max_uses
    for update
  ), inserted as (
    insert into pet_members (pet_id, user_id, role)
    select pet_id, new.id, role from claimed
    on conflict (pet_id, user_id) do nothing
    returning pet_id
  )
  update pet_invitations i
     set used_count = i.used_count + 1
    from claimed c
   where i.id = c.id;

  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.claim_email_invitations();


-- DOWN:
-- drop trigger if exists on_auth_user_confirmed on auth.users;
-- drop function if exists public.claim_email_invitations,
--   public.accept_invitation(text), public.peek_invitation(text),
--   public.create_invitation(uuid, public.pet_role, text, text, interval, int);
-- drop table if exists public.pet_invitations;
