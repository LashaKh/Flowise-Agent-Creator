import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface UseDeletePersonaReturn {
  deletePersona: (personaId: string) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
}

/**
 * Custom hook to delete a persona via the Supabase Edge Function
 */
export function useDeletePersona(): UseDeletePersonaReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deletePersona = async (personaId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      // Get the session token for authorization
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Make a direct fetch request to the Edge Function with personaId in URL
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/personas/${personaId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to delete persona' }));
        throw new Error(errorData.error || 'Failed to delete persona');
      }

      const responseData = await response.json();

      if (responseData?.error) {
        setError(responseData.error);
        setIsLoading(false);
        return false;
      }

      setIsLoading(false);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      setIsLoading(false);
      return false;
    }
  };

  return { deletePersona, isLoading, error };
}
