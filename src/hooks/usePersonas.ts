import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Persona, ApiResponse } from '../types';

interface UsePersonasReturn {
  personas: Persona[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch user's personas via the Supabase Edge Function
 */
export function usePersonas(): UsePersonasReturn {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPersonas = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: responseData, error: functionError } = await supabase.functions.invoke<ApiResponse<Persona[]>>(
        'personas',
        {
          method: 'GET',
        }
      );

      if (functionError) {
        const errorMessage = functionError.message || 'Failed to fetch personas';
        setError(errorMessage);
        setIsLoading(false);
        return;
      }

      if (responseData?.error) {
        setError(responseData.error);
        setIsLoading(false);
        return;
      }

      if (responseData?.data) {
        // Transform date strings to Date objects for each persona
        const transformedData = responseData.data.map((persona) => ({
          ...persona,
          createdAt: new Date(persona.createdAt),
          updatedAt: new Date(persona.updatedAt),
        }));
        setPersonas(transformedData);
      } else {
        setPersonas([]);
      }

      setIsLoading(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPersonas();
  }, [fetchPersonas]);

  return { personas, isLoading, error, refetch: fetchPersonas };
}
