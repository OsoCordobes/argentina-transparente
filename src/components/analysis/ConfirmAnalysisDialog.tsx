import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Clock, Calendar, Building2, Sparkles } from 'lucide-react';

interface ConfirmAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
  localityName: string;
  entityCount: number;
  yearsBack: number;
  estimatedMinutes: number;
  dateFrom: string;
  dateTo: string;
  plan: 'free' | 'premium';
}

export function ConfirmAnalysisDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
  localityName,
  entityCount,
  yearsBack,
  estimatedMinutes,
  dateFrom,
  dateTo,
  plan,
}: ConfirmAnalysisDialogProps) {
  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} minutos`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours} hora${hours > 1 ? 's' : ''}`;
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 font-serif">
            <Sparkles className="h-5 w-5 text-primary" />
            Confirmar análisis
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-2">
              <p>
                Vas a iniciar un análisis de <strong className="text-foreground">{localityName}</strong> con la siguiente configuración:
              </p>

              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Entidades</p>
                    <p className="font-medium text-foreground">
                      {entityCount === 0 ? 'Todas' : entityCount}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Período</p>
                    <p className="font-medium text-foreground">{yearsBack} año{yearsBack > 1 ? 's' : ''}</p>
                  </div>
                </div>
              </div>

              {/* Time estimate - prominent */}
              <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 border border-primary/20">
                <Clock className="h-6 w-6 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Tiempo estimado</p>
                  <p className="text-sm text-muted-foreground">
                    ~{formatDuration(estimatedMinutes)}
                  </p>
                </div>
              </div>

              {/* Plan badge */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Plan:</span>
                <Badge variant={plan === 'premium' ? 'default' : 'secondary'}>
                  {plan === 'premium' ? 'Premium' : 'Gratuito'}
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground">
                Puedes cerrar esta página durante el análisis y volver más tarde.
                También puedes cancelar en cualquier momento.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel disabled={isLoading}>
            Volver
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="gap-2"
          >
            {isLoading ? (
              'Iniciando...'
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Iniciar análisis
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
