import { Router } from 'express'
import { supabase } from '../lib/supabase'

const router = Router()

router.get('/', async (_req, res) => {
  if (!supabase) {
    return res.json([])
  }
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('id, period, executive_summary, total_contracts, total_amount, signals_found, created_at')
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw error
    res.json(data ?? [])
  } catch (err) {
    console.error('[historial] Error:', err)
    res.json([])
  }
})

export default router
