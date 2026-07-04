/**
 * Onboarding wizard component tests.
 *
 * 3-step flow: pick provider → configure endpoint/key + test → pick model + finish.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mock Tauri IPC ─────────────────────────────────────────────────────
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(vi.fn()) }));

import Onboarding from "./Onboarding";

// ── Fixtures ───────────────────────────────────────────────────────────

const OLLAMA = {
  id: "ollama",
  kind: "ollama",
  label: "Ollama",
  base_url: "http://localhost:11434",
  default_model: "ollama:llama3",
  enabled: false,
  sort_order: 0,
};

// Use a label distinct from the kind label so getByText is unambiguous
// ("Anthropic" maps to kind label "Anthropic" — would duplicate).
const CLAUDE = {
  id: "anthropic",
  kind: "anthropic",
  label: "Claude Pro",
  base_url: "https://api.anthropic.com",
  api_key_slot: "api_key",
  default_model: "anthropic:claude-3-sonnet",
  enabled: false,
  sort_order: 1,
};

const MODELS = [{ id: "llama3", name: "Llama 3" }, { id: "mistral", name: "Mistral 7B" }];

const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  invoke.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_providers":
        return [OLLAMA, CLAUDE];
      case "save_provider":
        return undefined;
      case "set_provider_key":
        return undefined;
      case "set_provider_enabled":
        return undefined;
      case "test_provider":
        return { alive: true, models: MODELS, error: null };
      case "complete_onboarding":
        return undefined;
      default:
        return undefined;
    }
  });
});

// ── Step 0: provider picker ───────────────────────────────────────────

describe("step 0 — provider picker", () => {
  it("renders provider buttons from listProviders", async () => {
    render(<Onboarding onClose={onClose} />);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("list_providers", {});
    });
    // Both provider labels are now unique (Claude Pro vs Anthropic kind).
    expect(screen.getByText("Ollama")).toBeInTheDocument();
    expect(screen.getByText("Claude Pro")).toBeInTheDocument();
  });

  it("renders the kind label under each provider", async () => {
    render(<Onboarding onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Ollama (local)")).toBeInTheDocument();
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
    });
  });

  it("clicking a provider advances to step 1 and pre-fills endpoint", async () => {
    render(<Onboarding onClose={onClose} />);

    await waitFor(() => expect(screen.getByText("Ollama")).toBeInTheDocument());

    // Click the Ollama provider button.
    await userEvent.click(screen.getByText("Ollama"));

    // Step 1 should show the endpoint input pre-filled.
    expect(screen.getByDisplayValue("http://localhost:11434")).toBeInTheDocument();
    // No API key field for Ollama (no api_key_slot).
    expect(screen.queryByPlaceholderText("sk-...")).not.toBeInTheDocument();
  });

  it("shows API key field for providers that need one", async () => {
    render(<Onboarding onClose={onClose} />);

    await waitFor(() => expect(screen.getByText("Claude Pro")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Claude Pro"));

    // API key input should be present.
    expect(screen.getByPlaceholderText("sk-...")).toBeInTheDocument();
  });
});

// ── Step 1: test connection ───────────────────────────────────────────

describe("step 1 — test connection", () => {
  it("disables Test connection button until API key is entered (key-required provider)", async () => {
    render(<Onboarding onClose={onClose} />);

    await waitFor(() => expect(screen.getByText("Claude Pro")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Claude Pro"));

    const testBtn = screen.getByRole("button", { name: /test connection/i });
    expect(testBtn).toBeDisabled();

    // Enter a key.
    await userEvent.type(screen.getByPlaceholderText("sk-..."), "sk-ant-test123");
    expect(testBtn).not.toBeDisabled();
  });

  it("on successful test, shows connected message and Next button", async () => {
    render(<Onboarding onClose={onClose} />);

    await waitFor(() => expect(screen.getByText("Ollama")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Ollama"));

    await userEvent.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => {
      expect(screen.getByText(/Connected/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
    });
  });

  it("calls saveProvider + setProviderEnabled on test", async () => {
    render(<Onboarding onClose={onClose} />);

    await waitFor(() => expect(screen.getByText("Ollama")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Ollama"));

    invoke.mockClear();
    await userEvent.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("save_provider", expect.objectContaining({
        provider: expect.objectContaining({ id: "ollama" }),
      }));
      expect(invoke).toHaveBeenCalledWith("set_provider_enabled", { id: "ollama", enabled: true });
      expect(invoke).toHaveBeenCalledWith("test_provider", { id: "ollama" });
    });
  });

  it("on failed test, shows error message", async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "test_provider") return { alive: false, models: [], error: "connection refused" };
      if (cmd === "list_providers") return [OLLAMA];
      return undefined;
    });

    render(<Onboarding onClose={onClose} />);

    await waitFor(() => expect(screen.getByText("Ollama")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Ollama"));
    await userEvent.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => {
      expect(screen.getByText(/connection refused/i)).toBeInTheDocument();
    });
  });
});

// ── Finish flow ───────────────────────────────────────────────────────

describe("finish flow", () => {
  it("Skip calls completeOnboarding with nulls and skipped=true, then onClose", async () => {
    render(<Onboarding onClose={onClose} />);

    await waitFor(() => expect(screen.getByText("Ollama")).toBeInTheDocument());

    // Use exact text "Skip" — the X close button has title "Skip setup" and
    // would also match a loose /skip/i regex.
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("complete_onboarding", {
        providerId: null,
        model: null,
        skipped: true,
      });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("Finish (after test) calls completeOnboarding with provider and model", async () => {
    render(<Onboarding onClose={onClose} />);

    await waitFor(() => expect(screen.getByText("Ollama")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Ollama"));
    await userEvent.click(screen.getByRole("button", { name: /test connection/i }));

    // Wait for Next to appear, then click it.
    const nextBtn = await screen.findByRole("button", { name: /next/i });
    await userEvent.click(nextBtn);

    // Step 2: click Finish.
    await userEvent.click(screen.getByRole("button", { name: /finish/i }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("complete_onboarding", {
        providerId: "ollama",
        model: expect.any(String),
        skipped: false,
      });
      expect(onClose).toHaveBeenCalled();
    });
  });
});

// ── Progress dots ─────────────────────────────────────────────────────

describe("progress dots", () => {
  it("renders 3 progress bars", async () => {
    const { container } = render(<Onboarding onClose={onClose} />);

    await waitFor(() => expect(screen.getByText("Ollama")).toBeInTheDocument());

    const bars = container.querySelectorAll(".rounded-full.h-1\\.5");
    expect(bars.length).toBe(3);
  });
});
