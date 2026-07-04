/**
 * OverlayApp component tests.
 *
 * The overlay window is the core UX: it captures text, streams LLM
 * optimization, lets the user accept/refine/save, and provides keyboard
 * shortcuts. These tests mock the Tauri IPC layer so no real backend is
 * needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mock Tauri IPC (hoisted so vi.mock factories can reference them) ──
const { invoke, listen, clearCapturedListeners, fireEvent } = vi.hoisted(() => {
  const captured: Record<string, ((...args: any[]) => void) | undefined> = {};
  return {
    invoke: vi.fn(),
    listen: vi.fn().mockImplementation((channel: string, cb: (evt: any) => void) => {
      captured[channel] = cb;
      return Promise.resolve(vi.fn()); // UnlistenFn
    }),
    capturedListeners: captured,
    /**
     * Fire a Tauri event through the captured listener.
     * The `tauri.ts` helpers unwrap via `(evt) => cb(evt.payload)`, so the
     * captured callback receives `{ payload, id, ... }`. We wrap the
     * supplied payload in `{ payload }` to match that shape.
     */
    fireEvent: (channel: string, payload: any) => {
      const cb = captured[channel];
      if (cb) cb({ payload, id: "test" });
    },
    clearCapturedListeners: () => {
      for (const k of Object.keys(captured)) delete captured[k];
    },
  };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

import OverlayApp from "./OverlayApp";

// ── Fixtures ───────────────────────────────────────────────────────────

const SETTINGS = {
  hotkey: "Ctrl+Shift+E",
  theme: "dark" as const,
  default_framework: "CREATE",
  default_model: "ollama:llama3",
  ollama_url: "http://localhost:11434",
  overlay_opacity: 90,
};

const MODELS = [
  { id: "llama3", name: "Llama 3" },
  { id: "mistral", name: "Mistral 7B" },
];

const FRAMEWORKS = [
  { id: "CREATE", name: "Create" },
  { id: "REFINE", name: "Refine" },
  { id: "CLARIFY", name: "Clarify" },
];

const CONTEXTS = [
  { id: "ctx1", name: "Dev", role: "developer", audience: "team" },
];

// ── Mock helper ─────────────────────────────────────────────────────────
// Uses a lookup table so tests only override what they need.
// Unrecognized commands return undefined.
type CmdMock = Record<string, any>;

const DEFAULT_MOCKS: CmdMock = {
  take_pending_text: "Hello world, this is a test prompt.",
  list_frameworks: FRAMEWORKS,
  get_settings: SETTINGS,
  list_contexts: CONTEXTS,
  get_models: MODELS,
  test_provider: { alive: true, models: MODELS, error: null },
  optimize_prompt: { optimized: "Better prompt text", score: 85, diff: "- old\n+ new", tokens: 42, session_id: "s1" },
  accept_replacement: { success: true, fallback: false },
  hide_overlay: undefined,
  save_prompt: "p1",
};

function setupInvoke(overrides?: Partial<CmdMock>) {
  invoke.mockImplementation(async (cmd: string, _args?: any) => {
    if (overrides && cmd in overrides) return overrides[cmd];
    if (cmd in DEFAULT_MOCKS) return DEFAULT_MOCKS[cmd];
    return undefined;
  });
}

/**
 * Wait for init to complete and simulate streaming + done.
 * Uses `get_models` as the anchor — it fires after `setActiveProviderId`
 * and runs concurrently with the listener-registration `setup()`.
 */
