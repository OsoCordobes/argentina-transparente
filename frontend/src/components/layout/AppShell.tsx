import { useState, useEffect } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Search,
  LayoutDashboard,
  FileBarChart2,
  Network,
  ExternalLink,
  FolderOpen,
  Building2,
  Bell,
  LogOut,
  LogIn,
  User,
  Telescope,
  Users,
  Gauge,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { CommandPalette } from '@/components/search/CommandPalette'
import { useAuth } from '@/lib/auth'
import { useAlertasCount } from '@/lib/queries'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { data: alertasCount } = useAlertasCount()

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
            <NavItem to="/explorar" icon={<Telescope className="h-4 w-4" />}>
              Explorar
            </NavItem>
            <NavItem to="/red" icon={<Network className="h-4 w-4" />}>
              Red
            </NavItem>
            <NavItem to="/actores" icon={<Users className="h-4 w-4" />}>
              Actores
            </NavItem>
            <NavItem to="/municipios" icon={<Building2 className="h-4 w-4" />}>
              Jurisdicciones
            </NavItem>
            <NavItem to="/cobertura" icon={<Gauge className="h-4 w-4" />}>
              Cobertura
            </NavItem>
            <NavItem to="/casos" icon={<FolderOpen className="h-4 w-4" />}>
              Casos
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

          <Link
            to="/alertas"
            className="relative inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={alertasCount?.total
              ? `${alertasCount.total} alertas sin leer`
              : 'Alertas'}
          >
            <Bell className="h-4 w-4" />
            {alertasCount && alertasCount.total > 0 && (
              <span
                className={cn(
                  'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1',
                  'rounded-full text-[10px] font-semibold flex items-center justify-center',
                  alertasCount.critical > 0
                    ? 'bg-destructive text-destructive-foreground'
                    : 'bg-yellow-500 text-white'
                )}
              >
                {alertasCount.total > 99 ? '99+' : alertasCount.total}
              </span>
            )}
          </Link>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <User className="h-4 w-4" />
                  <span className="hidden md:inline truncate max-w-[10rem]">
                    {user.email}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/casos')}>
                  <FolderOpen className="h-4 w-4 mr-2" /> Mis casos
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut()
                    navigate('/')
                  }}
                >
                  <LogOut className="h-4 w-4 mr-2" /> Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/login')}
              className="gap-2"
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Entrar</span>
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t mt-auto">
        <div className="mx-auto max-w-screen-2xl px-4 md:px-6 py-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>ARGOS — motor anticorrupción ciudadano</span>
          <span className="opacity-50">·</span>
          <Link to="/fuentes" className="hover:text-foreground hover:underline">
            Fuentes de datos
          </Link>
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
