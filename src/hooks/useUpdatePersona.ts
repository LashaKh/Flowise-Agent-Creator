import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Persona, ApiResponse, UpdatePersonaRequest } from '../types';

interface UseUpdatePersonaReturn {
  updatePersona: (updates: UpdatePersonaRequest) => Promise<Persona | null>;
  isLoading: boolean;
  error: string | null;
}

/**
 * Custom hook to update a persona via the Supabase Edge Function
 * @param personaId - The ID of the persona to update
 */
export function useUpdatePersona(personaId: string): UseUpdatePersonaReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePersona = async (updates: UpdatePersonaRequest): Promise<Persona | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: responseData, error: functionError } = await supabase.functions.invoke<ApiResponse<Persona>>(
        `personas/${personaId}`,
        {
          method: 'PATCH',
          body: updates,
        }
      );

      if (functionError) {
        const errorMessage = functionError.message || 'Failed to update persona';
        setError(errorMessage);
        setIsLoading(false);
        return null;
      }

      if (responseData?.error) {
        setError(responseData.error);
        setIsLoading(false);
        return null;
      }

      if (responseData?.data) {
        // Transform date strings to Date objects
        const transformedData: Persona = {
          ...responseData.data,
          createdAt: new Date(responseData.data.createdAt),
          updatedAt: new Date(responseData.data.updatedAt),
        };
        setIsLoading(false);
        return transformedData;
      }

      setError('Unexpected response from server');
      setIsLoading(false);
      return null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      setIsLoading(false);
      return null;
    }
  };

  return { updatePersona, isLoading, error };
}
