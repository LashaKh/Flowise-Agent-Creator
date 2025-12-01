import type { Persona } from '../types';
import { PersonaCard } from './PersonaCard';

interface PersonaListProps {
  personas: Persona[];
  isLoading: boolean;
  onSelect: (persona: Persona) => void;
  onDelete: (personaId: string) => void;
  /** Optional callback to open chat with a persona */
  onChat?: (persona: Persona) => void;
}

/**
 * Loading skeleton for persona cards
 */
function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-white rounded-lg shadow border border-gray-200 p-5 animate-pulse"
        >
          {/* Header skeleton */}
          <div className="flex items-start justify-between mb-3">
            <div className="h-6 bg-gray-200 rounded w-2/3" />
            <div className="h-5 bg-gray-200 rounded-full w-16" />
          </div>
          {/* Date skeleton */}
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
          {/* Actions skeleton */}
          <div className="flex gap-2">
            <div className="flex-1 h-9 bg-gray-200 rounded-lg" />
            <div className="w-16 h-9 bg-gray-200 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state when no personas exist
 */
function EmptyState() {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
        <svg
          className="w-8 h-8 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-1">No personas created yet</h3>
      <p className="text-gray-500">Create your first AI persona to get started.</p>
    </div>
  );
}

/**
 * Grid layout component for displaying persona cards
 */
export function PersonaList({ personas, isLoading, onSelect, onDelete, onChat }: PersonaListProps) {
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (personas.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {personas.map((persona) => (
        <PersonaCard
          key={persona.id}
          persona={persona}
          onSelect={onSelect}
          onDelete={onDelete}
          onChat={onChat}
        />
      ))}
    </div>
  );
}
