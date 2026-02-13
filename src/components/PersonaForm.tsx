import { useState, type FormEvent, type ChangeEvent } from 'react';
import toast from 'react-hot-toast';
import { useCreatePersona } from '../hooks/useCreatePersona';
import { PermissionConfig } from './PermissionConfig';
import { DEFAULT_PERMISSIONS } from '../types';
import type { Persona, PermissionConfigValue } from '../types';

interface PersonaFormProps {
  onSuccess: (persona: Persona) => void;
}

const MAX_NAME_LENGTH = 100;

export function PersonaForm({ onSuccess }: PersonaFormProps) {
  const [name, setName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionConfigValue>({ ...DEFAULT_PERMISSIONS });
  const [permissionsOpen, setPermissionsOpen] = useState(false);
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

    const persona = await createPersona(name.trim(), permissions);

    if (persona) {
      toast.success(`Persona "${persona.name}" created successfully!`);
      setName('');
      setPermissions({ ...DEFAULT_PERMISSIONS });
      setPermissionsOpen(false);
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

      {/* Collapsible Desktop Permissions */}
      <div className="glass rounded-xl border border-white/5 overflow-hidden">
        <button
          type="button"
          onClick={() => setPermissionsOpen(!permissionsOpen)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
        >
          <span className="text-sm font-display font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
            <svg className="w-4 h-4 text-cosmic-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Desktop Permissions
          </span>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${permissionsOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {permissionsOpen && (
          <div className="px-5 pb-5 border-t border-white/5 pt-4">
            <PermissionConfig value={permissions} onChange={setPermissions} />
          </div>
        )}
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
