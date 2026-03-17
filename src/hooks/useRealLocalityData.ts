import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocality } from '@/contexts/LocalityContext';

export interface RealContract {
  id: string;
  locality_id: string;
  company_id: string | null;
  company_name: string;
  description: string | null;
  amount: number;
  currency: string;
  date: string;
  document_url: string | null;
  document_type: string;
  government_area: string | null;
  status: string;
  bidders_count: number;
  bidders: string[] | null;
  days_to_award: number | null;
  risk_score: number | null;
  source_url: string | null;
  source_quote: string | null;
}

export interface RealCompany {
  id: string;
  locality_id: string | null;
  name: string;
  cuit: string | null;
  owners: string[] | null;
  registered_address: string | null;
  founded_date: string | null;
  sector: string | null;
  total_contracts_value: number;
  contracts_count: number;
  has_government_only_clients: boolean;
  unusual_growth: boolean;
  source_url: string | null;
}

export interface RealOfficial {
  id: string;
  locality_id: string;
  name: string;
  position: string;
  area: string | null;
  start_date: string | null;
  end_date: string | null;
  relatives: string[] | null;
  previous_employers: string[] | null;
  known_associates: string[] | null;
  declared_assets: number | null;
  source_url: string | null;
}

export interface RealRedFlag {
  id: string;
  locality_id: string;
  type: string;
  severity: string;
  confidence: number | null;
  title: string;
  description: string | null;
  evidence_quote: string | null;
  amount: number | null;
  source_url: string | null;
  detected_at: string;
}

export interface RealSignal {
  id: string;
  locality_id: string;
  signal_type: string;
  severity: string;
  confidence: number;
  title: string;
  description: string | null;
  amount_involved: number | null;
  detected_at: string;
}

export interface LocalityStats {
  totalSpending: number;
  uniqueCompanies: number;
  totalContracts: number;
  redFlagsCount: number;
  signalsCount: number;
  highRiskContracts: number;
  averageContractValue: number;
  equivalentSalaries: number;
}

export function useRealLocalityData() {
  const { currentLocality } = useLocality();
  const [contracts, setContracts] = useState<RealContract[]>([]);
  const [companies, setCompanies] = useState<RealCompany[]>([]);
  const [officials, setOfficials] = useState<RealOfficial[]>([]);
  const [redFlags, setRedFlags] = useState<RealRedFlag[]>([]);
  const [signals, setSignals] = useState<RealSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentLocality?.id) return;
    
    setLoading(true);
    setError(null);

    try {
      // Fetch all data in parallel
      const [
        contractsResult,
        companiesResult,
        officialsResult,
        redFlagsResult,
        signalsResult,
      ] = await Promise.all([
        supabase
          .from('contracts')
          .select('*')
          .eq('locality_id', currentLocality.id)
          .order('date', { ascending: false }),
        supabase
          .from('companies')
          .select('*')
          .eq('locality_id', currentLocality.id)
          .order('total_contracts_value', { ascending: false }),
        supabase
          .from('officials')
          .select('*')
          .eq('locality_id', currentLocality.id)
          .order('name'),
        supabase
          .from('red_flags')
          .select('*')
          .eq('locality_id', currentLocality.id)
          .order('detected_at', { ascending: false }),
        supabase
          .from('signals')
          .select('*')
          .eq('locality_id', currentLocality.id)
          .order('detected_at', { ascending: false }),
      ]);

      if (contractsResult.error) throw contractsResult.error;
      if (companiesResult.error) throw companiesResult.error;
      if (officialsResult.error) throw officialsResult.error;
      if (redFlagsResult.error) throw redFlagsResult.error;
      if (signalsResult.error) throw signalsResult.error;

      setContracts(contractsResult.data || []);
      setCompanies(companiesResult.data || []);
      setOfficials(officialsResult.data || []);
      setRedFlags(redFlagsResult.data || []);
      setSignals(signalsResult.data || []);
    } catch (err) {
      console.error('Error fetching locality data:', err);
      setError(err instanceof Error ? err.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }, [currentLocality?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute stats
  const stats: LocalityStats = {
    totalSpending: contracts.reduce((sum, c) => sum + (c.amount || 0), 0),
    uniqueCompanies: companies.length,
    totalContracts: contracts.length,
    redFlagsCount: redFlags.length,
    signalsCount: signals.length,
    highRiskContracts: contracts.filter(c => (c.risk_score || 0) >= 70).length,
    averageContractValue: contracts.length > 0 
      ? contracts.reduce((sum, c) => sum + (c.amount || 0), 0) / contracts.length 
      : 0,
    // Average salary in Argentina ~$500,000 ARS monthly
    equivalentSalaries: Math.round(contracts.reduce((sum, c) => sum + (c.amount || 0), 0) / 500000),
  };

  // Computed data for charts
  const spendingByCompany = companies
    .filter(c => c.total_contracts_value > 0)
    .map(c => ({
      name: c.name,
      value: c.total_contracts_value,
      owners: c.owners?.join(', ') || '',
      hasRedFlag: false, // Will be computed when data is available
    }))
    .slice(0, 10);

  const monthlyContracts = contracts.reduce((acc, contract) => {
    const month = new Date(contract.date).toISOString().slice(0, 7);
    const existing = acc.find(m => m.month === month);
    if (existing) {
      existing.count += 1;
      existing.total += contract.amount;
    } else {
      acc.push({ month, count: 1, total: contract.amount });
    }
    return acc;
  }, [] as { month: string; count: number; total: number }[])
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);

  const spendingByCategory = contracts.reduce((acc, contract) => {
    const category = contract.government_area || 'Sin categoría';
    const existing = acc.find(c => c.name === category);
    if (existing) {
      existing.value += contract.amount;
    } else {
      acc.push({ name: category, value: contract.amount });
    }
    return acc;
  }, [] as { name: string; value: number }[])
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return {
    contracts,
    companies,
    officials,
    redFlags,
    signals,
    stats,
    spendingByCompany,
    monthlyContracts,
    spendingByCategory,
    loading,
    error,
    refetch: fetchData,
  };
}
