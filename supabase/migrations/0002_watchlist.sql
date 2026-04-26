-- ARGOS — Phase F8 — Schema de watchlist personal de proveedores
--
-- Aplica con: supabase db push  (o pegar en el SQL Editor de Supabase)
--
-- Modelo: cada usuario (auth.users de Supabase) puede marcar proveedores
-- como "monitoreados". El frontend escribe primero a localStorage y, si hay
-- sesión Supabase activa, replica a esta tabla. La unicidad (user_id,
-- proveedor_id) garantiza que un mismo proveedor no se duplique para un
-- mismo usuario.
--
-- `ultima_visita` se usa por el endpoint backend /api/watchlist/novedades
-- para computar deltas de contratos/señales desde la última lectura.
--
-- RLS: cada usuario solo ve/edita sus propios items. No hay sharing en MVP.

CREATE TABLE IF NOT EXISTS watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proveedor_id TEXT NOT NULL,        -- normalizado
  proveedor_label TEXT NOT NULL,     -- nombre original para UI
  cuit TEXT,                          -- si conocido vía identity_matches
  agregado_en TIMESTAMPTZ DEFAULT now(),
  ultima_visita TIMESTAMPTZ DEFAULT now(),
  notas TEXT,
  UNIQUE(user_id, proveedor_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_ultima_visita ON watchlist(ultima_visita);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY watchlist_select ON watchlist FOR SELECT USING (user_id = auth.uid());
CREATE POLICY watchlist_insert ON watchlist FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY watchlist_update ON watchlist FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY watchlist_delete ON watchlist FOR DELETE USING (user_id = auth.uid());
