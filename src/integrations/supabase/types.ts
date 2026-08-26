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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          archived: boolean
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          tier: string
          type: string
        }
        Insert: {
          archived?: boolean
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          tier?: string
          type?: string
        }
        Update: {
          archived?: boolean
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          tier?: string
          type?: string
        }
        Relationships: []
      }
      agreements: {
        Row: {
          content: string
          created_at: string
          id: string
          pdf_url: string | null
          proposal_id: string
          type: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          pdf_url?: string | null
          proposal_id: string
          type?: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          pdf_url?: string | null
          proposal_id?: string
          type?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agreements_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          balance_cents: number
          created_at: string
          deposit_cents: number
          due_date: string | null
          id: string
          number: string
          pdf_url: string | null
          proposal_id: string
          status: string
          stripe_payment_link: string | null
        }
        Insert: {
          amount_cents?: number
          balance_cents?: number
          created_at?: string
          deposit_cents?: number
          due_date?: string | null
          id?: string
          number: string
          pdf_url?: string | null
          proposal_id: string
          status?: string
          stripe_payment_link?: string | null
        }
        Update: {
          amount_cents?: number
          balance_cents?: number
          created_at?: string
          deposit_cents?: number
          due_date?: string | null
          id?: string
          number?: string
          pdf_url?: string | null
          proposal_id?: string
          status?: string
          stripe_payment_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          account_id: string
          archived: boolean
          budget_estimate_cents: number | null
          created_at: string
          event_date: string | null
          id: string
          service_line: string
          stage: string
          title: string
          venue: string | null
        }
        Insert: {
          account_id: string
          archived?: boolean
          budget_estimate_cents?: number | null
          created_at?: string
          event_date?: string | null
          id?: string
          service_line: string
          stage?: string
          title: string
          venue?: string | null
        }
        Update: {
          account_id?: string
          archived?: boolean
          budget_estimate_cents?: number | null
          created_at?: string
          event_date?: string | null
          id?: string
          service_line?: string
          stage?: string
          title?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_line_items: {
        Row: {
          created_at: string
          id: string
          line_total_cents: number
          name: string
          position: number
          proposal_id: string
          qty: number
          rate_card_item_id: string | null
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total_cents?: number
          name: string
          position?: number
          proposal_id: string
          qty?: number
          rate_card_item_id?: string | null
          unit_price_cents?: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total_cents?: number
          name?: string
          position?: number
          proposal_id?: string
          qty?: number
          rate_card_item_id?: string | null
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_line_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_line_items_rate_card_item_id_fkey"
            columns: ["rate_card_item_id"]
            isOneToOne: false
            referencedRelation: "rate_card_items"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          archived: boolean
          created_at: string
          essence_image_urls: string[]
          id: string
          number: string
          pdf_url: string | null
          project_id: string
          sent_at: string | null
          status: string
          subtotal_cents: number
          total_cents: number
        }
        Insert: {
          archived?: boolean
          created_at?: string
          essence_image_urls?: string[]
          id?: string
          number: string
          pdf_url?: string | null
          project_id: string
          sent_at?: string | null
          status?: string
          subtotal_cents?: number
          total_cents?: number
        }
        Update: {
          archived?: boolean
          created_at?: string
          essence_image_urls?: string[]
          id?: string
          number?: string
          pdf_url?: string | null
          project_id?: string
          sent_at?: string | null
          status?: string
          subtotal_cents?: number
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_card_items: {
        Row: {
          archived: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          service_line: string
          unit: string
          unit_price_cents: number
        }
        Insert: {
          archived?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          service_line: string
          unit?: string
          unit_price_cents?: number
        }
        Update: {
          archived?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          service_line?: string
          unit?: string
          unit_price_cents?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      next_invoice_number: { Args: never; Returns: string }
      next_proposal_number: { Args: never; Returns: string }
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