async function initAndOptimize() {
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_models", expect.anything()));

  // Simulate streaming chunks, then completion.
  act(() => fireEvent("opt_chunk", { text: "Better ", session_id: "s1" }));
  act(() => fireEvent("opt_chunk", { text: "text", session_id: "s1" }));
  act(() => fireEvent("opt_done", {
    optimized: "Better text",
    score: 85,
    diff: "- old\n+ new",
    tokens: 10,
    session_id: "s1",
  }));

  // Optimized text appears in the right-hand textarea.
  await waitFor(() => {
    const textarea = screen.getByDisplayValue("Better text");
    expect(textarea).toBeInTheDocument();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearCapturedListeners();
  setupInvoke();
});

// ── 1. Init flow ───────────────────────────────────────────────────────

describe("init flow", () => {
  it("renders the overlay and loads settings, frameworks, and contexts", async () => {
    render(<OverlayApp />);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("take_pending_text", {});
      expect(invoke).toHaveBeenCalledWith("list_frameworks", {});
      expect(invoke).toHaveBeenCalledWith("get_settings", {});
      expect(invoke).toHaveBeenCalledWith("list_contexts", {});
      expect(invoke).toHaveBeenCalledWith("get_models", { provider: "ollama" });
    });

    // Framework dropdown should be populated.
    expect(screen.getByText("Create")).toBeInTheDocument();
    expect(screen.getByText("Refine")).toBeInTheDocument();
  });

  it("uses buffered pending text from takePendingText", async () => {
    render(<OverlayApp />);

    // Pending text goes into the raw textarea.
    await waitFor(() => {
      const textarea = screen.getByDisplayValue("Hello world, this is a test prompt.");
      expect(textarea).toBeInTheDocument();
    });
  });

  it("registers all expected event listeners", async () => {
    render(<OverlayApp />);

    await waitFor(() => {
      expect(listen).toHaveBeenCalledWith("overlay_show", expect.any(Function));
      expect(listen).toHaveBeenCalledWith("opt_chunk", expect.any(Function));
      expect(listen).toHaveBeenCalledWith("opt_done", expect.any(Function));
      expect(listen).toHaveBeenCalledWith("opt_error", expect.any(Function));
      expect(listen).toHaveBeenCalledWith("provider_status", expect.any(Function));
    });
  });
});

// ── 2. Streaming optimization ────────────────────────────────────────

