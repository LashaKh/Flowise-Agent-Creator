import { createClient } from '@supabase/supabase-js';
import { env, validateEnv } from './env';
import type { Database } from '../types/database';

// Validate environment on import
validateEnv();

// Create typed Supabase client
export const supabase = createClient<Database>(
  env.supabase.url || '',
  env.supabase.anonKey || ''
);

// Export type helper for database tables
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
