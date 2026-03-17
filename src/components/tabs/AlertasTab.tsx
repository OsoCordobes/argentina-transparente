import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StatCard } from '@/components/dashboard/StatCard';
import { EmptyState } from '@/components/ui/empty-state';
import { useRealLocalityData } from '@/hooks/useRealLocalityData';
import { useLocality } from '@/contexts/LocalityContext';
import { formatCurrency, amountToContext, SALARIO_MINIMO_ARG, getRedFlagLabel, getSeverityColor } from '@/lib/format-utils';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, 
  Users, 
  Building2, 
  DollarSign, 
  Shield,
  UserX,
  Scissors,
  Clock,
  TrendingUp,
  Info,
  Loader2,
  Play,
} from 'lucide-react';

export function AlertasTab() {
  const navigate = useNavigate();
  const { currentLocality } = useLocality();
  const { redFlags, signals, companies, officials, stats, loading, contracts } = useRealLocalityData();

  const highSeverityFlags = redFlags.filter(rf => rf.severity === 'alta' || rf.severity === 'high');
  const mediumSeverityFlags = redFlags.filter(rf => rf.severity === 'media' || rf.severity === 'medium');

  const totalAmountAtRisk = redFlags.reduce((sum, rf) => sum + (rf.amount || 0), 0);

  const getRedFlagIcon = (type: string) => {
    switch (type) {
      case 'conflicto_interes': return <UserX className="h-5 w-5" />;
      case 'fraccionamiento': return <Scissors className="h-5 w-5" />;
      case 'empresa_nueva': return <Building2 className="h-5 w-5" />;
      case 'oferente_unico': return <Users className="h-5 w-5" />;
      case 'sobrefacturacion': return <DollarSign className="h-5 w-5" />;
      case 'adjudicacion_rapida': return <Clock className="h-5 w-5" />;
      case 'concentracion': return <TrendingUp className="h-5 w-5" />;
      default: return <AlertTriangle className="h-5 w-5" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Cargando alertas de {currentLocality.name}...</span>
      </div>
    );
  }

  // Empty state - no data at all
  if (contracts.length === 0 && redFlags.length === 0 && signals.length === 0) {
    return (
      <EmptyState
        icon={Play}
        title="Sin datos para analizar"
        description={`Aún no hay información para ${currentLocality.name}. Inicia un análisis para detectar alertas.`}
        action={{
          label: "Iniciar análisis",
          onClick: () => navigate('/'),
        }}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Introducción */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Sistema de Detección de Alertas
          </CardTitle>
          <CardDescription>
            Este sistema analiza patrones en las contrataciones públicas para identificar situaciones 
            que merecen mayor atención ciudadana. Las alertas son observaciones estadísticas basadas 
            en datos públicos y <strong>no implican acusaciones ni irregularidades confirmadas</strong>.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Métricas de riesgo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Alertas Detectadas"
          value={stats.redFlagsCount}
          icon={AlertTriangle}
          subtitle={`${highSeverityFlags.length} de alta severidad`}
        />
        <StatCard
          title="Monto en Riesgo"
          value={formatCurrency(totalAmountAtRisk)}
          icon={DollarSign}
          subtitle={totalAmountAtRisk > 0 ? amountToContext(totalAmountAtRisk)[0] : 'Sin monto registrado'}
        />
        <StatCard
          title="Empresas Analizadas"
          value={companies.length}
          icon={Building2}
          subtitle={`${stats.uniqueCompanies} con contratos activos`}
        />
        <StatCard
          title="Funcionarios Monitoreados"
          value={officials.length}
          icon={Users}
          subtitle="En cargos públicos"
        />
      </div>

      {/* Señales de IA */}
      {signals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <TrendingUp className="h-5 w-5" />
              Patrones Detectados por IA ({signals.length})
            </CardTitle>
            <CardDescription>
              Análisis automático de patrones sospechosos en los datos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {signals.slice(0, 5).map(signal => (
              <div 
                key={signal.id} 
                className={`p-3 rounded-lg border ${getSeverityColor(signal.severity)}`}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`h-4 w-4 mt-0.5 ${signal.severity === 'high' ? 'text-destructive' : 'text-warning'}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-sm">{signal.title}</h4>
                      <Badge variant="outline" className="text-xs">
                        {Math.round(signal.confidence * 100)}% confianza
                      </Badge>
                    </div>
                    {signal.description && (
                      <p className="text-xs text-muted-foreground mt-1">{signal.description}</p>
                    )}
                    {signal.amount_involved && (
                      <p className="text-xs font-medium mt-1">
                        Monto: {formatCurrency(signal.amount_involved)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Alertas de alta severidad */}
      {highSeverityFlags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Alertas de Alta Severidad ({highSeverityFlags.length})
            </CardTitle>
            <CardDescription>
              Situaciones que requieren mayor atención por su magnitud o características.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {highSeverityFlags.map(flag => (
              <div 
                key={flag.id} 
                className={`p-4 rounded-lg border ${getSeverityColor(flag.severity)}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-destructive">
                    {getRedFlagIcon(flag.type)}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h4 className="font-semibold">{flag.title}</h4>
                      <Badge variant="destructive">{getRedFlagLabel(flag.type)}</Badge>
                    </div>
                    {flag.description && (
                      <p className="text-sm text-muted-foreground">{flag.description}</p>
                    )}
                    {flag.evidence_quote && (
                      <blockquote className="border-l-2 border-muted pl-3 text-sm italic text-muted-foreground">
                        "{flag.evidence_quote}"
                      </blockquote>
                    )}
                    {flag.amount && (
                      <p className="text-sm font-medium">
                        Monto involucrado: {formatCurrency(flag.amount)} 
                        <span className="text-muted-foreground font-normal">
                          {' '}({amountToContext(flag.amount)[0]})
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Alertas de severidad media */}
      {mediumSeverityFlags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <Info className="h-5 w-5" />
              Alertas de Severidad Media ({mediumSeverityFlags.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mediumSeverityFlags.map(flag => (
              <div 
                key={flag.id} 
                className={`p-3 rounded-lg border ${getSeverityColor(flag.severity)}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-warning">
                    {getRedFlagIcon(flag.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-sm">{flag.title}</h4>
                      <Badge variant="secondary" className="text-xs">{getRedFlagLabel(flag.type)}</Badge>
                    </div>
                    {flag.description && (
                      <p className="text-xs text-muted-foreground mt-1">{flag.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Empty state for alerts only */}
      {redFlags.length === 0 && signals.length === 0 && (
        <Card className="py-12">
          <CardContent className="text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-lg mb-2">Sin alertas detectadas</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              No se han identificado patrones de alerta en los datos de {currentLocality.name} hasta el momento.
              Esto puede significar que aún no hay datos suficientes o que no se detectaron anomalías.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Disclaimer */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Aviso importante:</strong> Las alertas mostradas son el resultado de análisis estadísticos 
          sobre datos públicos. No constituyen acusaciones ni implican necesariamente la existencia de irregularidades. 
          Cualquier ciudadano puede solicitar más información a través de los canales oficiales de transparencia.
        </AlertDescription>
      </Alert>
    </div>
  );
}
