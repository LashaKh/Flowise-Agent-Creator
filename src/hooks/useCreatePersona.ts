import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Persona, ApiResponse, PermissionConfigValue } from '../types';

interface UseCreatePersonaReturn {
  createPersona: (name: string, permissions?: PermissionConfigValue) => Promise<Persona | null>;
  isLoading: boolean;
  error: string | null;
  data: Persona | null;
}

/**
 * Custom hook to create a new persona via the Supabase Edge Function
 */
export function useCreatePersona(): UseCreatePersonaReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Persona | null>(null);

  const createPersona = async (name: string, permissions?: PermissionConfigValue): Promise<Persona | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: responseData, error: functionError } = await supabase.functions.invoke<ApiResponse<Persona>>(
        'personas',
        {
          method: 'POST',
          body: { name, permissions },
        }
      );

      if (functionError) {
        const errorMessage = functionError.message || 'Failed to create persona';
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
        setData(transformedData);
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

  return { createPersona, isLoading, error, data };
}
