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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      case_keywords: {
        Row: {
          case_id: string
          keyword_id: string
        }
        Insert: {
          case_id: string
          keyword_id: string
        }
        Update: {
          case_id?: string
          keyword_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_keywords_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "practice_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_keywords_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keywords"
            referencedColumns: ["id"]
          },
        ]
      }
      case_legal_links: {
        Row: {
          case_id: string
          created_at: string
          id: string
          note: string | null
          section_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          note?: string | null
          section_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          note?: string | null
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_legal_links_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "practice_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_legal_links_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "legal_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          created_at: string
          description: string | null
          fields: Json
          id: string
          slug: string | null
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          fields?: Json
          id?: string
          slug?: string | null
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          fields?: Json
          id?: string
          slug?: string | null
          title?: string
        }
        Relationships: []
      }
      keywords: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      legal_sections: {
        Row: {
          content: string | null
          created_at: string
          id: string
          note: string | null
          reference: string
          source_id: string
          title: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          note?: string | null
          reference: string
          source_id: string
          title?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          note?: string | null
          reference?: string
          source_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_sections_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "legal_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_sources: {
        Row: {
          created_at: string
          description: string | null
          id: string
          scope: string | null
          short_name: string | null
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          scope?: string | null
          short_name?: string | null
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          scope?: string | null
          short_name?: string | null
          title?: string
        }
        Relationships: []
      }
      practice_cases: {
        Row: {
          ampel: Database["public"]["Enums"]["ampel_status"]
          category: string | null
          checklist: string[]
          common_mistakes: string[]
          created_at: string
          decision_tree: Json
          documentation: string[]
          faq: Json
          id: string
          immediate_actions: string | null
          legal_explanation: string | null
          practice_tip: string | null
          recommendation: string | null
          related_cases: string[]
          responsibilities: string | null
          short_answer: string | null
          short_description: string | null
          status: Database["public"]["Enums"]["case_status"]
          subcategory: string | null
          title: string
          updated_at: string
        }
        Insert: {
          ampel?: Database["public"]["Enums"]["ampel_status"]
          category?: string | null
          checklist?: string[]
          common_mistakes?: string[]
          created_at?: string
          decision_tree?: Json
          documentation?: string[]
          faq?: Json
          id?: string
          immediate_actions?: string | null
          legal_explanation?: string | null
          practice_tip?: string | null
          recommendation?: string | null
          related_cases?: string[]
          responsibilities?: string | null
          short_answer?: string | null
          short_description?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          subcategory?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          ampel?: Database["public"]["Enums"]["ampel_status"]
          category?: string | null
          checklist?: string[]
          common_mistakes?: string[]
          created_at?: string
          decision_tree?: Json
          documentation?: string[]
          faq?: Json
          id?: string
          immediate_actions?: string | null
          legal_explanation?: string | null
          practice_tip?: string | null
          recommendation?: string | null
          related_cases?: string[]
          responsibilities?: string | null
          short_answer?: string | null
          short_description?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          subcategory?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      practice_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "practice_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "practice_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          description: string | null
          id: string
          name: string
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
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
      ampel_status: "gruen" | "gelb" | "rot"
      case_status: "draft" | "review" | "published" | "archived"
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
      ampel_status: ["gruen", "gelb", "rot"],
      case_status: ["draft", "review", "published", "archived"],
    },
  },
} as const
