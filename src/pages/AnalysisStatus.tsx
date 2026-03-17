import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AppHeader } from '@/components/layout/AppHeader';
import { LeaveAnalysisDialog } from '@/components/analysis/LeaveAnalysisDialog';
import { toast } from 'sonner';
import {
  BESTIA_RESULT_ENDPOINT,
  BESTIA_CANCEL_ENDPOINT,
  TIMEOUT_MS,
  type BestiaReport,
} from '@/lib/api';
import {
  Loader2,
  Home,
  XCircle,
  Clock,
  ArrowLeft,
} from 'lucide-react';

// ─── Animación de progreso simulada (basada en tiempo, sin API) ───────────────
const PROGRESS_STEPS = [
  { endTime: 8,        label: 'Buscando fuentes oficiales...',      startPct: 0,  endPct: 25 },
  { endTime: 16,       label: 'Descargando documentos públicos...',  startPct: 25, endPct: 55 },
  { endTime: 24,       label: 'Analizando patrones de gasto...',     startPct: 55, endPct: 80 },
  { endTime: Infinity, label: 'Generando informe ciudadano...',      startPct: 80, endPct: 95 },
];

function getSimulatedProgress(elapsedSecs: number): { pct: number; label: string } {
  let prevEnd = 0;
  for (const step of PROGRESS_STEPS) {
    if (elapsedSecs <= step.endTime || step.endTime === Infinity) {
      const stepDuration = step.endTime === Infinity ? 8 : step.endTime - prevEnd;
      const stepElapsed = Math.max(0, elapsedSecs - prevEnd);
      const ratio = Math.min(stepElapsed / stepDuration, 1);
      const pct = Math.round(step.startPct + ratio * (step.endPct - step.startPct));
      return { pct: Math.min(pct, 95), label: step.label };
    }
    prevEnd = step.endTime;
  }
  return { pct: 95, label: 'Generando informe ciudadano...' };
}
// ─────────────────────────────────────────────────────────────────────────────

