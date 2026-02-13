/**
 * Activity Log — Shows everything the AI personas have done.
 *
 * Like a security camera feed for your files: every read, write, delete,
 * and denied attempt is logged here with timestamps and undo buttons.
 */
import { useState, useEffect, useCallback } from 'react';
import type { ActionLogEntry } from '../types';

type FilterResult = 'all' | 'allowed' | 'denied' | 'confirmed' | 'undone';

export default function ActivityLog() {
  const [entries, setEntries] = useState<ActionLogEntry[]>([]);
  const [filterResult, setFilterResult] = useState<FilterResult>('all');
  const [filterPersona, setFilterPersona] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadEntries = useCallback(async () => {
    try {
      const result = await window.electronAPI.backup.getHistory(
        filterPersona === 'all' ? undefined : filterPersona
      );
      setEntries(result);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [filterPersona]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleUndo = async (backupId: string) => {
    const result = await window.electronAPI.backup.undo(backupId);
    if (result.success) {
      loadEntries(); // Refresh list
    }
  };

  const filteredEntries = entries.filter((e) =>
    filterResult === 'all' ? true : e.result === filterResult
  );

  const uniquePersonas = [...new Set(entries.map((e) => e.personaId))];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-semibold text-white mb-3">Activity Log</h1>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <select
            value={filterResult}
            onChange={(e) => setFilterResult(e.target.value as FilterResult)}
            className="bg-gray-800 text-sm text-gray-300 rounded-lg px-3 py-1.5 border border-gray-700"
          >
            <option value="all">All Results</option>
            <option value="allowed">Allowed</option>
            <option value="denied">Denied</option>
            <option value="confirmed">Confirmed</option>
            <option value="undone">Undone</option>
          </select>

          <select
            value={filterPersona}
            onChange={(e) => setFilterPersona(e.target.value)}
            className="bg-gray-800 text-sm text-gray-300 rounded-lg px-3 py-1.5 border border-gray-700"
          >
            <option value="all">All Personas</option>
            {uniquePersonas.map((id) => (
              <option key={id} value={id}>
                {id.slice(0, 8)}...
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <p className="text-gray-500 text-center py-8">Loading activity...</p>
        ) : filteredEntries.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No activity yet</p>
        ) : (
          filteredEntries.map((entry) => (
            <ActivityEntry
              key={entry.id}
              entry={entry}
              expanded={expandedId === entry.id}
              onToggle={() =>
                setExpandedId(expandedId === entry.id ? null : entry.id)
              }
              onUndo={handleUndo}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ActivityEntry({
  entry,
  expanded,
  onToggle,
  onUndo,
}: {
  entry: ActionLogEntry;
  expanded: boolean;
  onToggle: () => void;
  onUndo: (backupId: string) => void;
}) {
  const isReversible =
    entry.backupId &&
    entry.result !== 'undone' &&
    ['write', 'edit', 'delete'].includes(entry.tool);

  const resultBadge = {
    allowed: 'bg-green-900/40 text-green-400',
    denied: 'bg-red-900/40 text-red-400',
    confirmed: 'bg-blue-900/40 text-blue-400',
    undone: 'bg-yellow-900/40 text-yellow-400',
  }[entry.result] ?? 'bg-gray-800 text-gray-400';

  const toolIcon = {
    read: '📖',
    write: '📝',
    edit: '✏️',
    delete: '🗑️',
    exec: '⚡',
    web_search: '🔍',
    web_fetch: '🌐',
    'email.send': '📧',
  }[entry.tool] ?? '🔧';

  const time = new Date(entry.createdAt).toLocaleTimeString();
  const date = new Date(entry.createdAt).toLocaleDateString();

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 hover:bg-gray-800/50 transition-colors text-left"
      >
        <span className="text-lg">{toolIcon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white font-medium truncate">
              {entry.action}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${resultBadge}`}>
              {entry.result}
            </span>
          </div>
          {entry.target && (
            <p className="text-xs text-gray-500 font-mono truncate">
              {entry.target}
            </p>
          )}
        </div>
        <span className="text-xs text-gray-600 whitespace-nowrap">
          {time}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-800 p-3 space-y-2">
          <div className="text-xs text-gray-500">
            <span>{date} {time}</span>
            <span className="mx-2">|</span>
            <span>Persona: {entry.personaId.slice(0, 8)}...</span>
          </div>

          {entry.contentPreview && (
            <div className="bg-gray-950 rounded p-2">
              <p className="text-xs text-gray-400 mb-1">Content Preview:</p>
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                {entry.contentPreview}
              </pre>
            </div>
          )}

          {entry.denyReason && (
            <p className="text-xs text-red-400">
              Denied: {entry.denyReason}
            </p>
          )}

          {isReversible && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUndo(entry.backupId!);
              }}
              className="px-3 py-1.5 text-xs bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition-colors"
            >
              Undo This Action
            </button>
          )}
        </div>
      )}
    </div>
  );
}
