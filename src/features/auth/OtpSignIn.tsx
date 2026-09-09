import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { humanize } from './errors'

/** Должно совпадать с auth.email.otp_length в supabase/config.toml. */
const OTP_LENGTH = 6

/**
 * Вход по коду из письма (ADR-002). Показывается только когда у проекта настроен
 * свой SMTP: без него Supabase шлёт ссылку вместо кода и экран бесполезен (ADR-015).
 */
export function OtpSignIn({ onBack }: { onBack: () => void }) {
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
    setBusy(false)
    if (error) setError(humanize(error.message))
    else setSent(true)
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    if (error) setError(humanize(error.message))
  }

  if (!sent) {
    return (
      <div className="screen">
        <h1>Вход по коду</h1>
        <p className="lead">Пришлём код из {OTP_LENGTH} цифр. Пароль не нужен.</p>
        <form onSubmit={send}>
          <div className="field">
            <label htmlFor="otp-email">Почта</label>
            <input
              id="otp-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy || email.trim().length < 5}>
            {busy ? 'Отправляю…' : 'Получить код'}
          </button>
        </form>
        <button className="link" type="button" onClick={onBack}>
          Войти с паролем
        </button>
      </div>
    )
  }

  return (
    <div className="screen">
      <h1>Код из письма</h1>
      <p className="lead">Отправили на {email}.</p>
      <form onSubmit={verify}>
        <div className="field">
          <input
            className="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={OTP_LENGTH}
            placeholder={'0'.repeat(OTP_LENGTH)}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || code.length !== OTP_LENGTH}>
          {busy ? 'Проверяю…' : 'Войти'}
        </button>
      </form>
      <button className="link" type="button" onClick={() => setSent(false)}>
        Другой адрес
      </button>
    </div>
  )
}
