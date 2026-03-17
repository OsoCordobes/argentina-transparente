import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Info, HelpCircle, MapPin, ChevronDown, LogIn, LogOut, User } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useLocality } from '@/contexts/LocalityContext';
import { useAuth } from '@/contexts/AuthContext';
import { AuthModal } from '@/components/auth/AuthModal';

export function Header() {
  const { currentLocality, setCurrentLocality, localities } = useLocality();
  const { user, signOut, isPremium } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        {/* Independence disclaimer banner */}
        <div className="bg-accent px-4 py-2 text-center text-sm text-accent-foreground">
          <span className="flex items-center justify-center gap-2 flex-wrap">
            <Shield className="h-4 w-4 shrink-0" />
            <span className="font-medium">Iniciativa ciudadana independiente</span>
            <span className="hidden sm:inline">–</span>
            <span className="hidden sm:inline">Sin afiliación política ni gubernamental</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="ml-1 inline-flex">
                  <Info className="h-4 w-4 text-primary/70 hover:text-primary transition-colors" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>
                  Este portal presenta información pública de forma accesible para que
                  cualquier ciudadano pueda ver cómo se gasta el dinero de sus impuestos.
                  No tiene afiliación con ningún partido político ni gobierno.
                </p>
              </TooltipContent>
            </Tooltip>
          </span>
        </div>

        {/* Main header */}
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-serif font-bold text-lg shadow-md hover:opacity-90 transition-opacity">
              AT
            </Link>
            <div>
              <Link to="/" className="hover:opacity-80 transition-opacity">
                <h1 className="text-xl font-serif font-semibold text-foreground">
                  Argentina Transparente
                </h1>
              </Link>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>¿A dónde va el dinero de tus impuestos?</span>
                <span className="hidden sm:inline">–</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs font-medium text-primary hover:text-primary/80 gap-1">
                      <MapPin className="h-3 w-3" />
                      {currentLocality.name}, {currentLocality.province}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {localities.map(locality => (
                      <DropdownMenuItem
                        key={locality.id}
                        onClick={() => setCurrentLocality(locality)}
                        className={locality.id === currentLocality.id ? 'bg-accent' : ''}
                      >
                        <MapPin className="h-4 w-4 mr-2" />
                        <div>
                          <p className="font-medium">{locality.name}</p>
                          <p className="text-xs text-muted-foreground">{locality.province} • {locality.population.toLocaleString('es-AR')} hab.</p>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                    <HelpCircle className="h-4 w-4" />
                    <span>¿Cómo leer estos datos?</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p className="font-medium mb-1">Guía rápida:</p>
                  <ul className="text-xs space-y-1">
                    <li>• <strong>Contratos:</strong> Empresas que reciben pagos del municipio</li>
                    <li>• <strong>Dueños:</strong> Personas detrás de cada empresa</li>
                    <li>• <strong>Montos:</strong> Comparados con salarios para contexto</li>
                    <li>• <strong>Fuente:</strong> Datos públicos de cada municipio</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                <span>Datos actualizados</span>
              </div>
            </div>

            {/* Auth */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <User className="h-4 w-4" />
                    <span className="hidden sm:inline max-w-[100px] truncate">
                      {user.email?.split('@')[0]}
                    </span>
                    {isPremium && (
                      <span className="text-[10px] bg-primary text-primary-foreground px-1.5 rounded-full">
                        PRO
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                    {user.email}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Cerrar sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setAuthModalOpen(true)} className="gap-2">
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Iniciar sesión</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
    </>
  );
}