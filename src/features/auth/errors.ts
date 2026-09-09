/** Supabase отвечает по-английски. Показывать это пользователю нельзя. */
export function humanize(message: string): string {
  const m = message.toLowerCase()

  if (m.includes('invalid login credentials')) return 'Неверная почта или пароль.'
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'Эта почта уже зарегистрирована. Войдите вместо регистрации.'
  }
  if (m.includes('password should be') || m.includes('password is too short')) {
    return 'Пароль слишком короткий.'
  }
  if (m.includes('weak password') || m.includes('password requirements')) {
    return 'Пароль слишком простой. Добавьте букв и цифр.'
  }
  if (m.includes('email') && m.includes('invalid')) return 'Похоже, адрес введён с ошибкой.'
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
    return 'Регистрация сейчас закрыта.'
  }
  if (m.includes('email not confirmed')) {
    return 'Почта не подтверждена. Проверьте письмо со ссылкой.'
  }
  if (m.includes('invalid') && m.includes('token')) return 'Код неверный или просрочен.'
  if (m.includes('expired')) return 'Код просрочен. Запросите новый.'
  if (m.includes('rate limit') || m.includes('too many') || m.includes('for security purposes')) {
    return 'Слишком много попыток. Подождите минуту.'
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Нет связи с сервером. Проверьте интернет.'
  }
  return message
}
