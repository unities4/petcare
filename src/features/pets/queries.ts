import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../lib/database.types'

export type Breed = Database['public']['Tables']['breeds']['Row']
export type Pet = Database['public']['Tables']['pets']['Row']
export type Species = Database['public']['Enums']['pet_species']

/**
 * Справочник грузится целиком один раз на вид: 149 строк — это единицы килобайт,
 * зато поиск мгновенный и не шлёт запрос на каждую букву.
 */
export function useBreeds(species: Species) {
  return useQuery({
    queryKey: ['breeds', species],
    staleTime: Infinity,
    enabled: species !== 'other',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('breeds')
        .select('*')
        .eq('species', species)
        .order('sort_order')
        .order('name_ru')
      if (error) throw error
      return data
    },
  })
}

export function usePets() {
  return useQuery({
    queryKey: ['pets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pets')
        .select('*')
        .is('deleted_at', null)
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}

/** Поиск по русскому названию, английскому и синонимам. */
export function filterBreeds(breeds: Breed[], query: string): Breed[] {
  const q = query.trim().toLowerCase()
  if (!q) return breeds
  return breeds.filter(
    (b) =>
      b.name_ru.toLowerCase().includes(q) ||
      (b.name_en?.toLowerCase().includes(q) ?? false) ||
      b.aliases.some((a) => a.toLowerCase().includes(q)),
  )
}
