/**
 * Modal — Shared modal wrapper with Escape-to-close and focus trap.
 *
 * Audit finding P4-A-1: all 5 desktop modals previously lacked keyboard
 * handling (Escape, Tab cycling) and ARIA attributes. This wrapper
 * centralizes that behavior so every modal is accessible by default.
 */
import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
  /** If false, clicking the backdrop will not close the modal. */
  closeOnBackdrop?: boolean;
}

export default function Modal({
  isOpen,
  onClose,
  labelledBy,
  className = '',
  children,
  closeOnBackdrop = true,
}: ModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus management + Escape-to-close + Tab trap
  useEffect(() => {
    if (!isOpen) return;

    // Remember the element that had focus before the modal opened so we can
    // restore focus to it on close (standard modal a11y pattern).
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus the first focusable element in the modal.
    const focusables = containerRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusables?.[0]?.focus();

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && focusables && focusables.length > 0) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) return;
        // Trap Tab cycling inside the modal
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={containerRef}
        className={className}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
