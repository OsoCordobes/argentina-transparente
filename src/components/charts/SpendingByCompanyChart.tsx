import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { formatCurrency } from '@/lib/format-utils';
import { ExportButton } from '@/components/dashboard/ExportButton';
import { useRealLocalityData } from '@/hooks/useRealLocalityData';
import { Loader2 } from 'lucide-react';

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function SpendingByCompanyChart() {
  const { spendingByCompany, loading } = useRealLocalityData();

  // Transform data for the chart
  const chartData = spendingByCompany.map(c => ({
    empresa: c.name,
    monto: c.value,
    contratos: 1,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-3">
          <p className="font-medium text-foreground">{data.empresa}</p>
          <p className="text-sm text-muted-foreground">
            {formatCurrency(data.monto)}
          </p>
        </div>
      );
    }
    return null;
  };

  const exportData = chartData.map(c => ({
    Empresa: c.empresa,
    Monto: c.monto,
  }));

  if (loading) {
    return (
      <div className="chart-container flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="chart-container">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-serif font-semibold">
            ¿Quién recibe más dinero?
          </h3>
          <p className="text-sm text-muted-foreground">
            Empresas ordenadas por monto total de contratos
          </p>
        </div>
        <ExportButton data={exportData} filename="gasto_por_empresa" />
      </div>
      
      {chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-muted-foreground">
          No hay datos disponibles
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <XAxis
              type="number"
              tickFormatter={(value) => `$${(value / 1000000).toFixed(0)}M`}
              className="text-xs"
            />
            <YAxis
              type="category"
              dataKey="empresa"
              width={120}
              tick={{ fontSize: 11 }}
              className="text-xs"
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="monto" radius={[0, 4, 4, 0]}>
              {chartData.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
