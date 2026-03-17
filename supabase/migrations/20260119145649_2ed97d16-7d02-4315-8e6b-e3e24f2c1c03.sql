-- Core Data Tables for Argentina Transparente

-- Localities (4 cities)
CREATE TABLE public.localities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    province TEXT NOT NULL,
    population INTEGER,
    data_url TEXT,
    coordinates JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_localities_name ON public.localities(name);

-- Public Entities
CREATE TABLE public.public_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality_id UUID REFERENCES public.localities(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT,
    budget NUMERIC(15,2),
    address TEXT,
    phone TEXT,
    website TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_entities_locality ON public.public_entities(locality_id);
CREATE INDEX idx_entities_type ON public.public_entities(type);

-- Companies with CUIT and source citations
CREATE TABLE public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality_id UUID REFERENCES public.localities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    cuit TEXT,
    owners TEXT[],
    registered_address TEXT,
    founded_date DATE,
    sector TEXT,
    previous_sectors TEXT[],
    total_contracts_value NUMERIC(15,2) DEFAULT 0,
    contracts_count INTEGER DEFAULT 0,
    has_government_only_clients BOOLEAN DEFAULT false,
    unusual_growth BOOLEAN DEFAULT false,
    ownership_history JSONB,
    source_url TEXT,
    source_quote TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_companies_locality ON public.companies(locality_id);
CREATE INDEX idx_companies_cuit ON public.companies(cuit);

-- Contracts with amounts, dates, document URLs
CREATE TABLE public.contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality_id UUID REFERENCES public.localities(id) ON DELETE CASCADE NOT NULL,
    entity_id UUID REFERENCES public.public_entities(id) ON DELETE SET NULL,
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    company_name TEXT NOT NULL,
    description TEXT,
    amount NUMERIC(15,2) NOT NULL,
    currency TEXT DEFAULT 'ARS',
    date DATE NOT NULL,
    document_url TEXT,
    document_type TEXT NOT NULL,
    government_area TEXT,
    status TEXT DEFAULT 'adjudicado',
    bidders_count INTEGER DEFAULT 1,
    bidders TEXT[],
    days_to_award INTEGER,
    market_price_estimate NUMERIC(15,2),
    risk_score INTEGER,
    source_url TEXT,
    source_quote TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contracts_locality ON public.contracts(locality_id);
CREATE INDEX idx_contracts_company ON public.contracts(company_id);
CREATE INDEX idx_contracts_entity ON public.contracts(entity_id);
CREATE INDEX idx_contracts_date ON public.contracts(date);

-- Officials with positions, relatives, employers
CREATE TABLE public.officials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality_id UUID REFERENCES public.localities(id) ON DELETE CASCADE NOT NULL,
    entity_id UUID REFERENCES public.public_entities(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    position TEXT NOT NULL,
    area TEXT,
    start_date DATE,
    end_date DATE,
    relatives TEXT[],
    previous_employers TEXT[],
    known_associates TEXT[],
    declared_assets NUMERIC(15,2),
    document_url TEXT,
    source_url TEXT,
    source_quote TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_officials_locality ON public.officials(locality_id);
CREATE INDEX idx_officials_entity ON public.officials(entity_id);

-- Red Flags with severity and evidence
CREATE TABLE public.red_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality_id UUID REFERENCES public.localities(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    confidence NUMERIC(3,2) DEFAULT 0.5,
    title TEXT NOT NULL,
    description TEXT,
    evidence_quote TEXT,
    related_contracts UUID[],
    related_companies UUID[],
    related_officials UUID[],
    amount NUMERIC(15,2),
    detected_at TIMESTAMPTZ DEFAULT now(),
    source_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_red_flags_locality ON public.red_flags(locality_id);
CREATE INDEX idx_red_flags_type ON public.red_flags(type);
CREATE INDEX idx_red_flags_severity ON public.red_flags(severity);

-- Data Sources for scraping
CREATE TABLE public.data_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality_id UUID REFERENCES public.localities(id) ON DELETE CASCADE NOT NULL,
    url TEXT NOT NULL UNIQUE,
    name TEXT,
    type TEXT,
    last_scraped_at TIMESTAMPTZ,
    scrape_status TEXT DEFAULT 'pending',
    scrape_error TEXT,
    content_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_data_sources_locality ON public.data_sources(locality_id);
CREATE INDEX idx_data_sources_status ON public.data_sources(scrape_status);

-- Analysis Runs tracking
CREATE TABLE public.analysis_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality_id UUID REFERENCES public.localities(id) ON DELETE CASCADE NOT NULL,
    status TEXT DEFAULT 'pending',
    current_step INTEGER DEFAULT 0,
    total_steps INTEGER DEFAULT 9,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    error TEXT,
    results JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_analysis_runs_locality ON public.analysis_runs(locality_id);
CREATE INDEX idx_analysis_runs_status ON public.analysis_runs(status);

-- Enable RLS on all tables
ALTER TABLE public.localities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.officials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.red_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_runs ENABLE ROW LEVEL SECURITY;

-- Public SELECT policies (transparency data)
CREATE POLICY "Public read localities" ON public.localities FOR SELECT USING (true);
CREATE POLICY "Public read entities" ON public.public_entities FOR SELECT USING (true);
CREATE POLICY "Public read companies" ON public.companies FOR SELECT USING (true);
CREATE POLICY "Public read contracts" ON public.contracts FOR SELECT USING (true);
CREATE POLICY "Public read officials" ON public.officials FOR SELECT USING (true);
CREATE POLICY "Public read red_flags" ON public.red_flags FOR SELECT USING (true);
CREATE POLICY "Public read data_sources" ON public.data_sources FOR SELECT USING (true);
CREATE POLICY "Public read analysis_runs" ON public.analysis_runs FOR SELECT USING (true);

-- Insert initial localities
INSERT INTO public.localities (id, name, province, population, data_url) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Córdoba Capital', 'Córdoba', 1430000, 'https://cordoba.gob.ar'),
    ('22222222-2222-2222-2222-222222222222', 'Alta Gracia', 'Córdoba', 50000, 'https://altagracia.gob.ar'),
    ('33333333-3333-3333-3333-333333333333', 'Río Tercero', 'Córdoba', 55000, 'https://riotercero.gob.ar'),
    ('44444444-4444-4444-4444-444444444444', 'Pilar', 'Córdoba', 18000, 'https://pilar.gob.ar');