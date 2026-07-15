import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useCategories } from './queries'
import type { Category } from './types'

const CategoriesContext = createContext<Map<number, Category>>(new Map())

export function CategoriesProvider({ children }: { children: ReactNode }): JSX.Element {
  const { data } = useCategories()
  const map = useMemo(() => {
    const m = new Map<number, Category>()
    for (const c of data?.category_list.categories ?? []) {
      m.set(c.id, c)
      // Discourse nests subcategories on some endpoints; flatten if present.
      const subs = (c as unknown as { subcategory_list?: Category[] }).subcategory_list
      for (const s of subs ?? []) m.set(s.id, s)
    }
    return m
  }, [data])

  return <CategoriesContext.Provider value={map}>{children}</CategoriesContext.Provider>
}

export function useCategoryMap(): Map<number, Category> {
  return useContext(CategoriesContext)
}

export function useCategory(id: number | undefined): Category | undefined {
  const map = useCategoryMap()
  return id == null ? undefined : map.get(id)
}
