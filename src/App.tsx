import { useState } from 'react'
import { useSession } from './lib/useSession'
import { isStandalone } from './lib/standalone'
import { supabase } from './lib/supabase'
import { AuthScreen } from './features/auth/AuthScreen'
import { InstallHint } from './features/auth/InstallHint'
import { usePets } from './features/pets/queries'
import { Onboarding } from './features/pets/Onboarding'
import { AddPet } from './features/pets/AddPet'

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

  return <SignedIn email={session.user.email ?? ''} />
}

function SignedIn({ email }: { email: string }) {
  const { data: pets, isLoading, error } = usePets()
  const [adding, setAdding] = useState(false)

  if (isLoading) {
    return (
      <div className="screen">
        <p className="hint">Загрузка…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="screen">
        <p className="error">{error.message}</p>
      </div>
    )
  }

  if (adding) return <AddPet onDone={() => setAdding(false)} />
  if (!pets || pets.length === 0) return <Onboarding onAdd={() => setAdding(true)} />

  const pet = pets[0]

  return (
    <div className="screen">
      <h1>{pet.name}</h1>
      <p className="lead">
        {pet.species === 'dog' ? 'Собака' : pet.species === 'cat' ? 'Кошка' : 'Питомец'}
        {pet.feeding_mode === 'free' ? ', свободный доступ' : ', кормление по расписанию'}
      </p>

      <div className="card">
        <p style={{ margin: 0 }}>
          Здесь будет дневник: кнопки «Покормил» и «Симптом», лента за сегодня.
          Это задача 3.
        </p>
      </div>

      {!isStandalone() && (
        <div style={{ marginTop: 16 }}>
          <InstallHint />
        </div>
      )}

      <div className="spacer" />
      <p className="hint" style={{ marginBottom: 8 }}>
        {email} · {isStandalone() ? 'с домашнего экрана' : 'вкладка браузера'}
      </p>
      <button className="link" type="button" onClick={() => supabase.auth.signOut()}>
        Выйти
      </button>
    </div>
  )
}
