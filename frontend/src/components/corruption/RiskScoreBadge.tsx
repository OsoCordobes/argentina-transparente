import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

interface RiskScoreBadgeProps {
  riskScore: number | null | undefined;
  showDetails?: boolean;
}

type RiskLevel = 'critico' | 'alto' | 'medio' | 'bajo';

function getRiskLevel(score: number): RiskLevel {
  if (score >= 80) return 'critico';
  if (score >= 60) return 'alto';
  if (score >= 40) return 'medio';
  return 'bajo';
}

function getRiskLevelLabel(level: RiskLevel): string {
  const labels: Record<RiskLevel, string> = {
    critico: 'Crítico',
    alto: 'Alto',
    medio: 'Medio',
    bajo: 'Bajo',
  };
  return labels[level];
}

export function RiskScoreBadge({ riskScore, showDetails = true }: RiskScoreBadgeProps) {
  const score = riskScore ?? 0;
  const level = getRiskLevel(score);
  
  const getIcon = (lvl: RiskLevel) => {
    switch (lvl) {
      case 'critico': return <XCircle className="h-4 w-4" />;
      case 'alto': return <AlertTriangle className="h-4 w-4" />;
      case 'medio': return <AlertCircle className="h-4 w-4" />;
      default: return <CheckCircle className="h-4 w-4" />;
    }
  };

  const getColors = (lvl: RiskLevel) => {
    switch (lvl) {
      case 'critico': return 'bg-destructive/10 text-destructive border-destructive/30';
      case 'alto': return 'bg-warning/10 text-warning border-warning/30';
      case 'medio': return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
      default: return 'bg-success/10 text-success border-success/30';
    }
  };

  const badge = (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getColors(level)}`}>
      {getIcon(level)}
      <span>{score}</span>
    </div>
  );

  if (!showDetails || score === 0) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {badge}
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs p-3">
        <div className="space-y-2">
          <p className="font-semibold text-sm">
            Riesgo {getRiskLevelLabel(level)} ({score}/100)
          </p>
          <p className="text-xs text-muted-foreground italic pt-1 border-t">
            Observación estadística basada en patrones detectados. No implica irregularidad.
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
