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
import { AlertTriangle } from 'lucide-react';

interface CancelAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
  localityName?: string;
}

export function CancelAnalysisDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
  localityName,
}: CancelAnalysisDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            ¿Cancelar análisis?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Estás a punto de cancelar el análisis de <strong>{localityName || 'esta localidad'}</strong>.
            </p>
            <p>
              Los datos parciales que se hayan recolectado hasta ahora se mantendrán guardados, 
              pero el análisis se detendrá y no se generará el reporte final.
            </p>
            <p className="text-muted-foreground text-sm">
              Podrás reiniciar el análisis en cualquier momento desde la página principal.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            Continuar análisis
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? 'Cancelando...' : 'Sí, cancelar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
