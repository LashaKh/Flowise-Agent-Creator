/**
 * useTheme — applies the user's theme preference to <html>.
 *
 * Plain language: the Settings panel has a Light / Dark / System dropdown.
 * Before this hook, nothing consumed that preference. Now, on mount (and
 * when the user flips the toggle in Settings), we set a class on the
 * document root AND the CSS `color-scheme` property so native widgets
 * (scrollbars, focus rings, form controls) respect the choice.
 *
 * Note: the app's Tailwind classes are still hardcoded to the dark palette
 * (`bg-gray-950`, `text-white`, …), so toggling Light here will flip native
 * controls but not the custom chrome. A full light-theme skin is a
 * separate design pass. This hook is the correct plumbing layer so that
 * work, when it happens, doesn't need any new wiring.
 */
import { useEffect } from 'react';

type Theme = 'light' | 'dark' | 'system';

// QA finding UI4: users who previously picked "light" from the old 3-option
// picker would otherwise be stuck on a partial theme. Coerce anything except
// 'dark'/'system' to 'system' so existing prefs keep working.
function normalizeTheme(t: Theme): Theme {
  return t === 'dark' || t === 'system' ? t : 'system';
}

function resolveTheme(t: Theme): 'light' | 'dark' {
  if (t === 'system') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    return mq.matches ? 'dark' : 'light';
  }
  return t;
}

function applyTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

export function useTheme() {
  useEffect(() => {
    let cancelled = false;
    let mq: MediaQueryList | null = null;
    let mqListener: ((e: MediaQueryListEvent) => void) | null = null;
    let currentSetting: Theme = 'system';

    function applyFromSetting(raw: Theme) {
      const t = normalizeTheme(raw);
      currentSetting = t;
      applyTheme(resolveTheme(t));

      // Keep a live listener on prefers-color-scheme only when the user
      // picked "system" — otherwise OS changes shouldn't override the
      // explicit choice.
      if (mq && mqListener) {
        mq.removeEventListener('change', mqListener);
        mq = null;
        mqListener = null;
      }
      if (t === 'system') {
        mq = window.matchMedia('(prefers-color-scheme: dark)');
        mqListener = (e) => applyTheme(e.matches ? 'dark' : 'light');
        mq.addEventListener('change', mqListener);
      }
    }

    // Initial load from prefs.
    window.electronAPI.prefs
      .load()
      .then((prefs) => {
        if (cancelled) return;
        applyFromSetting((prefs.theme as Theme) || 'system');
      })
      .catch((err) => {
        console.warn('[useTheme] Failed to load prefs, falling back to system:', err);
        applyFromSetting('system');
      });

    // Live-apply when Settings dispatches the event after a save.
    function onPrefsChanged(e: Event) {
      const detail = (e as CustomEvent<{ theme?: Theme }>).detail;
      if (detail?.theme && detail.theme !== currentSetting) {
        applyFromSetting(detail.theme);
      }
    }
    window.addEventListener('prefs-changed', onPrefsChanged);

    return () => {
      cancelled = true;
      window.removeEventListener('prefs-changed', onPrefsChanged);
      if (mq && mqListener) mq.removeEventListener('change', mqListener);
    };
  }, []);
}
