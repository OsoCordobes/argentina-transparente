import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Bookmarks volátiles antes de persistir en Supabase. Cuando el usuario crea
// el caso (o ya tiene uno seleccionado), los items se sincronizan a la base
// y se vacían de aquí.

export type EntidadBookmark = {
  nombre: string
  cuit?: string
  municipio?: string
}

export type ContratoBookmark = {
  hash: string
  proveedor: string
  monto: number
  anio: number
  tipo: string
  area?: string
  fuenteUrl?: string
}

export type SeñalBookmark = {
  id: string
  tipologia: string
  titulo: string
  resumen: string
  score: number
  severidad: 'grave' | 'moderada' | 'leve'
  cuits: string[]
  evidencia: { descripcion: string; fuenteUrl: string }[]
  legal: { articulos?: string[]; severidad?: string; denunciarAnte?: string[] }
}

interface CasoStore {
  // Caso activo (id de Supabase). null = bookmarks volátiles locales.
  casoIdActivo: string | null
  setCasoActivo: (id: string | null) => void

  bookmarks: {
    entidades: EntidadBookmark[]
    contratos: ContratoBookmark[]
    señales: SeñalBookmark[]
  }
  agregarEntidad: (e: EntidadBookmark) => void
  quitarEntidad: (nombre: string) => void
  agregarContrato: (c: ContratoBookmark) => void
  quitarContrato: (hash: string) => void
  agregarSeñal: (s: SeñalBookmark) => void
  quitarSeñal: (id: string) => void
  limpiar: () => void

  // Total para mostrar en la UI
  totalBookmarks: () => number
}

export const useCasoStore = create<CasoStore>()(
  persist(
    (set, get) => ({
      casoIdActivo: null,
      setCasoActivo: (id) => set({ casoIdActivo: id }),

      bookmarks: { entidades: [], contratos: [], señales: [] },

      agregarEntidad: (e) =>
        set((s) => {
          if (s.bookmarks.entidades.some((x) => x.nombre === e.nombre)) return s
          return {
            bookmarks: { ...s.bookmarks, entidades: [...s.bookmarks.entidades, e] },
          }
        }),
      quitarEntidad: (nombre) =>
        set((s) => ({
          bookmarks: {
            ...s.bookmarks,
            entidades: s.bookmarks.entidades.filter((x) => x.nombre !== nombre),
          },
        })),

      agregarContrato: (c) =>
        set((s) => {
          if (s.bookmarks.contratos.some((x) => x.hash === c.hash)) return s
          return {
            bookmarks: { ...s.bookmarks, contratos: [...s.bookmarks.contratos, c] },
          }
        }),
      quitarContrato: (hash) =>
        set((s) => ({
          bookmarks: {
            ...s.bookmarks,
            contratos: s.bookmarks.contratos.filter((x) => x.hash !== hash),
          },
        })),

      agregarSeñal: (señ) =>
        set((s) => {
          if (s.bookmarks.señales.some((x) => x.id === señ.id)) return s
          return {
            bookmarks: { ...s.bookmarks, señales: [...s.bookmarks.señales, señ] },
          }
        }),
      quitarSeñal: (id) =>
        set((s) => ({
          bookmarks: {
            ...s.bookmarks,
            señales: s.bookmarks.señales.filter((x) => x.id !== id),
          },
        })),

      limpiar: () => set({ bookmarks: { entidades: [], contratos: [], señales: [] } }),

      totalBookmarks: () => {
        const b = get().bookmarks
        return b.entidades.length + b.contratos.length + b.señales.length
      },
    }),
    {
      name: 'argos-caso',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
