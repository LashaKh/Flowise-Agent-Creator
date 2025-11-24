export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      personas: {
        Row: {
          api_endpoint: string
          chatflow_id: string
          created_at: string | null
          error_message: string | null
          id: string
          name: string
          settings: Json | null
          status: string | null
          system_prompt: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          api_endpoint: string
          chatflow_id: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          name: string
          settings?: Json | null
          status?: string | null
          system_prompt: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          api_endpoint?: string
          chatflow_id?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          name?: string
          settings?: Json | null
          status?: string | null
          system_prompt?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
