import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  supabase,
  type CasoRow,
  type CasoEntidadRow,
  type CasoContratoRow,
  type CasoDirectorRow,
  type CasoSenalRow,
  type CasoNotasRow,
} from './supabase'
import { useAuth } from './auth'

// ─── Listar / crear / borrar casos ────────────────────────────────────────────
export function useCasos() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['casos', user?.id ?? 'anon'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('casos')
        .select('*')
        .order('actualizado_en', { ascending: false })
      if (error) throw error
      return data as CasoRow[]
    },
    enabled: !!user,
  })
}

export function useCaso(id: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['caso', id],
    queryFn: async () => {
      const [caso, entidades, contratos, directores, señales, notas] = await Promise.all([
        supabase.from('casos').select('*').eq('id', id!).single(),
        supabase.from('caso_entidades').select('*').eq('caso_id', id!),
        supabase.from('caso_contratos').select('*').eq('caso_id', id!),
        supabase.from('caso_directores').select('*').eq('caso_id', id!),
        supabase.from('caso_senales').select('*').eq('caso_id', id!),
        supabase.from('caso_notas').select('*').eq('caso_id', id!).maybeSingle(),
      ])
      if (caso.error) throw caso.error
      return {
        caso: caso.data as CasoRow,
        entidades: (entidades.data ?? []) as CasoEntidadRow[],
        contratos: (contratos.data ?? []) as CasoContratoRow[],
        directores: (directores.data ?? []) as CasoDirectorRow[],
        señales: (señales.data ?? []) as CasoSenalRow[],
        notas: (notas.data as CasoNotasRow | null) ?? null,
      }
    },
    enabled: !!user && !!id,
  })
}

export function useCrearCaso() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: { titulo: string; descripcion?: string }) => {
      if (!user) throw new Error('No autenticado')
      const { data, error } = await supabase
        .from('casos')
        .insert({
          user_id: user.id,
          titulo: input.titulo,
          descripcion: input.descripcion ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data as CasoRow
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['casos'] }),
  })
}

export function useBorrarCaso() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('casos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['casos'] }),
  })
}

// ─── Bookmarks por caso ───────────────────────────────────────────────────────
export function useAgregarEntidadACaso() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      casoId: string
      nombre: string
      cuit?: string
      municipio?: string
    }) => {
      const { error } = await supabase.from('caso_entidades').insert({
        caso_id: input.casoId,
        nombre: input.nombre,
        cuit: input.cuit ?? null,
        municipio: input.municipio ?? null,
      })
      if (error && !error.message.includes('duplicate')) throw error
    },
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['caso', vars.casoId] }),
  })
}

export function useAgregarContratoACaso() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      casoId: string
      hash: string
      proveedor: string
      monto: number
      anio: number
      tipo: string
      area?: string
      fuenteUrl?: string
    }) => {
      const { error } = await supabase.from('caso_contratos').insert({
        caso_id: input.casoId,
        hash: input.hash,
        proveedor: input.proveedor,
        monto: input.monto,
        anio: input.anio,
        tipo: input.tipo,
        area: input.area ?? null,
        fuente_url: input.fuenteUrl ?? null,
      })
      if (error && !error.message.includes('duplicate')) throw error
    },
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['caso', vars.casoId] }),
  })
}

export function useAgregarSeñalACaso() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      casoId: string
      señalId: string
      tipologia: string
      titulo: string
      resumen: string
      score: number
      severidad: 'grave' | 'moderada' | 'leve'
      cuits: string[]
      evidencia: { descripcion: string; fuenteUrl: string }[]
      legal: object
    }) => {
      const { error } = await supabase.from('caso_senales').insert({
        caso_id: input.casoId,
        senal_id: input.señalId,
        tipologia: input.tipologia,
        titulo: input.titulo,
        resumen: input.resumen,
        score: input.score,
        severidad: input.severidad,
        cuits: input.cuits,
        evidencia: input.evidencia,
        legal: input.legal,
      })
      if (error && !error.message.includes('duplicate')) throw error
    },
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['caso', vars.casoId] }),
  })
}

export function useQuitarBookmark() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      tipo: 'entidad' | 'contrato' | 'director' | 'senal'
      id: string
      casoId: string
    }) => {
      const tabla = {
        entidad: 'caso_entidades',
        contrato: 'caso_contratos',
        director: 'caso_directores',
        senal: 'caso_senales',
      }[input.tipo]
      const { error } = await supabase.from(tabla).delete().eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['caso', vars.casoId] }),
  })
}

// ─── Notas ─────────────────────────────────────────────────────────────────────
export function useGuardarNotas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { casoId: string; contenido: string }) => {
      const { error } = await supabase
        .from('caso_notas')
        .upsert({ caso_id: input.casoId, contenido: input.contenido })
      if (error) throw error
    },
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['caso', vars.casoId] }),
  })
}
