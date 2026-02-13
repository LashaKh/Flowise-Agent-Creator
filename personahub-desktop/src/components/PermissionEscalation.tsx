/**
 * Permission Escalation Dialog
 *
 * Shown when a synced persona has elevated permissions (new tools or paths).
 * The user must approve before the changes take effect locally.
 */
import type { PermissionEscalation } from '../types';

interface PermissionEscalationProps {
  escalation: PermissionEscalation;
  onApprove: () => void;
  onDeny: () => void;
}

export default function PermissionEscalationDialog({
  escalation,
  onApprove,
  onDeny,
}: PermissionEscalationProps) {
  const { personaName, changes } = escalation;
  const hasChanges =
    changes.newTools.length > 0 ||
    changes.newPaths.length > 0 ||
    changes.dangerousEnabled;

  if (!hasChanges) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <h2 className="text-lg font-semibold text-yellow-400 mb-1">
          Permission Update Required
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          <span className="text-white font-medium">{personaName}</span> has been
          updated with new permissions on the web platform.
        </p>

        {changes.newTools.length > 0 && (
          <div className="mb-3">
            <h3 className="text-sm font-medium text-gray-300 mb-1">New Tools</h3>
            <div className="flex flex-wrap gap-1">
              {changes.newTools.map((tool) => (
                <span
                  key={tool}
                  className="px-2 py-0.5 bg-yellow-900/40 text-yellow-300 text-xs rounded"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}

        {changes.newPaths.length > 0 && (
          <div className="mb-3">
            <h3 className="text-sm font-medium text-gray-300 mb-1">New Folder Access</h3>
            <ul className="space-y-1">
              {changes.newPaths.map((p) => (
                <li key={p.path} className="text-sm text-gray-400 flex items-center gap-2">
                  <span className="text-yellow-300 font-mono text-xs">{p.path}</span>
                  <span className="text-xs text-gray-500">({p.mode})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {changes.dangerousEnabled && (
          <div className="mb-3 p-2 bg-red-900/20 border border-red-800 rounded">
            <p className="text-sm text-red-400">
              Dangerous tools have been enabled (delete files, admin access, installs).
            </p>
          </div>
        )}

        <p className="text-xs text-gray-500 mb-4">
          These permissions will only take effect after you approve them.
        </p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onDeny}
            className="px-4 py-2 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            Deny
          </button>
          <button
            onClick={onApprove}
            className="px-4 py-2 text-sm text-white bg-yellow-600 hover:bg-yellow-500 rounded-lg transition-colors"
          >
            Approve Changes
          </button>
        </div>
      </div>
    </div>
  );
}
