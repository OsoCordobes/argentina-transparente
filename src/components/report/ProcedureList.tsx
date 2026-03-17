import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import type { Procedure } from '@/lib/n8n-config';

const TYPE_LABELS: Record<string, string> = {
  licitacion: 'Licitación',
  contratacion_directa: 'Contratación directa',
  presupuesto: 'Presupuesto',
  decreto: 'Decreto',
  ordenanza: 'Ordenanza',
  otro: 'Otro',
};

function formatARS(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ProcedureList({ procedures }: { procedures: Procedure[] }) {
  if (!procedures || procedures.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="font-semibold font-serif text-lg flex items-center gap-2">
        <FileText className="h-5 w-5 text-muted-foreground" />
        Procedimientos detectados ({procedures.length})
      </h2>
      <div className="space-y-2">
        {procedures.map((p, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {p.id && (
                    <span className="font-mono text-xs text-muted-foreground">{p.id}</span>
                  )}
                  {p.type && (
                    <Badge variant="outline" className="text-xs">
                      {TYPE_LABELS[p.type] ?? p.type}
                    </Badge>
                  )}
                  {p.date && (
                    <span className="text-xs text-muted-foreground">{p.date}</span>
                  )}
                </div>
                <p className="text-sm font-medium leading-snug">{p.title}</p>
                {p.supplier && (
                  <p className="text-xs text-muted-foreground truncate">Proveedor: {p.supplier}</p>
                )}
              </div>
              {typeof p.amount === 'number' && (
                <p className="text-sm font-semibold tabular-nums shrink-0">{formatARS(p.amount)}</p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
