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
          allocate_to_active_event: boolean
          code: string
          company_id: string
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
          allocate_to_active_event?: boolean
          code: string
          company_id?: string
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
          allocate_to_active_event?: boolean
          code?: string
          company_id?: string
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
            foreignKeyName: "account_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
        Relationships: [
          {
            foreignKeyName: "accounting_exports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      app_secrets: {
        Row: {
          created_at: string
          description: string | null
          name: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          name: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          name?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      audience_members: {
        Row: {
          added_at: string
          company_id: string
          contact_id: string
          snapshot_id: string
        }
        Insert: {
          added_at?: string
          company_id?: string
          contact_id: string
          snapshot_id: string
        }
        Update: {
          added_at?: string
          company_id?: string
          contact_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audience_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_members_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "audience_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      audience_snapshots: {
        Row: {
          audience_id: string
          captured_at: string
          company_id: string
          created_at: string
          exported_at: string | null
          exported_by: string | null
          id: string
          member_count: number
          notes: string | null
        }
        Insert: {
          audience_id: string
          captured_at?: string
          company_id?: string
          created_at?: string
          exported_at?: string | null
          exported_by?: string | null
          id?: string
          member_count?: number
          notes?: string | null
        }
        Update: {
          audience_id?: string
          captured_at?: string
          company_id?: string
          created_at?: string
          exported_at?: string | null
          exported_by?: string | null
          id?: string
          member_count?: number
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audience_snapshots_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "audiences"
            referencedColumns: ["id"]
          },
        ]
      }
      audiences: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          criterion: Json
          description: string | null
          id: string
          last_preview_count: number | null
          last_previewed_at: string | null
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          criterion?: Json
          description?: string | null
          id?: string
          last_preview_count?: number | null
          last_previewed_at?: string | null
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          criterion?: Json
          description?: string | null
          id?: string
          last_preview_count?: number | null
          last_previewed_at?: string | null
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author_id: string | null
          company_id: string
          content_en: string
          content_pt: string
          cover_image: string | null
          created_at: string
          excerpt_en: string | null
          excerpt_pt: string | null
          id: string
          portal_visible: boolean
          published: boolean
          published_at: string | null
          slug: string
          title_en: string
          title_pt: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          company_id: string
          content_en?: string
          content_pt?: string
          cover_image?: string | null
          created_at?: string
          excerpt_en?: string | null
          excerpt_pt?: string | null
          id?: string
          portal_visible?: boolean
          published?: boolean
          published_at?: string | null
          slug: string
          title_en: string
          title_pt: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          company_id?: string
          content_en?: string
          content_pt?: string
          cover_image?: string | null
          created_at?: string
          excerpt_en?: string | null
          excerpt_pt?: string | null
          id?: string
          portal_visible?: boolean
          published?: boolean
          published_at?: string | null
          slug?: string
          title_en?: string
          title_pt?: string
          updated_at?: string
        }
        Relationships: []
      }
      bp_orphan_attachments: {
        Row: {
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "bp_orphan_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_orphan_attachments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      bp_tx_reconciliation_ignored: {
        Row: {
          company_id: string
          id: string
          ignored_at: string
          ignored_by: string | null
          reason: string | null
          transaction_id: string
        }
        Insert: {
          company_id: string
          id?: string
          ignored_at?: string
          ignored_by?: string | null
          reason?: string | null
          transaction_id: string
        }
        Update: {
          company_id?: string
          id?: string
          ignored_at?: string
          ignored_by?: string | null
          reason?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bp_tx_reconciliation_ignored_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bp_tx_reconciliation_ignored_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      bp_version_audit_log: {
        Row: {
          action: string
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "bp_version_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "bp_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "camarim_fund_moves_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          integration_type: string
          session_id: string
          status: string
          summary_payload: Json | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          integration_type: string
          session_id: string
          status?: string
          summary_payload?: Json | null
        }
        Update: {
          company_id?: string
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
            foreignKeyName: "camarim_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "camarim_item_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "camarim_item_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          analytic_tag: string | null
          approved_without_document: boolean
          approved_without_document_reason: string | null
          base_amount: number
          bp_forecast_id: string | null
          bp_scope: string
          buyer_profile_id: string | null
          category_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          document_date: string | null
          document_issue_reason: string | null
          document_number: string | null
          document_type: string
          event_id: string | null
          financial_account_id: string | null
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
          analytic_tag?: string | null
          approved_without_document?: boolean
          approved_without_document_reason?: string | null
          base_amount?: number
          bp_forecast_id?: string | null
          bp_scope?: string
          buyer_profile_id?: string | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          document_date?: string | null
          document_issue_reason?: string | null
          document_number?: string | null
          document_type?: string
          event_id?: string | null
          financial_account_id?: string | null
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
          analytic_tag?: string | null
          approved_without_document?: boolean
          approved_without_document_reason?: string | null
          base_amount?: number
          bp_forecast_id?: string | null
          bp_scope?: string
          buyer_profile_id?: string | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          document_date?: string | null
          document_issue_reason?: string | null
          document_number?: string | null
          document_type?: string
          event_id?: string | null
          financial_account_id?: string | null
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
            foreignKeyName: "camarim_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
            foreignKeyName: "camarim_items_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
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
          company_id: string
          created_at: string
          event_id: string
          id: string
          is_primary: boolean
          session_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          event_id: string
          id?: string
          is_primary?: boolean
          session_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          event_id?: string
          id?: string
          is_primary?: boolean
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "camarim_session_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          integrated_at: string | null
          integration_summary: Json | null
          integration_transaction_ids: string[]
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
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          integrated_at?: string | null
          integration_summary?: Json | null
          integration_transaction_ids?: string[]
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
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          integrated_at?: string | null
          integration_summary?: Json | null
          integration_transaction_ids?: string[]
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
            foreignKeyName: "camarim_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          state: string | null
        }
        Insert: {
          country?: string
          created_at?: string
          id?: string
          name: string
          state?: string | null
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          name?: string
          state?: string | null
        }
        Relationships: []
      }
      coala_ai_classification_suggestions: {
        Row: {
          ai_response_raw: Json
          applied_at: string | null
          applied_auto: boolean
          applied_by: string | null
          bp_l2_filter_applied: boolean | null
          company_id: string
          created_at: string
          id: string
          requested_at: string
          requested_by: string | null
          revoked_at: string | null
          revoked_by: string | null
          top_candidate_code: string | null
          top_candidate_id: string | null
          top_confidence: number | null
          transaction_id: string
        }
        Insert: {
          ai_response_raw: Json
          applied_at?: string | null
          applied_auto?: boolean
          applied_by?: string | null
          bp_l2_filter_applied?: boolean | null
          company_id: string
          created_at?: string
          id?: string
          requested_at?: string
          requested_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          top_candidate_code?: string | null
          top_candidate_id?: string | null
          top_confidence?: number | null
          transaction_id: string
        }
        Update: {
          ai_response_raw?: Json
          applied_at?: string | null
          applied_auto?: boolean
          applied_by?: string | null
          bp_l2_filter_applied?: boolean | null
          company_id?: string
          created_at?: string
          id?: string
          requested_at?: string
          requested_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          top_candidate_code?: string | null
          top_candidate_id?: string | null
          top_confidence?: number | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coala_ai_classification_suggestions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coala_ai_classification_suggestions_top_candidate_id_fkey"
            columns: ["top_candidate_id"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coala_ai_classification_suggestions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      coala_import_runs: {
        Row: {
          applied_at: string | null
          bp_version_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          created_forecast_ids: string[]
          created_supplier_ids: string[]
          created_transaction_ids: string[]
          event_id: string
          file_name: string | null
          file_version: string
          id: string
          import_batch_id: string
          pendencies_report: Json
          rolled_back_at: string | null
          status: string
          totals: Json
          updated_at: string
          validation_report: Json
        }
        Insert: {
          applied_at?: string | null
          bp_version_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          created_forecast_ids?: string[]
          created_supplier_ids?: string[]
          created_transaction_ids?: string[]
          event_id: string
          file_name?: string | null
          file_version: string
          id?: string
          import_batch_id?: string
          pendencies_report?: Json
          rolled_back_at?: string | null
          status?: string
          totals?: Json
          updated_at?: string
          validation_report?: Json
        }
        Update: {
          applied_at?: string | null
          bp_version_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          created_forecast_ids?: string[]
          created_supplier_ids?: string[]
          created_transaction_ids?: string[]
          event_id?: string
          file_name?: string | null
          file_version?: string
          id?: string
          import_batch_id?: string
          pendencies_report?: Json
          rolled_back_at?: string | null
          status?: string
          totals?: Json
          updated_at?: string
          validation_report?: Json
        }
        Relationships: [
          {
            foreignKeyName: "coala_import_runs_bp_version_id_fkey"
            columns: ["bp_version_id"]
            isOneToOne: false
            referencedRelation: "bp_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coala_import_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coala_import_runs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      coala_supplier_category_map: {
        Row: {
          category_id: string
          company_id: string
          confirmed_count: number
          created_at: string
          created_by: string | null
          description_normalized: string
          id: string
          last_used_at: string
          matched_via: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          company_id: string
          confirmed_count?: number
          created_at?: string
          created_by?: string | null
          description_normalized: string
          id?: string
          last_used_at?: string
          matched_via?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          company_id?: string
          confirmed_count?: number
          created_at?: string
          created_by?: string | null
          description_normalized?: string
          id?: string
          last_used_at?: string
          matched_via?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coala_supplier_category_map_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coala_supplier_category_map_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coala_supplier_category_map_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      coala_sync_config: {
        Row: {
          auto_apply_enabled: boolean
          company_id: string
          created_at: string
          created_by: string | null
          drive_file_id: string
          enabled: boolean
          event_id: string
          file_label: string | null
          id: string
          last_modified_time: string | null
          last_run_at: string | null
          last_run_status: string | null
          notify_whatsapp: boolean
          schedule_cron: string
          updated_at: string
        }
        Insert: {
          auto_apply_enabled?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          drive_file_id: string
          enabled?: boolean
          event_id: string
          file_label?: string | null
          id?: string
          last_modified_time?: string | null
          last_run_at?: string | null
          last_run_status?: string | null
          notify_whatsapp?: boolean
          schedule_cron?: string
          updated_at?: string
        }
        Update: {
          auto_apply_enabled?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          drive_file_id?: string
          enabled?: boolean
          event_id?: string
          file_label?: string | null
          id?: string
          last_modified_time?: string | null
          last_run_at?: string | null
          last_run_status?: string | null
          notify_whatsapp?: boolean
          schedule_cron?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coala_sync_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coala_sync_config_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      coala_sync_decisions: {
        Row: {
          company_id: string | null
          config_id: string
          custom_amount: number | null
          decided_at: string
          decided_by: string | null
          decision: string
          diff_kind: string
          id: string
          notes: string | null
          row_key: string
          run_id: string
        }
        Insert: {
          company_id?: string | null
          config_id: string
          custom_amount?: number | null
          decided_at?: string
          decided_by?: string | null
          decision: string
          diff_kind: string
          id?: string
          notes?: string | null
          row_key: string
          run_id: string
        }
        Update: {
          company_id?: string | null
          config_id?: string
          custom_amount?: number | null
          decided_at?: string
          decided_by?: string | null
          decision?: string
          diff_kind?: string
          id?: string
          notes?: string | null
          row_key?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coala_sync_decisions_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "coala_sync_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coala_sync_decisions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "coala_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      coala_sync_deletes: {
        Row: {
          config_id: string
          deleted_at: string
          id: string
          reason: string | null
          run_id: string | null
          snapshot: Json
          target_id: string
          target_table: string
        }
        Insert: {
          config_id: string
          deleted_at?: string
          id?: string
          reason?: string | null
          run_id?: string | null
          snapshot: Json
          target_id: string
          target_table: string
        }
        Update: {
          config_id?: string
          deleted_at?: string
          id?: string
          reason?: string | null
          run_id?: string | null
          snapshot?: Json
          target_id?: string
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "coala_sync_deletes_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "coala_sync_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coala_sync_deletes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "coala_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      coala_sync_row_state: {
        Row: {
          bootstrap_source: string | null
          center_custo_norm: string | null
          config_id: string
          created_at: string
          fallback_key: string | null
          forecast_id: string | null
          id: string
          identity_key: string | null
          invoice_ref_norm: string | null
          last_apply_hash: string | null
          last_seen_run_id: string | null
          last_xlsx_payload: Json
          legacy_key: string | null
          manual_override: boolean
          manual_override_reason: string | null
          needs_manual_link: boolean
          net_amount_cents: number | null
          row_key: string
          row_number: number | null
          supplier_norm: string | null
          updated_at: string
        }
        Insert: {
          bootstrap_source?: string | null
          center_custo_norm?: string | null
          config_id: string
          created_at?: string
          fallback_key?: string | null
          forecast_id?: string | null
          id?: string
          identity_key?: string | null
          invoice_ref_norm?: string | null
          last_apply_hash?: string | null
          last_seen_run_id?: string | null
          last_xlsx_payload: Json
          legacy_key?: string | null
          manual_override?: boolean
          manual_override_reason?: string | null
          needs_manual_link?: boolean
          net_amount_cents?: number | null
          row_key: string
          row_number?: number | null
          supplier_norm?: string | null
          updated_at?: string
        }
        Update: {
          bootstrap_source?: string | null
          center_custo_norm?: string | null
          config_id?: string
          created_at?: string
          fallback_key?: string | null
          forecast_id?: string | null
          id?: string
          identity_key?: string | null
          invoice_ref_norm?: string | null
          last_apply_hash?: string | null
          last_seen_run_id?: string | null
          last_xlsx_payload?: Json
          legacy_key?: string | null
          manual_override?: boolean
          manual_override_reason?: string | null
          needs_manual_link?: boolean
          net_amount_cents?: number | null
          row_key?: string
          row_number?: number | null
          supplier_norm?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coala_sync_row_state_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "coala_sync_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coala_sync_row_state_last_seen_run_id_fkey"
            columns: ["last_seen_run_id"]
            isOneToOne: false
            referencedRelation: "coala_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      coala_sync_runs: {
        Row: {
          company_id: string
          config_id: string | null
          conflict_count: number | null
          diff: Json | null
          error_message: string | null
          event_id: string
          file_version: string | null
          finished_at: string | null
          id: string
          mode: string
          new_count: number | null
          removed_count: number | null
          started_at: string
          status: string
          total_rows: number | null
          triggered_by: string
          triggered_user_id: string | null
          updated_count: number | null
          xlsx_sha256: string | null
          xlsx_size_bytes: number | null
        }
        Insert: {
          company_id: string
          config_id?: string | null
          conflict_count?: number | null
          diff?: Json | null
          error_message?: string | null
          event_id: string
          file_version?: string | null
          finished_at?: string | null
          id?: string
          mode: string
          new_count?: number | null
          removed_count?: number | null
          started_at?: string
          status: string
          total_rows?: number | null
          triggered_by: string
          triggered_user_id?: string | null
          updated_count?: number | null
          xlsx_sha256?: string | null
          xlsx_size_bytes?: number | null
        }
        Update: {
          company_id?: string
          config_id?: string | null
          conflict_count?: number | null
          diff?: Json | null
          error_message?: string | null
          event_id?: string
          file_version?: string | null
          finished_at?: string | null
          id?: string
          mode?: string
          new_count?: number | null
          removed_count?: number | null
          started_at?: string
          status?: string
          total_rows?: number | null
          triggered_by?: string
          triggered_user_id?: string | null
          updated_count?: number | null
          xlsx_sha256?: string | null
          xlsx_size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coala_sync_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coala_sync_runs_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "coala_sync_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coala_sync_runs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      coala_sync_value_changes: {
        Row: {
          changed_at: string
          config_id: string
          field: string
          id: string
          new_value: Json
          old_value: Json
          run_id: string | null
          target_id: string
          target_table: string
        }
        Insert: {
          changed_at?: string
          config_id: string
          field: string
          id?: string
          new_value: Json
          old_value: Json
          run_id?: string | null
          target_id: string
          target_table: string
        }
        Update: {
          changed_at?: string
          config_id?: string
          field?: string
          id?: string
          new_value?: Json
          old_value?: Json
          run_id?: string | null
          target_id?: string
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "coala_sync_value_changes_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "coala_sync_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coala_sync_value_changes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "coala_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_log: {
        Row: {
          body_preview: string | null
          campaign_id: string | null
          channel: string
          company_id: string
          contact_id: string | null
          created_at: string
          direction: string
          id: string
          metadata: Json | null
          occurred_at: string
          provider_message_id: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          body_preview?: string | null
          campaign_id?: string | null
          channel: string
          company_id?: string
          contact_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          provider_message_id?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          body_preview?: string | null
          campaign_id?: string | null
          channel?: string
          company_id?: string
          contact_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          metadata?: Json | null
          occurred_at?: string
          provider_message_id?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: Json | null
          contact_email: string | null
          country: string
          created_at: string
          currency: string
          display_name: string
          favicon_url: string | null
          feature_tickets_v2: boolean
          id: string
          legal_name: string
          logo_url: string | null
          slug: string
          status: string
          tax_id: string | null
          theme_config: Json | null
          tickets_config: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: Json | null
          contact_email?: string | null
          country?: string
          created_at?: string
          currency?: string
          display_name: string
          favicon_url?: string | null
          feature_tickets_v2?: boolean
          id?: string
          legal_name: string
          logo_url?: string | null
          slug: string
          status?: string
          tax_id?: string | null
          theme_config?: Json | null
          tickets_config?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: Json | null
          contact_email?: string | null
          country?: string
          created_at?: string
          currency?: string
          display_name?: string
          favicon_url?: string | null
          feature_tickets_v2?: boolean
          id?: string
          legal_name?: string
          logo_url?: string | null
          slug?: string
          status?: string
          tax_id?: string | null
          theme_config?: Json | null
          tickets_config?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_features: {
        Row: {
          company_id: string
          config: Json
          created_at: string
          enabled: boolean
          enabled_at: string | null
          enabled_by: string | null
          feature_key: string
          id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          config?: Json
          created_at?: string
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          feature_key: string
          id?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          feature_key?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_features_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          company_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          company_id?: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          status?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          company_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_id: string
          consent_email: boolean
          consent_email_at: string | null
          consent_whatsapp: boolean
          consent_whatsapp_at: string | null
          created_at: string
          email: string | null
          email_hash_sha256: string | null
          first_seen_at: string
          id: string
          is_active: boolean
          last_activity_at: string
          name: string | null
          phone_e164: string | null
          phone_hash_sha256: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          consent_email?: boolean
          consent_email_at?: string | null
          consent_whatsapp?: boolean
          consent_whatsapp_at?: string | null
          created_at?: string
          email?: string | null
          email_hash_sha256?: string | null
          first_seen_at?: string
          id?: string
          is_active?: boolean
          last_activity_at?: string
          name?: string | null
          phone_e164?: string | null
          phone_hash_sha256?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          consent_email?: boolean
          consent_email_at?: string | null
          consent_whatsapp?: boolean
          consent_whatsapp_at?: string | null
          created_at?: string
          email?: string | null
          email_hash_sha256?: string | null
          first_seen_at?: string
          id?: string
          is_active?: boolean
          last_activity_at?: string
          name?: string | null
          phone_e164?: string | null
          phone_hash_sha256?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      document_download_audit: {
        Row: {
          bucket: string | null
          company_id: string
          downloaded_at: string
          extra_metadata: Json
          file_name: string | null
          file_path: string | null
          id: string
          period_from: string | null
          period_to: string | null
          resource_id: string | null
          resource_type: string
          user_email: string
          user_id: string
          user_role: string
        }
        Insert: {
          bucket?: string | null
          company_id: string
          downloaded_at?: string
          extra_metadata?: Json
          file_name?: string | null
          file_path?: string | null
          id?: string
          period_from?: string | null
          period_to?: string | null
          resource_id?: string | null
          resource_type: string
          user_email: string
          user_id: string
          user_role: string
        }
        Update: {
          bucket?: string | null
          company_id?: string
          downloaded_at?: string
          extra_metadata?: Json
          file_name?: string | null
          file_path?: string | null
          id?: string
          period_from?: string | null
          period_to?: string | null
          resource_id?: string | null
          resource_type?: string
          user_email?: string
          user_id?: string
          user_role?: string
        }
        Relationships: []
      }
      email_campaigns: {
        Row: {
          audience_id: string | null
          body_md_en: string | null
          body_md_pt: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          preheader_en: string | null
          preheader_pt: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          subject_en: string | null
          subject_pt: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience_id?: string | null
          body_md_en?: string | null
          body_md_pt?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          preheader_en?: string | null
          preheader_pt?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject_en?: string | null
          subject_pt?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience_id?: string | null
          body_md_en?: string | null
          body_md_pt?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          preheader_en?: string | null
          preheader_pt?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject_en?: string | null
          subject_pt?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "audiences"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          company_id: string
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
          company_id?: string
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
          company_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_send_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          company_id: string
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          company_id?: string
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          company_id?: string
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_send_state_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_unsubscribe_tokens: {
        Row: {
          company_id: string
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_unsubscribe_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ab_config: {
        Row: {
          ab_mode_alimentos: string
          ab_mode_bebidas: string
          auto_sync_bp: boolean
          company_id: string | null
          created_at: string
          custo_fixo_alimentos: number
          event_id: string
          fee_alimentos: number
          id: string
          notes: string | null
          operador_nome_alimentos: string | null
          per_capita_alimentos: number
          per_capita_custo_alimentos: number
          repasse_alimentos_pct: number
          updated_at: string
        }
        Insert: {
          ab_mode_alimentos?: string
          ab_mode_bebidas?: string
          auto_sync_bp?: boolean
          company_id?: string | null
          created_at?: string
          custo_fixo_alimentos?: number
          event_id: string
          fee_alimentos?: number
          id?: string
          notes?: string | null
          operador_nome_alimentos?: string | null
          per_capita_alimentos?: number
          per_capita_custo_alimentos?: number
          repasse_alimentos_pct?: number
          updated_at?: string
        }
        Update: {
          ab_mode_alimentos?: string
          ab_mode_bebidas?: string
          auto_sync_bp?: boolean
          company_id?: string | null
          created_at?: string
          custo_fixo_alimentos?: number
          event_id?: string
          fee_alimentos?: number
          id?: string
          notes?: string | null
          operador_nome_alimentos?: string | null
          per_capita_alimentos?: number
          per_capita_custo_alimentos?: number
          repasse_alimentos_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_ab_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ab_config_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ab_zones: {
        Row: {
          company_id: string | null
          created_at: string
          custo_fixo_bebidas: number
          event_id: string
          id: string
          open_bar: boolean
          open_food: boolean
          operador_nome: string | null
          participants_manual: number | null
          per_capita_bebidas: number
          per_capita_custo_bebidas: number
          repasse_bebidas_pct: number
          sort_order: number
          source_ticket_zone_id: string | null
          updated_at: string
          zone_label: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          custo_fixo_bebidas?: number
          event_id: string
          id?: string
          open_bar?: boolean
          open_food?: boolean
          operador_nome?: string | null
          participants_manual?: number | null
          per_capita_bebidas?: number
          per_capita_custo_bebidas?: number
          repasse_bebidas_pct?: number
          sort_order?: number
          source_ticket_zone_id?: string | null
          updated_at?: string
          zone_label: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          custo_fixo_bebidas?: number
          event_id?: string
          id?: string
          open_bar?: boolean
          open_food?: boolean
          operador_nome?: string | null
          participants_manual?: number | null
          per_capita_bebidas?: number
          per_capita_custo_bebidas?: number
          repasse_bebidas_pct?: number
          sort_order?: number
          source_ticket_zone_id?: string | null
          updated_at?: string
          zone_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_ab_zones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ab_zones_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ab_zones_source_ticket_zone_id_fkey"
            columns: ["source_ticket_zone_id"]
            isOneToOne: false
            referencedRelation: "event_ticket_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cache_city_settlements: {
        Row: {
          adjusted_amount: number | null
          agreement_notes: string | null
          cache_config_id: string
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "event_cache_city_settlements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "event_cache_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
          created_at: string
          id: string
        }
        Insert: {
          cache_config_id: string
          category_id: string
          company_id?: string
          created_at?: string
          id?: string
        }
        Update: {
          cache_config_id?: string
          category_id?: string
          company_id?: string
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
          {
            foreignKeyName: "event_cache_deductions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cache_extras: {
        Row: {
          amount: number
          cache_config_id: string
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "event_cache_extras_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "event_cache_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          company_id: string
          created_at: string
          id: string
          occupancy_threshold: number
          percentage: number
          sort_order: number
        }
        Insert: {
          cache_config_id: string
          company_id?: string
          created_at?: string
          id?: string
          occupancy_threshold?: number
          percentage?: number
          sort_order?: number
        }
        Update: {
          cache_config_id?: string
          company_id?: string
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
          {
            foreignKeyName: "event_cache_tiers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cash_allocations: {
        Row: {
          allocation_date: string
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          from_event_id: string
          id: string
          reason: string | null
          status: string
          to_event_id: string
          updated_at: string
        }
        Insert: {
          allocation_date?: string
          amount: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          from_event_id: string
          id?: string
          reason?: string | null
          status?: string
          to_event_id: string
          updated_at?: string
        }
        Update: {
          allocation_date?: string
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          from_event_id?: string
          id?: string
          reason?: string | null
          status?: string
          to_event_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_cash_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cash_allocations_from_event_id_fkey"
            columns: ["from_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cash_allocations_to_event_id_fkey"
            columns: ["to_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_closing_costs: {
        Row: {
          amount: number
          category_id: string | null
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "event_closing_costs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      event_courtesies: {
        Row: {
          company_id: string
          created_at: string
          event_date_id: string
          event_id: string
          id: string
          notes: string | null
          quantity: number
          scenario: string
          updated_at: string
          zone_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          event_date_id: string
          event_id: string
          id?: string
          notes?: string | null
          quantity?: number
          scenario?: string
          updated_at?: string
          zone_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          event_date_id?: string
          event_id?: string
          id?: string
          notes?: string | null
          quantity?: number
          scenario?: string
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_courtesies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_courtesies_event_date_id_fkey"
            columns: ["event_date_id"]
            isOneToOne: false
            referencedRelation: "event_dates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_courtesies_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_courtesies_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "event_ticket_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      event_dates: {
        Row: {
          company_id: string
          created_at: string
          date: string
          event_id: string
          id: string
          label: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          date: string
          event_id: string
          id?: string
          label?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          event_id?: string
          id?: string
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_dates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_dates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_faqs: {
        Row: {
          answer_en: string | null
          answer_pt: string
          category: string | null
          company_id: string
          created_at: string
          display_order: number
          event_id: string
          id: string
          question_en: string | null
          question_pt: string
        }
        Insert: {
          answer_en?: string | null
          answer_pt: string
          category?: string | null
          company_id?: string
          created_at?: string
          display_order?: number
          event_id: string
          id?: string
          question_en?: string | null
          question_pt: string
        }
        Update: {
          answer_en?: string | null
          answer_pt?: string
          category?: string | null
          company_id?: string
          created_at?: string
          display_order?: number
          event_id?: string
          id?: string
          question_en?: string | null
          question_pt?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_faqs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_faqs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_forecast_attachments: {
        Row: {
          company_id: string
          created_at: string
          file_name: string
          forecast_id: string
          id: string
          mime_type: string | null
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          file_name: string
          forecast_id: string
          id?: string
          mime_type?: string | null
          size_bytes?: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          file_name?: string
          forecast_id?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_forecast_attachments_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "event_forecasts"
            referencedColumns: ["id"]
          },
        ]
      }
      event_forecast_formalidade_log: {
        Row: {
          auto_suggested: boolean
          changed_at: string
          changed_by: string | null
          changed_by_label: string | null
          company_id: string
          forecast_id: string
          from_state: Database["public"]["Enums"]["bp_formalidade"] | null
          id: string
          reason: string | null
          to_state: Database["public"]["Enums"]["bp_formalidade"]
        }
        Insert: {
          auto_suggested?: boolean
          changed_at?: string
          changed_by?: string | null
          changed_by_label?: string | null
          company_id?: string
          forecast_id: string
          from_state?: Database["public"]["Enums"]["bp_formalidade"] | null
          id?: string
          reason?: string | null
          to_state: Database["public"]["Enums"]["bp_formalidade"]
        }
        Update: {
          auto_suggested?: boolean
          changed_at?: string
          changed_by?: string | null
          changed_by_label?: string | null
          company_id?: string
          forecast_id?: string
          from_state?: Database["public"]["Enums"]["bp_formalidade"] | null
          id?: string
          reason?: string | null
          to_state?: Database["public"]["Enums"]["bp_formalidade"]
        }
        Relationships: [
          {
            foreignKeyName: "event_forecast_formalidade_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_forecast_formalidade_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_forecast_formalidade_log_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "event_forecasts"
            referencedColumns: ["id"]
          },
        ]
      }
      event_forecast_partners: {
        Row: {
          company_id: string
          created_at: string
          forecast_id: string
          id: string
          partner_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          forecast_id: string
          id?: string
          partner_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          forecast_id?: string
          id?: string
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_forecast_partners_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
          created_at: string
          currency: string
          description: string
          event_id: string
          exclude_from_result: boolean
          formalidade: Database["public"]["Enums"]["bp_formalidade"]
          formalidade_changed_at: string | null
          formalidade_changed_by: string | null
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
          version_id: string | null
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          attachment_refs?: Json
          cache_config_id?: string | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          description: string
          event_id: string
          exclude_from_result?: boolean
          formalidade?: Database["public"]["Enums"]["bp_formalidade"]
          formalidade_changed_at?: string | null
          formalidade_changed_by?: string | null
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
          version_id?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          attachment_refs?: Json
          cache_config_id?: string | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          description?: string
          event_id?: string
          exclude_from_result?: boolean
          formalidade?: Database["public"]["Enums"]["bp_formalidade"]
          formalidade_changed_at?: string | null
          formalidade_changed_by?: string | null
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
          version_id?: string | null
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
            foreignKeyName: "event_forecasts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
            foreignKeyName: "event_forecasts_formalidade_changed_by_fkey"
            columns: ["formalidade_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          {
            foreignKeyName: "event_forecasts_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "bp_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      event_implementations: {
        Row: {
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "event_implementations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_implementations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_lineups: {
        Row: {
          artist_bio_en: string | null
          artist_bio_pt: string | null
          artist_image_url: string | null
          artist_name: string
          company_id: string
          created_at: string
          display_order: number
          event_id: string
          id: string
          performance_date: string | null
          performance_time: string | null
          stage: string | null
          updated_at: string
        }
        Insert: {
          artist_bio_en?: string | null
          artist_bio_pt?: string | null
          artist_image_url?: string | null
          artist_name: string
          company_id?: string
          created_at?: string
          display_order?: number
          event_id: string
          id?: string
          performance_date?: string | null
          performance_time?: string | null
          stage?: string | null
          updated_at?: string
        }
        Update: {
          artist_bio_en?: string | null
          artist_bio_pt?: string | null
          artist_image_url?: string | null
          artist_name?: string
          company_id?: string
          created_at?: string
          display_order?: number
          event_id?: string
          id?: string
          performance_date?: string | null
          performance_time?: string | null
          stage?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_lineups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_lineups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_marketing: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          cta_primary_label_en: string | null
          cta_primary_label_pt: string | null
          description_long_en: string | null
          description_long_pt: string | null
          event_id: string
          gallery_urls: string[] | null
          hero_image_url: string | null
          hero_video_url: string | null
          hook_en: string | null
          hook_pt: string | null
          meta_description_en: string | null
          meta_description_pt: string | null
          music_embed_url: string | null
          offer_availability: string | null
          offer_currency: string | null
          offer_price_max: number | null
          offer_price_min: number | null
          og_image_url: string | null
          performer_name: string | null
          performer_url: string | null
          poster_vertical_url: string | null
          press_quote_en: string | null
          press_quote_pt: string | null
          press_quote_source: string | null
          published_at: string | null
          status: string
          ticket_experiences: Json | null
          updated_at: string
          updated_by: string | null
          urgency_message_en: string | null
          urgency_message_pt: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          cta_primary_label_en?: string | null
          cta_primary_label_pt?: string | null
          description_long_en?: string | null
          description_long_pt?: string | null
          event_id: string
          gallery_urls?: string[] | null
          hero_image_url?: string | null
          hero_video_url?: string | null
          hook_en?: string | null
          hook_pt?: string | null
          meta_description_en?: string | null
          meta_description_pt?: string | null
          music_embed_url?: string | null
          offer_availability?: string | null
          offer_currency?: string | null
          offer_price_max?: number | null
          offer_price_min?: number | null
          og_image_url?: string | null
          performer_name?: string | null
          performer_url?: string | null
          poster_vertical_url?: string | null
          press_quote_en?: string | null
          press_quote_pt?: string | null
          press_quote_source?: string | null
          published_at?: string | null
          status?: string
          ticket_experiences?: Json | null
          updated_at?: string
          updated_by?: string | null
          urgency_message_en?: string | null
          urgency_message_pt?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          cta_primary_label_en?: string | null
          cta_primary_label_pt?: string | null
          description_long_en?: string | null
          description_long_pt?: string | null
          event_id?: string
          gallery_urls?: string[] | null
          hero_image_url?: string | null
          hero_video_url?: string | null
          hook_en?: string | null
          hook_pt?: string | null
          meta_description_en?: string | null
          meta_description_pt?: string | null
          music_embed_url?: string | null
          offer_availability?: string | null
          offer_currency?: string | null
          offer_price_max?: number | null
          offer_price_min?: number | null
          og_image_url?: string | null
          performer_name?: string | null
          performer_url?: string | null
          poster_vertical_url?: string | null
          press_quote_en?: string | null
          press_quote_pt?: string | null
          press_quote_source?: string | null
          published_at?: string | null
          status?: string
          ticket_experiences?: Json | null
          updated_at?: string
          updated_by?: string | null
          urgency_message_en?: string | null
          urgency_message_pt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_marketing_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_partner_extras: {
        Row: {
          amount: number
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "event_partner_extras_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "event_partners_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
      event_portal_endorsements: {
        Row: {
          added_at: string
          added_by: string | null
          display_order: number
          event_id: string
          featured: boolean
          override_hero_image_url: string | null
          partner_label: string | null
          portal_company_id: string
          updated_at: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          display_order?: number
          event_id: string
          featured?: boolean
          override_hero_image_url?: string | null
          partner_label?: string | null
          portal_company_id: string
          updated_at?: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          display_order?: number
          event_id?: string
          featured?: boolean
          override_hero_image_url?: string | null
          partner_label?: string | null
          portal_company_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_portal_endorsements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_portal_endorsements_portal_company_id_fkey"
            columns: ["portal_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sessions: {
        Row: {
          company_id: string
          created_at: string
          date: string
          event_id: string
          id: string
          label: string
          sort_order: number
          start_time: string | null
          updated_at: string
          version_id: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          date: string
          event_id: string
          id?: string
          label?: string
          sort_order?: number
          start_time?: string | null
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          event_id?: string
          id?: string
          label?: string
          sort_order?: number
          start_time?: string | null
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sessions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "bp_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      event_simulator_config: {
        Row: {
          ab_drink_passthrough_pct: number
          ab_food_passthrough_pct: number
          bonif_bebidas: number
          combo_lot_keywords: string
          company_id: string
          created_at: string
          default_drink_avg_ticket: number
          default_drink_cmv_pct: number
          default_drink_conversion_pct: number
          default_food_avg_ticket: number
          default_food_cmv_pct: number
          default_food_conversion_pct: number
          default_merch_avg_ticket: number | null
          default_merch_cmv_pct: number | null
          default_merch_conversion_pct: number | null
          event_id: string
          forecast_final_accel: number
          forecast_final_window_days: number
          notes: string | null
          other_revenue: number
          ponto_vendido: number
          prior_year_drink: number
          prior_year_food: number
          prior_year_notes: string | null
          prior_year_other: number
          prior_year_real_expenses: number | null
          prior_year_real_revenue: number | null
          prior_year_souvenir: number
          prior_year_sponsor: number
          prior_year_tickets: number
          sales_curve_mode: string | null
          sales_curve_prior_event_id: string | null
          souvenir_cost: number
          souvenir_revenue: number
          sponsor_category_l2_id: string | null
          sponsorship_notes: string | null
          sponsorship_revenue: number | null
          ticket_iva_pct: number
          updated_at: string
          variable_commission_pct: number | null
          variable_spa_pct: number | null
        }
        Insert: {
          ab_drink_passthrough_pct?: number
          ab_food_passthrough_pct?: number
          bonif_bebidas?: number
          combo_lot_keywords?: string
          company_id: string
          created_at?: string
          default_drink_avg_ticket?: number
          default_drink_cmv_pct?: number
          default_drink_conversion_pct?: number
          default_food_avg_ticket?: number
          default_food_cmv_pct?: number
          default_food_conversion_pct?: number
          default_merch_avg_ticket?: number | null
          default_merch_cmv_pct?: number | null
          default_merch_conversion_pct?: number | null
          event_id: string
          forecast_final_accel?: number
          forecast_final_window_days?: number
          notes?: string | null
          other_revenue?: number
          ponto_vendido?: number
          prior_year_drink?: number
          prior_year_food?: number
          prior_year_notes?: string | null
          prior_year_other?: number
          prior_year_real_expenses?: number | null
          prior_year_real_revenue?: number | null
          prior_year_souvenir?: number
          prior_year_sponsor?: number
          prior_year_tickets?: number
          sales_curve_mode?: string | null
          sales_curve_prior_event_id?: string | null
          souvenir_cost?: number
          souvenir_revenue?: number
          sponsor_category_l2_id?: string | null
          sponsorship_notes?: string | null
          sponsorship_revenue?: number | null
          ticket_iva_pct?: number
          updated_at?: string
          variable_commission_pct?: number | null
          variable_spa_pct?: number | null
        }
        Update: {
          ab_drink_passthrough_pct?: number
          ab_food_passthrough_pct?: number
          bonif_bebidas?: number
          combo_lot_keywords?: string
          company_id?: string
          created_at?: string
          default_drink_avg_ticket?: number
          default_drink_cmv_pct?: number
          default_drink_conversion_pct?: number
          default_food_avg_ticket?: number
          default_food_cmv_pct?: number
          default_food_conversion_pct?: number
          default_merch_avg_ticket?: number | null
          default_merch_cmv_pct?: number | null
          default_merch_conversion_pct?: number | null
          event_id?: string
          forecast_final_accel?: number
          forecast_final_window_days?: number
          notes?: string | null
          other_revenue?: number
          ponto_vendido?: number
          prior_year_drink?: number
          prior_year_food?: number
          prior_year_notes?: string | null
          prior_year_other?: number
          prior_year_real_expenses?: number | null
          prior_year_real_revenue?: number | null
          prior_year_souvenir?: number
          prior_year_sponsor?: number
          prior_year_tickets?: number
          sales_curve_mode?: string | null
          sales_curve_prior_event_id?: string | null
          souvenir_cost?: number
          souvenir_revenue?: number
          sponsor_category_l2_id?: string | null
          sponsorship_notes?: string | null
          sponsorship_revenue?: number | null
          ticket_iva_pct?: number
          updated_at?: string
          variable_commission_pct?: number | null
          variable_spa_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_simulator_config_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_simulator_config_sales_curve_prior_event_id_fkey"
            columns: ["sales_curve_prior_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_simulator_config_sponsor_category_l2_id_fkey"
            columns: ["sponsor_category_l2_id"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      event_simulator_cost_lines: {
        Row: {
          actual_amount: number
          actual_committed_bp: number
          actual_paid: number
          break_even_amount: number
          category_id: string | null
          company_id: string
          created_at: string
          display_order: number
          event_id: string
          forecast_amount: number
          id: string
          is_ab_passthrough: boolean
          label: string
          prior_year_amount: number
          updated_at: string
        }
        Insert: {
          actual_amount?: number
          actual_committed_bp?: number
          actual_paid?: number
          break_even_amount?: number
          category_id?: string | null
          company_id: string
          created_at?: string
          display_order?: number
          event_id: string
          forecast_amount?: number
          id?: string
          is_ab_passthrough?: boolean
          label: string
          prior_year_amount?: number
          updated_at?: string
        }
        Update: {
          actual_amount?: number
          actual_committed_bp?: number
          actual_paid?: number
          break_even_amount?: number
          category_id?: string | null
          company_id?: string
          created_at?: string
          display_order?: number
          event_id?: string
          forecast_amount?: number
          id?: string
          is_ab_passthrough?: boolean
          label?: string
          prior_year_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_simulator_cost_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_simulator_cost_lines_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_simulator_inputs: {
        Row: {
          avg_ticket_override: number | null
          break_even_qty_manual: number | null
          capacity_target: number | null
          company_id: string
          courtesy_qty: number
          created_at: string
          day_date: string | null
          day_index: number
          event_id: string
          forecast_qty: number | null
          id: string
          iva_pct: number
          notes: string | null
          prior_year_qty: number | null
          prior_year_revenue: number | null
          projected_qty: number
          projected_revenue: number | null
          real_sales_qty: number
          real_sales_revenue: number
          updated_at: string
          zone_label: string
        }
        Insert: {
          avg_ticket_override?: number | null
          break_even_qty_manual?: number | null
          capacity_target?: number | null
          company_id: string
          courtesy_qty?: number
          created_at?: string
          day_date?: string | null
          day_index: number
          event_id: string
          forecast_qty?: number | null
          id?: string
          iva_pct?: number
          notes?: string | null
          prior_year_qty?: number | null
          prior_year_revenue?: number | null
          projected_qty?: number
          projected_revenue?: number | null
          real_sales_qty?: number
          real_sales_revenue?: number
          updated_at?: string
          zone_label: string
        }
        Update: {
          avg_ticket_override?: number | null
          break_even_qty_manual?: number | null
          capacity_target?: number | null
          company_id?: string
          courtesy_qty?: number
          created_at?: string
          day_date?: string | null
          day_index?: number
          event_id?: string
          forecast_qty?: number | null
          id?: string
          iva_pct?: number
          notes?: string | null
          prior_year_qty?: number | null
          prior_year_revenue?: number | null
          projected_qty?: number
          projected_revenue?: number | null
          real_sales_qty?: number
          real_sales_revenue?: number
          updated_at?: string
          zone_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_simulator_inputs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_simulator_pax_benchmarks: {
        Row: {
          avg_ticket_per_pax: number
          category_code: string
          company_id: string | null
          created_at: string
          id: string
          last_calculated_at: string
          sample_size: number
          scope: string
          scope_value: string | null
          updated_at: string
        }
        Insert: {
          avg_ticket_per_pax?: number
          category_code: string
          company_id?: string | null
          created_at?: string
          id?: string
          last_calculated_at?: string
          sample_size?: number
          scope: string
          scope_value?: string | null
          updated_at?: string
        }
        Update: {
          avg_ticket_per_pax?: number
          category_code?: string
          company_id?: string | null
          created_at?: string
          id?: string
          last_calculated_at?: string
          sample_size?: number
          scope?: string
          scope_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_simulator_pax_benchmarks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      event_simulator_sales_curve_buckets: {
        Row: {
          created_at: string
          cumulative_pct: number
          days_before: number
          event_id: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cumulative_pct?: number
          days_before: number
          event_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cumulative_pct?: number
          days_before?: number
          event_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_simulator_sales_curve_buckets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_simulator_zone_config: {
        Row: {
          company_id: string
          created_at: string
          display_order: number
          drink_avg_ticket: number | null
          drink_cmv_pct: number | null
          drink_conversion_pct: number | null
          event_id: string
          food_avg_ticket: number | null
          food_cmv_pct: number | null
          food_conversion_pct: number | null
          id: string
          merch_avg_ticket: number | null
          merch_cmv_pct: number | null
          merch_conversion_pct: number | null
          updated_at: string
          zone_label: string
        }
        Insert: {
          company_id: string
          created_at?: string
          display_order?: number
          drink_avg_ticket?: number | null
          drink_cmv_pct?: number | null
          drink_conversion_pct?: number | null
          event_id: string
          food_avg_ticket?: number | null
          food_cmv_pct?: number | null
          food_conversion_pct?: number | null
          id?: string
          merch_avg_ticket?: number | null
          merch_cmv_pct?: number | null
          merch_conversion_pct?: number | null
          updated_at?: string
          zone_label: string
        }
        Update: {
          company_id?: string
          created_at?: string
          display_order?: number
          drink_avg_ticket?: number | null
          drink_cmv_pct?: number | null
          drink_conversion_pct?: number | null
          event_id?: string
          food_avg_ticket?: number | null
          food_cmv_pct?: number | null
          food_conversion_pct?: number | null
          id?: string
          merch_avg_ticket?: number | null
          merch_cmv_pct?: number | null
          merch_conversion_pct?: number | null
          updated_at?: string
          zone_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_simulator_zone_config_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_team_member_zones: {
        Row: {
          member_id: string
          zone_id: string
        }
        Insert: {
          member_id: string
          zone_id: string
        }
        Update: {
          member_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_team_member_zones_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "event_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_team_member_zones_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "operacao_frentes"
            referencedColumns: ["id"]
          },
        ]
      }
      event_team_members: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          profile_id: string
          role: string
          scope: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          profile_id: string
          role: string
          scope?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          profile_id?: string
          role?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_team_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_team_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ticket_lots: {
        Row: {
          applies_to_days: number
          campaign_label: string | null
          combo_benefits: string | null
          combo_description: string | null
          company_id: string
          consumes_zone_ids: string[]
          created_at: string
          id: string
          is_combo: boolean
          iva_rate: number
          lot_kind: string
          lot_number: number
          lot_type: string
          name: string
          price: number
          quantity: number
          sales_window_end: string | null
          sales_window_start: string | null
          ticket_type_id: string | null
          version_id: string | null
          zone_id: string
        }
        Insert: {
          applies_to_days?: number
          campaign_label?: string | null
          combo_benefits?: string | null
          combo_description?: string | null
          company_id?: string
          consumes_zone_ids?: string[]
          created_at?: string
          id?: string
          is_combo?: boolean
          iva_rate?: number
          lot_kind?: string
          lot_number?: number
          lot_type?: string
          name?: string
          price?: number
          quantity?: number
          sales_window_end?: string | null
          sales_window_start?: string | null
          ticket_type_id?: string | null
          version_id?: string | null
          zone_id: string
        }
        Update: {
          applies_to_days?: number
          campaign_label?: string | null
          combo_benefits?: string | null
          combo_description?: string | null
          company_id?: string
          consumes_zone_ids?: string[]
          created_at?: string
          id?: string
          is_combo?: boolean
          iva_rate?: number
          lot_kind?: string
          lot_number?: number
          lot_type?: string
          name?: string
          price?: number
          quantity?: number
          sales_window_end?: string | null
          sales_window_start?: string | null
          ticket_type_id?: string | null
          version_id?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_ticket_lots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ticket_lots_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "event_ticket_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ticket_lots_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "bp_versions"
            referencedColumns: ["id"]
          },
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
        Relationships: [
          {
            foreignKeyName: "event_ticket_office_advances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ticket_office_assignments: {
        Row: {
          commission_notes: string | null
          commission_type: string
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "event_ticket_office_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
      event_ticket_type_zones: {
        Row: {
          company_id: string
          created_at: string
          display_order: number
          id: string
          price_share: number | null
          ticket_type_id: string
          zone_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          display_order?: number
          id?: string
          price_share?: number | null
          ticket_type_id: string
          zone_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          display_order?: number
          id?: string
          price_share?: number | null
          ticket_type_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_ticket_type_zones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ticket_type_zones_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "event_ticket_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ticket_type_zones_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "event_ticket_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ticket_types: {
        Row: {
          benefits: string | null
          companion_courtesy_qty: number
          company_id: string
          created_at: string
          description: string | null
          display_order: number
          entries_per_unit: number
          event_id: string
          id: string
          kind: string
          max_total_quantity: number | null
          name: string
          parent_ticket_type_id: string | null
          sales_channel: string | null
          sales_channel_label: string | null
          updated_at: string
          variant_kind: string | null
          variant_label: string | null
          version_id: string | null
          visibility: string
        }
        Insert: {
          benefits?: string | null
          companion_courtesy_qty?: number
          company_id: string
          created_at?: string
          description?: string | null
          display_order?: number
          entries_per_unit?: number
          event_id: string
          id?: string
          kind?: string
          max_total_quantity?: number | null
          name: string
          parent_ticket_type_id?: string | null
          sales_channel?: string | null
          sales_channel_label?: string | null
          updated_at?: string
          variant_kind?: string | null
          variant_label?: string | null
          version_id?: string | null
          visibility?: string
        }
        Update: {
          benefits?: string | null
          companion_courtesy_qty?: number
          company_id?: string
          created_at?: string
          description?: string | null
          display_order?: number
          entries_per_unit?: number
          event_id?: string
          id?: string
          kind?: string
          max_total_quantity?: number | null
          name?: string
          parent_ticket_type_id?: string | null
          sales_channel?: string | null
          sales_channel_label?: string | null
          updated_at?: string
          variant_kind?: string | null
          variant_label?: string | null
          version_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_ticket_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ticket_types_parent_ticket_type_id_fkey"
            columns: ["parent_ticket_type_id"]
            isOneToOne: false
            referencedRelation: "event_ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ticket_zones: {
        Row: {
          company_id: string
          created_at: string
          event_id: string
          id: string
          name: string
          session_id: string | null
          total_capacity: number | null
          updated_at: string
          version_id: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          event_id: string
          id?: string
          name: string
          session_id?: string | null
          total_capacity?: number | null
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          session_id?: string | null
          total_capacity?: number | null
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_ticket_zones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "event_ticket_zones_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "bp_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          absorbs_admin_costs: boolean
          ad_destination_url: string | null
          admin_window_end: string | null
          admin_window_start: string | null
          budget: number
          city_id: string | null
          company_id: string
          created_at: string
          date: string
          description_en: string | null
          description_pt: string | null
          event_type: string
          hero_image_url: string | null
          id: string
          import_template: string | null
          last_sales_date: string | null
          location: string | null
          location_en: string | null
          location_pt: string | null
          management_type: string
          meta_audience_id: string | null
          meta_audience_name: string | null
          meta_pixel_id: string | null
          name: string
          operacao_mode: string | null
          parent_event_id: string | null
          partner_calc_basis: string
          partner_name: string | null
          pl_mode: string
          portal_featured: boolean
          portal_visible: boolean
          poster_image_url: string | null
          slug: string | null
          status: string
          ticketing_provider: string | null
          ticketing_url: string | null
          ticketline_event_id: string | null
          tickets_sold: number
          tickets_total: number
          title_en: string | null
          title_pt: string | null
          updated_at: string
          venue_directions_url: string | null
          venue_id: string | null
          venue_map_url: string | null
          vip_coupon_code: string | null
          vip_coupon_discount_label: string | null
          vip_coupon_valid_until: string | null
        }
        Insert: {
          absorbs_admin_costs?: boolean
          ad_destination_url?: string | null
          admin_window_end?: string | null
          admin_window_start?: string | null
          budget?: number
          city_id?: string | null
          company_id?: string
          created_at?: string
          date: string
          description_en?: string | null
          description_pt?: string | null
          event_type?: string
          hero_image_url?: string | null
          id?: string
          import_template?: string | null
          last_sales_date?: string | null
          location?: string | null
          location_en?: string | null
          location_pt?: string | null
          management_type?: string
          meta_audience_id?: string | null
          meta_audience_name?: string | null
          meta_pixel_id?: string | null
          name: string
          operacao_mode?: string | null
          parent_event_id?: string | null
          partner_calc_basis?: string
          partner_name?: string | null
          pl_mode?: string
          portal_featured?: boolean
          portal_visible?: boolean
          poster_image_url?: string | null
          slug?: string | null
          status?: string
          ticketing_provider?: string | null
          ticketing_url?: string | null
          ticketline_event_id?: string | null
          tickets_sold?: number
          tickets_total?: number
          title_en?: string | null
          title_pt?: string | null
          updated_at?: string
          venue_directions_url?: string | null
          venue_id?: string | null
          venue_map_url?: string | null
          vip_coupon_code?: string | null
          vip_coupon_discount_label?: string | null
          vip_coupon_valid_until?: string | null
        }
        Update: {
          absorbs_admin_costs?: boolean
          ad_destination_url?: string | null
          admin_window_end?: string | null
          admin_window_start?: string | null
          budget?: number
          city_id?: string | null
          company_id?: string
          created_at?: string
          date?: string
          description_en?: string | null
          description_pt?: string | null
          event_type?: string
          hero_image_url?: string | null
          id?: string
          import_template?: string | null
          last_sales_date?: string | null
          location?: string | null
          location_en?: string | null
          location_pt?: string | null
          management_type?: string
          meta_audience_id?: string | null
          meta_audience_name?: string | null
          meta_pixel_id?: string | null
          name?: string
          operacao_mode?: string | null
          parent_event_id?: string | null
          partner_calc_basis?: string
          partner_name?: string | null
          pl_mode?: string
          portal_featured?: boolean
          portal_visible?: boolean
          poster_image_url?: string | null
          slug?: string | null
          status?: string
          ticketing_provider?: string | null
          ticketing_url?: string | null
          ticketline_event_id?: string | null
          tickets_sold?: number
          tickets_total?: number
          title_en?: string | null
          title_pt?: string | null
          updated_at?: string
          venue_directions_url?: string | null
          venue_id?: string | null
          venue_map_url?: string | null
          vip_coupon_code?: string | null
          vip_coupon_discount_label?: string | null
          vip_coupon_valid_until?: string | null
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
            foreignKeyName: "events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      fever_sync_config: {
        Row: {
          b2b_token_secret_name: string | null
          card_sales_card: number
          card_sales_dashcard: number
          card_tickets_card: number
          card_tickets_dashcard: number
          city_id: string
          company_id: string
          created_at: string
          dashboard_id: number
          enabled: boolean
          event_id: string
          id: string
          last_run_at: string | null
          last_run_status: string | null
          last_token_refresh_at: string | null
          organization_name: string
          partner_id: number
          plan_id: string
          updated_at: string
          vault_secret_name: string
          venue_id: string
        }
        Insert: {
          b2b_token_secret_name?: string | null
          card_sales_card?: number
          card_sales_dashcard?: number
          card_tickets_card?: number
          card_tickets_dashcard?: number
          city_id: string
          company_id: string
          created_at?: string
          dashboard_id?: number
          enabled?: boolean
          event_id: string
          id?: string
          last_run_at?: string | null
          last_run_status?: string | null
          last_token_refresh_at?: string | null
          organization_name?: string
          partner_id?: number
          plan_id: string
          updated_at?: string
          vault_secret_name: string
          venue_id: string
        }
        Update: {
          b2b_token_secret_name?: string | null
          card_sales_card?: number
          card_sales_dashcard?: number
          card_tickets_card?: number
          card_tickets_dashcard?: number
          city_id?: string
          company_id?: string
          created_at?: string
          dashboard_id?: number
          enabled?: boolean
          event_id?: string
          id?: string
          last_run_at?: string | null
          last_run_status?: string | null
          last_token_refresh_at?: string | null
          organization_name?: string
          partner_id?: number
          plan_id?: string
          updated_at?: string
          vault_secret_name?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fever_sync_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fever_sync_config_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      fever_sync_runs: {
        Row: {
          company_id: string
          config_id: string
          created_at: string
          error_message: string | null
          files_downloaded: Json | null
          finished_at: string | null
          id: string
          import_audit: Json | null
          mode: string
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          company_id: string
          config_id: string
          created_at?: string
          error_message?: string | null
          files_downloaded?: Json | null
          finished_at?: string | null
          id?: string
          import_audit?: Json | null
          mode: string
          started_at?: string
          status: string
          triggered_by?: string | null
        }
        Update: {
          company_id?: string
          config_id?: string
          created_at?: string
          error_message?: string | null
          files_downloaded?: Json | null
          finished_at?: string | null
          id?: string
          import_audit?: Json | null
          mode?: string
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fever_sync_runs_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "fever_sync_config"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_account_access: {
        Row: {
          account_id: string
          company_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          account_id: string
          company_id?: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          account_id?: string
          company_id?: string
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
          {
            foreignKeyName: "financial_account_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_accounts: {
        Row: {
          balance_visible_to_all: boolean
          card_number: string | null
          company_id: string
          contact_name: string | null
          created_at: string
          description: string | null
          email_contact: string | null
          iban: string | null
          id: string
          initial_balance: number
          is_active: boolean
          is_hidden: boolean
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
          company_id?: string
          contact_name?: string | null
          created_at?: string
          description?: string | null
          email_contact?: string | null
          iban?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean
          is_hidden?: boolean
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
          company_id?: string
          contact_name?: string | null
          created_at?: string
          description?: string | null
          email_contact?: string | null
          iban?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean
          is_hidden?: boolean
          name?: string
          phone?: string | null
          skip_balance_check?: boolean
          type?: string
          updated_at?: string
          withholds_revenue?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "financial_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_audit_log: {
        Row: {
          changed_by: string
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "forecast_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_audit_log_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "event_forecasts"
            referencedColumns: ["id"]
          },
        ]
      }
      home_videos: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          display_order: number
          event_id: string | null
          id: string
          portal_visible: boolean
          title_en: string | null
          title_pt: string
          updated_at: string
          updated_by: string | null
          youtube_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          event_id?: string | null
          id?: string
          portal_visible?: boolean
          title_en?: string | null
          title_pt: string
          updated_at?: string
          updated_by?: string | null
          youtube_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          event_id?: string | null
          id?: string
          portal_visible?: boolean
          title_en?: string | null
          title_pt?: string
          updated_at?: string
          updated_by?: string | null
          youtube_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_videos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_videos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_capture: {
        Row: {
          client_event_id: string | null
          consent_email: boolean
          consent_whatsapp: boolean
          created_at: string
          email: string | null
          event_slug: string | null
          fbc: string | null
          fbp: string | null
          geo_city: string | null
          geo_country: string | null
          geo_region: string | null
          id: string
          ip_inet: unknown
          name: string | null
          phone: string | null
          processed: boolean
          processed_at: string | null
          processing_error: string | null
          raw: Json | null
          source: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          client_event_id?: string | null
          consent_email?: boolean
          consent_whatsapp?: boolean
          created_at?: string
          email?: string | null
          event_slug?: string | null
          fbc?: string | null
          fbp?: string | null
          geo_city?: string | null
          geo_country?: string | null
          geo_region?: string | null
          id?: string
          ip_inet?: unknown
          name?: string | null
          phone?: string | null
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
          raw?: Json | null
          source?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          client_event_id?: string | null
          consent_email?: boolean
          consent_whatsapp?: boolean
          created_at?: string
          email?: string | null
          event_slug?: string | null
          fbc?: string | null
          fbp?: string | null
          geo_city?: string | null
          geo_country?: string | null
          geo_region?: string | null
          id?: string
          ip_inet?: unknown
          name?: string | null
          phone?: string | null
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
          raw?: Json | null
          source?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          capi_sent_at: string | null
          capi_status: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          event_id: string | null
          fbc: string | null
          fbp: string | null
          geo_city: string | null
          geo_country: string | null
          geo_region: string | null
          id: string
          ip_inet: unknown
          kind: string
          meta: Json | null
          mp_click_id: string | null
          source: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          capi_sent_at?: string | null
          capi_status?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          event_id?: string | null
          fbc?: string | null
          fbp?: string | null
          geo_city?: string | null
          geo_country?: string | null
          geo_region?: string | null
          id?: string
          ip_inet?: unknown
          kind: string
          meta?: Json | null
          mp_click_id?: string | null
          source?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          capi_sent_at?: string | null
          capi_status?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          event_id?: string | null
          fbc?: string | null
          fbp?: string | null
          geo_city?: string | null
          geo_country?: string | null
          geo_region?: string | null
          id?: string
          ip_inet?: unknown
          kind?: string
          meta?: Json | null
          mp_click_id?: string | null
          source?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
          verified: boolean
        }
        Insert: {
          attempted_at?: string
          email: string
          id?: string
          ip_address?: string | null
          success?: boolean
          verified?: boolean
        }
        Update: {
          attempted_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          success?: boolean
          verified?: boolean
        }
        Relationships: []
      }
      meta_audience_sync_log: {
        Row: {
          audience_id: string
          error_message: string | null
          finished_at: string | null
          id: string
          meta_response: Json | null
          records_processed: number | null
          started_at: string
          status: string
        }
        Insert: {
          audience_id: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          meta_response?: Json | null
          records_processed?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          audience_id?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          meta_response?: Json | null
          records_processed?: number | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_audience_sync_log_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "meta_custom_audiences"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campaign_recommendations: {
        Row: {
          ad_account_id: string
          body: string | null
          company_id: string
          connection_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          dedupe_object_key: string | null
          external_adset_id: string | null
          external_campaign_id: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          lift_estimate: string | null
          opportunity_score_lift: number | null
          raw: Json | null
          recommendation_stage: string | null
          recommendation_time: string | null
          recommendation_type: string
          status: string
          updated_at: string
          url: string | null
        }
        Insert: {
          ad_account_id: string
          body?: string | null
          company_id: string
          connection_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          dedupe_object_key?: string | null
          external_adset_id?: string | null
          external_campaign_id?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          lift_estimate?: string | null
          opportunity_score_lift?: number | null
          raw?: Json | null
          recommendation_stage?: string | null
          recommendation_time?: string | null
          recommendation_type: string
          status?: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          ad_account_id?: string
          body?: string | null
          company_id?: string
          connection_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          dedupe_object_key?: string | null
          external_adset_id?: string | null
          external_campaign_id?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          lift_estimate?: string | null
          opportunity_score_lift?: number | null
          raw?: Json | null
          recommendation_stage?: string | null
          recommendation_time?: string | null
          recommendation_type?: string
          status?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      meta_custom_audiences: {
        Row: {
          audience_id_meta: string | null
          company_id: string
          connection_id: string
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          event_id: string | null
          filters: Json
          id: string
          is_primary_purchase: boolean
          last_sync_error: string | null
          last_sync_status: string | null
          last_synced_at: string | null
          name: string
          total_records_local: number | null
          total_records_meta: number | null
          updated_at: string
        }
        Insert: {
          audience_id_meta?: string | null
          company_id: string
          connection_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          event_id?: string | null
          filters?: Json
          id?: string
          is_primary_purchase?: boolean
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          name: string
          total_records_local?: number | null
          total_records_meta?: number | null
          updated_at?: string
        }
        Update: {
          audience_id_meta?: string | null
          company_id?: string
          connection_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          event_id?: string | null
          filters?: Json
          id?: string
          is_primary_purchase?: boolean
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          name?: string
          total_records_local?: number | null
          total_records_meta?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_custom_audiences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_custom_audiences_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mfa_trusted_devices: {
        Row: {
          created_at: string
          device_label: string | null
          device_token_hash: string
          expires_at: string
          id: string
          ip_address: string | null
          last_used_at: string
          revoked_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          device_token_hash: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          last_used_at?: string
          revoked_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          device_token_hash?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          last_used_at?: string
          revoked_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          queue_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          queue_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          queue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "notification_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_optin: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          notes: string | null
          opted_in_at: string | null
          opted_out_at: string | null
          phone_number: string
          profile_id: string
          source: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          notes?: string | null
          opted_in_at?: string | null
          opted_out_at?: string | null
          phone_number: string
          profile_id: string
          source?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          notes?: string | null
          opted_in_at?: string | null
          opted_out_at?: string | null
          phone_number?: string
          profile_id?: string
          source?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_optin_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          attempts: number
          company_id: string
          context_id: string | null
          context_type: string | null
          created_at: string
          delivered_at: string | null
          event_id: string | null
          failed_at: string | null
          id: string
          last_error: string | null
          meta_message_id: string | null
          params: Json
          read_at: string | null
          recipient_phone: string
          recipient_profile_id: string
          scheduled_at: string
          sent_at: string | null
          status: string
          template_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          company_id: string
          context_id?: string | null
          context_type?: string | null
          created_at?: string
          delivered_at?: string | null
          event_id?: string | null
          failed_at?: string | null
          id?: string
          last_error?: string | null
          meta_message_id?: string | null
          params?: Json
          read_at?: string | null
          recipient_phone: string
          recipient_profile_id: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          context_id?: string | null
          context_type?: string | null
          created_at?: string
          delivered_at?: string | null
          event_id?: string | null
          failed_at?: string | null
          id?: string
          last_error?: string | null
          meta_message_id?: string | null
          params?: Json
          read_at?: string | null
          recipient_phone?: string
          recipient_profile_id?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body_text: string
          category: string
          created_at: string
          description: string | null
          id: string
          language_code: string
          meta_template_id: string | null
          meta_template_name: string
          param_count: number
          param_schema: Json
          status: string
          template_name: string
          updated_at: string
        }
        Insert: {
          body_text: string
          category: string
          created_at?: string
          description?: string | null
          id?: string
          language_code?: string
          meta_template_id?: string | null
          meta_template_name: string
          param_count?: number
          param_schema?: Json
          status?: string
          template_name: string
          updated_at?: string
        }
        Update: {
          body_text?: string
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          language_code?: string
          meta_template_id?: string | null
          meta_template_name?: string
          param_count?: number
          param_schema?: Json
          status?: string
          template_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      operacao_chamado_sla: {
        Row: {
          priority: string
          sla_minutes: number
        }
        Insert: {
          priority: string
          sla_minutes: number
        }
        Update: {
          priority?: string
          sla_minutes?: number
        }
        Relationships: []
      }
      operacao_daily_reports: {
        Row: {
          company_id: string
          event_id: string
          generated_at: string
          generated_by_profile_id: string | null
          id: string
          mode: string
          pdf_url: string | null
          report_date: string
          summary_json: Json
        }
        Insert: {
          company_id?: string
          event_id: string
          generated_at?: string
          generated_by_profile_id?: string | null
          id?: string
          mode: string
          pdf_url?: string | null
          report_date: string
          summary_json?: Json
        }
        Update: {
          company_id?: string
          event_id?: string
          generated_at?: string
          generated_by_profile_id?: string | null
          id?: string
          mode?: string
          pdf_url?: string | null
          report_date?: string
          summary_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "operacao_daily_reports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_daily_reports_generated_by_profile_id_fkey"
            columns: ["generated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operacao_etapa_assignees: {
        Row: {
          company_id: string
          created_at: string
          created_by_profile_id: string | null
          etapa_id: string
          id: string
          profile_id: string
          role: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          created_by_profile_id?: string | null
          etapa_id: string
          id?: string
          profile_id: string
          role?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by_profile_id?: string | null
          etapa_id?: string
          id?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "operacao_etapa_assignees_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_etapa_assignees_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "operacao_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_etapa_assignees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operacao_etapa_suppliers: {
        Row: {
          company_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_role: string | null
          created_at: string
          created_by: string | null
          decided_amount: number | null
          etapa_id: string
          id: string
          iva_rate: number | null
          notes: string | null
          role: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          created_at?: string
          created_by?: string | null
          decided_amount?: number | null
          etapa_id: string
          id?: string
          iva_rate?: number | null
          notes?: string | null
          role?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          created_at?: string
          created_by?: string | null
          decided_amount?: number | null
          etapa_id?: string
          id?: string
          iva_rate?: number | null
          notes?: string | null
          role?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operacao_etapa_suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_etapa_suppliers_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "operacao_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_etapa_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      operacao_etapas: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          category_id: string | null
          company_id: string
          created_at: string
          display_order: number
          escopo: string | null
          forecast_id: string | null
          frente_id: string
          has_no_date: boolean
          id: string
          name: string
          planned_end: string | null
          planned_start: string | null
          responsible_profile_id: string | null
          status: string
          supplier_id: string | null
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          display_order?: number
          escopo?: string | null
          forecast_id?: string | null
          frente_id: string
          has_no_date?: boolean
          id?: string
          name: string
          planned_end?: string | null
          planned_start?: string | null
          responsible_profile_id?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          display_order?: number
          escopo?: string | null
          forecast_id?: string | null
          frente_id?: string
          has_no_date?: boolean
          id?: string
          name?: string
          planned_end?: string | null
          planned_start?: string | null
          responsible_profile_id?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operacao_etapas_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "account_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_etapas_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "event_forecasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_etapas_frente_id_fkey"
            columns: ["frente_id"]
            isOneToOne: false
            referencedRelation: "operacao_frentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_etapas_responsible_profile_id_fkey"
            columns: ["responsible_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_etapas_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_etapas_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "operacao_frentes"
            referencedColumns: ["id"]
          },
        ]
      }
      operacao_frente_team: {
        Row: {
          active: boolean
          assigned_at: string
          assigned_by_profile_id: string | null
          company_id: string
          frente_id: string
          id: string
          is_permanent_lead: boolean
          profile_id: string
          role_in_frente: string
        }
        Insert: {
          active?: boolean
          assigned_at?: string
          assigned_by_profile_id?: string | null
          company_id?: string
          frente_id: string
          id?: string
          is_permanent_lead?: boolean
          profile_id: string
          role_in_frente: string
        }
        Update: {
          active?: boolean
          assigned_at?: string
          assigned_by_profile_id?: string | null
          company_id?: string
          frente_id?: string
          id?: string
          is_permanent_lead?: boolean
          profile_id?: string
          role_in_frente?: string
        }
        Relationships: [
          {
            foreignKeyName: "operacao_frente_team_assigned_by_profile_id_fkey"
            columns: ["assigned_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_frente_team_frente_id_fkey"
            columns: ["frente_id"]
            isOneToOne: false
            referencedRelation: "operacao_frentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_frente_team_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operacao_frentes: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          current_lead_id: string | null
          description: string | null
          display_order: number
          event_id: string
          id: string
          lead_handover_until: string | null
          name: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          company_id?: string
          created_at?: string
          current_lead_id?: string | null
          description?: string | null
          display_order?: number
          event_id: string
          id?: string
          lead_handover_until?: string | null
          name: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          current_lead_id?: string | null
          description?: string | null
          display_order?: number
          event_id?: string
          id?: string
          lead_handover_until?: string | null
          name?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operacao_frentes_current_lead_id_fkey"
            columns: ["current_lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_frentes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      operacao_mentions: {
        Row: {
          company_id: string
          created_at: string
          id: string
          mentioned_profile_id: string
          notified_at: string | null
          read_at: string | null
          registro_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          mentioned_profile_id: string
          notified_at?: string | null
          read_at?: string | null
          registro_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          mentioned_profile_id?: string
          notified_at?: string | null
          read_at?: string | null
          registro_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operacao_mentions_mentioned_profile_id_fkey"
            columns: ["mentioned_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_mentions_registro_id_fkey"
            columns: ["registro_id"]
            isOneToOne: false
            referencedRelation: "operacao_registros"
            referencedColumns: ["id"]
          },
        ]
      }
      operacao_registro_media: {
        Row: {
          company_id: string
          created_at: string
          file_type: string
          file_url: string
          id: string
          registro_id: string
          sort_order: number
          thumbnail_url: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          file_type: string
          file_url: string
          id?: string
          registro_id: string
          sort_order?: number
          thumbnail_url?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          file_type?: string
          file_url?: string
          id?: string
          registro_id?: string
          sort_order?: number
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operacao_registro_media_registro_id_fkey"
            columns: ["registro_id"]
            isOneToOne: false
            referencedRelation: "operacao_registros"
            referencedColumns: ["id"]
          },
        ]
      }
      operacao_registros: {
        Row: {
          acked_at: string | null
          acked_by_profile_id: string | null
          audio_url: string | null
          author_profile_id: string
          company_id: string
          created_at: string
          escalation_level: number
          etapa_id: string | null
          frente_id: string
          id: string
          kind: string
          metadata: Json
          priority: string | null
          resolved_at: string | null
          resolved_by_profile_id: string | null
          sla_due_at: string | null
          sla_half_at: string | null
          status: string | null
          text: string | null
          transcribed_text: string | null
          updated_at: string
        }
        Insert: {
          acked_at?: string | null
          acked_by_profile_id?: string | null
          audio_url?: string | null
          author_profile_id: string
          company_id?: string
          created_at?: string
          escalation_level?: number
          etapa_id?: string | null
          frente_id: string
          id?: string
          kind: string
          metadata?: Json
          priority?: string | null
          resolved_at?: string | null
          resolved_by_profile_id?: string | null
          sla_due_at?: string | null
          sla_half_at?: string | null
          status?: string | null
          text?: string | null
          transcribed_text?: string | null
          updated_at?: string
        }
        Update: {
          acked_at?: string | null
          acked_by_profile_id?: string | null
          audio_url?: string | null
          author_profile_id?: string
          company_id?: string
          created_at?: string
          escalation_level?: number
          etapa_id?: string | null
          frente_id?: string
          id?: string
          kind?: string
          metadata?: Json
          priority?: string | null
          resolved_at?: string | null
          resolved_by_profile_id?: string | null
          sla_due_at?: string | null
          sla_half_at?: string | null
          status?: string | null
          text?: string | null
          transcribed_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operacao_registros_acked_by_profile_id_fkey"
            columns: ["acked_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_registros_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_registros_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "operacao_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_registros_frente_id_fkey"
            columns: ["frente_id"]
            isOneToOne: false
            referencedRelation: "operacao_frentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_registros_resolved_by_profile_id_fkey"
            columns: ["resolved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operacao_staff_invites: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          created_by_profile_id: string | null
          expires_at: string
          id: string
          profile_id: string
          send_count: number
          sent_at: string | null
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          created_by_profile_id?: string | null
          expires_at?: string
          id?: string
          profile_id: string
          send_count?: number
          sent_at?: string | null
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          created_by_profile_id?: string | null
          expires_at?: string
          id?: string
          profile_id?: string
          send_count?: number
          sent_at?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "operacao_staff_invites_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_staff_invites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_advance_expenses: {
        Row: {
          company_id: string
          created_at: string
          event_id: string
          id: string
          notes: string | null
          partner_id: string
          transaction_id: string
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          event_id: string
          id?: string
          notes?: string | null
          partner_id: string
          transaction_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
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
            foreignKeyName: "partner_advance_expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          can_edit_bp: boolean
          company_id: string
          created_at: string
          default_tab: string
          event_id: string
          granted_by: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          can_edit_bp?: boolean
          company_id?: string
          created_at?: string
          default_tab?: string
          event_id: string
          granted_by?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          can_edit_bp?: boolean
          company_id?: string
          created_at?: string
          default_tab?: string
          event_id?: string
          granted_by?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_event_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
          created_at: string
          event_id: string
          id: string
          notes: string | null
          paid_date: string | null
          partner_id: string
          transaction_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          event_id: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          partner_id: string
          transaction_id: string
        }
        Update: {
          company_id?: string
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
            foreignKeyName: "partner_paid_expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
          created_at: string
          id: string
          manually_marked_paid: boolean
          payment_list_id: string
          transaction_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          manually_marked_paid?: boolean
          payment_list_id: string
          transaction_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          manually_marked_paid?: boolean
          payment_list_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_list_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
        Relationships: [
          {
            foreignKeyName: "payment_lists_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_settings: {
        Row: {
          category: string
          company_id: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          key: string
          label: string | null
          updated_at: string
          updated_by: string | null
          value: Json | null
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          key: string
          label?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: Json | null
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          key?: string
          label?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      press_clippings: {
        Row: {
          company_id: string
          created_at: string
          display_order: number | null
          event_id: string | null
          event_name: string
          id: string
          image: string | null
          portal_visible: boolean
          source: string
          url: string
        }
        Insert: {
          company_id: string
          created_at?: string
          display_order?: number | null
          event_id?: string | null
          event_name: string
          id?: string
          image?: string | null
          portal_visible?: boolean
          source: string
          url: string
        }
        Update: {
          company_id?: string
          created_at?: string
          display_order?: number | null
          event_id?: string | null
          event_name?: string
          id?: string
          image?: string | null
          portal_visible?: boolean
          source?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "press_clippings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_company_id: string | null
          archived_at: string | null
          company_id: string | null
          created_at: string
          email: string | null
          first_access_consumed_at: string | null
          first_access_token: string | null
          full_name: string
          id: string
          is_operacao_only: boolean
          phone: string | null
          profile_type: string
          updated_at: string
          whatsapp_phone: string | null
        }
        Insert: {
          active_company_id?: string | null
          archived_at?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          first_access_consumed_at?: string | null
          first_access_token?: string | null
          full_name?: string
          id: string
          is_operacao_only?: boolean
          phone?: string | null
          profile_type?: string
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Update: {
          active_company_id?: string | null
          archived_at?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          first_access_consumed_at?: string | null
          first_access_token?: string | null
          full_name?: string
          id?: string
          is_operacao_only?: boolean
          phone?: string | null
          profile_type?: string
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_company_id_fkey"
            columns: ["active_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          company_id: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          company_id?: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          company_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          amount: number
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "quotations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "recurring_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      redirect_log: {
        Row: {
          client_event_id: string | null
          created_at: string
          event_slug: string
          fbc: string | null
          fbp: string | null
          geo_city: string | null
          geo_country: string | null
          geo_region: string | null
          id: string
          ip_inet: unknown
          mp_click_id: string | null
          processed: boolean
          referrer: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          client_event_id?: string | null
          created_at?: string
          event_slug: string
          fbc?: string | null
          fbp?: string | null
          geo_city?: string | null
          geo_country?: string | null
          geo_region?: string | null
          id?: string
          ip_inet?: unknown
          mp_click_id?: string | null
          processed?: boolean
          referrer?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          client_event_id?: string | null
          created_at?: string
          event_slug?: string
          fbc?: string | null
          fbp?: string | null
          geo_city?: string | null
          geo_country?: string | null
          geo_region?: string | null
          id?: string
          ip_inet?: unknown
          mp_click_id?: string | null
          processed?: boolean
          referrer?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      reimbursement_note_items: {
        Row: {
          company_id: string
          created_at: string
          id: string
          reimbursement_note_id: string
          transaction_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          reimbursement_note_id: string
          transaction_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          reimbursement_note_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reimbursement_note_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
          created_at: string
          created_by: string
          employee_name: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_iban: string | null
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
          company_id?: string
          created_at?: string
          created_by?: string
          employee_name: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_iban?: string | null
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
          company_id?: string
          created_at?: string
          created_by?: string
          employee_name?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_iban?: string | null
          payment_transaction_id?: string | null
          status?: string
          supplier_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reimbursement_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
      rls_legacy_audit_reports: {
        Row: {
          created_at: string
          details: Json
          environment: string
          id: string
          legacy_count: number
          notes: string | null
          ran_at: string
          status: string
          total_policies: number
          triggered_by: string
          triggered_by_user: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          environment?: string
          id?: string
          legacy_count: number
          notes?: string | null
          ran_at?: string
          status: string
          total_policies: number
          triggered_by?: string
          triggered_by_user?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          environment?: string
          id?: string
          legacy_count?: number
          notes?: string | null
          ran_at?: string
          status?: string
          total_policies?: number
          triggered_by?: string
          triggered_by_user?: string | null
        }
        Relationships: []
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
      sponsorship_pipeline: {
        Row: {
          auto_sync_bp: boolean
          barter_description: string | null
          closed_at: string | null
          company_id: string
          confirmed_amount: number | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          currency: string
          doc_status:
            | Database["public"]["Enums"]["sponsorship_doc_status"]
            | null
          event_id: string
          id: string
          is_barter: boolean
          iva_rate: number | null
          linked_forecast_id: string | null
          linked_transaction_id: string | null
          lost_reason: string | null
          next_followup_date: string | null
          notes: string | null
          owner_user_id: string | null
          priority: string
          proposed_amount: number | null
          sort_order: number
          stage: Database["public"]["Enums"]["sponsorship_stage"]
          supplier_id: string | null
          supplier_name: string
          updated_at: string
        }
        Insert: {
          auto_sync_bp?: boolean
          barter_description?: string | null
          closed_at?: string | null
          company_id: string
          confirmed_amount?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          doc_status?:
            | Database["public"]["Enums"]["sponsorship_doc_status"]
            | null
          event_id: string
          id?: string
          is_barter?: boolean
          iva_rate?: number | null
          linked_forecast_id?: string | null
          linked_transaction_id?: string | null
          lost_reason?: string | null
          next_followup_date?: string | null
          notes?: string | null
          owner_user_id?: string | null
          priority?: string
          proposed_amount?: number | null
          sort_order?: number
          stage?: Database["public"]["Enums"]["sponsorship_stage"]
          supplier_id?: string | null
          supplier_name: string
          updated_at?: string
        }
        Update: {
          auto_sync_bp?: boolean
          barter_description?: string | null
          closed_at?: string | null
          company_id?: string
          confirmed_amount?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          doc_status?:
            | Database["public"]["Enums"]["sponsorship_doc_status"]
            | null
          event_id?: string
          id?: string
          is_barter?: boolean
          iva_rate?: number | null
          linked_forecast_id?: string | null
          linked_transaction_id?: string | null
          lost_reason?: string | null
          next_followup_date?: string | null
          notes?: string | null
          owner_user_id?: string | null
          priority?: string
          proposed_amount?: number | null
          sort_order?: number
          stage?: Database["public"]["Enums"]["sponsorship_stage"]
          supplier_id?: string | null
          supplier_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsorship_pipeline_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsorship_pipeline_linked_forecast_id_fkey"
            columns: ["linked_forecast_id"]
            isOneToOne: false
            referencedRelation: "event_forecasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsorship_pipeline_linked_transaction_id_fkey"
            columns: ["linked_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsorship_pipeline_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsorship_pipeline_activities: {
        Row: {
          body: string | null
          company_id: string
          id: string
          kind: Database["public"]["Enums"]["sponsorship_activity_kind"]
          metadata: Json | null
          occurred_at: string
          pipeline_id: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          company_id: string
          id?: string
          kind?: Database["public"]["Enums"]["sponsorship_activity_kind"]
          metadata?: Json | null
          occurred_at?: string
          pipeline_id: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          company_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["sponsorship_activity_kind"]
          metadata?: Json | null
          occurred_at?: string
          pipeline_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsorship_pipeline_activities_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "sponsorship_pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      static_pages: {
        Row: {
          company_id: string
          content_md: string | null
          created_at: string
          created_by: string | null
          id: string
          locale: string
          meta_description: string | null
          meta_title: string | null
          og_image_url: string | null
          published_at: string | null
          slug: string
          status: string
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id?: string
          content_md?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          locale: string
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          published_at?: string | null
          slug: string
          status?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          content_md?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          locale?: string
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          published_at?: string | null
          slug?: string
          status?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      supplier_credit_usages: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          credit_id: string
          id: string
          notes: string | null
          transaction_id: string
          used_by: string
        }
        Insert: {
          amount?: number
          company_id?: string
          created_at?: string
          credit_id: string
          id?: string
          notes?: string | null
          transaction_id: string
          used_by?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          credit_id?: string
          id?: string
          notes?: string | null
          transaction_id?: string
          used_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_credit_usages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "supplier_credits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
          doc_type: string
          file_url: string
          id: string
          name: string
          supplier_id: string
          uploaded_at: string
        }
        Insert: {
          company_id?: string
          doc_type?: string
          file_url: string
          id?: string
          name: string
          supplier_id: string
          uploaded_at?: string
        }
        Update: {
          company_id?: string
          doc_type?: string
          file_url?: string
          id?: string
          name?: string
          supplier_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          company_id: string
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppressed_emails_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_notifications_sent: {
        Row: {
          config_id: string
          id: string
          last_notified_at: string
          sync_type: string
        }
        Insert: {
          config_id: string
          id?: string
          last_notified_at?: string
          sync_type: string
        }
        Update: {
          config_id?: string
          id?: string
          last_notified_at?: string
          sync_type?: string
        }
        Relationships: []
      }
      system_audit_log: {
        Row: {
          action: string
          changed_by: string
          company_id: string
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
          company_id?: string
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
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "system_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      system_reminder_settings: {
        Row: {
          daily_send_hour_lisbon: number
          default_twilio_from: string | null
          default_whatsapp_recipient: string | null
          id: number
          updated_at: string
        }
        Insert: {
          daily_send_hour_lisbon?: number
          default_twilio_from?: string | null
          default_whatsapp_recipient?: string | null
          id?: number
          updated_at?: string
        }
        Update: {
          daily_send_hour_lisbon?: number
          default_twilio_from?: string | null
          default_whatsapp_recipient?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      system_reminders: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          due_date: string
          frequency: string
          id: string
          is_active: boolean
          key: string
          last_sent_at: string | null
          link_url: string | null
          message: string
          send_count: number
          title: string
          twilio_from: string | null
          updated_at: string
          whatsapp_recipient: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          due_date: string
          frequency?: string
          id?: string
          is_active?: boolean
          key: string
          last_sent_at?: string | null
          link_url?: string | null
          message: string
          send_count?: number
          title: string
          twilio_from?: string | null
          updated_at?: string
          whatsapp_recipient?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string
          frequency?: string
          id?: string
          is_active?: boolean
          key?: string
          last_sent_at?: string | null
          link_url?: string | null
          message?: string
          send_count?: number
          title?: string
          twilio_from?: string | null
          updated_at?: string
          whatsapp_recipient?: string | null
        }
        Relationships: []
      }
      ticket_import_logs: {
        Row: {
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "ticket_import_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "ticket_office_settlements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "ticket_sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
      ticketline_sync_config: {
        Row: {
          company_id: string
          created_at: string
          enabled: boolean
          event_id: string
          id: string
          last_run_at: string | null
          last_run_status: string | null
          organization_name: string
          sales_start_date: string | null
          ticketline_event_id: string
          updated_at: string
          vault_secret_name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled?: boolean
          event_id: string
          id?: string
          last_run_at?: string | null
          last_run_status?: string | null
          organization_name?: string
          sales_start_date?: string | null
          ticketline_event_id: string
          updated_at?: string
          vault_secret_name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled?: boolean
          event_id?: string
          id?: string
          last_run_at?: string | null
          last_run_status?: string | null
          organization_name?: string
          sales_start_date?: string | null
          ticketline_event_id?: string
          updated_at?: string
          vault_secret_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticketline_sync_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketline_sync_config_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      ticketline_sync_runs: {
        Row: {
          company_id: string
          config_id: string
          created_at: string
          error_message: string | null
          files_downloaded: Json | null
          finished_at: string | null
          id: string
          import_audit: Json | null
          mode: string
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          company_id: string
          config_id: string
          created_at?: string
          error_message?: string | null
          files_downloaded?: Json | null
          finished_at?: string | null
          id?: string
          import_audit?: Json | null
          mode: string
          started_at?: string
          status: string
          triggered_by?: string | null
        }
        Update: {
          company_id?: string
          config_id?: string
          created_at?: string
          error_message?: string | null
          files_downloaded?: Json | null
          finished_at?: string | null
          id?: string
          import_audit?: Json | null
          mode?: string
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticketline_sync_runs_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ticketline_sync_config"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets_v2_sync_log: {
        Row: {
          company_id: string | null
          context: Json | null
          created_at: string
          event_id: string | null
          id: string
          lot_id: string | null
          matched_via: string | null
          operation: string
          proposed_type_id: string | null
          proposed_type_name: string | null
          proposed_zone_signature: string[] | null
          sync_mode: string
          trigger_action: string
          warnings: string[] | null
        }
        Insert: {
          company_id?: string | null
          context?: Json | null
          created_at?: string
          event_id?: string | null
          id?: string
          lot_id?: string | null
          matched_via?: string | null
          operation: string
          proposed_type_id?: string | null
          proposed_type_name?: string | null
          proposed_zone_signature?: string[] | null
          sync_mode: string
          trigger_action: string
          warnings?: string[] | null
        }
        Update: {
          company_id?: string | null
          context?: Json | null
          created_at?: string
          event_id?: string | null
          id?: string
          lot_id?: string | null
          matched_via?: string | null
          operation?: string
          proposed_type_id?: string | null
          proposed_type_name?: string | null
          proposed_zone_signature?: string[] | null
          sync_mode?: string
          trigger_action?: string
          warnings?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_v2_sync_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_audit_log: {
        Row: {
          changed_at: string
          changed_by: string
          company_id: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          transaction_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string
          company_id?: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          transaction_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          company_id?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
            foreignKeyName: "transaction_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          company_id: string
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
          reversal_kind: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          scheduled_date: string | null
          status: string
          supplier_credit_id: string | null
          transaction_id: string
          updated_at: string
          withholding_amount: number
        }
        Insert: {
          account_id?: string | null
          amount: number
          company_id?: string
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
          reversal_kind?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          scheduled_date?: string | null
          status?: string
          supplier_credit_id?: string | null
          transaction_id: string
          updated_at?: string
          withholding_amount?: number
        }
        Update: {
          account_id?: string | null
          amount?: number
          company_id?: string
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
          reversal_kind?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          scheduled_date?: string | null
          status?: string
          supplier_credit_id?: string | null
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
            foreignKeyName: "transaction_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_payments_supplier_credit_id_fkey"
            columns: ["supplier_credit_id"]
            isOneToOne: false
            referencedRelation: "supplier_credits"
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
          company_id: string
          created_at: string
          currency: string
          date: string
          declared_withholding_amount: number | null
          declared_withholding_rate: number | null
          description: string
          due_date: string | null
          event_id: string | null
          exclude_from_result: boolean
          fx_rate: number | null
          fx_rate_source: string | null
          iban_override: string | null
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
          reversal_kind: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          settlement_id: string | null
          specification: string | null
          split_amount: number | null
          split_mode: string | null
          split_percentage: number | null
          status: string
          supplier_credit_id: string | null
          supplier_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category_id?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          date: string
          declared_withholding_amount?: number | null
          declared_withholding_rate?: number | null
          description: string
          due_date?: string | null
          event_id?: string | null
          exclude_from_result?: boolean
          fx_rate?: number | null
          fx_rate_source?: string | null
          iban_override?: string | null
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
          reversal_kind?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          settlement_id?: string | null
          specification?: string | null
          split_amount?: number | null
          split_mode?: string | null
          split_percentage?: number | null
          status?: string
          supplier_credit_id?: string | null
          supplier_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          date?: string
          declared_withholding_amount?: number | null
          declared_withholding_rate?: number | null
          description?: string
          due_date?: string | null
          event_id?: string | null
          exclude_from_result?: boolean
          fx_rate?: number | null
          fx_rate_source?: string | null
          iban_override?: string | null
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
          reversal_kind?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          settlement_id?: string | null
          specification?: string | null
          split_amount?: number | null
          split_mode?: string | null
          split_percentage?: number | null
          status?: string
          supplier_credit_id?: string | null
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
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
            foreignKeyName: "transactions_supplier_credit_id_fkey"
            columns: ["supplier_credit_id"]
            isOneToOne: false
            referencedRelation: "supplier_credits"
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
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
        Relationships: [
          {
            foreignKeyName: "trash_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      undo_actions: {
        Row: {
          action_type: string
          company_id: string
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
          company_id?: string
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
          company_id?: string
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
        Relationships: [
          {
            foreignKeyName: "undo_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_log: {
        Row: {
          company_id: string
          created_at: string
          id: string
          page: string
          user_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          page: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          page?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          company_id: string
          created_at: string
          granted: boolean
          id: string
          permission: string
          user_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          granted?: boolean
          id?: string
          permission: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          granted?: boolean
          id?: string
          permission?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          consolidate_refunds_view: boolean
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          consolidate_refunds_view?: boolean
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          consolidate_refunds_view?: boolean
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          company_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_reservations: {
        Row: {
          city_id: string | null
          company_id: string
          created_at: string
          date: string
          id: string
          notes: string | null
          venue_id: string
        }
        Insert: {
          city_id?: string | null
          company_id?: string
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          venue_id: string
        }
        Update: {
          city_id?: string | null
          company_id?: string
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
            foreignKeyName: "venue_reservations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          city_id: string
          company_id?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          address?: string | null
          capacity?: number | null
          city_id?: string
          company_id?: string
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
          {
            foreignKeyName: "venues_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      blog_posts_public: {
        Row: {
          content_en: string | null
          content_pt: string | null
          cover_image: string | null
          created_at: string | null
          excerpt_en: string | null
          excerpt_pt: string | null
          id: string | null
          published_at: string | null
          slug: string | null
          title_en: string | null
          title_pt: string | null
          updated_at: string | null
        }
        Insert: {
          content_en?: string | null
          content_pt?: string | null
          cover_image?: string | null
          created_at?: string | null
          excerpt_en?: string | null
          excerpt_pt?: string | null
          id?: string | null
          published_at?: string | null
          slug?: string | null
          title_en?: string | null
          title_pt?: string | null
          updated_at?: string | null
        }
        Update: {
          content_en?: string | null
          content_pt?: string | null
          cover_image?: string | null
          created_at?: string | null
          excerpt_en?: string | null
          excerpt_pt?: string | null
          id?: string | null
          published_at?: string | null
          slug?: string | null
          title_en?: string | null
          title_pt?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      event_faqs_public: {
        Row: {
          answer_en: string | null
          answer_pt: string | null
          category: string | null
          display_order: number | null
          event_id: string | null
          event_slug: string | null
          id: string | null
          question_en: string | null
          question_pt: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_faqs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_lineups_public: {
        Row: {
          artist_bio_en: string | null
          artist_bio_pt: string | null
          artist_image_url: string | null
          artist_name: string | null
          display_order: number | null
          event_id: string | null
          event_slug: string | null
          id: string | null
          performance_date: string | null
          performance_time: string | null
          stage: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_lineups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events_public: {
        Row: {
          cta_primary_label_en: string | null
          cta_primary_label_pt: string | null
          date: string | null
          description_en: string | null
          description_long_en: string | null
          description_long_pt: string | null
          description_pt: string | null
          endorsement_display_order: number | null
          endorsement_partner_label: string | null
          featured: boolean | null
          gallery_urls: string[] | null
          has_marketing: boolean | null
          hero_image_url: string | null
          hero_video_url: string | null
          hook_en: string | null
          hook_pt: string | null
          id: string | null
          is_endorsement: boolean | null
          is_past: boolean | null
          location_en: string | null
          location_pt: string | null
          meta_description_en: string | null
          meta_description_pt: string | null
          meta_pixel_id: string | null
          music_embed_url: string | null
          offer_availability: string | null
          offer_currency: string | null
          offer_price_max: number | null
          offer_price_min: number | null
          og_image_url: string | null
          performer_name: string | null
          performer_url: string | null
          portal_company_id: string | null
          poster_image_url: string | null
          poster_vertical_url: string | null
          press_quote_en: string | null
          press_quote_pt: string | null
          press_quote_source: string | null
          slug: string | null
          ticket_experiences: Json | null
          ticketing_url: string | null
          title_en: string | null
          title_pt: string | null
          urgency_message_en: string | null
          urgency_message_pt: string | null
          venue_directions_url: string | null
          venue_map_url: string | null
          vip_coupon_code: string | null
          vip_coupon_discount_label: string | null
          vip_coupon_valid_until: string | null
        }
        Relationships: []
      }
      home_videos_public: {
        Row: {
          company_id: string | null
          display_order: number | null
          event_id: string | null
          event_slug: string | null
          id: string | null
          title_en: string | null
          title_pt: string | null
          youtube_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "home_videos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_videos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_settings_public: {
        Row: {
          category: string | null
          company_id: string | null
          display_order: number | null
          key: string | null
          value: Json | null
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          display_order?: number | null
          key?: string | null
          value?: Json | null
        }
        Update: {
          category?: string | null
          company_id?: string | null
          display_order?: number | null
          key?: string | null
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      press_clippings_public: {
        Row: {
          created_at: string | null
          display_order: number | null
          event_id: string | null
          event_name: string | null
          id: string | null
          image: string | null
          source: string | null
          url: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          event_id?: string | null
          event_name?: string | null
          id?: string | null
          image?: string | null
          source?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          event_id?: string | null
          event_name?: string | null
          id?: string | null
          image?: string | null
          source?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "press_clippings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      static_pages_public: {
        Row: {
          content_md: string | null
          locale: string | null
          meta_description: string | null
          meta_title: string | null
          og_image_url: string | null
          published_at: string | null
          slug: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          content_md?: string | null
          locale?: string | null
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          published_at?: string | null
          slug?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          content_md?: string | null
          locale?: string | null
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          published_at?: string | null
          slug?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_companies: {
        Row: {
          company_id: string | null
          display_name: string | null
          logo_url: string | null
          primary_role: Database["public"]["Enums"]["app_role"] | null
          slug: string | null
          status: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_sync_health: {
        Row: {
          expected_runs_24h: number | null
          health: string | null
          is_stale: boolean | null
          last_run_at: string | null
          last_run_duration_sec: number | null
          last_run_status: string | null
          runs_needing_action_24h: number | null
          runs_success_24h: number | null
          seconds_since_last_run: number | null
          sync_name: string | null
        }
        Relationships: []
      }
      vw_tickets_v2_sync_summary_7d: {
        Row: {
          empresa: string | null
          eventos_afetados: number | null
          operation: string | null
          primeiro: string | null
          qtd: number | null
          trigger_action: string | null
          ultimo: string | null
        }
        Relationships: []
      }
      vw_tickets_v2_sync_warnings: {
        Row: {
          context: Json | null
          created_at: string | null
          empresa: string | null
          evento: string | null
          operation: string | null
          trigger_action: string | null
          warnings: string[] | null
        }
        Relationships: []
      }
      vw_tickets_v2_sync_would_create: {
        Row: {
          base_name: Json | null
          created_at: string | null
          empresa: string | null
          evento: string | null
          is_combo: Json | null
          lot_id: string | null
          lot_name_original: Json | null
          proposed_type_name: string | null
        }
        Relationships: []
      }
      vw_tickets_v2_test_health: {
        Row: {
          failed: number | null
          passed: number | null
          status: string | null
          suite: string | null
          total: number | null
        }
        Relationships: []
      }
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
      _test_tickets_v2_compute_function: {
        Args: never
        Returns: {
          detail: string
          passed: boolean
          test_name: string
        }[]
      }
      _test_tickets_v2_invariants: {
        Args: never
        Returns: {
          detail: string
          passed: boolean
          test_name: string
        }[]
      }
      _test_tickets_v2_trigger_log_only: {
        Args: never
        Returns: {
          detail: string
          passed: boolean
          test_name: string
        }[]
      }
      analyze_formalidade_bulk: {
        Args: { _event_ids?: string[] }
        Returns: {
          approved_total: number
          bp_amount: number
          category_code: string
          category_name: string
          confidence: string
          current_formalidade: Database["public"]["Enums"]["bp_formalidade"]
          description: string
          event_id: string
          event_name: string
          forecast_id: string
          has_transaction: boolean
          paid_total: number
          reason: string
          suggested_formalidade: Database["public"]["Enums"]["bp_formalidade"]
        }[]
      }
      apply_formalidade_suggestions: {
        Args: {
          _forecast_ids: string[]
          _new_state: Database["public"]["Enums"]["bp_formalidade"]
        }
        Returns: number
      }
      apply_formalidade_suggestions_map: {
        Args: { _payload: Json }
        Returns: number
      }
      archive_bp_version: {
        Args: {
          _performed_by?: string
          _performed_by_label?: string
          _version_id: string
        }
        Returns: undefined
      }
      audit_multi_tenant_isolation: {
        Args: never
        Returns: {
          metric: string
          value: number
        }[]
      }
      batch_insert_event_forecasts: {
        Args: { _event_id: string; _inserts?: Json; _version_id?: string }
        Returns: Json
      }
      batch_update_event_forecasts: {
        Args: { _edits?: Json; _event_id: string; _version_id?: string }
        Returns: Json
      }
      bp_version_linked_tx_count: {
        Args: { _event_id: string }
        Returns: number
      }
      calibrate_forecast_boost: {
        Args: { p_event_id: string; p_window_days?: number }
        Returns: {
          base_qty: number
          base_velocity: number
          base_window_days: number
          event_date: string
          event_id: string
          event_name: string
          final_qty: number
          final_velocity: number
          first_sale_date: string
          last_sale_date: string
          observed_boost: number
          total_qty: number
          warning: string
          window_days: number
        }[]
      }
      can_manage_event_operacao_full: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_operacao_etapa: {
        Args: { _etapa_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_event_operacao: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      check_supplier_iban_duplicate: {
        Args: { p_iban: string; p_supplier_id?: string }
        Returns: Json
      }
      cleanup_old_backups: {
        Args: never
        Returns: {
          deleted_count: number
          oldest_kept: string
        }[]
      }
      compute_ticket_type_for_lot: {
        Args: {
          p_applies_to_days: number
          p_consumes_zones: string[]
          p_is_combo: boolean
          p_lot_name: string
          p_version_id: string
          p_zone_id: string
        }
        Returns: {
          base_name: string
          found_type_id: string
          is_real_combo: boolean
          proposed_kind: string
          proposed_type_name: string
          warnings: string[]
          zone_signature: string[]
        }[]
      }
      consume_recovery_code: { Args: { _code_hash: string }; Returns: boolean }
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
      create_registro_with_media: {
        Args: { p_media?: Json; p_registro: Json }
        Returns: string
      }
      create_scenario_draft: {
        Args: {
          _description?: string
          _event_id: string
          _scenario_assumptions?: Json
          _scenario_label: string
        }
        Returns: string
      }
      create_vault_secret: {
        Args: { _description?: string; _name: string; _value: string }
        Returns: string
      }
      crm_auto_link_meta_campaigns_to_events: {
        Args: { p_company_id: string }
        Returns: {
          total_active_campaigns: number
          updated_count: number
        }[]
      }
      crm_consume_oauth_state: {
        Args: { p_state_id: string }
        Returns: {
          company_id: string
          platform: string
          user_id: string
          valid: boolean
        }[]
      }
      crm_get_meta_decrypted_token: {
        Args: { p_connection_id: string; p_master_key: string }
        Returns: {
          access_token: string
          company_id: string
          external_business_id: string
          external_business_name: string
        }[]
      }
      crm_meta_audience_collect_leads: {
        Args: { p_audience_id: string }
        Returns: {
          email: string
          phone: string
        }[]
      }
      crm_meta_audiences_dashboard: { Args: never; Returns: Json }
      crm_meta_capi_dashboard: { Args: { p_days?: number }; Returns: Json }
      crm_rgpd_erase_contact: { Args: { p_contact_id: string }; Returns: Json }
      crm_upsert_meta_connection: {
        Args: {
          p_access_token: string
          p_available_ad_accounts?: Json
          p_company_id: string
          p_expires_at: string
          p_external_business_id: string
          p_external_business_name: string
          p_master_key: string
          p_token_type: string
          p_user_id: string
        }
        Returns: string
      }
      crm_write_audit_log: {
        Args: {
          p_action: string
          p_company_id: string
          p_entity_id: string
          p_entity_type: string
          p_ip_address?: unknown
          p_payload_after?: Json
          p_payload_before?: Json
          p_user_agent?: string
          p_user_id: string
        }
        Returns: number
      }
      current_company_id: { Args: never; Returns: string }
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
      discard_scenario_draft: {
        Args: { _version_id: string }
        Returns: undefined
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_whatsapp_notification: {
        Args: {
          p_context_id?: string
          p_context_type?: string
          p_event_id?: string
          p_params: Json
          p_recipient_profile_id: string
          p_template_name: string
        }
        Returns: string
      }
      find_admin_absorbing_events: {
        Args: { p_company_id: string; p_date: string }
        Returns: {
          admin_window_end: string
          admin_window_start: string
          event_date: string
          event_id: string
          event_name: string
        }[]
      }
      formalidade_audit_stats: {
        Args: { _event_ids?: string[] }
        Returns: {
          count_estimado: number
          count_fechado: number
          count_pago_parcial: number
          count_pago_total: number
          total_events: number
          total_lines: number
          with_category_match: number
          with_direct_tx: number
          without_any_match: number
        }[]
      }
      get_app_secret: { Args: { _name: string }; Returns: string }
      get_bp_l3_attachments: {
        Args: { _event_ids: string[] }
        Returns: {
          category_id: string
          document_id: string
          event_id: string
          file_name: string
          kind: string
        }[]
      }
      get_bp_line_attachments: {
        Args: { _event_ids: string[] }
        Returns: {
          document_id: string
          file_name: string
          forecast_id: string
          kind: string
        }[]
      }
      get_event_cash_position: {
        Args: { p_company_id: string; p_date_from?: string; p_date_to?: string }
        Returns: {
          committed: number
          event_date: string
          event_id: string
          event_name: string
          is_sub: boolean
          level: string
          master_event_id: string
          parent_event_id: string
          pending: number
          realized: number
        }[]
      }
      get_event_cash_position_invariant: {
        Args: { p_company_id: string }
        Returns: {
          diff: number
          is_balanced: boolean
          lhs: number
          rhs_computebalance: number
          sum_initial: number
          sum_realized: number
        }[]
      }
      get_leads_geo_stats: { Args: { p_period?: string }; Returns: Json }
      get_user_max_daily_budget_eur: {
        Args: { _user_id: string }
        Returns: number
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_vault_secret: { Args: { _name: string }; Returns: string }
      has_company_feature: {
        Args: { _company_id: string; _feature_key: string }
        Returns: boolean
      }
      has_partner_access: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_permission_in: {
        Args: { _company_id: string; _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_in: {
        Args: {
          _company_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id?: string }; Returns: boolean }
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
          scenario_assumptions: Json
          scenario_label: string
          state: string
          superseded_at: string
          version_number: number
        }[]
      }
      list_endorsable_companies: {
        Args: { p_portal_company_id: string }
        Returns: {
          display_name: string
          id: string
          legal_name: string
        }[]
      }
      list_endorsable_events: {
        Args: {
          p_company_filter?: string
          p_hide_past?: boolean
          p_limit?: number
          p_portal_company_id: string
          p_search?: string
        }
        Returns: {
          company_display_name: string
          company_id: string
          company_legal_name: string
          date: string
          hero_image_url: string
          id: string
          name: string
          status: string
        }[]
      }
      list_orphan_transactions_for_event: {
        Args: { _event_id: string }
        Returns: {
          best_forecast_amount: number
          best_forecast_description: string
          best_forecast_id: string
          match_reason: string
          match_score: number
          transaction_id: string
          tx_amount: number
          tx_category_id: string
          tx_category_name: string
          tx_date: string
          tx_description: string
          tx_status: string
        }[]
      }
      mark_forecasts_fechado_auto: {
        Args: { _ids: string[] }
        Returns: {
          id: string
          previous_formalidade: Database["public"]["Enums"]["bp_formalidade"]
        }[]
      }
      merge_forecasts_into_active_snapshot: {
        Args: { _event_id: string; _forecast_ids: string[] }
        Returns: {
          merged_into_master: number
          merged_into_splits: number
        }[]
      }
      move_operacao_etapa: {
        Args: { p_etapa_id: string; p_new_frente_id: string }
        Returns: Json
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
      norm_coala_desc: { Args: { s: string }; Returns: string }
      portal_tick_lead_capture: { Args: never; Returns: Json }
      portal_tick_redirect_log: { Args: never; Returns: Json }
      process_lead_captures_batch: {
        Args: { p_batch_size?: number }
        Returns: Json[]
      }
      process_leads_capi_batch: {
        Args: { p_batch_size?: number }
        Returns: Json[]
      }
      process_redirect_logs_batch: {
        Args: { p_batch_size?: number }
        Returns: Json[]
      }
      promote_scenario_draft_to_active: {
        Args: {
          _new_active_description?: string
          _new_active_label?: string
          _scenario_version_id: string
        }
        Returns: string
      }
      promote_scenario_to_active: {
        Args: {
          _description?: string
          _force?: boolean
          _other_scenarios_actions?: Json
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
      recalculate_pax_benchmarks: {
        Args: { _company_id?: string }
        Returns: number
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
      record_document_download: {
        Args: {
          p_bucket?: string
          p_extra?: Json
          p_file_name?: string
          p_file_path?: string
          p_period_from?: string
          p_period_to?: string
          p_resource_id?: string
          p_resource_type: string
        }
        Returns: string
      }
      relink_orphan_transactions: {
        Args: {
          _event_id: string
          _pairs: Json
          _performed_by?: string
          _performed_by_label?: string
        }
        Returns: {
          details: Json
          relinked_count: number
          skipped_count: number
        }[]
      }
      restore_bp_versions_from_trash: {
        Args: { _trash_id: string }
        Returns: Json
      }
      reverse_payment: {
        Args: {
          p_kind: string
          p_payment_id: string
          p_reason: string
          p_valid_until?: string
        }
        Returns: Json
      }
      reverse_transaction:
        | {
            Args: {
              p_reason: string
              p_reversal_kind: string
              p_transaction_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_kind: string
              p_reason: string
              p_tx_id: string
              p_valid_until?: string
            }
            Returns: Json
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
      revoke_coala_learning: { Args: { rule_id: string }; Returns: boolean }
      row_belongs_to_current_company: {
        Args: { _row_company_id: string }
        Returns: boolean
      }
      run_operacao_sla_escalator: { Args: never; Returns: Json }
      run_rls_isolation_test: {
        Args: never
        Returns: {
          block: string
          check_name: string
          details: string
          status: string
        }[]
      }
      run_rls_legacy_audit: {
        Args: { _triggered_by?: string; _triggered_by_user?: string }
        Returns: Json
      }
      run_rls_legacy_audit_cron: { Args: never; Returns: Json }
      seed_operacao_frentes_default: {
        Args: { p_event_id: string }
        Returns: number
      }
      set_active_company: {
        Args: { target_company_id: string }
        Returns: string
      }
      set_coala_match_source: { Args: { source: string }; Returns: undefined }
      set_formalidade_auto_suggested: {
        Args: { _value: boolean }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      storage_path_belongs_to_current_company: {
        Args: { _name: string }
        Returns: boolean
      }
      suggest_formalidade: {
        Args: { _forecast_id: string }
        Returns: Database["public"]["Enums"]["bp_formalidade"]
      }
      test_latest_backup: { Args: never; Returns: Json }
      tickets_v2_run_all_tests: {
        Args: never
        Returns: {
          detail: string
          passed: boolean
          suite: string
          test_name: string
        }[]
      }
      tx_has_installment_schedule: {
        Args: { _tx_id: string }
        Returns: boolean
      }
      unarchive_bp_version: {
        Args: {
          _performed_by?: string
          _performed_by_label?: string
          _version_id: string
        }
        Returns: undefined
      }
      update_vault_secret: {
        Args: { _id: string; _value: string }
        Returns: boolean
      }
      upsert_vault_secret: {
        Args: { _description?: string; _name: string; _value: string }
        Returns: string
      }
      user_has_event_access: {
        Args: { p_event_id: string; p_user_id: string }
        Returns: boolean
      }
      user_supplier_id: { Args: { p_user_id: string }; Returns: string }
      validate_trusted_device: {
        Args: { _token_hash: string }
        Returns: boolean
      }
      validate_tx_category_l2_match: {
        Args: { _forecast_id: string; _tx_category_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "viewer"
        | "partner"
        | "marketing_manager"
        | "editor"
        | "manager"
        | "platform_admin"
        | "field_producer"
        | "producer"
        | "content_manager"
        | "accountant"
      bp_formalidade:
        | "estimado"
        | "negociacao"
        | "fechado"
        | "pago_parcial"
        | "pago_total"
      sponsorship_activity_kind:
        | "note"
        | "stage_change"
        | "doc_status_change"
        | "sync"
        | "system"
      sponsorship_doc_status:
        | "awaiting"
        | "invoice_sent"
        | "invoice_received"
        | "post_event"
      sponsorship_stage:
        | "lead"
        | "contacted"
        | "proposal_sent"
        | "negotiating"
        | "closed"
        | "barter"
        | "lost"
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
      app_role: [
        "admin",
        "user",
        "viewer",
        "partner",
        "marketing_manager",
        "editor",
        "manager",
        "platform_admin",
        "field_producer",
        "producer",
        "content_manager",
        "accountant",
      ],
      bp_formalidade: [
        "estimado",
        "negociacao",
        "fechado",
        "pago_parcial",
        "pago_total",
      ],
      sponsorship_activity_kind: [
        "note",
        "stage_change",
        "doc_status_change",
        "sync",
        "system",
      ],
      sponsorship_doc_status: [
        "awaiting",
        "invoice_sent",
        "invoice_received",
        "post_event",
      ],
      sponsorship_stage: [
        "lead",
        "contacted",
        "proposal_sent",
        "negotiating",
        "closed",
        "barter",
        "lost",
      ],
    },
  },
} as const
