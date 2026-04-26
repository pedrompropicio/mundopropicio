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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      account_categories: {
        Row: {
          code: string
          created_at: string
          event_required: boolean
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          event_required?: boolean
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          event_required?: boolean
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_exports: {
        Row: {
          created_at: string
          document_count: number
          exported_by: string
          id: string
          notes: string | null
          pending_count: number
          period_from: string
          period_to: string
          transaction_count: number
        }
        Insert: {
          created_at?: string
          document_count?: number
          exported_by?: string
          id?: string
          notes?: string | null
          pending_count?: number
          period_from: string
          period_to: string
          transaction_count?: number
        }
        Update: {
          created_at?: string
          document_count?: number
          exported_by?: string
          id?: string
          notes?: string | null
          pending_count?: number
          period_from?: string
          period_to?: string
          transaction_count?: number
        }
        Relationships: []
      }
      bp_orphan_attachments: {
        Row: {
          created_at: string
          event_id: string
          id: string
          link_url: string
          notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_forecast_ids: string[]
          row_base_amount: number
          row_description: string
          sheet_name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          link_url: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_forecast_ids?: string[]
          row_base_amount?: number
          row_description: string
          sheet_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          link_url?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_forecast_ids?: string[]
          row_base_amount?: number
          row_description?: string
          sheet_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bp_orphan_attachments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      bp_version_audit_log: {
        Row: {
          action: string
          created_at: string
          event_id: string
          id: string
          metadata: Json | null
          performed_by: string | null
          performed_by_label: string | null
          version_id: string
        }
        Insert: {
          action: string
          created_at?: string
          event_id: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          performed_by_label?: string | null
          version_id: string
        }
        Update: {
          action?: string
          created_at?: string
          event_id?: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          performed_by_label?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bp_version_audit_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_version_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_version_audit_log_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "bp_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      bp_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          cascaded_from_version_id: string | null
          created_at: string
          created_by: string | null
          created_by_label: string | null
          description: string | null
          event_id: string
          id: string
          is_pinned_scenario: boolean
          is_retroactive_snapshot: boolean
          scenario_assumptions: Json | null
          scenario_label: string | null
          snapshot_payload: Json
          state: string
          superseded_at: string | null
          superseded_by_version_id: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          cascaded_from_version_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_label?: string | null
          description?: string | null
          event_id: string
          id?: string
          is_pinned_scenario?: boolean
          is_retroactive_snapshot?: boolean
          scenario_assumptions?: Json | null
          scenario_label?: string | null
          snapshot_payload?: Json
          state?: string
          superseded_at?: string | null
          superseded_by_version_id?: string | null
          updated_at?: string
          version_number: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          cascaded_from_version_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_label?: string | null
          description?: string | null
          event_id?: string
          id?: string
          is_pinned_scenario?: boolean
          is_retroactive_snapshot?: boolean
          scenario_assumptions?: Json | null
          scenario_label?: string | null
          snapshot_payload?: Json
          state?: string
          superseded_at?: string | null
          superseded_by_version_id?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "bp_versions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_versions_cascaded_from_version_id_fkey"
            columns: ["cascaded_from_version_id"]
            isOneToOne: false
            referencedRelation: "bp_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_versions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_versions_superseded_by_version_id_fkey"
            columns: ["superseded_by_version_id"]
            isOneToOne: false
            referencedRelation: "bp_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      camarim_fund_moves: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          event_id: string | null
          financial_account_id: string | null
          id: string
          move_date: string
          move_type: string
          notes: string | null
          session_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          event_id?: string | null
          financial_account_id?: string | null
          id?: string
          move_date?: string
          move_type: string
          notes?: string | null
          session_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          event_id?: string | null
          financial_account_id?: string | null
          id?: string
          move_date?: string
          move_type?: string
          notes?: string | null
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "camarim_fund_moves_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_fund_moves_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_fund_moves_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_fund_moves_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "camarim_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      camarim_integrations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          integration_type: string
          session_id: string
          status: string
          summary_payload: Json | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          integration_type: string
          session_id: string
          status?: string
          summary_payload?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          integration_type?: string
          session_id?: string
          status?: string
          summary_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "camarim_integrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_integrations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "camarim_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      camarim_item_documents: {
        Row: {
          created_at: string
          created_by: string | null
          document_source: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          item_id: string
          mime_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_source?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          item_id: string
          mime_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_source?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          item_id?: string
          mime_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "camarim_item_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_item_documents_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "camarim_items"
            referencedColumns: ["id"]
          },
        ]
      }
      camarim_item_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          item_id: string
          new_data: Json | null
          old_data: Json | null
          review_type: string
          reviewed_by: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          item_id: string
          new_data?: Json | null
          old_data?: Json | null
          review_type: string
          reviewed_by?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          item_id?: string
          new_data?: Json | null
          old_data?: Json | null
          review_type?: string
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "camarim_item_reviews_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "camarim_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_item_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      camarim_items: {
        Row: {
          approved_without_document: boolean
          approved_without_document_reason: string | null
          base_amount: number
          bp_forecast_id: string | null
          bp_scope: string
          buyer_profile_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          document_date: string | null
          document_issue_reason: string | null
          document_number: string | null
          document_type: string
          event_id: string
          has_document: boolean
          id: string
          integration_mode: string
          iva_amount: number
          needs_accounting_review: boolean
          notes: string | null
          ocr_confidence: string | null
          ocr_raw_payload: Json | null
          parent_item_id: string | null
          payment_origin: string
          pending_review_reason: string | null
          service_description: string | null
          session_id: string
          status: string
          supplier_id: string | null
          supplier_name_raw: string | null
          total_amount: number
          transaction_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          approved_without_document?: boolean
          approved_without_document_reason?: string | null
          base_amount?: number
          bp_forecast_id?: string | null
          bp_scope?: string
          buyer_profile_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          document_date?: string | null
          document_issue_reason?: string | null
          document_number?: string | null
          document_type?: string
          event_id: string
          has_document?: boolean
          id?: string
          integration_mode?: string
          iva_amount?: number
          needs_accounting_review?: boolean
          notes?: string | null
          ocr_confidence?: string | null
          ocr_raw_payload?: Json | null
          parent_item_id?: string | null
          payment_origin: string
          pending_review_reason?: string | null
          service_description?: string | null
          session_id: string
          status?: string
          supplier_id?: string | null
          supplier_name_raw?: string | null
          total_amount?: number
          transaction_id?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          approved_without_document?: boolean
          approved_without_document_reason?: string | null
          base_amount?: number
          bp_forecast_id?: string | null
          bp_scope?: string
          buyer_profile_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          document_date?: string | null
          document_issue_reason?: string | null
          document_number?: string | null
          document_type?: string
          event_id?: string
          has_document?: boolean
          id?: string
          integration_mode?: string
          iva_amount?: number
          needs_accounting_review?: boolean
          notes?: string | null
          ocr_confidence?: string | null
          ocr_raw_payload?: Json | null
          parent_item_id?: string | null
          payment_origin?: string
          pending_review_reason?: string | null
          service_description?: string | null
          session_id?: string
          status?: string
          supplier_id?: string | null
          supplier_name_raw?: string | null
          total_amount?: number
          transaction_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "camarim_items_bp_forecast_id_fkey"
            columns: ["bp_forecast_id"]
            isOneToOne: false
            referencedRelation: "event_forecasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_items_buyer_profile_id_fkey"
            columns: ["buyer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "camarim_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "camarim_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      camarim_session_events: {
        Row: {
          created_at: string
          event_id: string
          id: string
          is_primary: boolean
          session_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          is_primary?: boolean
          session_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          is_primary?: boolean
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "camarim_session_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_session_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "camarim_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      camarim_sessions: {
        Row: {
          advance_total: number
          budget_amount: number
          closed_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          integrated_at: string | null
          master_event_id: string | null
          mode: string
          notes: string | null
          opened_at: string
          responsible_profile_id: string | null
          settlement_balance: number
          settlement_transaction_id: string | null
          settlement_type: string | null
          spent_total: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          advance_total?: number
          budget_amount?: number
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          integrated_at?: string | null
          master_event_id?: string | null
          mode?: string
          notes?: string | null
          opened_at?: string
          responsible_profile_id?: string | null
          settlement_balance?: number
          settlement_transaction_id?: string | null
          settlement_type?: string | null
          spent_total?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          advance_total?: number
          budget_amount?: number
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          integrated_at?: string | null
          master_event_id?: string | null
          mode?: string
          notes?: string | null
          opened_at?: string
          responsible_profile_id?: string | null
          settlement_balance?: number
          settlement_transaction_id?: string | null
          settlement_type?: string | null
          spent_total?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "camarim_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_sessions_master_event_id_fkey"
            columns: ["master_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camarim_sessions_responsible_profile_id_fkey"
            columns: ["responsible_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          country: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          country?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      event_cache_city_settlements: {
        Row: {
          adjusted_amount: number | null
          agreement_notes: string | null
          cache_config_id: string
          created_at: string
          event_id: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          is_finalized: boolean
          real_amount: number | null
          updated_at: string
        }
        Insert: {
          adjusted_amount?: number | null
          agreement_notes?: string | null
          cache_config_id: string
          created_at?: string
          event_id: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          is_finalized?: boolean
          real_amount?: number | null
          updated_at?: string
        }
        Update: {
          adjusted_amount?: number | null
          agreement_notes?: string | null
          cache_config_id?: string
          created_at?: string
          event_id?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          is_finalized?: boolean
          real_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_cache_city_settlements_cache_config_id_fkey"
            columns: ["cache_config_id"]
            isOneToOne: false
            referencedRelation: "event_cache_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cache_city_settlements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cache_configs: {
        Row: {
          adjusted_amount: number | null
          agreement_notes: string | null
          artist_name: string
          cache_deduction_basis: string
          cache_revenue_basis: string
          cache_type: string
          created_at: string
          event_id: string
          finalized_at: string | null
          finalized_by: string | null
          fixed_amount: number
          fixed_deduction_percentage: number
          id: string
          is_finalized: boolean
          minimum_guaranteed: number
          percentage: number
          real_amount: number | null
          supplier_id: string | null
          updated_at: string
          withholding_applicable: boolean
          withholding_rate: number
        }
        Insert: {
          adjusted_amount?: number | null
          agreement_notes?: string | null
          artist_name: string
          cache_deduction_basis?: string
          cache_revenue_basis?: string
          cache_type?: string
          created_at?: string
          event_id: string
          finalized_at?: string | null
          finalized_by?: string | null
          fixed_amount?: number
          fixed_deduction_percentage?: number
          id?: string
          is_finalized?: boolean
          minimum_guaranteed?: number
          percentage?: number
          real_amount?: number | null
          supplier_id?: string | null
          updated_at?: string
          withholding_applicable?: boolean
          withholding_rate?: number
        }
        Update: {
          adjusted_amount?: number | null
          agreement_notes?: string | null
          artist_name?: string
          cache_deduction_basis?: string
          cache_revenue_basis?: string
          cache_type?: string
          created_at?: string
          event_id?: string
          finalized_at?: string | null
          finalized_by?: string | null
          fixed_amount?: number
          fixed_deduction_percentage?: number
          id?: string
          is_finalized?: boolean
          minimum_guaranteed?: number
          percentage?: number
          real_amount?: number | null
          supplier_id?: string | null
          updated_at?: string
          withholding_applicable?: boolean
          withholding_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_cache_configs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cache_configs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cache_deductions: {
        Row: {
          cache_config_id: string
          category_id: string
          created_at: string
          id: string
        }
        Insert: {
          cache_config_id: string
          category_id: string
          created_at?: string
          id?: string
        }
        Update: {
          cache_config_id?: string
          category_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_cache_deductions_cache_config_id_fkey"
            columns: ["cache_config_id"]
            isOneToOne: false
            referencedRelation: "event_cache_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cache_deductions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cache_extras: {
        Row: {
          amount: number
          cache_config_id: string
          created_at: string
          description: string
          event_id: string
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          cache_config_id: string
          created_at?: string
          description: string
          event_id: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          cache_config_id?: string
          created_at?: string
          description?: string
          event_id?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_cache_extras_cache_config_id_fkey"
            columns: ["cache_config_id"]
            isOneToOne: false
            referencedRelation: "event_cache_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cache_extras_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cache_payments: {
        Row: {
          amount: number
          cache_config_id: string
          category_id: string | null
          created_at: string
          description: string
          event_id: string
          id: string
          notes: string | null
          sort_order: number
          supplier_id: string | null
          transaction_id: string | null
          updated_at: string
          withholding_transaction_id: string | null
        }
        Insert: {
          amount?: number
          cache_config_id: string
          category_id?: string | null
          created_at?: string
          description?: string
          event_id: string
          id?: string
          notes?: string | null
          sort_order?: number
          supplier_id?: string | null
          transaction_id?: string | null
          updated_at?: string
          withholding_transaction_id?: string | null
        }
        Update: {
          amount?: number
          cache_config_id?: string
          category_id?: string | null
          created_at?: string
          description?: string
          event_id?: string
          id?: string
          notes?: string | null
          sort_order?: number
          supplier_id?: string | null
          transaction_id?: string | null
          updated_at?: string
          withholding_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_cache_payments_cache_config_id_fkey"
            columns: ["cache_config_id"]
            isOneToOne: false
            referencedRelation: "event_cache_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cache_payments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cache_payments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cache_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cache_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cache_payments_withholding_transaction_id_fkey"
            columns: ["withholding_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cache_tiers: {
        Row: {
          cache_config_id: string
          created_at: string
          id: string
          occupancy_threshold: number
          percentage: number
          sort_order: number
        }
        Insert: {
          cache_config_id: string
          created_at?: string
          id?: string
          occupancy_threshold?: number
          percentage?: number
          sort_order?: number
        }
        Update: {
          cache_config_id?: string
          created_at?: string
          id?: string
          occupancy_threshold?: number
          percentage?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_cache_tiers_cache_config_id_fkey"
            columns: ["cache_config_id"]
            isOneToOne: false
            referencedRelation: "event_cache_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      event_closing_costs: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          description: string
          event_id: string
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category_id?: string | null
          created_at?: string
          description: string
          event_id: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          description?: string
          event_id?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_closing_costs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_closing_costs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_dates: {
        Row: {
          created_at: string
          date: string
          event_id: string
          id: string
          label: string | null
        }
        Insert: {
          created_at?: string
          date: string
          event_id: string
          id?: string
          label?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          event_id?: string
          id?: string
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_dates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_forecast_partners: {
        Row: {
          created_at: string
          forecast_id: string
          id: string
          partner_id: string
        }
        Insert: {
          created_at?: string
          forecast_id: string
          id?: string
          partner_id: string
        }
        Update: {
          created_at?: string
          forecast_id?: string
          id?: string
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_forecast_partners_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "event_forecasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_forecast_partners_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "event_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      event_forecasts: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          attachment_refs: Json
          cache_config_id: string | null
          category_id: string | null
          created_at: string
          currency: string
          description: string
          event_id: string
          exclude_from_result: boolean
          formula_type: string
          formula_value: number
          fx_rate: number | null
          fx_rate_source: string | null
          historic_overrides: Json
          id: string
          invoice_group_id: string | null
          is_overhead: boolean
          is_retroactive_override: boolean
          is_transitory: boolean
          iva_rate: number
          master_forecast_id: string | null
          notes: string | null
          original_amount: number | null
          specification: string | null
          status: string
          transaction_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          attachment_refs?: Json
          cache_config_id?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          description: string
          event_id: string
          exclude_from_result?: boolean
          formula_type?: string
          formula_value?: number
          fx_rate?: number | null
          fx_rate_source?: string | null
          historic_overrides?: Json
          id?: string
          invoice_group_id?: string | null
          is_overhead?: boolean
          is_retroactive_override?: boolean
          is_transitory?: boolean
          iva_rate?: number
          master_forecast_id?: string | null
          notes?: string | null
          original_amount?: number | null
          specification?: string | null
          status?: string
          transaction_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          attachment_refs?: Json
          cache_config_id?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string
          event_id?: string
          exclude_from_result?: boolean
          formula_type?: string
          formula_value?: number
          fx_rate?: number | null
          fx_rate_source?: string | null
          historic_overrides?: Json
          id?: string
          invoice_group_id?: string | null
          is_overhead?: boolean
          is_retroactive_override?: boolean
          is_transitory?: boolean
          iva_rate?: number
          master_forecast_id?: string | null
          notes?: string | null
          original_amount?: number | null
          specification?: string | null
          status?: string
          transaction_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_forecasts_cache_config_id_fkey"
            columns: ["cache_config_id"]
            isOneToOne: false
            referencedRelation: "event_cache_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_forecasts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_forecasts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_forecasts_master_forecast_id_fkey"
            columns: ["master_forecast_id"]
            isOneToOne: false
            referencedRelation: "event_forecasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_forecasts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      event_implementations: {
        Row: {
          created_at: string
          event_id: string | null
          event_structure: Json | null
          id: string
          import_instructions: string | null
          notes: string | null
          reference_file_name: string | null
          reference_file_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          event_structure?: Json | null
          id?: string
          import_instructions?: string | null
          notes?: string | null
          reference_file_name?: string | null
          reference_file_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          event_structure?: Json | null
          id?: string
          import_instructions?: string | null
          notes?: string | null
          reference_file_name?: string | null
          reference_file_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_implementations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_partner_extras: {
        Row: {
          amount: number
          created_at: string
          description: string
          event_id: string
          id: string
          notes: string | null
          partner_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          event_id: string
          id?: string
          notes?: string | null
          partner_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          event_id?: string
          id?: string
          notes?: string | null
          partner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_partner_extras_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_partner_extras_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "event_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      event_partners: {
        Row: {
          created_at: string
          event_id: string
          expense_includes_iva: boolean
          id: string
          loss_percentage: number | null
          notes: string | null
          percentage: number
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          expense_includes_iva?: boolean
          id?: string
          loss_percentage?: number | null
          notes?: string | null
          percentage?: number
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          expense_includes_iva?: boolean
          id?: string
          loss_percentage?: number | null
          notes?: string | null
          percentage?: number
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_partners_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_partners_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sessions: {
        Row: {
          created_at: string
          date: string
          event_id: string
          id: string
          label: string
          sort_order: number
          start_time: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          event_id: string
          id?: string
          label?: string
          sort_order?: number
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          event_id?: string
          id?: string
          label?: string
          sort_order?: number
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ticket_lots: {
        Row: {
          created_at: string
          id: string
          iva_rate: number
          lot_number: number
          lot_type: string
          name: string
          price: number
          quantity: number
          zone_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          iva_rate?: number
          lot_number?: number
          lot_type?: string
          name?: string
          price?: number
          quantity?: number
          zone_id: string
        }
        Update: {
          created_at?: string
          id?: string
          iva_rate?: number
          lot_number?: number
          lot_type?: string
          name?: string
          price?: number
          quantity?: number
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_ticket_lots_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "event_ticket_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ticket_office_advances: {
        Row: {
          advance_date: string
          amount: number
          created_at: string
          created_by: string
          event_id: string
          financial_account_id: string
          id: string
          notes: string | null
          settlement_id: string | null
          target_account_id: string | null
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          advance_date?: string
          amount?: number
          created_at?: string
          created_by?: string
          event_id: string
          financial_account_id: string
          id?: string
          notes?: string | null
          settlement_id?: string | null
          target_account_id?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          advance_date?: string
          amount?: number
          created_at?: string
          created_by?: string
          event_id?: string
          financial_account_id?: string
          id?: string
          notes?: string | null
          settlement_id?: string | null
          target_account_id?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      event_ticket_office_assignments: {
        Row: {
          commission_notes: string | null
          commission_type: string
          conciliated_at: string | null
          conciliated_by: string | null
          created_at: string
          event_date_id: string | null
          event_id: string
          financial_account_id: string
          id: string
          is_conciliated: boolean
          updated_at: string
        }
        Insert: {
          commission_notes?: string | null
          commission_type?: string
          conciliated_at?: string | null
          conciliated_by?: string | null
          created_at?: string
          event_date_id?: string | null
          event_id: string
          financial_account_id: string
          id?: string
          is_conciliated?: boolean
          updated_at?: string
        }
        Update: {
          commission_notes?: string | null
          commission_type?: string
          conciliated_at?: string | null
          conciliated_by?: string | null
          created_at?: string
          event_date_id?: string | null
          event_id?: string
          financial_account_id?: string
          id?: string
          is_conciliated?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_ticket_office_assignments_event_date_id_fkey"
            columns: ["event_date_id"]
            isOneToOne: false
            referencedRelation: "event_dates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ticket_office_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ticket_office_assignments_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ticket_zones: {
        Row: {
          created_at: string
          event_id: string
          id: string
          name: string
          session_id: string | null
          total_capacity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          name: string
          session_id?: string | null
          total_capacity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          session_id?: string | null
          total_capacity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_ticket_zones_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ticket_zones_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          budget: number
          city_id: string | null
          created_at: string
          date: string
          event_type: string
          id: string
          last_sales_date: string | null
          location: string | null
          name: string
          parent_event_id: string | null
          partner_calc_basis: string
          pl_mode: string
          status: string
          tickets_sold: number
          tickets_total: number
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          budget?: number
          city_id?: string | null
          created_at?: string
          date: string
          event_type?: string
          id?: string
          last_sales_date?: string | null
          location?: string | null
          name: string
          parent_event_id?: string | null
          partner_calc_basis?: string
          pl_mode?: string
          status?: string
          tickets_sold?: number
          tickets_total?: number
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          budget?: number
          city_id?: string | null
          created_at?: string
          date?: string
          event_type?: string
          id?: string
          last_sales_date?: string | null
          location?: string | null
          name?: string
          parent_event_id?: string | null
          partner_calc_basis?: string
          pl_mode?: string
          status?: string
          tickets_sold?: number
          tickets_total?: number
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_account_access: {
        Row: {
          account_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_account_access_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_accounts: {
        Row: {
          balance_visible_to_all: boolean
          card_number: string | null
          contact_name: string | null
          created_at: string
          description: string | null
          email_contact: string | null
          iban: string | null
          id: string
          initial_balance: number
          is_active: boolean
          name: string
          phone: string | null
          skip_balance_check: boolean
          type: string
          updated_at: string
          withholds_revenue: boolean
        }
        Insert: {
          balance_visible_to_all?: boolean
          card_number?: string | null
          contact_name?: string | null
          created_at?: string
          description?: string | null
          email_contact?: string | null
          iban?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean
          name: string
          phone?: string | null
          skip_balance_check?: boolean
          type?: string
          updated_at?: string
          withholds_revenue?: boolean
        }
        Update: {
          balance_visible_to_all?: boolean
          card_number?: string | null
          contact_name?: string | null
          created_at?: string
          description?: string | null
          email_contact?: string | null
          iban?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean
          name?: string
          phone?: string | null
          skip_balance_check?: boolean
          type?: string
          updated_at?: string
          withholds_revenue?: boolean
        }
        Relationships: []
      }
      forecast_audit_log: {
        Row: {
          changed_by: string
          created_at: string
          field_name: string
          forecast_id: string
          id: string
          new_value: string | null
          observation: string | null
          old_value: string | null
        }
        Insert: {
          changed_by?: string
          created_at?: string
          field_name: string
          forecast_id: string
          id?: string
          new_value?: string | null
          observation?: string | null
          old_value?: string | null
        }
        Update: {
          changed_by?: string
          created_at?: string
          field_name?: string
          forecast_id?: string
          id?: string
          new_value?: string | null
          observation?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forecast_audit_log_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "event_forecasts"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempted_at: string
          email: string
          id: string
          ip_address: string | null
          success: boolean
        }
        Insert: {
          attempted_at?: string
          email: string
          id?: string
          ip_address?: string | null
          success?: boolean
        }
        Update: {
          attempted_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          success?: boolean
        }
        Relationships: []
      }
      partner_advance_expenses: {
        Row: {
          created_at: string
          event_id: string
          id: string
          notes: string | null
          partner_id: string
          transaction_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          notes?: string | null
          partner_id: string
          transaction_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          notes?: string | null
          partner_id?: string
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_advance_expenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_advance_expenses_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "event_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_advance_expenses_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_event_access: {
        Row: {
          created_at: string
          event_id: string
          granted_by: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          granted_by?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          granted_by?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_event_access_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_paid_expenses: {
        Row: {
          created_at: string
          event_id: string
          id: string
          notes: string | null
          paid_date: string | null
          partner_id: string
          transaction_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          partner_id: string
          transaction_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          partner_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_paid_expenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_paid_expenses_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "event_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_paid_expenses_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_list_items: {
        Row: {
          created_at: string
          id: string
          manually_marked_paid: boolean
          payment_list_id: string
          transaction_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          manually_marked_paid?: boolean
          payment_list_id: string
          transaction_id: string
        }
        Update: {
          created_at?: string
          id?: string
          manually_marked_paid?: boolean
          payment_list_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_list_items_payment_list_id_fkey"
            columns: ["payment_list_id"]
            isOneToOne: false
            referencedRelation: "payment_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_list_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_lists: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          id: string
          notes: string | null
          payment_date: string
          revision_notes: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          payment_date?: string
          revision_notes?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          payment_date?: string
          revision_notes?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quotations: {
        Row: {
          amount: number
          created_at: string
          description: string
          event_id: string
          id: string
          iva_rate: number
          notes: string | null
          status: string
          supplier_id: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          event_id: string
          id?: string
          iva_rate?: number
          notes?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          event_id?: string
          id?: string
          iva_rate?: number
          notes?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_transactions: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          created_by: string
          day_of_month: number
          description: string
          end_date: string | null
          event_id: string | null
          frequency: string
          id: string
          is_active: boolean
          iva_rate: number
          last_generated_at: string | null
          next_due_date: string | null
          specification: string | null
          start_date: string
          supplier_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category_id?: string | null
          created_at?: string
          created_by?: string
          day_of_month?: number
          description: string
          end_date?: string | null
          event_id?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          iva_rate?: number
          last_generated_at?: string | null
          next_due_date?: string | null
          specification?: string | null
          start_date?: string
          supplier_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string
          day_of_month?: number
          description?: string
          end_date?: string | null
          event_id?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          iva_rate?: number
          last_generated_at?: string | null
          next_due_date?: string | null
          specification?: string | null
          start_date?: string
          supplier_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      reimbursement_note_items: {
        Row: {
          created_at: string
          id: string
          reimbursement_note_id: string
          transaction_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reimbursement_note_id: string
          transaction_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reimbursement_note_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reimbursement_note_items_reimbursement_note_id_fkey"
            columns: ["reimbursement_note_id"]
            isOneToOne: false
            referencedRelation: "reimbursement_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_note_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      reimbursement_notes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          code: string
          created_at: string
          created_by: string
          employee_name: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_transaction_id: string | null
          status: string
          supplier_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          code: string
          created_at?: string
          created_by?: string
          employee_name: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_transaction_id?: string | null
          status?: string
          supplier_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          code?: string
          created_at?: string
          created_by?: string
          employee_name?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_transaction_id?: string | null
          status?: string
          supplier_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reimbursement_notes_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_notes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      supplier_credit_usages: {
        Row: {
          amount: number
          created_at: string
          credit_id: string
          id: string
          notes: string | null
          transaction_id: string
          used_by: string
        }
        Insert: {
          amount?: number
          created_at?: string
          credit_id: string
          id?: string
          notes?: string | null
          transaction_id: string
          used_by?: string
        }
        Update: {
          amount?: number
          created_at?: string
          credit_id?: string
          id?: string
          notes?: string | null
          transaction_id?: string
          used_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_credit_usages_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "supplier_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credit_usages_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_credits: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          document_ref: string | null
          file_url: string | null
          id: string
          notes: string | null
          origin_event_id: string | null
          reason: string
          status: string
          supplier_id: string
          updated_at: string
          used_amount: number
          valid_until: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string
          document_ref?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          origin_event_id?: string | null
          reason?: string
          status?: string
          supplier_id: string
          updated_at?: string
          used_amount?: number
          valid_until?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          document_ref?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          origin_event_id?: string | null
          reason?: string
          status?: string
          supplier_id?: string
          updated_at?: string
          used_amount?: number
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_credits_origin_event_id_fkey"
            columns: ["origin_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credits_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_documents: {
        Row: {
          doc_type: string
          file_url: string
          id: string
          name: string
          supplier_id: string
          uploaded_at: string
        }
        Insert: {
          doc_type?: string
          file_url: string
          id?: string
          name: string
          supplier_id: string
          uploaded_at?: string
        }
        Update: {
          doc_type?: string
          file_url?: string
          id?: string
          name?: string
          supplier_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          category: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          iban: string | null
          iban_2: string | null
          iban_3: string | null
          id: string
          is_active: boolean
          is_partner: boolean
          name: string
          nif: string | null
          notes: string | null
          payment_terms: string | null
          phone: string | null
          swift_bic: string | null
          swift_bic_2: string | null
          swift_bic_3: string | null
          trade_name: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          iban?: string | null
          iban_2?: string | null
          iban_3?: string | null
          id?: string
          is_active?: boolean
          is_partner?: boolean
          name: string
          nif?: string | null
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          swift_bic?: string | null
          swift_bic_2?: string | null
          swift_bic_3?: string | null
          trade_name?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          iban?: string | null
          iban_2?: string | null
          iban_3?: string | null
          id?: string
          is_active?: boolean
          is_partner?: boolean
          name?: string
          nif?: string | null
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          swift_bic?: string | null
          swift_bic_2?: string | null
          swift_bic_3?: string | null
          trade_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_audit_log: {
        Row: {
          action: string
          changed_by: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          new_data: Json | null
          old_data: Json | null
        }
        Insert: {
          action: string
          changed_by?: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
        }
        Update: {
          action?: string
          changed_by?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
        }
        Relationships: []
      }
      ticket_import_logs: {
        Row: {
          created_at: string
          event_id: string | null
          file_name: string | null
          financial_account_id: string | null
          id: string
          import_type: string
          imported_by: string
          lots_created: number
          period_from: string
          period_to: string
          report_url: string | null
          rows_imported: number
          rows_skipped: number
          zones_created: number
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          file_name?: string | null
          financial_account_id?: string | null
          id?: string
          import_type?: string
          imported_by?: string
          lots_created?: number
          period_from: string
          period_to: string
          report_url?: string | null
          rows_imported?: number
          rows_skipped?: number
          zones_created?: number
        }
        Update: {
          created_at?: string
          event_id?: string | null
          file_name?: string | null
          financial_account_id?: string | null
          id?: string
          import_type?: string
          imported_by?: string
          lots_created?: number
          period_from?: string
          period_to?: string
          report_url?: string | null
          rows_imported?: number
          rows_skipped?: number
          zones_created?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_import_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_import_logs_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_office_settlements: {
        Row: {
          adjustment_notes: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string
          document_name: string | null
          document_url: string | null
          event_id: string
          financial_account_id: string
          gross_revenue: number
          id: string
          net_adjusted: number | null
          net_calculated: number
          net_transferred: number
          notes: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          settlement_date: string
          status: string
          total_deductions: number
          transfer_account_id: string | null
          transfer_transaction_id: string | null
          updated_at: string
          venue_invoice_remainder_amount: number
          venue_invoice_remainder_paid: boolean
          venue_invoice_remainder_payment_id: string | null
          venue_retained_amount: number
          venue_retained_invoice_id: string | null
          venue_retained_notes: string | null
          venue_retained_payment_id: string | null
        }
        Insert: {
          adjustment_notes?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string
          document_name?: string | null
          document_url?: string | null
          event_id: string
          financial_account_id: string
          gross_revenue?: number
          id?: string
          net_adjusted?: number | null
          net_calculated?: number
          net_transferred?: number
          notes?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          settlement_date?: string
          status?: string
          total_deductions?: number
          transfer_account_id?: string | null
          transfer_transaction_id?: string | null
          updated_at?: string
          venue_invoice_remainder_amount?: number
          venue_invoice_remainder_paid?: boolean
          venue_invoice_remainder_payment_id?: string | null
          venue_retained_amount?: number
          venue_retained_invoice_id?: string | null
          venue_retained_notes?: string | null
          venue_retained_payment_id?: string | null
        }
        Update: {
          adjustment_notes?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string
          document_name?: string | null
          document_url?: string | null
          event_id?: string
          financial_account_id?: string
          gross_revenue?: number
          id?: string
          net_adjusted?: number | null
          net_calculated?: number
          net_transferred?: number
          notes?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          settlement_date?: string
          status?: string
          total_deductions?: number
          transfer_account_id?: string | null
          transfer_transaction_id?: string | null
          updated_at?: string
          venue_invoice_remainder_amount?: number
          venue_invoice_remainder_paid?: boolean
          venue_invoice_remainder_payment_id?: string | null
          venue_retained_amount?: number
          venue_retained_invoice_id?: string | null
          venue_retained_notes?: string | null
          venue_retained_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_office_settlements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_office_settlements_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_office_settlements_transfer_account_id_fkey"
            columns: ["transfer_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_office_settlements_transfer_transaction_id_fkey"
            columns: ["transfer_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_office_settlements_venue_retained_invoice_id_fkey"
            columns: ["venue_retained_invoice_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_office_settlements_venue_retained_payment_id_fkey"
            columns: ["venue_retained_payment_id"]
            isOneToOne: false
            referencedRelation: "transaction_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_sales: {
        Row: {
          created_at: string
          created_by: string
          financial_account_id: string | null
          id: string
          import_batch_id: string | null
          lot_id: string | null
          notes: string | null
          quantity: number
          sale_date: string
          sale_date_to: string | null
          source: string
          total_value: number | null
          unit_price: number
          zone_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          financial_account_id?: string | null
          id?: string
          import_batch_id?: string | null
          lot_id?: string | null
          notes?: string | null
          quantity?: number
          sale_date?: string
          sale_date_to?: string | null
          source?: string
          total_value?: number | null
          unit_price?: number
          zone_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          financial_account_id?: string | null
          id?: string
          import_batch_id?: string | null
          lot_id?: string | null
          notes?: string | null
          quantity?: number
          sale_date?: string
          sale_date_to?: string | null
          source?: string
          total_value?: number | null
          unit_price?: number
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_sales_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_sales_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "event_ticket_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_sales_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "event_ticket_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_audit_log: {
        Row: {
          changed_at: string
          changed_by: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          transaction_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          transaction_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_audit_log_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_documents: {
        Row: {
          doc_type: string
          file_url: string
          id: string
          is_accounting: boolean
          name: string
          transaction_id: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          doc_type?: string
          file_url: string
          id?: string
          is_accounting?: boolean
          name: string
          transaction_id: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Update: {
          doc_type?: string
          file_url?: string
          id?: string
          is_accounting?: boolean
          name?: string
          transaction_id?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_payments: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          created_by: string
          credit_amount: number
          id: string
          invoice_ref: string | null
          notes: string | null
          payment_date: string
          payment_entity: string | null
          payment_method: string
          payment_reference: string | null
          transaction_id: string
          updated_at: string
          withholding_amount: number
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          created_by?: string
          credit_amount?: number
          id?: string
          invoice_ref?: string | null
          notes?: string | null
          payment_date: string
          payment_entity?: string | null
          payment_method?: string
          payment_reference?: string | null
          transaction_id: string
          updated_at?: string
          withholding_amount?: number
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          created_by?: string
          credit_amount?: number
          id?: string
          invoice_ref?: string | null
          notes?: string | null
          payment_date?: string
          payment_entity?: string | null
          payment_method?: string
          payment_reference?: string | null
          transaction_id?: string
          updated_at?: string
          withholding_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "transaction_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          date: string
          description: string
          due_date: string | null
          event_id: string | null
          exclude_from_result: boolean
          fx_rate: number | null
          fx_rate_source: string | null
          id: string
          invoice_group_id: string | null
          invoice_ref: string | null
          is_hidden: boolean
          is_reimbursement: boolean
          is_transitory: boolean
          iva_rate: number
          original_amount: number | null
          paid_amount: number
          parent_transaction_id: string | null
          payment_date: string | null
          payment_entity: string | null
          payment_method: string
          payment_reference: string | null
          pl_override_note: string | null
          reimbursement_to: string | null
          settlement_id: string | null
          specification: string | null
          split_amount: number | null
          split_mode: string | null
          split_percentage: number | null
          status: string
          supplier_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category_id?: string | null
          created_at?: string
          currency?: string
          date: string
          description: string
          due_date?: string | null
          event_id?: string | null
          exclude_from_result?: boolean
          fx_rate?: number | null
          fx_rate_source?: string | null
          id?: string
          invoice_group_id?: string | null
          invoice_ref?: string | null
          is_hidden?: boolean
          is_reimbursement?: boolean
          is_transitory?: boolean
          iva_rate?: number
          original_amount?: number | null
          paid_amount?: number
          parent_transaction_id?: string | null
          payment_date?: string | null
          payment_entity?: string | null
          payment_method?: string
          payment_reference?: string | null
          pl_override_note?: string | null
          reimbursement_to?: string | null
          settlement_id?: string | null
          specification?: string | null
          split_amount?: number | null
          split_mode?: string | null
          split_percentage?: number | null
          status?: string
          supplier_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          date?: string
          description?: string
          due_date?: string | null
          event_id?: string | null
          exclude_from_result?: boolean
          fx_rate?: number | null
          fx_rate_source?: string | null
          id?: string
          invoice_group_id?: string | null
          invoice_ref?: string | null
          is_hidden?: boolean
          is_reimbursement?: boolean
          is_transitory?: boolean
          iva_rate?: number
          original_amount?: number | null
          paid_amount?: number
          parent_transaction_id?: string | null
          payment_date?: string | null
          payment_entity?: string | null
          payment_method?: string
          payment_reference?: string | null
          pl_override_note?: string | null
          reimbursement_to?: string | null
          settlement_id?: string | null
          specification?: string | null
          split_amount?: number | null
          split_mode?: string | null
          split_percentage?: number | null
          status?: string
          supplier_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_transaction_id_fkey"
            columns: ["parent_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "ticket_office_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      trash: {
        Row: {
          deleted_at: string
          deleted_by: string
          entity_data: Json
          entity_id: string
          entity_type: string
          expires_at: string
          id: string
          related_data: Json | null
          restored_at: string | null
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string
          entity_data?: Json
          entity_id: string
          entity_type: string
          expires_at?: string
          id?: string
          related_data?: Json | null
          restored_at?: string | null
        }
        Update: {
          deleted_at?: string
          deleted_by?: string
          entity_data?: Json
          entity_id?: string
          entity_type?: string
          expires_at?: string
          id?: string
          related_data?: Json | null
          restored_at?: string | null
        }
        Relationships: []
      }
      undo_actions: {
        Row: {
          action_type: string
          description: string | null
          entity_id: string | null
          entity_type: string
          expires_at: string
          id: string
          payload: Json
          performed_at: string
          performed_by: string
          performed_by_name: string | null
          revert_reason: string | null
          reverted_at: string | null
          reverted_by: string | null
          reverted_by_name: string | null
        }
        Insert: {
          action_type: string
          description?: string | null
          entity_id?: string | null
          entity_type: string
          expires_at?: string
          id?: string
          payload?: Json
          performed_at?: string
          performed_by: string
          performed_by_name?: string | null
          revert_reason?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          reverted_by_name?: string | null
        }
        Update: {
          action_type?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string
          expires_at?: string
          id?: string
          payload?: Json
          performed_at?: string
          performed_by?: string
          performed_by_name?: string | null
          revert_reason?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          reverted_by_name?: string | null
        }
        Relationships: []
      }
      user_activity_log: {
        Row: {
          created_at: string
          id: string
          page: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          page: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          page?: string
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          created_at: string
          granted: boolean
          id: string
          permission: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          id?: string
          permission: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: string
          permission?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venue_reservations: {
        Row: {
          city_id: string | null
          created_at: string
          date: string
          id: string
          notes: string | null
          venue_id: string
        }
        Insert: {
          city_id?: string | null
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          venue_id: string
        }
        Update: {
          city_id?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_reservations_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_reservations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          capacity: number | null
          city_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          city_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          address?: string | null
          capacity?: number | null
          city_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _revert_event_to_version: {
        Args: {
          _event_id: string
          _force: boolean
          _performed_by: string
          _performed_by_label: string
          _target_version_id: string
        }
        Returns: undefined
      }
      archive_bp_version: {
        Args: {
          _performed_by?: string
          _performed_by_label?: string
          _version_id: string
        }
        Returns: undefined
      }
      bp_version_linked_tx_count: {
        Args: { _event_id: string }
        Returns: number
      }
      create_bp_snapshot: {
        Args: {
          _approve_immediately?: boolean
          _created_by?: string
          _created_by_label?: string
          _description?: string
          _event_id: string
          _is_pinned_scenario?: boolean
          _scenario_assumptions?: Json
          _scenario_label?: string
        }
        Returns: string
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      discard_bp_version_draft: {
        Args: {
          _performed_by?: string
          _performed_by_label?: string
          _version_id: string
        }
        Returns: undefined
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_partner_access: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_bp_versions: {
        Args: { _event_id: string }
        Returns: {
          approved_at: string
          archived_at: string
          cascaded_from_version_id: string
          created_at: string
          created_by: string
          created_by_label: string
          description: string
          forecast_count: number
          id: string
          is_pinned_scenario: boolean
          is_retroactive_snapshot: boolean
          scenario_label: string
          state: string
          superseded_at: string
          version_number: number
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      promote_scenario_to_active: {
        Args: {
          _description?: string
          _performed_by?: string
          _performed_by_label?: string
          _scenario_version_id: string
        }
        Returns: string
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reconcile_bp_overrides_for_event: {
        Args: {
          _event_id: string
          _performed_by?: string
          _performed_by_label?: string
          _trigger_version_id: string
          _trigger_version_number: number
        }
        Returns: undefined
      }
      revert_to_bp_version: {
        Args: {
          _force?: boolean
          _performed_by?: string
          _performed_by_label?: string
          _version_id: string
        }
        Returns: string
      }
      unarchive_bp_version: {
        Args: {
          _performed_by?: string
          _performed_by_label?: string
          _version_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user" | "manager" | "editor" | "viewer" | "partner"
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
    Enums: {
      app_role: ["admin", "user", "manager", "editor", "viewer", "partner"],
    },
  },
} as const
