import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AppHeader } from '@/components/layout/AppHeader';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BESTIA_RESULT_ENDPOINT, type BestiaReport, type Finding } from '@/lib/n8n-config';
import { ProcedureTable } from '@/components/ProcedureTable';
import { toast } from 'sonner';
import {
  Share2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Info,
  Shield,
  FileText,
  Search,
  Home,
  Loader2,
  XCircle,
} from 'lucide-react';

function getRiskColor(score: number): { text: string; bg: string; ring: string; stroke: string } {
  if (score < 40) return { text: 'text-success', bg: 'bg-success/10', ring: 'ring-success/30', stroke: 'hsl(var(--success))' };
  if (score < 70) return { text: 'text-warning', bg: 'bg-warning/10', ring: 'ring-warning/30', stroke: 'hsl(var(--warning))' };
  return { text: 'text-destructive', bg: 'bg-destructive/10', ring: 'ring-destructive/30', stroke: 'hsl(var(--destructive))' };
}

function getRiskLabel(score: number): string {
  if (score < 40) return 'Bajo';
  if (score < 70) return 'Medio';
  return 'Alto';
}

function FindingLevelBadge({ level }: { level: string }) {
  const config: Record<string, { variant: 'destructive' | 'secondary' | 'default'; label: string }> = {
    alto: { variant: 'destructive', label: 'Alto' },
    medio: { variant: 'secondary', label: 'Medio' },
    bajo: { variant: 'default', label: 'Bajo' },
  };
  const c = config[level] || config.bajo;
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

function RiskScoreCircle({ score }: { score: number }) {
  const colors = getRiskColor(score);
  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-40 h-40 mx-auto">
      <svg className="w-40 h-40 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="45"
          fill="none"
          stroke={colors.stroke}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-bold ${colors.text}`}>{score}</span>
        <span className="text-xs text-muted-foreground">Riesgo {getRiskLabel(score)}</span>
      </div>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <AlertTriangle className={`h-5 w-5 ${
                finding.risk_level === 'alto' ? 'text-destructive' :
                finding.risk_level === 'medio' ? 'text-warning' : 'text-success'
              }`} />
              <div>
                <h3 className="font-medium text-sm">{finding.title}</h3>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FindingLevelBadge level={finding.risk_level} />
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3 border-t pt-3">
            <p className="text-sm text-muted-foreground">{finding.description}</p>
            {finding.recommendations.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">Recomendaciones</h4>
                <ul className="space-y-1">
                  {finding.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function Report() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const runId = searchParams.get('runId');

  const [report, setReport] = useState<BestiaReport | null>(
    (location.state as any)?.report || null
  );
  const [loading, setLoading] = useState(!report);
  const [error, setError] = useState<string | null>(null);

  // Fetch report if not passed via state
  useEffect(() => {
    if (report || !runId) return;

    const fetchReport = async () => {
      try {
        const res = await fetch(`${BESTIA_RESULT_ENDPOINT}?runId=${runId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data?.report) {
          setReport(data.report);
        } else {
          throw new Error('Reporte no encontrado');
        }
      } catch (err) {
        console.error('Error fetching report:', err);
        setError('No pudimos cargar el reporte.');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [runId, report]);

  const handleShare = () => {
    if (!report) return;
    const text = `🔍 Análisis de transparencia\n\nScore de riesgo: ${report.risk_score}/100 (${getRiskLabel(report.risk_score)})\n\n${report.executive_summary}\n\nHallazgos: ${report.findings.length}\nFuentes analizadas: ${report.coverage.sources_analyzed}\nDocumentos encontrados: ${report.coverage.documents_found}`;
    navigator.clipboard.writeText(text);
    toast.success('Resumen copiado al portapapeles');
  };

  // Empty results check
  const isEmpty = report && report.risk_score === 0 && report.findings.length === 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Cargando reporte...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader variant="analysis" showBackButton backTo="/" />
        <div className="container py-12">
          <Card className="max-w-2xl mx-auto p-8 text-center space-y-6">
            <XCircle className="h-16 w-16 text-destructive mx-auto" />
            <h1 className="text-2xl font-bold font-serif">Error</h1>
            <p className="text-muted-foreground">{error || 'Reporte no encontrado'}</p>
            <Button onClick={() => navigate('/')} variant="outline">
              <Home className="h-4 w-4 mr-2" />
              Volver al inicio
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader variant="analysis" showBackButton backTo="/" />
        <div className="container py-12">
          <Card className="max-w-2xl mx-auto p-8 text-center space-y-6">
            <Info className="h-16 w-16 text-muted-foreground mx-auto" />
            <h1 className="text-2xl font-bold font-serif">Sin datos suficientes</h1>
            <p className="text-muted-foreground">
              No encontramos datos suficientes para este período. Probá con otro rango de fechas.
            </p>
            <Button onClick={() => navigate('/')} variant="outline">
              <Home className="h-4 w-4 mr-2" />
              Elegir otro período
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const riskColors = getRiskColor(report.risk_score);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader variant="analysis" showBackButton backTo="/" showLocalitySelector={false} />

      <div className="container py-8 md:py-12 max-w-3xl space-y-8">
        {/* Risk Score */}
        <Card className={`p-8 text-center ${riskColors.bg} ring-1 ${riskColors.ring}`}>
          <RiskScoreCircle score={report.risk_score} />
        </Card>

        {/* Executive Summary */}
        <Card className="p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="font-semibold font-serif text-lg">Resumen ejecutivo</h2>
          </div>
          <p className="text-muted-foreground leading-relaxed">{report.executive_summary}</p>
        </Card>

        {/* Findings */}
        {report.findings.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold font-serif text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Hallazgos ({report.findings.length})
            </h2>
            {report.findings.map((f, i) => (
              <FindingCard key={i} finding={f} />
            ))}
          </div>
        )}

        {/* Procedures */}
        <ProcedureTable procedures={report.procedures ?? []} />

        {/* Coverage & Limitations Footer */}
        <Card className="p-6 space-y-4 bg-muted/30">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Search className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{report.coverage.sources_analyzed}</p>
                <p className="text-xs text-muted-foreground">Fuentes analizadas</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{report.coverage.documents_found}</p>
                <p className="text-xs text-muted-foreground">Documentos encontrados</p>
              </div>
            </div>
          </div>
          {report.limitations && (
            <div className="pt-3 border-t">
              <p className="text-xs text-muted-foreground">
                <strong>Limitaciones:</strong> {report.limitations}
              </p>
            </div>
          )}
        </Card>

        {/* Actions */}
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => navigate('/')}>
            <Home className="h-4 w-4 mr-2" />
            Nuevo análisis
          </Button>
          <Button onClick={handleShare} className="gap-2">
            <Share2 className="h-4 w-4" />
            Compartir
          </Button>
        </div>
      </div>
    </div>
  );
}
