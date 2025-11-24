/**
 * Environment configuration
 * All environment variables should be accessed through this module
 */

export const env = {
  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL as string,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  },
  flowise: {
    baseUrl: import.meta.env.VITE_FLOWISE_URL || 'https://flowise-2-0.onrender.com',
  },
} as const;

// Validate required environment variables
export function validateEnv(): void {
  const missing: string[] = [];

  if (!env.supabase.url) missing.push('VITE_SUPABASE_URL');
  if (!env.supabase.anonKey) missing.push('VITE_SUPABASE_ANON_KEY');

  if (missing.length > 0) {
    console.warn(`Missing environment variables: ${missing.join(', ')}`);
  }
}
