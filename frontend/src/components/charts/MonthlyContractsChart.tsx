import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/lib/format-utils';
import { useRealLocalityData } from '@/hooks/useRealLocalityData';
import { Loader2 } from 'lucide-react';

export function MonthlyContractsChart() {
  const { monthlyContracts, loading } = useRealLocalityData();

  // Transform data for the chart
  const chartData = monthlyContracts.map(m => ({
    month: m.month,
    total: m.total,
    cantidad: m.count,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-3">
          <p className="font-medium text-foreground">{data.month}</p>
          <p className="text-sm text-muted-foreground">
            Total: {formatCurrency(data.total)}
          </p>
          <p className="text-sm text-muted-foreground">
            {data.cantidad} contratos adjudicados
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="chart-container flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="chart-container">
      <div className="mb-4">
        <h3 className="text-lg font-serif font-semibold">
          Evolución mensual de contratos
        </h3>
        <p className="text-sm text-muted-foreground">
          Monto total y cantidad de contratos por mes
        </p>
      </div>
      
      {chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-muted-foreground">
          No hay datos disponibles
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="month" 
              tick={{ fontSize: 12 }}
              className="text-xs"
            />
            <YAxis 
              yAxisId="left"
              tickFormatter={(value) => `$${(value / 1000000).toFixed(0)}M`}
              tick={{ fontSize: 12 }}
              className="text-xs"
            />
            <YAxis 
              yAxisId="right" 
              orientation="right"
              tick={{ fontSize: 12 }}
              className="text-xs"
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar 
              yAxisId="right"
              dataKey="cantidad" 
              fill="hsl(var(--chart-2))" 
              radius={[4, 4, 0, 0]}
              opacity={0.7}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="total"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--primary))' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
