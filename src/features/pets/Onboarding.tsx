/**
 * Развилка на входе. Поиска чужих питомцев здесь нет и не будет: привязка
 * возможна только по приглашению владельца, иначе постороннему достаточно
 * знать кличку, чтобы найти чужое животное.
 */
export function Onboarding({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="screen">
      <h1>Начнём</h1>
      <p className="lead">У вас пока нет питомца.</p>

      <button type="button" onClick={onAdd}>
        Добавить питомца
      </button>

      <div className="card" style={{ marginTop: 20 }}>
        <strong>У меня есть приглашение</strong>
        <p className="hint" style={{ margin: '6px 0 0' }}>
          Если питомца уже ведёт кто-то из семьи, попросите у него ссылку —
          она сразу откроет доступ. Экран приглашений появится в задаче 4.
        </p>
      </div>
    </div>
  )
}
