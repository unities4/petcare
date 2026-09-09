import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Нет VITE_SUPABASE_URL или VITE_SUPABASE_ANON_KEY. Скопируйте .env.example в .env.local.',
  )
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Вход только по коду (ADR-002), ссылок из письма не разбираем.
    detectSessionInUrl: false,
  },
})

// Только в разработке: клиент доступен из консоли для отладки запросов и RLS.
// В production-сборке ветка вырезается целиком.
if (import.meta.env.DEV) {
  ;(window as unknown as { sb: typeof supabase }).sb = supabase
}
