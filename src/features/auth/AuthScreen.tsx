import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { humanize } from './errors'
import { OtpSignIn } from './OtpSignIn'

/** Должно совпадать с auth.minimum_password_length в supabase/config.toml. */
const MIN_PASSWORD = 8

/** Вход по коду показываем, только когда у проекта настроен свой SMTP (ADR-015). */
const OTP_AVAILABLE = import.meta.env.VITE_EMAIL_OTP_ENABLED === 'true'

type Mode = 'signin' | 'signup'

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin')
  const [otp, setOtp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkMail, setCheckMail] = useState(false)

  if (otp && OTP_AVAILABLE) return <OtpSignIn onBack={() => setOtp(false)} />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const creds = { email: email.trim(), password }

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword(creds)
      setBusy(false)
      if (error) setError(humanize(error.message))
      return
    }

    const { data, error } = await supabase.auth.signUp(creds)
    setBusy(false)
    if (error) {
      setError(humanize(error.message))
      return
    }
    // Если подтверждение почты включено, сессии не будет: Supabase ждёт перехода
    // по ссылке из письма. Сейчас подтверждение выключено (ADR-016), но код
    // должен пережить его возврат.
    if (!data.session) setCheckMail(true)
  }

  if (checkMail) {
    return (
      <div className="screen">
        <h1>Проверьте почту</h1>
        <p className="lead">
          Отправили письмо на {email.trim()}. Перейдите по ссылке, чтобы завершить
          регистрацию, и возвращайтесь сюда.
        </p>
        <button
          className="link"
          type="button"
          onClick={() => {
            setCheckMail(false)
            setMode('signin')
          }}
        >
          Назад ко входу
        </button>
      </div>
    )
  }

  const tooShort = password.length < MIN_PASSWORD
  const canSubmit = email.trim().length >= 5 && !tooShort && !busy

  return (
    <div className="screen">
      <h1>PetCare</h1>
      <p className="lead">Дневник питания и симптомов питомца.</p>

      <div className="tabs">
        <button
          type="button"
          className={mode === 'signin' ? 'tab active' : 'tab'}
          onClick={() => {
            setMode('signin')
            setError(null)
          }}
        >
          Вход
        </button>
        <button
          type="button"
          className={mode === 'signup' ? 'tab active' : 'tab'}
          onClick={() => {
            setMode('signup')
            setError(null)
          }}
        >
          Регистрация
        </button>
      </div>

      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">Почта</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">Пароль</label>
          <div className="with-action">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              autoCapitalize="none"
              autoCorrect="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="button" className="reveal" onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? 'Скрыть' : 'Показать'}
            </button>
          </div>
          {mode === 'signup' && (
            <p className="hint" style={{ marginTop: 6 }}>
              Минимум {MIN_PASSWORD} символов.
            </p>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={!canSubmit}>
          {busy
            ? mode === 'signin'
              ? 'Вхожу…'
              : 'Регистрирую…'
            : mode === 'signin'
              ? 'Войти'
              : 'Зарегистрироваться'}
        </button>
      </form>

      {OTP_AVAILABLE && (
        <button className="link" type="button" onClick={() => setOtp(true)}>
          Войти по коду из письма
        </button>
      )}
    </div>
  )
}
