import { useSession } from './lib/useSession'
import { isStandalone } from './lib/standalone'
import { supabase } from './lib/supabase'
import { AuthScreen } from './features/auth/AuthScreen'
import { InstallHint } from './features/auth/InstallHint'

export function App() {
  const session = useSession()

  if (session === undefined) {
    return (
      <div className="screen">
        <p className="hint">Загрузка…</p>
      </div>
    )
  }

  if (session === null) return <AuthScreen />

  return (
    <div className="screen">
      <h1>Вы вошли</h1>
      <p className="lead">{session.user.email}</p>

      <div className="card">
        <p style={{ margin: 0 }}>
          Здесь будет питомец и дневник. Пока это заглушка: задача 1 проверяет
          установку на домашний экран и вход по коду.
        </p>
      </div>

      {!isStandalone() && (
        <div style={{ marginTop: 16 }}>
          <InstallHint />
        </div>
      )}

      <div className="spacer" />
      <p className="hint" style={{ marginBottom: 8 }}>
        Режим: {isStandalone() ? 'с домашнего экрана' : 'вкладка браузера'}
      </p>
      <button className="link" type="button" onClick={() => supabase.auth.signOut()}>
        Выйти
      </button>
    </div>
  )
}
