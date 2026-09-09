import { useMemo, useState } from 'react'
import { useBreeds, filterBreeds, type Species } from './queries'

export type BreedChoice =
  | { kind: 'known'; breedId: string; label: string }
  | { kind: 'custom'; label: string }
  | { kind: 'none' }

export function BreedPicker({
  species,
  value,
  onChange,
}: {
  species: Species
  value: BreedChoice
  onChange: (v: BreedChoice) => void
}) {
  const { data: breeds, isLoading } = useBreeds(species)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const found = useMemo(() => filterBreeds(breeds ?? [], query), [breeds, query])
  const exactMatch = found.some((b) => b.name_ru.toLowerCase() === query.trim().toLowerCase())

  if (species === 'other') return null

  if (!open) {
    const label =
      value.kind === 'none' ? 'Выбрать породу' : value.label
    return (
      <div className="field">
        <label>Порода</label>
        <button type="button" className="select-like" onClick={() => setOpen(true)}>
          {label}
        </button>
      </div>
    )
  }

  return (
    <div className="field">
      <label htmlFor="breed-search">Порода</label>
      <input
        id="breed-search"
        type="text"
        placeholder="Начните вводить…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        autoCapitalize="none"
      />

      <div className="picker">
        {isLoading && <p className="hint" style={{ padding: 12 }}>Загружаю…</p>}

        {found.map((b) => (
          <button
            key={b.id}
            type="button"
            className="picker-row"
            onClick={() => {
              onChange({ kind: 'known', breedId: b.id, label: b.name_ru })
              setOpen(false)
            }}
          >
            <span>{b.name_ru}</span>
            {/* Непризнанные не хуже, просто не признаны кинологическими
                организациями. Показываем это, а не прячем. */}
            {!b.recognized && <span className="badge">не признана FCI</span>}
          </button>
        ))}

        {query.trim().length > 1 && !exactMatch && (
          <button
            type="button"
            className="picker-row custom"
            onClick={() => {
              onChange({ kind: 'custom', label: query.trim() })
              setOpen(false)
            }}
          >
            Нет в списке — записать «{query.trim()}»
          </button>
        )}

        {!isLoading && found.length === 0 && query.trim().length <= 1 && (
          <p className="hint" style={{ padding: 12 }}>Ничего не найдено</p>
        )}
      </div>

      <button className="link" type="button" onClick={() => setOpen(false)}>
        Отмена
      </button>
    </div>
  )
}
