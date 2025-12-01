import { useEffect, useRef } from 'react';
import { PersonaSelector } from './PersonaSelector';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { useChat } from '../hooks/useChat';
import type { Persona } from '../types';

interface ChatWindowProps {
  /** Array of all personas (active and inactive) */
  personas: Persona[];

  /** Currently selected persona to chat with */
  selectedPersona: Persona | null;

  /** Callback when persona selection changes */
  onSelectPersona: (persona: Persona | null) => void;

  /** Optional loading state for personas list */
  isLoadingPersonas?: boolean;

  /** Callback to navigate to Create tab */
  onNavigateToCreate?: () => void;
}

/**
 * ChatWindow Component
 *
 * Main chat interface combining persona selection, message display, and input.
 * Handles the complete chat experience for interacting with AI personas.
 *
 * Features:
 * - Persona selection dropdown at top
 * - Scrollable message list with auto-scroll to bottom
 * - Chat input with send functionality
 * - Empty states for various scenarios
 * - Streaming message support
 * - Error handling with retry
 *
 * Layout Structure:
 * ┌─────────────────────────────────────┐
 * │  PersonaSelector                     │
 * ├─────────────────────────────────────┤
 * │                                      │
 * │  Message List (scrollable)           │
 * │  - ChatMessage components            │
 * │  - Auto-scroll on new messages       │
 * │                                      │
 * ├─────────────────────────────────────┤
 * │  ChatInput                           │
 * └─────────────────────────────────────┘
 */
export function ChatWindow({
  personas,
  selectedPersona,
  onSelectPersona,
  isLoadingPersonas = false,
  onNavigateToCreate,
}: ChatWindowProps) {
  // ============================================
  // Chat State Management
  // ============================================

  const { messages, isLoading, error, sendMessage, retryLastMessage } = useChat(
    selectedPersona?.chatflowId || null
  );

  // Ref for auto-scrolling to bottom on new messages
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ============================================
  // Auto-Scroll to Bottom
  // ============================================

  /**
   * Scroll to bottom when new messages arrive
   * Uses smooth behavior for better UX
   */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ============================================
  // Event Handlers
  // ============================================

  /**
   * Handle sending a message from ChatInput
   */
  const handleSendMessage = async (content: string) => {
    await sendMessage(content);
  };

  /**
   * Handle retry button click in error messages
   */
  const handleRetry = async () => {
    await retryLastMessage();
  };

  // ============================================
  // Empty States
  // ============================================

  /**
   * Empty State: No personas created yet
   */
  const renderNoPersonasState = () => (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-cosmic-cyan/20 to-cosmic-purple/20 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-cosmic-cyan"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
        </div>
        <h3 className="text-xl font-display font-bold text-white mb-3">
          No Personas Yet
        </h3>
        <p className="text-gray-400 font-body mb-6">
          Create your first AI persona to start chatting. Each persona has a unique
          personality and knowledge domain.
        </p>
        <button
          onClick={onNavigateToCreate}
          className="btn-cosmic px-6 py-3 rounded-xl font-display font-semibold"
        >
          Create Your First Persona
        </button>
      </div>
    </div>
  );

  /**
   * Empty State: No persona selected
   */
  const renderNoSelectionState = () => (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-cosmic-cyan/20 to-cosmic-purple/20 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-cosmic-purple"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </div>
        <h3 className="text-xl font-display font-bold text-white mb-3">
          Select a Persona
        </h3>
        <p className="text-gray-400 font-body">
          Choose a persona from the dropdown above to start a conversation.
        </p>
      </div>
    </div>
  );

  /**
   * Empty State: Persona selected but no messages yet
   */
  const renderWelcomeState = () => (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-cosmic-cyan to-cosmic-purple flex items-center justify-center">
          <span className="text-3xl font-display font-bold text-white">
            {selectedPersona!.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <h3 className="text-xl font-display font-bold text-white mb-3">
          Chat with {selectedPersona!.name}
        </h3>
        <p className="text-gray-400 font-body">
          Start a conversation by typing a message below. This persona is powered
          by AI and can help with various tasks.
        </p>
      </div>
    </div>
  );

  /**
   * Message List: Display chat messages with auto-scroll
   */
  const renderMessageList = () => (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          onRetry={message.error && message.role === 'user' ? handleRetry : undefined}
        />
      ))}
      {/* Invisible element at bottom for auto-scroll anchor */}
      <div ref={messagesEndRef} />
    </div>
  );

  // ============================================
  // Determine Content State
  // ============================================

  /**
   * Determine which content to render based on current state
   */
  const renderContent = () => {
    // Loading personas
    if (isLoadingPersonas) {
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <svg
              className="animate-spin h-10 w-10 text-cosmic-cyan mx-auto mb-4"
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
            <p className="text-gray-400 font-body">Loading personas...</p>
          </div>
        </div>
      );
    }

    // No personas created
    if (personas.length === 0) {
      return renderNoPersonasState();
    }

    // No persona selected
    if (!selectedPersona) {
      return renderNoSelectionState();
    }

    // Persona selected but no messages
    if (messages.length === 0) {
      return renderWelcomeState();
    }

    // Show messages
    return renderMessageList();
  };

  // ============================================
  // Render
  // ============================================

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[400px] md:min-h-[500px] glass-strong rounded-2xl overflow-hidden">
      {/* Header: Persona Selector */}
      <div className="p-3 md:p-4 border-b border-white/10">
        <PersonaSelector
          personas={personas}
          selectedPersona={selectedPersona}
          onSelect={onSelectPersona}
          disabled={isLoadingPersonas}
        />
      </div>

      {/* Content: Messages or Empty States */}
      {renderContent()}

      {/* Footer: Chat Input */}
      <div className="p-3 md:p-4 border-t border-white/10">
        {error && (
          <div className="mb-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-red-400 font-body">{error}</p>
              </div>
            </div>
          </div>
        )}

        <ChatInput
          onSend={handleSendMessage}
          disabled={!selectedPersona || selectedPersona.status !== 'active'}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
