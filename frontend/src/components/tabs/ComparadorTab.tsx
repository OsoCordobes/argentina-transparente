import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useLocality } from '@/contexts/LocalityContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/format-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Crown, TrendingUp, Users, AlertTriangle, Loader2, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface LocalityData {
  id: string;
  name: string;
  population: number;
  totalSpending: number;
  budgetPerCapita: number;
  contractsCount: number;
  redFlagsCount: number;
  companiesCount: number;
  transparencyScore: number;
}

export function ComparadorTab() {
  const { currentLocality, localities } = useLocality();
  const { isPremium } = useAuth();
  const [comparisonData, setComparisonData] = useState<LocalityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'budgetPerCapita' | 'transparencyScore' | 'redFlagsCount'>('budgetPerCapita');

  useEffect(() => {
    const fetchComparisonData = async () => {
      setLoading(true);
      
      const data: LocalityData[] = [];
      
      for (const loc of localities) {
        // Fetch real data for each locality
        const [contractsResult, redFlagsResult, companiesResult] = await Promise.all([
          supabase
            .from('contracts')
            .select('amount')
            .eq('locality_id', loc.id),
          supabase
            .from('red_flags')
            .select('id')
            .eq('locality_id', loc.id),
          supabase
            .from('companies')
            .select('id')
            .eq('locality_id', loc.id),
        ]);

        const totalSpending = (contractsResult.data || []).reduce((sum, c) => sum + (c.amount || 0), 0);
        const contractsCount = (contractsResult.data || []).length;
        const redFlagsCount = (redFlagsResult.data || []).length;
        const companiesCount = (companiesResult.data || []).length;
        const budgetPerCapita = loc.population > 0 ? totalSpending / loc.population : 0;
        
        // Calculate transparency score based on data availability and red flags
        let transparencyScore = 50;
        if (contractsCount > 0) transparencyScore += 20;
        if (companiesCount > 0) transparencyScore += 15;
        transparencyScore -= Math.min(redFlagsCount * 5, 25);
        transparencyScore = Math.max(0, Math.min(100, transparencyScore));

        data.push({
          id: loc.id,
          name: loc.name,
          population: loc.population,
          totalSpending,
          budgetPerCapita: Math.round(budgetPerCapita),
          contractsCount,
          redFlagsCount,
          companiesCount,
          transparencyScore,
        });
      }
      
      setComparisonData(data);
      setLoading(false);
    };

    fetchComparisonData();
  }, []);

  const sortedData = [...comparisonData].sort((a, b) => {
    if (sortBy === 'redFlagsCount') return a[sortBy] - b[sortBy];
    return b[sortBy] - a[sortBy];
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Cargando datos comparativos...</span>
      </div>
    );
  }

  // Premium feature gate
  if (!isPremium) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Card className="border-2 border-dashed">
          <CardContent className="py-12 text-center">
            <Lock className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <div className="flex items-center justify-center gap-2 mb-2">
              <Crown className="h-5 w-5 text-warning" />
              <h3 className="text-xl font-semibold">Función Premium</h3>
            </div>
            <p className="text-muted-foreground max-w-md mx-auto mb-4">
              El comparador de localidades es una función exclusiva para suscriptores premium.
              Compara presupuestos, alertas y transparencia entre diferentes municipios.
            </p>
            <Badge variant="secondary" className="text-sm">
              Próximamente: Suscríbete por $5/mes
            </Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif font-bold text-foreground flex items-center gap-2">
            Comparador de Localidades
            <Badge variant="secondary" className="text-xs">
              <Crown className="h-3 w-3 mr-1" />
              Premium
            </Badge>
          </h2>
          <p className="text-muted-foreground">
            Análisis comparativo de gasto público y transparencia entre municipios
          </p>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {sortedData.map((loc, idx) => (
          <Card 
            key={loc.id} 
            className={`transition-all ${loc.id === currentLocality.id ? 'ring-2 ring-primary' : ''}`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">{loc.name}</CardTitle>
                <Badge variant={idx === 0 ? 'default' : 'secondary'}>
                  #{idx + 1}
                </Badge>
              </div>
              <CardDescription className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {loc.population.toLocaleString('es-AR')} habitantes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Presupuesto/hab</p>
                  <p className="font-bold text-primary">{formatCurrency(loc.budgetPerCapita)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Score Transparencia</p>
                  <p className="font-bold">{loc.transparencyScore}/100</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Red Flags</p>
                  <p className={`font-bold ${loc.redFlagsCount > 8 ? 'text-destructive' : loc.redFlagsCount > 4 ? 'text-warning' : 'text-success'}`}>
                    {loc.redFlagsCount}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Contratos</p>
                  <p className="font-bold">{loc.contractsCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bar Chart - Budget per Capita */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Gasto per Cápita
            </CardTitle>
            <CardDescription>
              Comparación del gasto público por habitante
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <YAxis dataKey="name" type="category" width={100} />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), 'Por habitante']}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar 
                    dataKey="budgetPerCapita" 
                    fill="hsl(var(--primary))" 
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Bar Chart - Red Flags Comparison */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Alertas por Localidad
            </CardTitle>
            <CardDescription>
              Cantidad de red flags detectados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Bar 
                    dataKey="redFlagsCount" 
                    name="Red Flags"
                    fill="hsl(var(--destructive))" 
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar 
                    dataKey="contractsCount" 
                    name="Contratos"
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ranking Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base font-semibold">
                Ranking de Transparencia
              </CardTitle>
              <CardDescription>
                Ordenado por criterios de transparencia
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy('transparencyScore')}
                className={`text-xs px-2 py-1 rounded ${sortBy === 'transparencyScore' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
              >
                Transparencia
              </button>
              <button
                onClick={() => setSortBy('budgetPerCapita')}
                className={`text-xs px-2 py-1 rounded ${sortBy === 'budgetPerCapita' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
              >
                Presupuesto
              </button>
              <button
                onClick={() => setSortBy('redFlagsCount')}
                className={`text-xs px-2 py-1 rounded ${sortBy === 'redFlagsCount' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
              >
                Menos Alertas
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">Pos.</th>
                  <th className="text-left py-2 px-2">Localidad</th>
                  <th className="text-right py-2 px-2">Población</th>
                  <th className="text-right py-2 px-2">Gasto Total</th>
                  <th className="text-right py-2 px-2">$/Hab</th>
                  <th className="text-right py-2 px-2">Contratos</th>
                  <th className="text-right py-2 px-2">Alertas</th>
                  <th className="text-right py-2 px-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((loc, idx) => (
                  <tr key={loc.id} className={`border-b ${loc.id === currentLocality.id ? 'bg-primary/5' : ''}`}>
                    <td className="py-2 px-2 font-bold">{idx + 1}</td>
                    <td className="py-2 px-2 font-medium">{loc.name}</td>
                    <td className="py-2 px-2 text-right">{loc.population.toLocaleString('es-AR')}</td>
                    <td className="py-2 px-2 text-right">{formatCurrency(loc.totalSpending)}</td>
                    <td className="py-2 px-2 text-right font-medium text-primary">{formatCurrency(loc.budgetPerCapita)}</td>
                    <td className="py-2 px-2 text-right">{loc.contractsCount}</td>
                    <td className="py-2 px-2 text-right">
                      <Badge variant={loc.redFlagsCount > 8 ? 'destructive' : loc.redFlagsCount > 4 ? 'secondary' : 'default'}>
                        {loc.redFlagsCount}
                      </Badge>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full" 
                            style={{ width: `${loc.transparencyScore}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium w-6">{loc.transparencyScore}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
