import { useState, useEffect } from 'react';
import { Lightbulb, TrendingUp, AlertCircle, GitBranch, Users, Skull, DollarSign, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/format-utils';
import { useLocality } from '@/contexts/LocalityContext';
import { supabase } from '@/integrations/supabase/client';

interface Insight {
  id: string;
  type: 'concentracion' | 'frecuencia' | 'monto_alto' | 'conexion' | 'testaferro' | 'lavado';
  title: string;
  summary: string;
  relatedEntities: string[];
  amount?: number;
  createdAt: string;
}

const insightIcons: Record<Insight['type'], React.ComponentType<{ className?: string }>> = {
  concentracion: AlertCircle,
  frecuencia: TrendingUp,
  monto_alto: Lightbulb,
  conexion: GitBranch,
  testaferro: Skull,
  lavado: DollarSign,
};

const insightLabels: Record<Insight['type'], string> = {
  concentracion: 'Concentración',
  frecuencia: 'Frecuencia',
  monto_alto: 'Monto Alto',
  conexion: 'Conexión',
  testaferro: 'Testaferro',
  lavado: 'Lavado',
};

const insightColors: Record<Insight['type'], string> = {
  concentracion: 'bg-warning/10 text-warning border-warning/20',
  frecuencia: 'bg-info/10 text-info border-info/20',
  monto_alto: 'bg-primary/10 text-primary border-primary/20',
  conexion: 'bg-accent text-accent-foreground border-accent',
  testaferro: 'bg-destructive/10 text-destructive border-destructive/20',
  lavado: 'bg-destructive/10 text-destructive border-destructive/20',
};

// Map signal types to insight types
function mapSignalToInsight(signal: any): Insight | null {
  const typeMapping: Record<string, Insight['type']> = {
    'CONFLICT_OF_INTEREST': 'conexion',
    'SPLIT_CONTRACTING': 'concentracion',
    'RELATED_PARTIES': 'testaferro',
    'UNUSUAL_GROWTH': 'lavado',
    'SINGLE_BIDDER': 'concentracion',
    'RAPID_AWARD': 'frecuencia',
    'OVERPRICING': 'monto_alto',
  };

  const type = typeMapping[signal.signal_type] || 'conexion';
  
  return {
    id: signal.id,
    type,
    title: signal.title,
    summary: signal.description || '',
    relatedEntities: signal.related_actors || [],
    amount: signal.amount_involved,
    createdAt: signal.detected_at || signal.created_at,
  };
}

export function InsightsList() {
  const { currentLocality } = useLocality();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInsights = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('signals')
          .select('*')
          .eq('locality_id', currentLocality.id)
          .order('detected_at', { ascending: false })
          .limit(10);

        if (error) throw error;

        const mappedInsights = (data || [])
          .map(mapSignalToInsight)
          .filter((i): i is Insight => i !== null);
        
        setInsights(mappedInsights);
      } catch (err) {
        console.error('Error fetching insights:', err);
        setInsights([]);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, [currentLocality.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Lightbulb className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">
            No se han detectado patrones automáticos todavía.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Los patrones se generan al analizar datos de {currentLocality.name}.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-6">
        <Lightbulb className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-serif font-semibold">
          Patrones detectados automáticamente
        </h3>
      </div>

      <div className="disclaimer-banner mb-6">
        <p className="text-sm">
          Estos patrones son <strong>observaciones estadísticas</strong> generadas automáticamente 
          al analizar los datos públicos. Muestran tendencias y concentraciones que podrían 
          interesarte como ciudadano. <strong>No implican irregularidades ni acusaciones.</strong>
        </p>
      </div>

      <div className="space-y-4">
        {insights.map((insight) => {
          const Icon = insightIcons[insight.type] || AlertCircle;
          const colors = insightColors[insight.type] || insightColors.conexion;
          const label = insightLabels[insight.type] || insight.type;

          return (
            <div
              key={insight.id}
              className="border rounded-lg p-4 bg-card hover:shadow-md transition-shadow animate-fade-in"
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colors}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge variant="outline" className={colors}>
                      {label}
                    </Badge>
                    {insight.amount && (
                      <span className="text-sm font-medium text-primary">
                        {formatCurrency(insight.amount)}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(insight.createdAt)}
                    </span>
                  </div>
                  <h4 className="font-medium text-foreground mb-1">{insight.title}</h4>
                  <p className="text-sm text-muted-foreground mb-3">{insight.summary}</p>
                  {insight.relatedEntities.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {insight.relatedEntities.map((entity, index) => (
                        <span key={index} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-muted text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {entity}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
