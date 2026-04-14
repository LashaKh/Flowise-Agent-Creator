import type { Persona, PersonaStatus } from '../types';

interface PersonaCardProps {
  persona: Persona;
  onSelect: (persona: Persona) => void;
  onDelete: (personaId: string) => void;
  /** Optional callback to open chat with this persona */
  onChat?: (persona: Persona) => void;
}

/**
 * Get status badge styling based on persona status
 */
function getStatusStyles(status: PersonaStatus): { gradient: string; dot: string } {
  switch (status) {
    case 'active':
      return { gradient: 'bg-gradient-to-r from-green-400 to-emerald-500', dot: 'bg-green-400' };
    case 'failed':
      return { gradient: 'bg-gradient-to-r from-red-400 to-pink-500', dot: 'bg-red-400' };
    case 'creating':
      return { gradient: 'bg-gradient-to-r from-yellow-400 to-orange-500', dot: 'bg-yellow-400' };
    default:
      return { gradient: 'bg-gradient-to-r from-gray-400 to-gray-500', dot: 'bg-gray-400' };
  }
}

/**
 * Format date to readable string
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

/**
 * Card component for displaying a single persona.
 *
 * NOTE: The card delegates delete confirmation to the parent (App.tsx) so
 * there's only ONE confirmation modal shown to the user. Audit finding P2-7
 * removed the previous double-modal flow where both PersonaCard and App.tsx
 * rendered their own DeleteConfirmation back-to-back.
 */
export function PersonaCard({ persona, onSelect, onDelete, onChat }: PersonaCardProps) {
  const statusStyles = getStatusStyles(persona.status);

  const handleDeleteClick = () => {
    onDelete(persona.id);
  };

  return (
    <>
      <div className="glass-strong rounded-2xl p-6 card-cosmic hover:scale-[1.02] transition-all group">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-xl font-display font-bold text-white truncate pr-2 group-hover:text-cosmic-cyan transition-colors">
            {persona.name}
          </h3>
          {/* Status Badge */}
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold font-display ${statusStyles.gradient} text-white uppercase tracking-wide`}
          >
            <span className={`w-1.5 h-1.5 rounded-full mr-2 ${statusStyles.dot} animate-pulse`} />
            {persona.status}
          </span>
        </div>

        {/* Creation Date */}
        <p className="text-sm text-gray-400 font-body mb-6 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Created {formatDate(persona.createdAt)}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => onSelect(persona)}
            className="flex-1 px-4 py-2.5 text-sm font-display font-semibold btn-cosmic rounded-xl transition-all hover:scale-105"
          >
            View Details
          </button>
          {/* Chat Button - only show for active personas */}
          {onChat && persona.status === 'active' && (
            <button
              onClick={() => onChat(persona)}
              className="px-4 py-2.5 text-sm font-display font-semibold glass hover:glass-strong border border-cosmic-cyan/30 text-cosmic-cyan hover:text-white rounded-xl transition-all hover:scale-105 flex items-center gap-2"
              title="Chat with this persona"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Chat
            </button>
          )}
          <button
            onClick={handleDeleteClick}
            className="px-4 py-2.5 text-sm font-display font-semibold glass hover:glass-strong border border-red-500/30 text-red-400 hover:text-red-300 rounded-xl transition-all hover:scale-105"
          >
            Delete
          </button>
        </div>
      </div>
    </>
  );
}
