/**
 * Окна кормления от стартового времени.
 *
 * Приёмы распределяются по 12-часовому «активному дню», а не по суткам: иначе
 * при трёх кормлениях от 8:00 третье попало бы на полночь. Интервал 12 ч / (n − 1)
 * даёт привычные значения: 2 → 8:00 и 20:00, 3 → 8:00, 14:00, 20:00,
 * 4 → 8:00, 12:00, 16:00, 20:00.
 */
const ACTIVE_DAY_MINUTES = 12 * 60

export function computeTimes(startTime: string, mealsPerDay: number): string[] {
  const [h, m] = startTime.split(':').map(Number)
  const start = h * 60 + m
  if (mealsPerDay <= 1) return [toTime(start)]

  const step = ACTIVE_DAY_MINUTES / (mealsPerDay - 1)
  return Array.from({ length: mealsPerDay }, (_, i) => toTime(Math.round(start + step * i)))
}

function toTime(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Разовая порция. Считать это в уме над миской никто не будет. */
export function portionGrams(dailyNormG: number, mealsPerDay: number): number {
  if (!dailyNormG || !mealsPerDay) return 0
  return Math.round(dailyNormG / mealsPerDay)
}
