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
import { Home, PlayCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LeaveAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeaveRunning: () => void;
  onCancel: () => void;
  isCancelling?: boolean;
}

export function LeaveAnalysisDialog({
  open,
  onOpenChange,
  onLeaveRunning,
  onCancel,
  isCancelling = false,
}: LeaveAnalysisDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            ¿Qué querés hacer con el análisis?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              El análisis está en curso. Podés dejarlo corriendo en segundo plano
              o cancelarlo.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <Button
            variant="outline"
            className="justify-start gap-3 h-auto py-3 px-4"
            onClick={onLeaveRunning}
          >
            <PlayCircle className="h-5 w-5 text-primary shrink-0" />
            <div className="text-left">
              <p className="font-medium text-sm">Dejar corriendo y volver al inicio</p>
              <p className="text-xs text-muted-foreground">
                El análisis seguirá en segundo plano. Podrás ver el resultado cuando termine.
              </p>
            </div>
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-3 h-auto py-3 px-4 border-destructive/30 hover:bg-destructive/10"
            onClick={onCancel}
            disabled={isCancelling}
          >
            <XCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="text-left">
              <p className="font-medium text-sm text-destructive">
                {isCancelling ? 'Cancelando...' : 'Cancelar el análisis'}
              </p>
              <p className="text-xs text-muted-foreground">
                Se detendrá el análisis y no se generará el reporte.
              </p>
            </div>
          </Button>
        </div>
        <AlertDialogFooter className="mt-2">
          <AlertDialogCancel disabled={isCancelling}>
            Seguir esperando
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
