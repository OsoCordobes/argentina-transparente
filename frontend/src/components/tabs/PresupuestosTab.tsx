import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/format-utils';
import { useRealLocalityData } from '@/hooks/useRealLocalityData';
import { PiggyBank, TrendingUp, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export function PresupuestosTab() {
  const { spendingByCategory, loading, contracts } = useRealLocalityData();

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-3">
          <p className="font-medium text-foreground mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (contracts.length === 0) {
    return (
      <EmptyState
        icon={PiggyBank}
        title="Sin datos de presupuesto"
        description="Inicia un análisis para obtener información presupuestaria."
      />
    );
  }

  const total = spendingByCategory.reduce((sum, c) => sum + c.value, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-muted/50 rounded-lg p-4 border">
        <div className="flex items-start gap-3">
          <PiggyBank className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h2 className="font-serif font-semibold text-foreground mb-1">Distribución del Gasto</h2>
            <p className="text-sm text-muted-foreground">
              Basado en los contratos analizados. Total: <strong>{formatCurrency(total)}</strong>
            </p>
          </div>
        </div>
      </div>

      <div className="chart-container">
        <h3 className="text-lg font-serif font-semibold mb-4">¿En qué se gasta tu dinero?</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {spendingByCategory.map((cat) => {
            const percentage = total > 0 ? ((cat.value / total) * 100).toFixed(1) : 0;
            return (
              <div key={cat.name} className="border rounded-lg p-4 bg-background">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium truncate">{cat.name}</span>
                  <span className="text-lg font-bold text-primary">{percentage}%</span>
                </div>
                <p className="text-sm text-muted-foreground">{formatCurrency(cat.value)}</p>
                <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-500" style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="disclaimer-banner">
        <div className="flex items-start gap-2">
          <TrendingUp className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            <strong>Nota:</strong> Los datos mostrados provienen de contratos analizados y pueden no representar el presupuesto completo.
          </p>
        </div>
      </div>
    </div>
  );
}
