/**
 * ConfirmDialog — Modal shown when ActionGuard says "confirm".
 *
 * This is the "are you sure?" dialog that pops up when a persona tries to do
 * something that needs user approval (like writing a file or running a command).
 * The user can Allow Once, Allow Always, Deny, or Block the action.
 */
import { useState } from 'react';
import type { ConfirmationRequest, ConfirmationResponse, ToolTier } from '../types';

interface ConfirmDialogProps {
  request: ConfirmationRequest;
  onResponse: (response: ConfirmationResponse) => void;
}

const TIER_COLORS: Record<ToolTier, string> = {
  safe: 'text-green-400',
  guarded: 'text-yellow-400',
  dangerous: 'text-red-400',
  blocked: 'text-red-600',
};

const TIER_LABELS: Record<ToolTier, string> = {
  safe: 'Safe',
  guarded: 'Requires Approval',
  dangerous: 'Dangerous',
  blocked: 'Blocked',
};

const REMEMBER_OPTIONS = [5, 15, 30, 60];

export default function ConfirmDialog({ request, onResponse }: ConfirmDialogProps) {
  const [rememberEnabled, setRememberEnabled] = useState(false);
  const [rememberMinutes, setRememberMinutes] = useState(15);

  const handleAllowOnce = () => {
    if (rememberEnabled) {
      onResponse({ decision: 'allow_once', rememberMinutes });
    } else {
      onResponse({ decision: 'allow_once' });
    }
  };

  const handleAllowAlways = () => {
    onResponse({
      decision: 'allow_always',
      pathPattern: request.target ?? '',
    });
  };

  const handleDeny = () => {
    onResponse({ decision: 'deny' });
  };

  const handleBlock = () => {
    onResponse({ decision: 'block' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl bg-gray-800 shadow-2xl border border-gray-700">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-700 px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-700 text-lg">
            {request.personaName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-100">
              {request.personaName}
            </h2>
            <span className={`text-sm ${TIER_COLORS[request.tier]}`}>
              {TIER_LABELS[request.tier]}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-4">
          {/* Action description */}
          <div>
            <p className="text-sm text-gray-400">Action</p>
            <p className="text-gray-100">{request.action}</p>
          </div>

          {/* Tool */}
          <div>
            <p className="text-sm text-gray-400">Tool</p>
            <p className="font-mono text-sm text-gray-200">{request.tool}</p>
          </div>

          {/* Target path */}
          {request.target && (
            <div>
              <p className="text-sm text-gray-400">Target</p>
              <p className="break-all font-mono text-sm text-gray-200">
                {request.target}
              </p>
            </div>
          )}

          {/* Content preview */}
          {request.contentPreview && (
            <div>
              <p className="text-sm text-gray-400">Content Preview</p>
              <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-300">
                {request.contentPreview.slice(0, 500)}
                {request.contentPreview.length > 500 && '\n... (truncated)'}
              </pre>
            </div>
          )}

          {/* Remember checkbox */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={rememberEnabled}
                onChange={(e) => setRememberEnabled(e.target.checked)}
                className="rounded border-gray-600 bg-gray-700"
              />
              Remember for
            </label>
            <select
              value={rememberMinutes}
              onChange={(e) => setRememberMinutes(Number(e.target.value))}
              disabled={!rememberEnabled}
              className="rounded bg-gray-700 px-2 py-1 text-sm text-gray-200 border border-gray-600 disabled:opacity-50"
            >
              {REMEMBER_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 border-t border-gray-700 px-6 py-4">
          <button
            onClick={handleAllowOnce}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          >
            Allow Once
          </button>
          <button
            onClick={handleAllowAlways}
            className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 transition-colors"
          >
            Allow Always
          </button>
          <button
            onClick={handleDeny}
            className="flex-1 rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-500 transition-colors"
          >
            Deny
          </button>
          <button
            onClick={handleBlock}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors"
          >
            Block
          </button>
        </div>
      </div>
    </div>
  );
}
