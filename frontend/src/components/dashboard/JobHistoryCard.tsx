import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useLocality } from '@/contexts/LocalityContext';
import { formatDateTime } from '@/lib/format-utils';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Eye,
  ChevronRight,
  History,
} from 'lucide-react';

interface Job {
  id: string;
  status: string;
  progress: number | null;
  started_at: string | null;
  completed_at: string | null;
  step: string | null;
}

export function JobHistoryCard() {
  const navigate = useNavigate();
  const { currentLocality } = useLocality();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('jobs')
          .select('id, status, progress, started_at, completed_at, step')
          .eq('locality_id', currentLocality.id)
          .order('started_at', { ascending: false })
          .limit(5);

        if (error) throw error;
        setJobs(data || []);
      } catch (err) {
        console.error('Error fetching jobs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('job-history')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `locality_id=eq.${currentLocality.id}`,
        },
        () => {
          fetchJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentLocality.id]);

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'completed':
        return { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Completado' };
      case 'failed':
      case 'cancelled':
        return { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: status === 'cancelled' ? 'Cancelado' : 'Error' };
      case 'running':
        return { icon: Loader2, color: 'text-primary', bg: 'bg-primary/10', label: 'En progreso', spin: true };
      default:
        return { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Pendiente' };
    }
  };

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Cargando historial...</span>
        </div>
      </Card>
    );
  }

  if (jobs.length === 0) {
    return null; // Don't show if no jobs
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Análisis recientes
        </h3>
      </div>

      <div className="space-y-2">
        {jobs.map(job => {
          const status = getStatusInfo(job.status);
          const StatusIcon = status.icon;

          return (
            <div
              key={job.id}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => navigate(`/analysis?jobId=${job.id}`)}
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-full ${status.bg}`}>
                  <StatusIcon className={`h-4 w-4 ${status.color} ${status.spin ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {status.label}
                    </Badge>
                    {job.progress !== null && job.status === 'running' && (
                      <span className="text-xs text-muted-foreground">{job.progress}%</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {job.started_at ? formatDateTime(job.started_at) : 'Pendiente'}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>

      {jobs.some(j => j.status === 'running') && (
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Hay un análisis en progreso
        </p>
      )}
    </Card>
  );
}
