export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      actors: {
        Row: {
          actor_type: string
          aliases: string[] | null
          created_at: string | null
          first_seen: string | null
          id: string
          identifier: string | null
          last_seen: string | null
          locality_id: string
          merged_from: string[] | null
          name: string
          normalized_name: string | null
          properties: Json | null
        }
        Insert: {
          actor_type: string
          aliases?: string[] | null
          created_at?: string | null
          first_seen?: string | null
          id?: string
          identifier?: string | null
          last_seen?: string | null
          locality_id: string
          merged_from?: string[] | null
          name: string
          normalized_name?: string | null
          properties?: Json | null
        }
        Update: {
          actor_type?: string
          aliases?: string[] | null
          created_at?: string | null
          first_seen?: string | null
          id?: string
          identifier?: string | null
          last_seen?: string | null
          locality_id?: string
          merged_from?: string[] | null
          name?: string
          normalized_name?: string | null
          properties?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "actors_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_runs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_step: number | null
          error: string | null
          id: string
          locality_id: string
          results: Json | null
          started_at: string | null
          status: string | null
          total_steps: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          error?: string | null
          id?: string
          locality_id: string
          results?: Json | null
          started_at?: string | null
          status?: string | null
          total_steps?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          error?: string | null
          id?: string
          locality_id?: string
          results?: Json | null
          started_at?: string | null
          status?: string | null
          total_steps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_runs_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          evidence_ids: string[] | null
          id: string
          metadata: Json | null
          role: string
          signal_ids: string[] | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          evidence_ids?: string[] | null
          id?: string
          metadata?: Json | null
          role: string
          signal_ids?: string[] | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          evidence_ids?: string[] | null
          id?: string
          metadata?: Json | null
          role?: string
          signal_ids?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          contracts_count: number | null
          created_at: string | null
          cuit: string | null
          founded_date: string | null
          has_government_only_clients: boolean | null
          id: string
          locality_id: string | null
          name: string
          owners: string[] | null
          ownership_history: Json | null
          previous_sectors: string[] | null
          registered_address: string | null
          sector: string | null
          source_quote: string | null
          source_url: string | null
          total_contracts_value: number | null
          unusual_growth: boolean | null
          updated_at: string | null
        }
        Insert: {
          contracts_count?: number | null
          created_at?: string | null
          cuit?: string | null
          founded_date?: string | null
          has_government_only_clients?: boolean | null
          id?: string
          locality_id?: string | null
          name: string
          owners?: string[] | null
          ownership_history?: Json | null
          previous_sectors?: string[] | null
          registered_address?: string | null
          sector?: string | null
          source_quote?: string | null
          source_url?: string | null
          total_contracts_value?: number | null
          unusual_growth?: boolean | null
          updated_at?: string | null
        }
        Update: {
          contracts_count?: number | null
          created_at?: string | null
          cuit?: string | null
          founded_date?: string | null
          has_government_only_clients?: boolean | null
          id?: string
          locality_id?: string | null
          name?: string
          owners?: string[] | null
          ownership_history?: Json | null
          previous_sectors?: string[] | null
          registered_address?: string | null
          sector?: string | null
          source_quote?: string | null
          source_url?: string | null
          total_contracts_value?: number | null
          unusual_growth?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          amount: number
          bidders: string[] | null
          bidders_count: number | null
          company_id: string | null
          company_name: string
          created_at: string | null
          currency: string | null
          date: string
          days_to_award: number | null
          description: string | null
          document_type: string
          document_url: string | null
          entity_id: string | null
          government_area: string | null
          id: string
          locality_id: string
          market_price_estimate: number | null
          risk_score: number | null
          source_quote: string | null
          source_url: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          bidders?: string[] | null
          bidders_count?: number | null
          company_id?: string | null
          company_name: string
          created_at?: string | null
          currency?: string | null
          date: string
          days_to_award?: number | null
          description?: string | null
          document_type: string
          document_url?: string | null
          entity_id?: string | null
          government_area?: string | null
          id?: string
          locality_id: string
          market_price_estimate?: number | null
          risk_score?: number | null
          source_quote?: string | null
          source_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          bidders?: string[] | null
          bidders_count?: number | null
          company_id?: string | null
          company_name?: string
          created_at?: string | null
          currency?: string | null
          date?: string
          days_to_award?: number | null
          description?: string | null
          document_type?: string
          document_url?: string | null
          entity_id?: string | null
          government_area?: string | null
          id?: string
          locality_id?: string
          market_price_estimate?: number | null
          risk_score?: number | null
          source_quote?: string | null
          source_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "public_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          content_hash: string | null
          created_at: string | null
          id: string
          last_scraped_at: string | null
          locality_id: string
          name: string | null
          scrape_error: string | null
          scrape_status: string | null
          type: string | null
          updated_at: string | null
          url: string
        }
        Insert: {
          content_hash?: string | null
          created_at?: string | null
          id?: string
          last_scraped_at?: string | null
          locality_id: string
          name?: string | null
          scrape_error?: string | null
          scrape_status?: string | null
          type?: string | null
          updated_at?: string | null
          url: string
        }
        Update: {
          content_hash?: string | null
          created_at?: string | null
          id?: string
          last_scraped_at?: string | null
          locality_id?: string
          name?: string | null
          scrape_error?: string | null
          scrape_status?: string | null
          type?: string | null
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_sources_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          classification_confidence: number | null
          content_hash: string
          created_at: string | null
          doc_type: string | null
          fetched_at: string | null
          id: string
          locality_id: string
          markdown_content: string | null
          metadata: Json | null
          raw_content: string | null
          source_id: string
          title: string | null
          url: string
        }
        Insert: {
          classification_confidence?: number | null
          content_hash: string
          created_at?: string | null
          doc_type?: string | null
          fetched_at?: string | null
          id?: string
          locality_id: string
          markdown_content?: string | null
          metadata?: Json | null
          raw_content?: string | null
          source_id: string
          title?: string | null
          url: string
        }
        Update: {
          classification_confidence?: number | null
          content_hash?: string
          created_at?: string | null
          doc_type?: string | null
          fetched_at?: string | null
          id?: string
          locality_id?: string
          markdown_content?: string | null
          metadata?: Json | null
          raw_content?: string | null
          source_id?: string
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      fragments: {
        Row: {
          content: string
          created_at: string | null
          document_id: string
          end_offset: number | null
          fragment_type: string | null
          id: string
          relevance_score: number | null
          start_offset: number | null
        }
        Insert: {
          content: string
          created_at?: string | null
          document_id: string
          end_offset?: number | null
          fragment_type?: string | null
          id?: string
          relevance_score?: number | null
          start_offset?: number | null
        }
        Update: {
          content?: string
          created_at?: string | null
          document_id?: string
          end_offset?: number | null
          fragment_type?: string | null
          id?: string
          relevance_score?: number | null
          start_offset?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fragments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      job_steps: {
        Row: {
          completed_at: string | null
          created_at: string | null
          duration_ms: number | null
          error: string | null
          id: string
          input_data: Json | null
          job_id: string
          output_data: Json | null
          started_at: string | null
          status: string | null
          step_name: string
          step_number: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          input_data?: Json | null
          job_id: string
          output_data?: Json | null
          started_at?: string | null
          status?: string | null
          step_name: string
          step_number: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          input_data?: Json | null
          job_id?: string
          output_data?: Json | null
          started_at?: string | null
          status?: string | null
          step_name?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_steps_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          completed_at: string | null
          config: Json | null
          counts: Json | null
          created_at: string | null
          error: string | null
          eta_seconds: number | null
          id: string
          job_type: string
          locality_id: string
          priority: number | null
          progress: number | null
          report: Json | null
          results: Json | null
          run_id: string | null
          scanned_entities: Json | null
          started_at: string | null
          status: string | null
          step: string | null
          target_entities: Json | null
        }
        Insert: {
          completed_at?: string | null
          config?: Json | null
          counts?: Json | null
          created_at?: string | null
          error?: string | null
          eta_seconds?: number | null
          id?: string
          job_type: string
          locality_id: string
          priority?: number | null
          progress?: number | null
          report?: Json | null
          results?: Json | null
          run_id?: string | null
          scanned_entities?: Json | null
          started_at?: string | null
          status?: string | null
          step?: string | null
          target_entities?: Json | null
        }
        Update: {
          completed_at?: string | null
          config?: Json | null
          counts?: Json | null
          created_at?: string | null
          error?: string | null
          eta_seconds?: number | null
          id?: string
          job_type?: string
          locality_id?: string
          priority?: number | null
          progress?: number | null
          report?: Json | null
          results?: Json | null
          run_id?: string | null
          scanned_entities?: Json | null
          started_at?: string | null
          status?: string | null
          step?: string | null
          target_entities?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
        ]
      }
      localities: {
        Row: {
          coordinates: Json | null
          created_at: string | null
          data_url: string | null
          id: string
          name: string
          population: number | null
          province: string
          updated_at: string | null
        }
        Insert: {
          coordinates?: Json | null
          created_at?: string | null
          data_url?: string | null
          id?: string
          name: string
          population?: number | null
          province: string
          updated_at?: string | null
        }
        Update: {
          coordinates?: Json | null
          created_at?: string | null
          data_url?: string | null
          id?: string
          name?: string
          population?: number | null
          province?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      officials: {
        Row: {
          area: string | null
          created_at: string | null
          declared_assets: number | null
          document_url: string | null
          end_date: string | null
          entity_id: string | null
          id: string
          known_associates: string[] | null
          locality_id: string
          name: string
          position: string
          previous_employers: string[] | null
          relatives: string[] | null
          source_quote: string | null
          source_url: string | null
          start_date: string | null
          updated_at: string | null
        }
        Insert: {
          area?: string | null
          created_at?: string | null
          declared_assets?: number | null
          document_url?: string | null
          end_date?: string | null
          entity_id?: string | null
          id?: string
          known_associates?: string[] | null
          locality_id: string
          name: string
          position: string
          previous_employers?: string[] | null
          relatives?: string[] | null
          source_quote?: string | null
          source_url?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          area?: string | null
          created_at?: string | null
          declared_assets?: number | null
          document_url?: string | null
          end_date?: string | null
          entity_id?: string | null
          id?: string
          known_associates?: string[] | null
          locality_id?: string
          name?: string
          position?: string
          previous_employers?: string[] | null
          relatives?: string[] | null
          source_quote?: string | null
          source_url?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "officials_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "public_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "officials_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
        ]
      }
      procedures: {
        Row: {
          amount: number | null
          created_at: string | null
          currency: string | null
          date: string | null
          description: string | null
          extracted_data: Json | null
          id: string
          locality_id: string
          procedure_type: string
          source_document_id: string | null
          status: string | null
          title: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          date?: string | null
          description?: string | null
          extracted_data?: Json | null
          id?: string
          locality_id: string
          procedure_type: string
          source_document_id?: string | null
          status?: string | null
          title?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          date?: string | null
          description?: string | null
          extracted_data?: Json | null
          id?: string
          locality_id?: string
          procedure_type?: string
          source_document_id?: string | null
          status?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedures_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedures_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      public_entities: {
        Row: {
          address: string | null
          budget: number | null
          category: string | null
          created_at: string | null
          id: string
          locality_id: string
          name: string
          phone: string | null
          status: string | null
          type: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          budget?: number | null
          category?: string | null
          created_at?: string | null
          id?: string
          locality_id: string
          name: string
          phone?: string | null
          status?: string | null
          type: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          budget?: number | null
          category?: string | null
          created_at?: string | null
          id?: string
          locality_id?: string
          name?: string
          phone?: string | null
          status?: string | null
          type?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_entities_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
        ]
      }
      red_flags: {
        Row: {
          amount: number | null
          confidence: number | null
          created_at: string | null
          description: string | null
          detected_at: string | null
          evidence_quote: string | null
          id: string
          locality_id: string
          related_companies: string[] | null
          related_contracts: string[] | null
          related_officials: string[] | null
          severity: string
          source_url: string | null
          title: string
          type: string
        }
        Insert: {
          amount?: number | null
          confidence?: number | null
          created_at?: string | null
          description?: string | null
          detected_at?: string | null
          evidence_quote?: string | null
          id?: string
          locality_id: string
          related_companies?: string[] | null
          related_contracts?: string[] | null
          related_officials?: string[] | null
          severity: string
          source_url?: string | null
          title: string
          type: string
        }
        Update: {
          amount?: number | null
          confidence?: number | null
          created_at?: string | null
          description?: string | null
          detected_at?: string | null
          evidence_quote?: string | null
          id?: string
          locality_id?: string
          related_companies?: string[] | null
          related_contracts?: string[] | null
          related_officials?: string[] | null
          severity?: string
          source_url?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "red_flags_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
        ]
      }
      relations: {
        Row: {
          created_at: string | null
          evidence_fragments: string[] | null
          first_seen: string | null
          id: string
          last_seen: string | null
          properties: Json | null
          relation_type: string
          source_actor_id: string
          strength: number | null
          target_actor_id: string
        }
        Insert: {
          created_at?: string | null
          evidence_fragments?: string[] | null
          first_seen?: string | null
          id?: string
          last_seen?: string | null
          properties?: Json | null
          relation_type: string
          source_actor_id: string
          strength?: number | null
          target_actor_id: string
        }
        Update: {
          created_at?: string | null
          evidence_fragments?: string[] | null
          first_seen?: string | null
          id?: string
          last_seen?: string | null
          properties?: Json | null
          relation_type?: string
          source_actor_id?: string
          strength?: number | null
          target_actor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relations_source_actor_id_fkey"
            columns: ["source_actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relations_target_actor_id_fkey"
            columns: ["target_actor_id"]
            isOneToOne: false
            referencedRelation: "actors"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          analysis_run_id: string | null
          created_at: string | null
          executive_summary: string | null
          full_content: string | null
          generated_at: string | null
          id: string
          key_findings: Json | null
          locality_id: string
          related_signals: string[] | null
          report_type: string
          title: string
        }
        Insert: {
          analysis_run_id?: string | null
          created_at?: string | null
          executive_summary?: string | null
          full_content?: string | null
          generated_at?: string | null
          id?: string
          key_findings?: Json | null
          locality_id: string
          related_signals?: string[] | null
          report_type: string
          title: string
        }
        Update: {
          analysis_run_id?: string | null
          created_at?: string | null
          executive_summary?: string | null
          full_content?: string | null
          generated_at?: string | null
          id?: string
          key_findings?: Json | null
          locality_id?: string
          related_signals?: string[] | null
          report_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_analysis_run_id_fkey"
            columns: ["analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          amount_involved: number | null
          analysis_run_id: string | null
          confidence: number
          created_at: string | null
          description: string | null
          detected_at: string | null
          evidence_fragments: string[] | null
          id: string
          locality_id: string
          related_actors: string[] | null
          related_procedures: string[] | null
          severity: string
          signal_type: string
          title: string
        }
        Insert: {
          amount_involved?: number | null
          analysis_run_id?: string | null
          confidence: number
          created_at?: string | null
          description?: string | null
          detected_at?: string | null
          evidence_fragments?: string[] | null
          id?: string
          locality_id: string
          related_actors?: string[] | null
          related_procedures?: string[] | null
          severity: string
          signal_type: string
          title: string
        }
        Update: {
          amount_involved?: number | null
          analysis_run_id?: string | null
          confidence?: number
          created_at?: string | null
          description?: string | null
          detected_at?: string | null
          evidence_fragments?: string[] | null
          id?: string
          locality_id?: string
          related_actors?: string[] | null
          related_procedures?: string[] | null
          severity?: string
          signal_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_analysis_run_id_fkey"
            columns: ["analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          content_type: string | null
          created_at: string | null
          discovered_at: string | null
          domain: string | null
          fetch_error: string | null
          fetch_status: string | null
          id: string
          last_fetched: string | null
          locality_id: string
          url: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string | null
          discovered_at?: string | null
          domain?: string | null
          fetch_error?: string | null
          fetch_status?: string | null
          id?: string
          last_fetched?: string | null
          locality_id: string
          url: string
        }
        Update: {
          content_type?: string | null
          created_at?: string | null
          discovered_at?: string | null
          domain?: string | null
          fetch_error?: string | null
          fetch_status?: string | null
          id?: string
          last_fetched?: string | null
          locality_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "localities"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_customers: {
        Row: {
          created_at: string | null
          id: string
          stripe_customer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          stripe_customer_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          stripe_customer_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_entitlements: {
        Row: {
          created_at: string | null
          id: string
          is_premium: boolean | null
          last_query_date: string | null
          product_id: string | null
          queries_limit: number | null
          queries_today: number | null
          subscription_end: string | null
          subscription_id: string | null
          subscription_status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_premium?: boolean | null
          last_query_date?: string | null
          product_id?: string | null
          queries_limit?: number | null
          queries_today?: number | null
          subscription_end?: string | null
          subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_premium?: boolean | null
          last_query_date?: string | null
          product_id?: string | null
          queries_limit?: number | null
          queries_today?: number | null
          subscription_end?: string | null
          subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
