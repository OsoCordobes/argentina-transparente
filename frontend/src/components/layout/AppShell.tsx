import { useState, useEffect } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Search, LayoutDashboard, FileBarChart2, Network, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { CommandPalette } from '@/components/search/CommandPalette'

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((s) => !s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto max-w-screen-2xl flex items-center gap-4 h-14 px-4 md:px-6">
          <Link to="/" className="flex items-baseline gap-2 font-semibold">
            <span className="text-lg tracking-tight">ARGOS</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Argentina Transparente
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 ml-4">
            <NavItem to="/" icon={<LayoutDashboard className="h-4 w-4" />}>
              Dashboard
            </NavItem>
            <NavItem to="/red" icon={<Network className="h-4 w-4" />}>
              Red
            </NavItem>
            <a
              href="/reports"
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Reportes públicos (Evidence.dev)"
            >
              <FileBarChart2 className="h-4 w-4" /> Reportes
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          </nav>

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="inline-flex items-center gap-2 h-9 w-full max-w-[28rem] rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Buscar entidad, contrato, director…</span>
            <span className="sm:hidden">Buscar…</span>
            <kbd className="ml-auto hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium">
              ⌘K
            </kbd>
          </button>

          <Button
            size="sm"
            variant="default"
            onClick={() => navigate('/')}
            className="hidden sm:inline-flex"
          >
            Iniciar análisis
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t mt-auto">
        <div className="mx-auto max-w-screen-2xl px-4 md:px-6 py-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>ARGOS — motor anticorrupción ciudadano</span>
          <span className="opacity-50">·</span>
          <span>Datos: gobiernoabierto.cordoba.gob.ar (Ley 27.275)</span>
          <span className="opacity-50">·</span>
          <span>Cero alucinaciones · Toda señal verificable</span>
        </div>
      </footer>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}

function NavItem({
  to,
  icon,
  children,
  disabled,
}: {
  to: string
  icon: React.ReactNode
  children: React.ReactNode
  disabled?: boolean
}) {
  if (disabled) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-sm text-muted-foreground/50 cursor-not-allowed"
        title="Disponible en Sprint 2"
      >
        {icon} {children}
      </span>
    )
  }
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          'inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-sm transition-colors',
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        )
      }
    >
      {icon} {children}
    </NavLink>
  )
}
