/**
 * Main App component tests.
 *
 * Focus: onboarding gate, tab navigation, platform-aware hotkey labels,
 * and hotkey error toast. Keeps scope narrow to avoid brittle mocks for
 * the 5 Settings subtabs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mock Tauri IPC ─────────────────────────────────────────────────────
const { invoke, listen, clearCapturedListeners, fireEvent } = vi.hoisted(() => {
  const captured: Record<string, ((...args: any[]) => void) | undefined> = {};
  return {
    invoke: vi.fn(),
    listen: vi.fn().mockImplementation((channel: string, cb: (evt: any) => void) => {
      captured[channel] = cb;
      return Promise.resolve(vi.fn());
    }),
    capturedListeners: captured,
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

import App from "./App";

// ── Fixtures ───────────────────────────────────────────────────────────

const ONBOARDING_STATE_COMPLETED = { completed: true, has_enabled_provider: true };
const ONBOARDING_STATE_NOT_DONE = { completed: false, has_enabled_provider: false };

const SETTINGS = {
  hotkey: "Ctrl+Shift+E",
  theme: "dark" as const,
  default_framework: "CREATE",
  default_model: "ollama:llama3",
  ollama_url: "http://localhost:11434",
};

beforeEach(() => {
  vi.clearAllMocks();
  clearCapturedListeners();

  invoke.mockImplementation(async (cmd: string) => {
    // Default: any list_* command returns an empty array so component maps don't crash.
    if (cmd.startsWith("list_")) return [];
    switch (cmd) {
      case "get_onboarding_state":
        return ONBOARDING_STATE_COMPLETED;
      case "get_settings":
        return SETTINGS;
      default:
        return undefined;
    }
  });
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

// ── Onboarding gate ─────────────────────────────────────────────────────

describe("onboarding gate", () => {
  it("renders Onboarding when onboarding is not completed", async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd.startsWith("list_")) return [];
      switch (cmd) {
        case "get_onboarding_state":
          return ONBOARDING_STATE_NOT_DONE;
        case "get_settings":
          return SETTINGS;
        default:
          return undefined;
      }
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Welcome to Prompter/i)).toBeInTheDocument();
    });
  });

  it("renders main tabs when onboarding is completed", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Library/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /History/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Settings/i })).toBeInTheDocument();
    });
  });
});

// ── Tab navigation ──────────────────────────────────────────────────────

describe("tab navigation", () => {
  it("renders History button and can click it", async () => {
    render(<App />);

    const historyBtn = await screen.findByRole("button", { name: /History/i });
    expect(historyBtn).toBeInTheDocument();

    // Click succeeds without error.
    await userEvent.click(historyBtn);
  });
});

// ── Hotkey label (platform-aware) ───────────────────────────────────────

describe("platform-aware hotkey label", () => {
  let origPlatform: string;

  beforeEach(() => {
    origPlatform = navigator.platform;
  });

  afterEach(() => {
    Object.defineProperty(navigator, "platform", { value: origPlatform, configurable: true });
  });

  it("shows ⌘ for the hotkey on Mac (inside Settings tab)", async () => {
    Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });

    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: /Settings/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /Settings/i }));

    await waitFor(() => {
      expect(screen.getByText("⌘")).toBeInTheDocument();
    });
  });

  it("shows Ctrl for the hotkey on Windows/Linux (inside Settings tab)", async () => {
    Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });

    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: /Settings/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /Settings/i }));

    await waitFor(() => {
      expect(screen.getByText("Ctrl")).toBeInTheDocument();
    });
  });
});

// ── Hotkey error toast ──────────────────────────────────────────────────

describe("hotkey error toast", () => {
  it("hotkey_error event shows a toast with the error message", async () => {
    render(<App />);

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_onboarding_state", {}));

    act(() => fireEvent("hotkey_error", { shortcut: "Ctrl+Shift+E", message: "Already in use" }));

    await waitFor(() => {
      expect(screen.getByText(/Already in use/i)).toBeInTheDocument();
    });
  });
});

// ── Theme (init only) ───────────────────────────────────────────────────

describe("theme application on init", () => {
  it("sets data-theme to dark on init (default settings)", async () => {
    render(<App />);

    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });
});
