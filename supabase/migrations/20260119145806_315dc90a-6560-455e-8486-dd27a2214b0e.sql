-- Advanced Data Model (without vector extension)

-- Sources (discovered data source URLs)
CREATE TABLE public.sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality_id UUID REFERENCES public.localities(id) ON DELETE CASCADE NOT NULL,
    url TEXT NOT NULL,
    domain TEXT,
    discovered_at TIMESTAMPTZ DEFAULT now(),
    last_fetched TIMESTAMPTZ,
    fetch_status TEXT DEFAULT 'pending',
    fetch_error TEXT,
    content_type TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_sources_url ON public.sources(url);
CREATE INDEX idx_sources_locality ON public.sources(locality_id);

-- Documents (scraped with hash deduplication)
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES public.sources(id) ON DELETE CASCADE NOT NULL,
    locality_id UUID REFERENCES public.localities(id) ON DELETE CASCADE NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    content_hash TEXT NOT NULL,
    raw_content TEXT,
    markdown_content TEXT,
    doc_type TEXT,
    classification_confidence NUMERIC(3,2),
    metadata JSONB,
    fetched_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_documents_hash ON public.documents(content_hash);
CREATE INDEX idx_documents_source ON public.documents(source_id);
CREATE INDEX idx_documents_locality ON public.documents(locality_id);

-- Fragments (text citations with offsets - no vector for now)
CREATE TABLE public.fragments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    start_offset INTEGER,
    end_offset INTEGER,
    fragment_type TEXT,
    relevance_score NUMERIC(3,2),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fragments_document ON public.fragments(document_id);
CREATE INDEX idx_fragments_type ON public.fragments(fragment_type);

-- Actors (deduplicated persons/companies/orgs)
CREATE TABLE public.actors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality_id UUID REFERENCES public.localities(id) ON DELETE CASCADE NOT NULL,
    actor_type TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT,
    identifier TEXT,
    aliases TEXT[],
    properties JSONB,
    merged_from UUID[],
    first_seen TIMESTAMPTZ DEFAULT now(),
    last_seen TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_actors_locality ON public.actors(locality_id);
CREATE INDEX idx_actors_type ON public.actors(actor_type);
CREATE INDEX idx_actors_identifier ON public.actors(identifier);

-- Procedures (contracts/tenders/payments)
CREATE TABLE public.procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality_id UUID REFERENCES public.localities(id) ON DELETE CASCADE NOT NULL,
    procedure_type TEXT NOT NULL,
    title TEXT,
    description TEXT,
    amount NUMERIC(15,2),
    currency TEXT DEFAULT 'ARS',
    date DATE,
    status TEXT,
    source_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    extracted_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_procedures_locality ON public.procedures(locality_id);
CREATE INDEX idx_procedures_type ON public.procedures(procedure_type);

-- Relations (links between entities)
CREATE TABLE public.relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_actor_id UUID REFERENCES public.actors(id) ON DELETE CASCADE NOT NULL,
    target_actor_id UUID REFERENCES public.actors(id) ON DELETE CASCADE NOT NULL,
    relation_type TEXT NOT NULL,
    strength NUMERIC(3,2) DEFAULT 0.5,
    evidence_fragments UUID[],
    properties JSONB,
    first_seen TIMESTAMPTZ DEFAULT now(),
    last_seen TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_relations_source ON public.relations(source_actor_id);
CREATE INDEX idx_relations_target ON public.relations(target_actor_id);
CREATE INDEX idx_relations_type ON public.relations(relation_type);

-- Signals (12 risk typology detections)
CREATE TABLE public.signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality_id UUID REFERENCES public.localities(id) ON DELETE CASCADE NOT NULL,
    signal_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    confidence NUMERIC(3,2) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    evidence_fragments UUID[],
    related_actors UUID[],
    related_procedures UUID[],
    amount_involved NUMERIC(15,2),
    detected_at TIMESTAMPTZ DEFAULT now(),
    analysis_run_id UUID REFERENCES public.analysis_runs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_signals_locality ON public.signals(locality_id);
CREATE INDEX idx_signals_type ON public.signals(signal_type);
CREATE INDEX idx_signals_severity ON public.signals(severity);

-- Jobs (analysis pipeline execution)
CREATE TABLE public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality_id UUID REFERENCES public.localities(id) ON DELETE CASCADE NOT NULL,
    job_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    config JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error TEXT,
    results JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_jobs_locality ON public.jobs(locality_id);
CREATE INDEX idx_jobs_status ON public.jobs(status);

-- Job Steps (individual step tracking)
CREATE TABLE public.job_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
    step_number INTEGER NOT NULL,
    step_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    input_data JSONB,
    output_data JSONB,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_job_steps_job ON public.job_steps(job_id);
CREATE INDEX idx_job_steps_status ON public.job_steps(status);

-- Reports (generated executive summaries)
CREATE TABLE public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locality_id UUID REFERENCES public.localities(id) ON DELETE CASCADE NOT NULL,
    report_type TEXT NOT NULL,
    title TEXT NOT NULL,
    executive_summary TEXT,
    full_content TEXT,
    key_findings JSONB,
    related_signals UUID[],
    generated_at TIMESTAMPTZ DEFAULT now(),
    analysis_run_id UUID REFERENCES public.analysis_runs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reports_locality ON public.reports(locality_id);
CREATE INDEX idx_reports_type ON public.reports(report_type);

-- Enable RLS
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fragments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Public SELECT policies
CREATE POLICY "Public read sources" ON public.sources FOR SELECT USING (true);
CREATE POLICY "Public read documents" ON public.documents FOR SELECT USING (true);
CREATE POLICY "Public read fragments" ON public.fragments FOR SELECT USING (true);
CREATE POLICY "Public read actors" ON public.actors FOR SELECT USING (true);
CREATE POLICY "Public read procedures" ON public.procedures FOR SELECT USING (true);
CREATE POLICY "Public read relations" ON public.relations FOR SELECT USING (true);
CREATE POLICY "Public read signals" ON public.signals FOR SELECT USING (true);
CREATE POLICY "Public read jobs" ON public.jobs FOR SELECT USING (true);
CREATE POLICY "Public read job_steps" ON public.job_steps FOR SELECT USING (true);
CREATE POLICY "Public read reports" ON public.reports FOR SELECT USING (true);