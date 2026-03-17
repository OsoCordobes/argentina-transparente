import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/format-utils';
import { useRealLocalityData } from '@/hooks/useRealLocalityData';
import { Loader2 } from 'lucide-react';

const COLORS = [
  'hsl(220, 13%, 50%)',
  'hsl(276, 87%, 53%)',
  'hsl(199, 89%, 48%)',
  'hsl(142, 71%, 45%)',
  'hsl(38, 92%, 50%)',
  'hsl(326, 80%, 55%)',
  'hsl(220, 13%, 70%)',
];

export function SpendingByCategoryChart() {
  const { spendingByCategory, loading } = useRealLocalityData();

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; value: number } }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const total = spendingByCategory.reduce((sum, c) => sum + c.value, 0);
      const percentage = total > 0 ? ((data.value / total) * 100).toFixed(1) : 0;
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-3">
          <p className="font-medium text-foreground">{data.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatCurrency(data.value)} ({percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="chart-container flex items-center justify-center h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (spendingByCategory.length === 0) {
    return (
      <div className="chart-container">
        <div className="mb-4">
          <h3 className="text-lg font-serif font-semibold">Gasto por Categoría</h3>
          <p className="text-sm text-muted-foreground">Sin datos disponibles</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <div className="mb-4">
        <h3 className="text-lg font-serif font-semibold">¿En qué se gasta tu dinero?</h3>
        <p className="text-sm text-muted-foreground">Distribución por área de gobierno</p>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={spendingByCategory}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
          >
            {spendingByCategory.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="stroke-background" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend formatter={(value) => <span className="text-sm text-foreground">{value}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
