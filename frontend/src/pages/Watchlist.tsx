/**
 * Watchlist.tsx — página /watchlist
 *
 * Lista de proveedores marcados por el usuario. Lee desde localStorage por
 * defecto; si hay sesión Supabase activa, hace `syncOnLogin()` para mergear
 * con la nube y mostrar la unión más reciente.
 *
 * Cero alucinaciones: si la lista está vacía, mostramos un empty state que
 * deriva al user a `/explorar` para agregar proveedores con el botón ⭐.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { readLocal, syncOnLogin } from '@/lib/argos/watchlist'
import { supabase } from '@/lib/supabase'
import type { WatchlistItem } from '@/lib/argos/types'

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const session = (await supabase.auth.getSession()).data.session
        const next = session ? await syncOnLogin() : readLocal()
        if (!cancelled) setItems(next)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main style={{ padding: 24, color: 'var(--text)', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 6 }}>Tu watchlist</h1>
      <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 18 }}>
        Proveedores que estás monitoreando. Si iniciás sesión, se sincronizan
        entre dispositivos. Si no, viven en este navegador.
      </p>

      {loading ? (
        <p style={{ color: 'var(--text-3)' }}>Cargando…</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--text-3)' }}>
          No agregaste proveedores todavía. Buscá uno en{' '}
          <Link to="/explorar" style={{ color: 'var(--celeste)' }}>
            Explorar
          </Link>{' '}
          y hacé click en ⭐.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {items.map((item) => (
            <li
              key={item.proveedor_id}
              style={{
                padding: '10px 12px',
                marginBottom: 6,
                border: '1px solid var(--stroke)',
                borderRadius: 6,
                background: 'var(--bg-panel)',
              }}
            >
              <Link
                to={`/explorar?focus=${encodeURIComponent(item.proveedor_id)}`}
                style={{ color: 'var(--text)', fontWeight: 600 }}
              >
                {item.proveedor_label}
              </Link>
              <div style={{ marginTop: 4, color: 'var(--text-3)', fontSize: 12 }} className="mono">
                {item.cuit ?? 'sin CUIT'}
                {' · agregado '}
                {new Date(item.agregado_en).toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
