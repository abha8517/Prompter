/**
 * Mock helpers for Tauri's IPC layer.
 *
 * Usage in test files:
 *
 *   import { mockInvoke, capturedListeners } from "../test/mock-tauri";
 *
 *   // In beforeEach / beforeAll:
 *   mockInvoke();
 *   vi.mock("@tauri-apps/api/core", () => ({ invoke }));
 *   vi.mock("@tauri-apps/api/event", () => ({ listen }));
 *
 *   // In a test:
 *   vi.mocked(invoke).mockResolvedValue(myFixture);
 *   capturedListeners["opt_chunk"]({ text: "chunk" });
 */

import { vi } from "vitest";

// ── invoke mock ───────────────────────────────────────────────────────

/**
 * A mock for `@tauri-apps/api/core.invoke`.
 *
 * By default resolves to `undefined`. Per-test, override with:
 *   vi.mocked(invoke).mockImplementation(async (cmd, args) => { ... })
 * or:
 *   vi.mocked(invoke).mockResolvedValue(fixture)
 */
export const mockInvoke = () =>
  vi.fn().mockResolvedValue(undefined);

// ── listen mock ───────────────────────────────────────────────────────

/**
 * Registry that captures the callback passed to `listen(channel, cb)`.
 *
 * After a component registers listeners via `onOptChunk(cb)` etc., fire an
 * event from a test with:
 *   capturedListeners["opt_chunk"]!({ text: "hello", session_id: "s1" })
 */
export const capturedListeners: Record<string, ((...args: any[]) => void) | undefined> = {};

/**
 * A mock for `@tauri-apps/api/event.listen`.
 *
 * Intercepts the callback passed to `listen(channel, cb)`, stores it in
 * `capturedListeners`, and returns a no-op `UnlistenFn`.
 */
export const mockListen = () =>
  vi.fn().mockImplementation(async (channel: string, cb: (evt: any) => void) => {
    capturedListeners[channel] = cb;
    return vi.fn(); // UnlistenFn
  });

/**
 * Clear all captured listeners (call in `beforeEach`).
 */
export function clearCapturedListeners() {
  for (const key of Object.keys(capturedListeners)) {
    delete capturedListeners[key];
  }
}
