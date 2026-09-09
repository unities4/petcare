import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { BreedPicker, type BreedChoice } from './BreedPicker'
import { computeTimes, portionGrams } from './schedule'
import type { Species } from './queries'

type Step = 'pet' | 'feeding'
type Sex = 'male' | 'female' | 'unknown'
type Mode = 'scheduled' | 'free'

const SPECIES: { value: Species; label: string }[] = [
  { value: 'dog', label: 'Собака' },
  { value: 'cat', label: 'Кошка' },
  { value: 'other', label: 'Другое' },
]

export function AddPet({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('pet')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- шаг 1: питомец ---
  const [name, setName] = useState('')
  const [species, setSpecies] = useState<Species>('dog')
  const [breed, setBreed] = useState<BreedChoice>({ kind: 'none' })
  const [sex, setSex] = useState<Sex>('unknown')
  const [exactBirth, setExactBirth] = useState(true)
  const [birthDate, setBirthDate] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [neutered, setNeutered] = useState<boolean | null>(null)

  // --- шаг 2: режим кормления ---
  const [mode, setMode] = useState<Mode>('scheduled')
  const [foodName, setFoodName] = useState('')
  const [dailyNorm, setDailyNorm] = useState('')
  const [mealsPerDay, setMealsPerDay] = useState(2)
  const [startTime, setStartTime] = useState('08:00')
  const [times, setTimes] = useState<string[]>(() => computeTimes('08:00', 2))
  const [packageWeight, setPackageWeight] = useState('')
  const [packageOpened, setPackageOpened] = useState('')
  const [tracksFeedings, setTracksFeedings] = useState(true)

  // Окна пересчитываются от старта и количества приёмов, но остаются правимыми
  // руками до сохранения.
  useEffect(() => {
    setTimes(computeTimes(startTime, mealsPerDay))
  }, [startTime, mealsPerDay])

  // Порода привязана к виду: сменили вид — прежний выбор бессмыслен.
  useEffect(() => {
    setBreed({ kind: 'none' })
  }, [species])

  function birthFields() {
    if (exactBirth) {
      return birthDate ? { birth_date: birthDate, birth_precision: 'day' as const } : null
    }
    if (!/^\d{4}$/.test(birthYear)) return null
    return { birth_date: `${birthYear}-01-01`, birth_precision: 'year' as const }
  }

  async function save() {
    setBusy(true)
    setError(null)

    const birth = birthFields()

    const userId = (await supabase.auth.getUser()).data.user?.id
    if (!userId) {
      setBusy(false)
      setError('Сессия истекла. Войдите заново.')
      return
    }

    // id генерируется здесь, и вставка идёт без RETURNING. Причина не в стиле:
    // политика чтения pets требует членства, а членство создаёт триггер
    // on_pet_created — after insert. is_pet_member помечена stable, поэтому
    // внутри того же запроса она этой строки ещё не видит, и любой insert
    // с возвратом строки падает на RLS. Свой id снимает вопрос целиком и
    // заодно делает повтор запроса безопасным.
    const petId = crypto.randomUUID()

    const { error: petError } = await supabase
      .from('pets')
      .insert({
        id: petId,
        name: name.trim(),
        species,
        sex,
        breed_id: breed.kind === 'known' ? breed.breedId : null,
        breed_custom: breed.kind === 'custom' ? breed.label : null,
        ...(birth ?? {}),
        neutered,
        feeding_mode: mode,
        tracks_feedings: mode === 'scheduled' ? tracksFeedings : true,
        created_by: userId,
      })

    if (petError) {
      setBusy(false)
      setError(petError.message)
      return
    }

    // Режим кормления — период, а не поля питомца (ADR-012).
    const { error: planError } = await supabase.from('feeding_plans').insert({
      pet_id: petId,
      food_name: foodName.trim() || 'Не указан',
      daily_norm_g: dailyNorm ? Number(dailyNorm) : null,
      meals_per_day: mode === 'scheduled' ? mealsPerDay : null,
      times: mode === 'scheduled' ? times : null,
      package_weight_g: packageWeight ? Number(packageWeight) : null,
      package_opened_on: packageOpened || null,
    })

    // Вес — событие, а не поле: он меняется, и в 0.2 из него будет график.
    if (weightKg) {
      await supabase.from('events').insert({
        id: crypto.randomUUID(),
        pet_id: petId,
        type: 'weight',
        details: { kg: Number(weightKg) },
        author_id: (await supabase.auth.getUser()).data.user!.id,
      })
    }

    setBusy(false)
    if (planError) {
      setError(`Питомец создан, но режим кормления не сохранился: ${planError.message}`)
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['pets'] })
    onDone()
  }

  if (step === 'pet') {
    const birthOk = birthFields() !== null || (!birthDate && !birthYear)
    const canNext = name.trim().length > 0 && birthOk

    return (
      <div className="screen">
        <h1>Питомец</h1>
        <p className="lead">Шаг 1 из 2</p>

        <div className="field">
          <label htmlFor="pet-name">Кличка</label>
          <input
            id="pet-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Барсик"
            required
          />
        </div>

        <div className="field">
          <label>Вид</label>
          <div className="chips">
            {SPECIES.map((s) => (
              <button
                key={s.value}
                type="button"
                className={species === s.value ? 'chip active' : 'chip'}
                onClick={() => setSpecies(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <BreedPicker species={species} value={breed} onChange={setBreed} />

        <div className="field">
          <label>Пол</label>
          <div className="chips">
            {(
              [
                ['male', 'Мальчик'],
                ['female', 'Девочка'],
                ['unknown', 'Не знаю'],
              ] as [Sex, string][]
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={sex === v ? 'chip active' : 'chip'}
                onClick={() => setSex(v)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Дата рождения</label>
          <div className="chips">
            <button
              type="button"
              className={exactBirth ? 'chip active' : 'chip'}
              onClick={() => setExactBirth(true)}
            >
              Знаю точно
            </button>
            <button
              type="button"
              className={!exactBirth ? 'chip active' : 'chip'}
              onClick={() => setExactBirth(false)}
            >
              Примерно
            </button>
          </div>
          {exactBirth ? (
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              style={{ marginTop: 8 }}
            />
          ) : (
            <input
              type="number"
              inputMode="numeric"
              placeholder="Год рождения, например 2021"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              style={{ marginTop: 8 }}
            />
          )}
          {!exactBirth && (
            <p className="hint" style={{ marginTop: 6 }}>
              Запишем как приблизительный. Лучше честно, чем выдуманный день.
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="weight">Вес, кг</label>
          <input
            id="weight"
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="12.5"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
          />
          <p className="hint" style={{ marginTop: 6 }}>
            Нужен, чтобы прочитать норму с пачки: там она разбита по весу.
          </p>
        </div>

        <div className="field">
          <label>Стерилизация</label>
          <div className="chips">
            {(
              [
                [true, 'Да'],
                [false, 'Нет'],
                [null, 'Не знаю'],
              ] as [boolean | null, string][]
            ).map(([v, l]) => (
              <button
                key={String(v)}
                type="button"
                className={neutered === v ? 'chip active' : 'chip'}
                onClick={() => setNeutered(v)}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            Снижает потребность в калориях примерно на четверть.
          </p>
        </div>

        <button type="button" disabled={!canNext} onClick={() => setStep('feeding')}>
          Дальше
        </button>
      </div>
    )
  }

  const portion = portionGrams(Number(dailyNorm), mealsPerDay)

  return (
    <div className="screen">
      <h1>Кормление</h1>
      <p className="lead">Шаг 2 из 2</p>

      <div className="field">
        <label>Режим</label>
        <div className="chips">
          <button
            type="button"
            className={mode === 'scheduled' ? 'chip active' : 'chip'}
            onClick={() => setMode('scheduled')}
          >
            По расписанию
          </button>
          <button
            type="button"
            className={mode === 'free' ? 'chip active' : 'chip'}
            onClick={() => setMode('free')}
          >
            Свободный доступ
          </button>
        </div>
        {mode === 'free' && (
          <p className="hint" style={{ marginTop: 6 }}>
            Корм всегда в миске. Расписания не будет, останутся напоминание
            «проверь миску», лекарства и запас корма.
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="food">Корм</label>
        <input
          id="food"
          value={foodName}
          onChange={(e) => setFoodName(e.target.value)}
          placeholder="Acana Lamb"
        />
      </div>

      <div className="field">
        <label htmlFor="norm">Дневная норма, г</label>
        <input
          id="norm"
          type="number"
          inputMode="numeric"
          value={dailyNorm}
          onChange={(e) => setDailyNorm(e.target.value)}
          placeholder="200"
        />
        <p className="hint" style={{ marginTop: 6 }}>
          Перепишите с пачки для веса вашего питомца.
        </p>
      </div>

      {mode === 'scheduled' && (
        <>
          <div className="field">
            <label>Приёмов в день</label>
            <div className="chips">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={mealsPerDay === n ? 'chip active' : 'chip'}
                  onClick={() => setMealsPerDay(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            {portion > 0 && (
              <p className="hint" style={{ marginTop: 6 }}>
                {dailyNorm} г ÷ {mealsPerDay} = <strong>{portion} г за раз</strong>
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="start">Первое кормление утром</label>
            <input
              id="start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Окна кормления</label>
            <div className="times">
              {times.map((t, i) => (
                <input
                  key={i}
                  type="time"
                  value={t}
                  onChange={(e) => {
                    const next = [...times]
                    next[i] = e.target.value
                    setTimes(next)
                  }}
                />
              ))}
            </div>
            <p className="hint" style={{ marginTop: 6 }}>
              Расставлены автоматически. Можно поправить любое.
            </p>
          </div>

          <div className="field">
            <label>Будете отмечать кормления в приложении?</label>
            <div className="chips">
              <button
                type="button"
                className={tracksFeedings ? 'chip active' : 'chip'}
                onClick={() => setTracksFeedings(true)}
              >
                Да
              </button>
              <button
                type="button"
                className={!tracksFeedings ? 'chip active' : 'chip'}
                onClick={() => setTracksFeedings(false)}
              >
                Нет
              </button>
            </div>
            <p className="hint" style={{ marginTop: 6 }}>
              {tracksFeedings
                ? 'На главном экране появится кнопка «Покормил».'
                : 'Кнопки не будет, лента кормлений построится из расписания. Отклонения записывать всё равно можно.'}
            </p>
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="pack">Вес пачки, г — необязательно</label>
        <input
          id="pack"
          type="number"
          inputMode="numeric"
          value={packageWeight}
          onChange={(e) => setPackageWeight(e.target.value)}
          placeholder="2000"
        />
        {packageWeight && (
          <input
            type="date"
            value={packageOpened}
            onChange={(e) => setPackageOpened(e.target.value)}
            style={{ marginTop: 8 }}
          />
        )}
        <p className="hint" style={{ marginTop: 6 }}>
          Нужны, чтобы предупредить, когда корм заканчивается. Это оценка, а не
          точный учёт.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <button type="button" onClick={save} disabled={busy}>
        {busy ? 'Сохраняю…' : 'Готово'}
      </button>
      <button className="link" type="button" onClick={() => setStep('pet')}>
        Назад
      </button>
    </div>
  )
}
