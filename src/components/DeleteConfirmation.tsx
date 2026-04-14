import { useEffect, useRef } from 'react';

interface DeleteConfirmationProps {
  isOpen: boolean;
  personaName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal dialog for confirming persona deletion.
 *
 * Styled with the cosmic dark theme to match the rest of the app
 * (audit finding P3-G-4). Also wires up Escape-to-close and an initial
 * focus on Cancel for keyboard accessibility (audit finding P4-A-1).
 */
export function DeleteConfirmation({
  isOpen,
  personaName,
  onConfirm,
  onCancel,
}: DeleteConfirmationProps) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Focus Cancel when the modal opens and handle Escape-to-close.
  useEffect(() => {
    if (!isOpen) return;
    cancelBtnRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-persona-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative glass-strong rounded-2xl card-cosmic max-w-md w-full mx-4 p-6 border border-white/10">
        {/* Warning Icon */}
        <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-500/15 border border-red-500/30 rounded-full">
          <svg
            className="w-6 h-6 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Content */}
        <h3 id="delete-persona-title" className="text-lg font-display font-semibold text-white text-center mb-2">
          Delete Persona
        </h3>
        <p className="text-gray-400 text-center mb-6 font-body">
          Are you sure you want to delete{' '}
          <span className="font-semibold text-white">&quot;{personaName}&quot;</span>?
          This action cannot be undone and will permanently remove the persona
          and its API endpoint.
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            ref={cancelBtnRef}
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 font-display font-semibold glass hover:glass-strong border border-white/10 text-gray-300 hover:text-white rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 font-display font-semibold text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-xl transition-all shadow-lg shadow-red-500/20"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
