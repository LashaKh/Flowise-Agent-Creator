import { useState, useRef, useEffect } from 'react';
import type { Persona } from '../types';

interface PersonaSelectorProps {
  personas: Persona[];
  selectedPersona: Persona | null;
  onSelect: (persona: Persona | null) => void;
  disabled?: boolean;
}

/**
 * PersonaSelector Component
 *
 * A custom dropdown selector for choosing AI personas to chat with.
 * Filters to show only active personas and provides a cosmic-themed UI.
 *
 * Features:
 * - Custom dropdown (not native select) matching cosmic theme
 * - Filters out non-active personas
 * - Click-outside detection to close dropdown
 * - Keyboard navigation support (Escape to close)
 * - Disabled state support
 */
export function PersonaSelector({
  personas,
  selectedPersona,
  onSelect,
  disabled = false,
}: PersonaSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter to only show active personas
  const activePersonas = personas.filter((p) => p.status === 'active');

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  const handleSelect = (persona: Persona) => {
    onSelect(persona);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Dropdown Trigger */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        className={`
          w-full glass-strong rounded-xl px-4 py-3 border border-white/20
          flex items-center justify-between
          transition-all select-none
          ${disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:border-cosmic-cyan/40 cursor-pointer'
          }
          ${isOpen ? 'border-cosmic-cyan/50' : ''}
        `}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Persona Icon */}
          <div className={`
            flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
            ${selectedPersona
              ? 'bg-gradient-to-br from-cosmic-cyan to-cosmic-purple'
              : 'bg-white/10'
            }
          `}>
            {selectedPersona ? (
              <span className="text-sm font-display font-bold text-white">
                {selectedPersona.name.charAt(0).toUpperCase()}
              </span>
            ) : (
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
          </div>

          {/* Persona Name or Placeholder */}
          <span className={`
            font-body truncate
            ${selectedPersona ? 'text-white' : 'text-gray-500'}
          `}>
            {selectedPersona ? selectedPersona.name : 'Select a persona to chat'}
          </span>
        </div>

        {/* Clear Button (when selected) & Dropdown Arrow */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {selectedPersona && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Clear selection"
            >
              <svg className="w-4 h-4 text-gray-400 hover:text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {/* Dropdown Arrow */}
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-2 glass-strong rounded-xl border border-cosmic-cyan/30 shadow-lg overflow-hidden">
          {activePersonas.length === 0 ? (
            /* Empty State */
            <div className="px-4 py-8 text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="text-sm text-gray-400 font-body">No active personas available</p>
              <p className="text-xs text-gray-500 font-body mt-1">Create a persona to get started</p>
            </div>
          ) : (
            /* Persona List */
            <div className="max-h-64 overflow-y-auto">
              {activePersonas.map((persona) => {
                const isSelected = selectedPersona?.id === persona.id;
                return (
                  <button
                    key={persona.id}
                    type="button"
                    onClick={() => handleSelect(persona)}
                    className={`
                      w-full px-4 py-3 flex items-center gap-3
                      transition-colors text-left
                      ${isSelected
                        ? 'bg-cosmic-cyan/20 border-l-2 border-cosmic-cyan'
                        : 'hover:bg-white/10 border-l-2 border-transparent'
                      }
                    `}
                  >
                    {/* Persona Avatar */}
                    <div className={`
                      flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                      bg-gradient-to-br from-cosmic-cyan to-cosmic-purple
                    `}>
                      <span className="text-sm font-display font-bold text-white">
                        {persona.name.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    {/* Persona Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-body font-medium text-white truncate">
                        {persona.name}
                      </p>
                      <p className="text-xs text-gray-400 font-body truncate">
                        Created {persona.createdAt.toLocaleDateString()}
                      </p>
                    </div>

                    {/* Selected Indicator */}
                    {isSelected && (
                      <svg className="w-5 h-5 text-cosmic-cyan flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
