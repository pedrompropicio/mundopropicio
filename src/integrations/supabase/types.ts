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
      event_cache_configs: {
        Row: {
          artist_name: string
          cache_type: string
          created_at: string
          event_id: string
          fixed_amount: number
          id: string
          percentage: number
          updated_at: string
        }
        Insert: {
          artist_name: string
          cache_type?: string
          created_at?: string
          event_id: string
          fixed_amount?: number
          id?: string
          percentage?: number
          updated_at?: string
        }
        Update: {
          artist_name?: string
          cache_type?: string
          created_at?: string
          event_id?: string
          fixed_amount?: number
          id?: string
          percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_cache_configs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
      event_forecasts: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          category_id: string | null
          created_at: string
          description: string
          event_id: string
          formula_type: string
          formula_value: number
          id: string
          iva_rate: number
          notes: string | null
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
          category_id?: string | null
          created_at?: string
          description: string
          event_id: string
          formula_type?: string
          formula_value?: number
          id?: string
          iva_rate?: number
          notes?: string | null
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
          category_id?: string | null
          created_at?: string
          description?: string
          event_id?: string
          formula_type?: string
          formula_value?: number
          id?: string
          iva_rate?: number
          notes?: string | null
          specification?: string | null
          status?: string
          transaction_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
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
            foreignKeyName: "event_forecasts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
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
      event_ticket_zones: {
        Row: {
          created_at: string
          event_id: string
          id: string
          name: string
          total_capacity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          name: string
          total_capacity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          name?: string
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
          location: string | null
          name: string
          parent_event_id: string | null
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
          location?: string | null
          name: string
          parent_event_id?: string | null
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
          location?: string | null
          name?: string
          parent_event_id?: string | null
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
      financial_accounts: {
        Row: {
          balance_visible_to_all: boolean
          created_at: string
          description: string | null
          id: string
          initial_balance: number
          is_active: boolean
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          balance_visible_to_all?: boolean
          created_at?: string
          description?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean
          name: string
          type?: string
          updated_at?: string
        }
        Update: {
          balance_visible_to_all?: boolean
          created_at?: string
          description?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_list_items: {
        Row: {
          created_at: string
          id: string
          payment_list_id: string
          transaction_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payment_list_id: string
          transaction_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
          id: string
          is_active: boolean
          name: string
          nif: string | null
          notes: string | null
          payment_terms: string | null
          phone: string | null
          rating: number | null
          swift_bic: string | null
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
          id?: string
          is_active?: boolean
          name: string
          nif?: string | null
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          rating?: number | null
          swift_bic?: string | null
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
          id?: string
          is_active?: boolean
          name?: string
          nif?: string | null
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          rating?: number | null
          swift_bic?: string | null
          trade_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ticket_sales: {
        Row: {
          created_at: string
          created_by: string
          id: string
          lot_id: string | null
          notes: string | null
          quantity: number
          sale_date: string
          unit_price: number
          zone_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          lot_id?: string | null
          notes?: string | null
          quantity?: number
          sale_date?: string
          unit_price?: number
          zone_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          lot_id?: string | null
          notes?: string | null
          quantity?: number
          sale_date?: string
          unit_price?: number
          zone_id?: string | null
        }
        Relationships: [
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
          name: string
          transaction_id: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          doc_type?: string
          file_url: string
          id?: string
          name: string
          transaction_id: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Update: {
          doc_type?: string
          file_url?: string
          id?: string
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
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          date: string
          description: string
          due_date: string | null
          event_id: string | null
          id: string
          invoice_ref: string | null
          iva_rate: number
          paid_amount: number
          payment_date: string | null
          specification: string | null
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
          date: string
          description: string
          due_date?: string | null
          event_id?: string | null
          id?: string
          invoice_ref?: string | null
          iva_rate?: number
          paid_amount?: number
          payment_date?: string | null
          specification?: string | null
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
          date?: string
          description?: string
          due_date?: string | null
          event_id?: string | null
          id?: string
          invoice_ref?: string | null
          iva_rate?: number
          paid_amount?: number
          payment_date?: string | null
          specification?: string | null
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
            foreignKeyName: "transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
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
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
