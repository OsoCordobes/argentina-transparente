import { Card } from '@/components/ui/card';
import { ExternalLink } from 'lucide-react';
import type { ProcedureRow } from '@/lib/n8n-config';

function formatARS(amount: number): string {
  return '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(amount);
}

export function ProcedureTable({ procedures }: { procedures: ProcedureRow[] }) {
  if (!procedures || procedures.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="font-semibold font-serif text-lg">
        Procedimientos detectados ({procedures.length})
      </h2>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-3 text-left whitespace-nowrap">Nº Decreto</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Fecha</th>
                <th className="px-4 py-3 text-left">Proveedor</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Monto</th>
                <th className="px-4 py-3 text-left whitespace-nowrap">Tipo</th>
                <th className="px-4 py-3 text-left">Objeto</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">Fuente</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {procedures.map((row, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {row.id}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                    {row.date}
                  </td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <span className="line-clamp-2">{row.supplier}</span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap font-medium tabular-nums">
                    {row.amount_ars !== null ? formatARS(row.amount_ars) : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs">
                    {row.type}
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <span className="line-clamp-2 text-muted-foreground">{row.object}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.source_url ? (
                      <a
                        href={row.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center text-primary hover:text-primary/70 transition-colors"
                        aria-label="Ver en documento"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