export default function AnalysisStatus() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const runId = searchParams.get('runId');

  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('Buscando fuentes oficiales...');
  const [status, setStatus] = useState<'polling' | 'done' | 'error' | 'timeout'>('polling');
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BestiaReport | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const pollingRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const animationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef   = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const stoppedRef   = useRef(false);

  const stopAll = () => {
    stoppedRef.current = true;
    if (pollingRef.current)   { clearInterval(pollingRef.current);   pollingRef.current   = null; }
    if (animationRef.current) { clearInterval(animationRef.current); animationRef.current = null; }
    if (timeoutRef.current)   { clearTimeout(timeoutRef.current);    timeoutRef.current   = null; }
  };

  // Navegar al reporte cuando termina
  useEffect(() => {
    if (status === 'done' && report && runId) {
      navigate(`/report?runId=${runId}`, { state: { report } });
    }
  }, [status, report, runId, navigate]);

  useEffect(() => {
    if (!runId) return;

    stoppedRef.current = false;
    startTimeRef.current = Date.now();

    // ── 1. Animación simulada: actualiza cada 300ms basándose en tiempo ──────
    animationRef.current = setInterval(() => {
      if (stoppedRef.current) return;
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const { pct, label } = getSimulatedProgress(elapsed);
      setProgress(pct);
      setStatusMsg(label);
    }, 300);

    // ── 2. Polling SOLO a /bestia-result cada 4 segundos ─────────────────────
    //    Si { ok: false } → seguir esperando (animación continúa)
    //    Si { ok: true, report: {...} } → éxito, mostrar reporte
    const pollResult = async () => {
      if (stoppedRef.current) return;
      try {
        const res = await fetch(`${BESTIA_RESULT_ENDPOINT}?runId=${runId}`);
        if (!res.ok) return; // error de red → seguir esperando silenciosamente
        const data = await res.json();

        if (data?.ok === true && data?.report) {
          stopAll();
          setProgress(100);
          setStatusMsg('¡Análisis completado!');
          setReport(data.report);
          setStatus('done');
        }
        // data.ok === false → no hacer nada, el polling sigue
      } catch {
        // error de red → seguir esperando silenciosamente
      }
    };

    pollResult(); // poll inmediato al arrancar
    pollingRef.current = setInterval(pollResult, 4000);

    // ── 3. Timeout a 3 minutos ────────────────────────────────────────────────
    timeoutRef.current = setTimeout(() => {
      if (!stoppedRef.current) {
        setTimedOut(true);
      }
    }, TIMEOUT_MS);

    return stopAll;
  }, [runId]);

  const handleBackClick = () => {
    if (status === 'polling') {
      setLeaveDialogOpen(true);
    } else {
      navigate('/');
    }
  };

  const handleLeaveRunning = () => {
    stopAll();
    setLeaveDialogOpen(false);
    toast.info('El análisis sigue corriendo en segundo plano.', {
      description: 'Podrás ver el resultado desde la página principal.',
    });
    navigate('/');
  };

  const handleCancelAnalysis = async () => {
    if (!runId) return;
    setIsCancelling(true);
    try {
      await fetch(`${BESTIA_CANCEL_ENDPOINT}?runId=${runId}`, { method: 'POST' });
      stopAll();
      setLeaveDialogOpen(false);
      toast.success('Análisis cancelado.');
      navigate('/');
    } catch (err) {
      console.error('Cancel error:', err);
      toast.error('No se pudo cancelar el análisis. Intentá de nuevo.');
    } finally {
      setIsCancelling(false);
    }
  };

  // Sin runId
  if (!runId) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader variant="analysis" showBackButton backTo="/" />
        <div className="container py-12">
          <Card className="max-w-2xl mx-auto p-8 text-center space-y-6">
            <XCircle className="h-16 w-16 text-destructive mx-auto" />
            <h1 className="text-2xl font-bold font-serif">Sin análisis activo</h1>
            <p className="text-muted-foreground">
              No hay un análisis en curso. Iniciá uno desde la página principal.
            </p>
            <Button onClick={() => navigate('/')} variant="outline">
              <Home className="h-4 w-4 mr-2" />
              Ir al inicio
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // Estado de error
  if (status === 'error') {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader variant="analysis" showBackButton backTo="/" />
        <div className="container py-12">
          <Card className="max-w-2xl mx-auto p-8 text-center space-y-6">
            <XCircle className="h-16 w-16 text-destructive mx-auto" />
            <h1 className="text-2xl font-bold font-serif">Error en el análisis</h1>
            <p className="text-muted-foreground">{error || 'No pudimos conectar con el motor de análisis. Intentá de nuevo.'}</p>
            <Button onClick={() => navigate('/')} variant="outline">
              <Home className="h-4 w-4 mr-2" />
              Volver al inicio
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // Estado done → useEffect navega, renderizar null mientras
  if (status === 'done') {
    return null;
  }

  // Estado polling / en progreso
  return (
    <div className="min-h-screen bg-background">
      <AppHeader variant="analysis" showBackButton={false} showLocalitySelector={false} />

      <div className="container py-12 md:py-20 max-w-2xl">
        <div className="text-center space-y-8">
          {/* Loader animado */}
          <div className="relative mx-auto w-24 h-24">
            <div className="absolute inset-0 rounded-full animate-ping bg-primary/20" />
            <div className="relative w-24 h-24 rounded-full flex items-center justify-center bg-gradient-to-br from-primary to-primary/70">
              <Loader2 className="h-10 w-10 text-primary-foreground animate-spin" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold font-serif">Analizando...</h1>
            <p className="text-muted-foreground text-lg">{statusMsg}</p>
          </div>

          {/* Barra de progreso simulada */}
          <div className="space-y-2 max-w-md mx-auto">
            <Progress value={progress} className="h-3" />
            <p className="text-sm text-muted-foreground">{progress}% completado</p>
          </div>

          {/* Aviso de timeout */}
          {timedOut && (
            <Card className="p-4 border-warning bg-warning/10 max-w-md mx-auto">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-warning mt-0.5" />
                <div className="text-left">
                  <p className="text-sm font-medium">El análisis está tomando más tiempo del esperado.</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Podés cerrar esta pantalla y volver más tarde.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Botones */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto pt-4">
            <Button
              variant="outline"
              onClick={handleBackClick}
              className="gap-2 w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio
            </Button>
          </div>
        </div>
      </div>

      <LeaveAnalysisDialog
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
        onLeaveRunning={handleLeaveRunning}
        onCancel={handleCancelAnalysis}
        isCancelling={isCancelling}
      />
    </div>
  );
}
