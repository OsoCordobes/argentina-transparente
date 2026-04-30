import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL ?? ''
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const supabaseConfigured = URL.length > 0 && ANON_KEY.length > 0

// Cliente real solo si está configurado. Si no, exportamos un proxy que tira
// errores explícitos cuando se invoca un método (mejor que crashear silenciosamente).
function makeStub(): SupabaseClient {
  const handler: ProxyHandler<object> = {
    get(_, prop) {
      if (prop === 'auth') return {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInWithOtp: async () => ({
          data: null,
          error: { message: 'Supabase no configurado. Definí VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.' },
        }),
        signOut: async () => ({ error: null }),
      }
      if (prop === 'from') {
        return () => new Proxy({}, handler)
      }
      return new Proxy(() => undefined, handler)
    },
    apply() {
      throw new Error(
        'Supabase no está configurado. Definí VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en frontend/.env.development'
      )
    },
  }
  return new Proxy({}, handler) as unknown as SupabaseClient
}

export const supabase: SupabaseClient = supabaseConfigured
  ? createClient(URL, ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : makeStub()

export type CasoRow = {
  id: string
  user_id: string
  titulo: string
  descripcion: string | null
  estado: 'abierto' | 'cerrado' | 'archivado'
  creado_en: string
  actualizado_en: string
}

export type CasoEntidadRow = {
  id: string
  caso_id: string
  nombre: string
  cuit: string | null
  municipio: string | null
  agregado_en: string
}

export type CasoContratoRow = {
  id: string
  caso_id: string
  hash: string
  proveedor: string
  monto: number
  anio: number
  tipo: string
  area: string | null
  fuente_url: string | null
  agregado_en: string
}

export type CasoDirectorRow = {
  id: string
  caso_id: string
  nombre: string
  empresas: string[]
  agregado_en: string
}

export type CasoSenalRow = {
  id: string
  caso_id: string
  senal_id: string
  tipologia: string
  titulo: string
  resumen: string | null
  score: number | null
  severidad: 'grave' | 'moderada' | 'leve' | null
  cuits: string[]
  evidencia: { descripcion: string; fuenteUrl: string }[]
  legal: { articulos?: string[]; severidad?: string; denunciarAnte?: string[] }
  agregado_en: string
}

export type CasoNotasRow = {
  caso_id: string
  contenido: string
  actualizado_en: string
}
