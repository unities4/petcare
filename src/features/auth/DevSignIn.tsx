import { useState } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * ВРЕМЕННО (ADR-016). Вход без письма, пока у проекта нет своего SMTP и коды
 * physически не приходят. Весь файл удаляется целиком, когда заработает ADR-002.
 *
 * В продакшен-сборку не попадает: вызов обёрнут в import.meta.env.DEV, и Vite
 * вырезает ветку целиком при npm run build.
 */
const DEV_EMAIL = import.meta.env.VITE_DEV_EMAIL ?? 'dev@example.com'
const DEV_PASSWORD = import.meta.env.VITE_DEV_PASSWORD ?? 'petcare-dev-424242'

export function DevSignIn() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setBusy(true)
    setError(null)

    const creds = { email: DEV_EMAIL, password: DEV_PASSWORD }
    let { error } = await supabase.auth.signInWithPassword(creds)

    // Первый запуск: пользователя ещё нет. Подтверждение почты выключено,
    // поэтому signUp сразу отдаёт сессию.
    if (error) {
      const { error: signUpError } = await supabase.auth.signUp(creds)
      if (signUpError) {
        setBusy(false)
        setError(signUpError.message)
        return
      }
      ;({ error } = await supabase.auth.signInWithPassword(creds))
    }

    setBusy(false)
    if (error) setError(error.message)
  }

  return (
    <div className="card hint" style={{ marginTop: 24, borderStyle: 'dashed' }}>
      <strong style={{ color: 'var(--text)' }}>Вход для разработки</strong>
      <p style={{ margin: '6px 0 12px' }}>
        Писем пока нет: у проекта не настроен SMTP, и Supabase не может прислать
        код (ADR-015). Эта кнопка входит по паролю, минуя почту.
      </p>
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={signIn} disabled={busy}>
        {busy ? 'Вхожу…' : `Войти как ${DEV_EMAIL}`}
      </button>
    </div>
  )
}
