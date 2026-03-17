import { useEffect, useState } from 'react';
import { RefreshCw, Clock, ExternalLink, FileText, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { formatDateTime } from '@/lib/format-utils';
import { supabase } from '@/integrations/supabase/client';
import { useLocality } from '@/contexts/LocalityContext';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';

interface Source {
  id: string;
  url: string;
  domain: string | null;
  content_type: string | null;
  fetch_status: string;
  last_fetched: string | null;
  discovered_at: string;
}

export function ActualizacionesTab() {
  const { currentLocality } = useLocality();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSources = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .eq('locality_id', currentLocality.id)
        .order('discovered_at', { ascending: false });

      if (!error && data) {
        setSources(data);
      }
      setLoading(false);
    };

    fetchSources();
  }, [currentLocality.id]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'ok':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'failed':
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'pending':
      default:
        return <Clock className="h-4 w-4 text-warning" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
      case 'ok':
        return 'Procesado';
      case 'failed':
      case 'error':
        return 'Error';
      case 'pending':
        return 'Pendiente';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Cargando fuentes...</span>
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <EmptyState
        icon={RefreshCw}
        title="Sin fuentes registradas"
        description={`Aún no se han descubierto fuentes de datos para ${currentLocality.name}. Ejecuta un análisis para encontrar fuentes oficiales.`}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Sources status */}
      <div className="chart-container">
        <h3 className="text-lg font-serif font-semibold mb-4 flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-primary" />
          Fuentes de Datos Oficiales ({sources.length})
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Toda la información proviene exclusivamente de estas fuentes públicas del municipio de {currentLocality.name}.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sources.map((source) => (
            <div key={source.id} className="border rounded-lg p-4 bg-background">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium truncate flex-1 mr-2">
                  {source.domain || new URL(source.url).hostname}
                </h4>
                {getStatusIcon(source.fetch_status)}
              </div>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1 mb-2 truncate"
              >
                Ver fuente <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  {getStatusLabel(source.fetch_status)}
                </Badge>
                {source.last_fetched && (
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(source.last_fetched)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="disclaimer-banner">
        <div className="flex items-start gap-2">
          <FileText className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            <strong>Sobre la recopilación:</strong> Utilizamos técnicas de scraping ético que respetan 
            las políticas de los sitios oficiales. Los datos se actualizan periódicamente.
          </p>
        </div>
      </div>
    </div>
  );
}
