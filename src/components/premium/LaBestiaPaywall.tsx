import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AuthModal } from '@/components/auth/AuthModal';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Crown, Loader2 } from 'lucide-react';

interface LaBestiaPaywallProps {
  children: React.ReactNode;
}

export function LaBestiaPaywall({ children }: LaBestiaPaywallProps) {
  const { user, isPremium, session } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    if (!user || !session) {
      setShowAuthModal(true);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { origin: window.location.origin },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      toast.error('Error al iniciar el checkout. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // If premium, show content
  if (isPremium) {
    return <>{children}</>;
  }

  // Show paywall
  return (
    <>
      <div className="relative">
        {/* Blurred preview */}
        <div className="blur-sm opacity-50 pointer-events-none">
          {children}
        </div>

        {/* Overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="text-center p-8 max-w-md">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Crown className="h-8 w-8 text-primary" />
            </div>
            
            <h3 className="text-2xl font-bold mb-2">
              Accede a La Bestia Premium
            </h3>
            
            <p className="text-muted-foreground mb-6">
              Desbloquea análisis avanzados de corrupción con IA, 
              consultas ilimitadas y evidencia citada.
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="font-semibold text-3xl">$5</span>
                <span className="text-muted-foreground">/mes</span>
              </div>

              <ul className="text-sm text-left space-y-2 mb-6">
                <li className="flex items-center gap-2">
                  <span className="text-success">✓</span>
                  Chat ilimitado con La Bestia IA
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-success">✓</span>
                  Análisis de 12 tipologías de corrupción
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-success">✓</span>
                  Evidencia citada con URLs fuente
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-success">✓</span>
                  Reportes ejecutivos descargables
                </li>
              </ul>

              <Button 
                onClick={handleSubscribe} 
                size="lg" 
                className="w-full"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Crown className="mr-2 h-4 w-4" />
                    {user ? 'Suscribirse Ahora' : 'Ingresar y Suscribirse'}
                  </>
                )}
              </Button>

              {!user && (
                <p className="text-xs text-muted-foreground">
                  Necesitas una cuenta para suscribirte
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </>
  );
}
