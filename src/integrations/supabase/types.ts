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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      candidates: {
        Row: {
          availability: string | null
          created_at: string
          created_by: string
          current_company: string | null
          current_compensation: number | null
          current_location: string | null
          earliest_joining_date: string | null
          email: string
          expected_compensation: number | null
          experience_level: string
          full_name: string
          id: string
          job_role_id: string | null
          notice_period_days: number | null
          phone: string | null
          recruiter_notes: string | null
          resume_path: string | null
          skills: string[]
          status: string
          updated_at: string
          years_of_experience: number
        }
        Insert: {
          availability?: string | null
          created_at?: string
          created_by?: string
          current_company?: string | null
          current_compensation?: number | null
          current_location?: string | null
          earliest_joining_date?: string | null
          email: string
          expected_compensation?: number | null
          experience_level: string
          full_name: string
          id?: string
          job_role_id?: string | null
          notice_period_days?: number | null
          phone?: string | null
          recruiter_notes?: string | null
          resume_path?: string | null
          skills?: string[]
          status?: string
          updated_at?: string
          years_of_experience?: number
        }
        Update: {
          availability?: string | null
          created_at?: string
          created_by?: string
          current_company?: string | null
          current_compensation?: number | null
          current_location?: string | null
          earliest_joining_date?: string | null
          email?: string
          expected_compensation?: number | null
          experience_level?: string
          full_name?: string
          id?: string
          job_role_id?: string | null
          notice_period_days?: number | null
          phone?: string | null
          recruiter_notes?: string | null
          resume_path?: string | null
          skills?: string[]
          status?: string
          updated_at?: string
          years_of_experience?: number
        }
        Relationships: [
          {
            foreignKeyName: "candidates_job_role_id_fkey"
            columns: ["job_role_id"]
            isOneToOne: false
            referencedRelation: "job_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_evaluations: {
        Row: {
          candidate_id: string
          competency_scores: Json
          created_at: string
          details: Json
          id: string
          interview_id: string
          missing_information: Json
          model: string | null
          recommendation: string
          red_flags: Json
          strengths: Json
          summary: string
          weaknesses: Json
        }
        Insert: {
          candidate_id: string
          competency_scores: Json
          created_at?: string
          details?: Json
          id?: string
          interview_id: string
          missing_information?: Json
          model?: string | null
          recommendation: string
          red_flags?: Json
          strengths?: Json
          summary: string
          weaknesses?: Json
        }
        Update: {
          candidate_id?: string
          competency_scores?: Json
          created_at?: string
          details?: Json
          id?: string
          interview_id?: string
          missing_information?: Json
          model?: string | null
          recommendation?: string
          red_flags?: Json
          strengths?: Json
          summary?: string
          weaknesses?: Json
        }
        Relationships: [
          {
            foreignKeyName: "interview_evaluations_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_evaluations_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: true
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_messages: {
        Row: {
          client_message_id: string | null
          created_at: string
          id: string
          interview_id: string
          message: string
          section: string | null
          sender_type: string
          sequence_number: number
        }
        Insert: {
          client_message_id?: string | null
          created_at?: string
          id?: string
          interview_id: string
          message: string
          section?: string | null
          sender_type: string
          sequence_number: number
        }
        Update: {
          client_message_id?: string | null
          created_at?: string
          id?: string
          interview_id?: string
          message?: string
          section?: string | null
          sender_type?: string
          sequence_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "interview_messages_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          candidate_id: string
          completed_at: string | null
          created_at: string
          current_section: string
          duration_minutes: number
          experience_category: string
          id: string
          interview_type: string
          interviewer_id: string
          job_role_id: string | null
          role_context: string | null
          started_at: string
          state: Json
          status: string
        }
        Insert: {
          candidate_id: string
          completed_at?: string | null
          created_at?: string
          current_section?: string
          duration_minutes?: number
          experience_category: string
          id?: string
          interview_type?: string
          interviewer_id?: string
          job_role_id?: string | null
          role_context?: string | null
          started_at?: string
          state?: Json
          status?: string
        }
        Update: {
          candidate_id?: string
          completed_at?: string | null
          created_at?: string
          current_section?: string
          duration_minutes?: number
          experience_category?: string
          id?: string
          interview_type?: string
          interviewer_id?: string
          job_role_id?: string | null
          role_context?: string | null
          started_at?: string
          state?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_job_role_id_fkey"
            columns: ["job_role_id"]
            isOneToOne: false
            referencedRelation: "job_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_roles: {
        Row: {
          competency_configuration: Json
          created_at: string
          description: string | null
          experience_category: string
          id: string
          is_active: boolean
          title: string
        }
        Insert: {
          competency_configuration?: Json
          created_at?: string
          description?: string | null
          experience_category?: string
          id?: string
          is_active?: boolean
          title: string
        }
        Update: {
          competency_configuration?: Json
          created_at?: string
          description?: string | null
          experience_category?: string
          id?: string
          is_active?: boolean
          title?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      review_actions: {
        Row: {
          action: string
          comments: string | null
          created_at: string
          id: string
          new_status: string | null
          previous_status: string | null
          reviewer_id: string
          scorecard_id: string
        }
        Insert: {
          action: string
          comments?: string | null
          created_at?: string
          id?: string
          new_status?: string | null
          previous_status?: string | null
          reviewer_id?: string
          scorecard_id: string
        }
        Update: {
          action?: string
          comments?: string | null
          created_at?: string
          id?: string
          new_status?: string | null
          previous_status?: string | null
          reviewer_id?: string
          scorecard_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_actions_scorecard_id_fkey"
            columns: ["scorecard_id"]
            isOneToOne: false
            referencedRelation: "scorecards"
            referencedColumns: ["id"]
          },
        ]
      }
      reviewer_notes: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          interview_id: string | null
          note: string
          note_type: string
          reviewer_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          interview_id?: string | null
          note: string
          note_type?: string
          reviewer_id?: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          interview_id?: string | null
          note?: string
          note_type?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviewer_notes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviewer_notes_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_bands: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          id: string
          is_active: boolean
          job_role_id: string
          maximum_salary: number
          minimum_salary: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          id?: string
          is_active?: boolean
          job_role_id: string
          maximum_salary: number
          minimum_salary: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          id?: string
          is_active?: boolean
          job_role_id?: string
          maximum_salary?: number
          minimum_salary?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_bands_job_role_id_fkey"
            columns: ["job_role_id"]
            isOneToOne: false
            referencedRelation: "job_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      scorecards: {
        Row: {
          ai_notes: string | null
          band_max: number | null
          band_min: number | null
          candidate_id: string
          created_at: string
          expected_salary: number | null
          final_recommendation: string
          final_round_outcome: string | null
          id: string
          interview_id: string
          review_reasons: string[]
          review_required: boolean
          reviewer_status: string
          salary_alignment: string
          salary_currency: string | null
          updated_at: string
          verified_items: Json
        }
        Insert: {
          ai_notes?: string | null
          band_max?: number | null
          band_min?: number | null
          candidate_id: string
          created_at?: string
          expected_salary?: number | null
          final_recommendation: string
          final_round_outcome?: string | null
          id?: string
          interview_id: string
          review_reasons?: string[]
          review_required?: boolean
          reviewer_status?: string
          salary_alignment?: string
          salary_currency?: string | null
          updated_at?: string
          verified_items?: Json
        }
        Update: {
          ai_notes?: string | null
          band_max?: number | null
          band_min?: number | null
          candidate_id?: string
          created_at?: string
          expected_salary?: number | null
          final_recommendation?: string
          final_round_outcome?: string | null
          id?: string
          interview_id?: string
          review_reasons?: string[]
          review_required?: boolean
          reviewer_status?: string
          salary_alignment?: string
          salary_currency?: string | null
          updated_at?: string
          verified_items?: Json
        }
        Relationships: [
          {
            foreignKeyName: "scorecards_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scorecards_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: true
            referencedRelation: "interviews"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_candidate: { Args: { _cid: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "recruiter" | "reviewer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "recruiter", "reviewer"],
    },
  },
} as const
