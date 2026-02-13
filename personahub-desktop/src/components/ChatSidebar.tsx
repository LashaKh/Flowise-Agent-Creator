interface ChatSidebarProps {
  personas: Array<{
    id: string;
    name: string;
    lastMessage?: string;
    unread: boolean;
  }>;
  activePersonaId: string | null;
  onSelectPersona: (personaId: string) => void;
}

export default function ChatSidebar({
  personas,
  activePersonaId,
  onSelectPersona,
}: ChatSidebarProps) {
  if (personas.length === 0) {
    return (
      <div className="w-64 bg-gray-900 border-r border-gray-800 flex items-center justify-center p-4">
        <p className="text-gray-500 text-sm text-center">
          No personas synced yet. Run a sync to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300">Conversations</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {personas.map((persona) => {
          const isActive = persona.id === activePersonaId;
          return (
            <button
              key={persona.id}
              onClick={() => onSelectPersona(persona.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-800/50 transition-colors ${
                isActive
                  ? 'bg-indigo-600/20 border-l-2 border-l-indigo-500'
                  : 'hover:bg-gray-800/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-medium truncate flex-1 ${
                    isActive ? 'text-white' : 'text-gray-300'
                  }`}
                >
                  {persona.name}
                </span>
                {persona.unread && (
                  <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                )}
              </div>
              {persona.lastMessage && (
                <p className="text-xs text-gray-500 truncate mt-1">
                  {persona.lastMessage}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
