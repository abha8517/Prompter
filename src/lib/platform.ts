/**
 * Platform detection helpers for OS-aware UI (hotkey labels, key bindings).
 *
 * The backend seeds its own platform-aware defaults (Command on macOS,
 * Ctrl elsewhere); these helpers keep the frontend in sync for display
 * strings and keydown handling.
 */

/** True when running on macOS (checks both legacy and Apple-silicon UA strings). */
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const p = (navigator.platform || "") + " " + (navigator.userAgent || "");
  return /Mac|iPhone|iPad|iPod/i.test(p);
}

/**
 * Display label for the platform's primary modifier key.
 * "⌘" on macOS, "Ctrl" elsewhere.
 */
export function modLabel(): string {
  return isMac() ? "⌘" : "Ctrl";
}

/**
 * Full accelerator string for the default open-overlay hotkey.
 * e.g. "Cmd+Shift+E" on Mac, "Ctrl+Shift+E" elsewhere — matches what the
 * settings UI renders in the KbdRow.
 */
export function defaultHotkeyLabel(): string[] {
  return isMac() ? ["⌘", "Shift", "E"] : ["Ctrl", "Shift", "E"];
}
