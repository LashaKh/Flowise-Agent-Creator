import { useState, type FormEvent, type ChangeEvent } from 'react';
import toast from 'react-hot-toast';
import { useCreatePersona } from '../hooks/useCreatePersona';
import type { Persona } from '../types';

interface PersonaFormProps {
  onSuccess: (persona: Persona) => void;
}

const MAX_NAME_LENGTH = 100;

export function PersonaForm({ onSuccess }: PersonaFormProps) {
  const [name, setName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const { createPersona, isLoading } = useCreatePersona();

  const validateName = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'Name is required';
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      return `Name must be ${MAX_NAME_LENGTH} characters or less`;
    }
    return null;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setName(value);

    // Clear validation error when user starts typing
    if (validationError) {
      setValidationError(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const error = validateName(name);
    if (error) {
      setValidationError(error);
      return;
    }

    const persona = await createPersona(name.trim());

    if (persona) {
      toast.success(`Persona "${persona.name}" created successfully!`);
      setName('');
      onSuccess(persona);
    } else {
      toast.error('Failed to create persona. Please try again.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-6">
      <div className="space-y-3">
        <label
          htmlFor="persona-name"
          className="block text-sm font-display font-semibold text-cosmic-cyan uppercase tracking-wide"
        >
          Famous Person's Name
        </label>
        <input
          id="persona-name"
          type="text"
          value={name}
          onChange={handleChange}
          placeholder="e.g., Albert Einstein"
          disabled={isLoading}
          className={`
            w-full px-5 py-4 glass border rounded-xl
            text-white font-body placeholder:text-gray-500
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all
            ${validationError
              ? 'border-red-500/50 focus:border-red-500'
              : 'border-white/10 hover:border-cosmic-cyan/30'
            }
          `}
        />
        {validationError && (
          <p className="text-sm text-red-400 font-body flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
            </svg>
            {validationError}
          </p>
        )}
        <p className="text-xs text-gray-500 font-body">
          {name.length}/{MAX_NAME_LENGTH} characters
        </p>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className={`
          w-full px-6 py-4 font-display font-bold rounded-xl text-lg
          transition-all
          ${isLoading
            ? 'btn-cosmic opacity-70 cursor-not-allowed'
            : 'btn-cosmic hover:scale-[1.02]'
          }
        `}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-3">
            <svg
              className="animate-spin h-6 w-6 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Summoning Persona...
          </span>
        ) : (
          'Create Persona'
        )}
      </button>
    </form>
  );
}
