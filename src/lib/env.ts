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
    // Audit finding P3-G-1: the .env file defines VITE_FLOWISE_API_URL but
    // the code was reading VITE_FLOWISE_URL. Masked by the fallback being
    // identical to the current Flowise host. Now reads the correct name.
    baseUrl: import.meta.env.VITE_FLOWISE_API_URL || 'https://flowise-2-0.onrender.com',
    apiKey: (import.meta.env.VITE_FLOWISE_API_KEY as string | undefined) || '',
  },
} as const;

// Validate required environment variables. Throws instead of warning so
// misconfigurations fail loudly at startup rather than causing cryptic
// network errors later (audit finding P3-G-3).
export function validateEnv(): void {
  const missing: string[] = [];

  if (!env.supabase.url) missing.push('VITE_SUPABASE_URL');
  if (!env.supabase.anonKey) missing.push('VITE_SUPABASE_ANON_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      `Add them to your .env file and restart the dev server.`
    );
  }
}