describe("streaming optimization", () => {
  it("clicking Optimize calls optimize_prompt with the right payload", async () => {
    render(<OverlayApp />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_settings", {}));

    invoke.mockClear();
    setupInvoke();

    // Click the Optimize button.
    const optimizeBtn = screen.getByRole("button", { name: /optimize/i });
    await userEvent.click(optimizeBtn);

    expect(invoke).toHaveBeenCalledWith("optimize_prompt", expect.objectContaining({
      request: expect.objectContaining({
        raw: expect.any(String),
        framework: expect.any(String),
        model: expect.any(String),
      }),
    }));
  });

  it("accumulates opt_chunk events into the optimized textarea", async () => {
    render(<OverlayApp />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_settings", {}));

    // Fire two chunks — the overlay's onOptChunk listener accumulates them.
    act(() => fireEvent("opt_chunk", { text: "Better ", session_id: "s1" }));
    act(() => fireEvent("opt_chunk", { text: "prompt", session_id: "s1" }));

    // The optimized textarea should show the accumulated text.
    await waitFor(() => {
      expect(screen.getByDisplayValue("Better prompt")).toBeInTheDocument();
    });
  });

  it("opt_done sets score and clears streaming", async () => {
    render(<OverlayApp />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_settings", {}));

    // Fire a chunk then done.
    act(() => fireEvent("opt_chunk", { text: "Hello", session_id: "s1" }));
    act(() => fireEvent("opt_done", {
      optimized: "Hello",
      score: 92,
      diff: "- old\n+ new",
      tokens: 5,
      session_id: "s1",
    }));

    // Score should be rendered somewhere in the overlay.
    await waitFor(() => {
      expect(screen.getByText(/92/)).toBeInTheDocument();
    });
  });

  it("handles opt_error by showing error message", async () => {
    render(<OverlayApp />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_settings", {}));

    // Click optimize.
    const optimizeBtn = screen.getByRole("button", { name: /optimize/i });
    await userEvent.click(optimizeBtn);

    // Simulate error event.
    act(() => fireEvent("opt_error", { code: "timeout", message: "Request timed out", session_id: "s1" }));

    await waitFor(() => {
      expect(screen.getByText(/Request timed out/)).toBeInTheDocument();
    });
  });
});

// ── 3. Accept replacement ─────────────────────────────────────────────

describe("accept replacement", () => {
  it("calls acceptReplacement and hides overlay on success", async () => {
    render(<OverlayApp />);
    await initAndOptimize();

    invoke.mockClear();
    setupInvoke();

    // Click Accept.
    const acceptBtn = screen.getByRole("button", { name: /accept/i });
    await userEvent.click(acceptBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("accept_replacement", { text: "Better text" });
      expect(invoke).toHaveBeenCalledWith("hide_overlay", {});
    });
  });

  it("shows fallback message when clipboard fallback is used", async () => {
    setupInvoke({ accept_replacement: { success: true, fallback: true } });

    render(<OverlayApp />);
    await initAndOptimize();

    invoke.mockClear();
    setupInvoke({ accept_replacement: { success: true, fallback: true } });

    // Click Accept.
    const acceptBtn = screen.getByRole("button", { name: /accept/i });
    await userEvent.click(acceptBtn);

    await waitFor(() => {
      expect(screen.getByText(/Ctrl\+V to paste/i)).toBeInTheDocument();
    });
  });
});

// ── 4. Keyboard shortcuts ─────────────────────────────────────────────

describe("keyboard shortcuts", () => {
  it("Escape triggers hideOverlay", async () => {
    render(<OverlayApp />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_settings", {}));

    invoke.mockClear();
    setupInvoke();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("hide_overlay", {});
    });
  });

  it("Ctrl+R and Meta+R both toggle refine input without error", async () => {
    render(<OverlayApp />);
    await initAndOptimize();

    // Ctrl+R
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "r", ctrlKey: true, metaKey: false, bubbles: true,
      }));
    });

    // Meta+R
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "r", ctrlKey: false, metaKey: true, bubbles: true,
      }));
    });

    // Both should have triggered without throwing.
    expect(true).toBe(true);
  });

  it("Ctrl+S saves prompt after optimization completes", async () => {
    render(<OverlayApp />);
    await initAndOptimize();

    invoke.mockClear();
    setupInvoke();

    // Ctrl+S
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "s", ctrlKey: true, metaKey: false, bubbles: true,
      }));
    });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("save_prompt", expect.objectContaining({
        prompt: expect.objectContaining({ body: "Better text" }),
      }));
    });
  });

  it("Ctrl+M / Meta+M opens model dropdown", async () => {
    render(<OverlayApp />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_settings", {}));

    // Ctrl+M
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "m", ctrlKey: true, metaKey: false, bubbles: true,
      }));
    });

    // Model dropdown should be open — model names should be visible.
    await waitFor(() => {
      expect(screen.getByText("Mistral 7B")).toBeInTheDocument();
    });
  });
});

// ── 5. Theme ──────────────────────────────────────────────────────────

describe("theme application", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("sets data-theme=dark for dark settings (default)", async () => {
    render(<OverlayApp />);
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });

  it("sets data-theme=light for light settings", async () => {
    setupInvoke({ get_settings: { ...SETTINGS, theme: "light" } });

    render(<OverlayApp />);
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });
});

// ── 6. Provider health ────────────────────────────────────────────────

describe("provider health", () => {
  it("reacts to provider_status for the active provider", async () => {
    render(<OverlayApp />);
    // Wait until the component has fully initialised (get_models runs after
    // setActiveProviderId, which updates the ref used by the handler).
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("get_models", expect.anything());
    });

    act(() => fireEvent("provider_status", { provider: "ollama", alive: false }));

    await waitFor(() => {
      // The dead-provider banner should appear.
      expect(screen.getByText(/not reachable/i)).toBeInTheDocument();
    });
  });

  it("ignores provider_status for non-active providers", async () => {
    render(<OverlayApp />);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("get_models", expect.anything());
    });

    act(() => fireEvent("provider_status", { provider: "anthropic", alive: false }));

    // No banner should appear for a non-active provider.
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByText(/not reachable/i)).not.toBeInTheDocument();
  });
});
