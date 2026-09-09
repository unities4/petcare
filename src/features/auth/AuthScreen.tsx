import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DevSignIn } from './DevSignIn'

type Step = 'email' | 'code'

/** Должно совпадать с auth.email.otp_length в supabase/config.toml. */
const OTP_LENGTH = 6

/** Сообщения Supabase приходят по-английски, а показывать их так — плохо. */
function humanize(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid') && m.includes('token')) return 'Код неверный или просрочен.'
  if (m.includes('expired')) return 'Код просрочен. Запросите новый.'
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Слишком много попыток. Подождите минуту.'
  }
  if (m.includes('invalid') && m.includes('email')) return 'Похоже, адрес введён с ошибкой.'
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Нет связи с сервером. Проверьте интернет.'
  }
  return message
}

export function AuthScreen() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
    setBusy(false)
    if (error) setError(humanize(error.message))
    else setStep('code')
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // type: 'email' — код из письма. Сессия дальше подхватится onAuthStateChange.
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    if (error) setError(humanize(error.message))
  }

  if (step === 'email') {
    return (
      <div className="screen">
        <h1>PetCare</h1>
        <p className="lead">Дневник питания и симптомов питомца.</p>

        <form onSubmit={sendCode}>
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
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy || email.trim().length < 5}>
            {busy ? 'Отправляю…' : 'Получить код'}
          </button>
        </form>

        <p className="hint" style={{ marginTop: 16 }}>
          Пришлём код из {OTP_LENGTH} цифр. Пароль не нужен.
        </p>

        {import.meta.env.DEV && <DevSignIn />}
      </div>
    )
  }

  return (
    <div className="screen">
      <h1>Код из письма</h1>
      <p className="lead">Отправили на {email}. Введите {OTP_LENGTH} цифр.</p>

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

      <button
        className="link"
        type="button"
        onClick={() => {
          setStep('email')
          setCode('')
          setError(null)
        }}
      >
        Другой адрес
      </button>
    </div>
  )
}
