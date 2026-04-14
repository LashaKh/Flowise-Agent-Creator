import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Persona, ApiResponse, PermissionConfigValue } from '../types';

interface UseCreatePersonaReturn {
  createPersona: (name: string, permissions?: PermissionConfigValue) => Promise<Persona | null>;
  isLoading: boolean;
  error: string | null;
  data: Persona | null;
}

/**
 * Custom hook to create a new persona via the Supabase Edge Function.
 *
 * Uses an `isMountedRef` to avoid setting state after unmount (audit
 * finding P4-F). Supabase's functions.invoke doesn't accept an AbortSignal
 * directly, so we use the mounted-flag pattern to at least skip stale
 * state updates on unmount.
 */
export function useCreatePersona(): UseCreatePersonaReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Persona | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const safeSet = <T,>(fn: (v: T) => void, value: T) => {
    if (isMountedRef.current) fn(value);
  };

  const createPersona = async (name: string, permissions?: PermissionConfigValue): Promise<Persona | null> => {
    safeSet(setIsLoading, true);
    safeSet(setError, null);

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
        safeSet(setError, errorMessage);
        safeSet(setIsLoading, false);
        return null;
      }

      if (responseData?.error) {
        safeSet(setError, responseData.error);
        safeSet(setIsLoading, false);
        return null;
      }

      if (responseData?.data) {
        // Transform date strings to Date objects
        const transformedData: Persona = {
          ...responseData.data,
          createdAt: new Date(responseData.data.createdAt),
          updatedAt: new Date(responseData.data.updatedAt),
        };
        safeSet(setData, transformedData);
        safeSet(setIsLoading, false);
        return transformedData;
      }

      safeSet(setError, 'Unexpected response from server');
      safeSet(setIsLoading, false);
      return null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      safeSet(setError, errorMessage);
      safeSet(setIsLoading, false);
      return null;
    }
  };

  return { createPersona, isLoading, error, data };
}
