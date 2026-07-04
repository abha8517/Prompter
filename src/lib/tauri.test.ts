import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Tauri IPC (factories are hoisted — no outer vars) ─────────────
const { invoke, listen } = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

import { cmd, onOptChunk, onOptDone, onOptError, onOverlayShow, onProviderStatus, onHotkeyError } from "./tauri";

// ── Fixtures ───────────────────────────────────────────────────────────

const FIXTURES = {
  captureResult: { text: "hello", position: { x: 100, y: 200 } },
  optResult: { optimized: "better text", score: 85, diff: "- old\n+ new", tokens: 42, session_id: "s1" },
  replaceResult: { success: true, fallback: false },
  models: [{ id: "llama3", name: "Llama 3" }],
  testProviderResult: { alive: true, models: [{ id: "llama3", name: "Llama 3" }], error: null },
  prompt: { id: "p1", title: "Test", body: "text", score: 10, usage_count: 1, created_at: "2025-01-01T00:00:00Z" },
  context: { id: "c1", name: "Dev", role: "dev", audience: "team", tone: "casual", style_snippet: "" },
  history: { id: "h1", raw_prompt: "old", optimized_prompt: "new", model: "ollama:llama3", score: 70, timestamp: "2025-01-01T00:00:00Z" },
  settings: { hotkey: "Ctrl+Shift+E", theme: "dark", default_framework: "CREATE", default_model: "ollama:llama3", ollama_url: "http://localhost:11434" },
  framework: { id: "CREATE", name: "Create" },
  provider: { id: "ollama", kind: "ollama", label: "Ollama", base_url: "http://localhost:11434", default_model: "ollama:llama3", enabled: true, sort_order: 0 },
  dbStats: { prompts: 5, history: 20 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── cmd wrappers ───────────────────────────────────────────────────────

describe("cmd wrappers", () => {
  it("captureText invokes correct command", async () => {
    invoke.mockResolvedValue(FIXTURES.captureResult);
    const r = await cmd.captureText();
    expect(invoke).toHaveBeenCalledWith("capture_text", {});
    expect(r).toEqual(FIXTURES.captureResult);
  });

  it("optimizePrompt passes request object", async () => {
    invoke.mockResolvedValue(FIXTURES.optResult);
    const req = { raw: "hello", framework: "CREATE", model: "ollama:llama3" };
    const r = await cmd.optimizePrompt(req);
    expect(invoke).toHaveBeenCalledWith("optimize_prompt", { request: req });
    expect(r).toEqual(FIXTURES.optResult);
  });

  it("optimizePrompt passes context_id when provided", async () => {
    invoke.mockResolvedValue(FIXTURES.optResult);
    const req = { raw: "hello", framework: "CREATE", model: "ollama:llama3", context_id: "c1" };
    await cmd.optimizePrompt(req);
    expect(invoke).toHaveBeenCalledWith("optimize_prompt", { request: req });
  });

  it("optimizePrompt passes refinement_notes when provided", async () => {
    invoke.mockResolvedValue(FIXTURES.optResult);
    const req = { raw: "hello", framework: "CREATE", model: "ollama:llama3", refinement_notes: "more detail" };
    await cmd.optimizePrompt(req);
    expect(invoke).toHaveBeenCalledWith("optimize_prompt", { request: req });
  });

  it("acceptReplacement passes text", async () => {
    invoke.mockResolvedValue(FIXTURES.replaceResult);
    const r = await cmd.acceptReplacement("new text");
    expect(invoke).toHaveBeenCalledWith("accept_replacement", { text: "new text" });
    expect(r).toEqual(FIXTURES.replaceResult);
  });

  it("getModels passes provider string", async () => {
    invoke.mockResolvedValue(FIXTURES.models);
    await cmd.getModels("ollama");
    expect(invoke).toHaveBeenCalledWith("get_models", { provider: "ollama" });
  });

  it("testProvider passes provider id", async () => {
    invoke.mockResolvedValue(FIXTURES.testProviderResult);
    await cmd.testProvider("ollama");
    expect(invoke).toHaveBeenCalledWith("test_provider", { id: "ollama" });
  });

  it("savePrompt passes prompt object", async () => {
    invoke.mockResolvedValue("p1");
    await cmd.savePrompt(FIXTURES.prompt);
    expect(invoke).toHaveBeenCalledWith("save_prompt", { prompt: FIXTURES.prompt });
  });

  it("listPrompts invokes with empty args", async () => {
    invoke.mockResolvedValue([]);
    await cmd.listPrompts();
    expect(invoke).toHaveBeenCalledWith("list_prompts", {});
  });

  it("searchPrompts passes query", async () => {
    invoke.mockResolvedValue([]);
    await cmd.searchPrompts("hello");
    expect(invoke).toHaveBeenCalledWith("search_prompts", { query: "hello" });
  });

  it("deletePrompt passes id", async () => {
    invoke.mockResolvedValue(undefined);
    await cmd.deletePrompt("p1");
    expect(invoke).toHaveBeenCalledWith("delete_prompt", { id: "p1" });
  });

  it("bumpUsage passes id", async () => {
    invoke.mockResolvedValue(undefined);
    await cmd.bumpUsage("p1");
    expect(invoke).toHaveBeenCalledWith("bump_usage", { id: "p1" });
  });

  it("saveContext passes profile", async () => {
    invoke.mockResolvedValue(undefined);
    await cmd.saveContext(FIXTURES.context);
    expect(invoke).toHaveBeenCalledWith("save_context", { profile: FIXTURES.context });
  });

  it("listContexts invokes with empty args", async () => {
    invoke.mockResolvedValue([]);
    await cmd.listContexts();
    expect(invoke).toHaveBeenCalledWith("list_contexts", {});
  });

  it("deleteContext passes id", async () => {
    invoke.mockResolvedValue(undefined);
    await cmd.deleteContext("c1");
    expect(invoke).toHaveBeenCalledWith("delete_context", { id: "c1" });
  });

  it("listHistory passes optional limit", async () => {
    invoke.mockResolvedValue([]);
    await cmd.listHistory(50);
    expect(invoke).toHaveBeenCalledWith("list_history", { limit: 50 });
  });

  it("listHistory passes no args when limit omitted", async () => {
    invoke.mockResolvedValue([]);
    await cmd.listHistory();
    expect(invoke).toHaveBeenCalledWith("list_history", { limit: undefined });
  });

  it("getSettings invokes with empty args", async () => {
    invoke.mockResolvedValue(FIXTURES.settings);
    await cmd.getSettings();
    expect(invoke).toHaveBeenCalledWith("get_settings", {});
  });

  it("setSetting passes key and value", async () => {
    invoke.mockResolvedValue(undefined);
    await cmd.setSetting("hotkey", "Ctrl+Shift+E");
    expect(invoke).toHaveBeenCalledWith("set_setting", { key: "hotkey", value: "Ctrl+Shift+E" });
  });

  it("listFrameworks invokes with empty args", async () => {
    invoke.mockResolvedValue([]);
    await cmd.listFrameworks();
    expect(invoke).toHaveBeenCalledWith("list_frameworks", {});
  });

  it("importFramework passes pack object", async () => {
    invoke.mockResolvedValue(undefined);
    const pack = { ...FIXTURES.framework, variables: ["var1"], template: "{% raw %}" };
    await cmd.importFramework(pack);
    expect(invoke).toHaveBeenCalledWith("import_framework", { pack });
  });

  it("deleteFramework passes id", async () => {
    invoke.mockResolvedValue(undefined);
    await cmd.deleteFramework("CREATE");
    expect(invoke).toHaveBeenCalledWith("delete_framework", { id: "CREATE" });
  });

  it("showOverlay passes position", async () => {
    invoke.mockResolvedValue(undefined);
    const pos = { x: 100, y: 200 };
    await cmd.showOverlay(pos);
    expect(invoke).toHaveBeenCalledWith("show_overlay", { pos });
  });

  it("hideOverlay invokes with empty args", async () => {
    invoke.mockResolvedValue(undefined);
    await cmd.hideOverlay();
    expect(invoke).toHaveBeenCalledWith("hide_overlay", {});
  });

  it("takePendingText invokes with empty args", async () => {
    invoke.mockResolvedValue("some text");
    const r = await cmd.takePendingText();
    expect(invoke).toHaveBeenCalledWith("take_pending_text", {});
    expect(r).toBe("some text");
  });

  it("dbStats invokes with empty args", async () => {
    invoke.mockResolvedValue(FIXTURES.dbStats);
    await cmd.dbStats();
    expect(invoke).toHaveBeenCalledWith("db_stats", {});
  });

  it("listProviders invokes with empty args", async () => {
    invoke.mockResolvedValue([]);
    await cmd.listProviders();
    expect(invoke).toHaveBeenCalledWith("list_providers", {});
  });

  it("getProvider passes id", async () => {
    invoke.mockResolvedValue(FIXTURES.provider);
    await cmd.getProvider("ollama");
    expect(invoke).toHaveBeenCalledWith("get_provider", { id: "ollama" });
  });

  it("saveProvider passes provider object", async () => {
    invoke.mockResolvedValue(undefined);
    await cmd.saveProvider(FIXTURES.provider);
    expect(invoke).toHaveBeenCalledWith("save_provider", { provider: FIXTURES.provider });
  });

  it("deleteProvider passes id", async () => {
    invoke.mockResolvedValue(undefined);
    await cmd.deleteProvider("ollama");
    expect(invoke).toHaveBeenCalledWith("delete_provider", { id: "ollama" });
  });

  it("setProviderEnabled passes id and enabled", async () => {
    invoke.mockResolvedValue(undefined);
    await cmd.setProviderEnabled("ollama", true);
    expect(invoke).toHaveBeenCalledWith("set_provider_enabled", { id: "ollama", enabled: true });
  });

  it("getMeta passes key", async () => {
    invoke.mockResolvedValue("1");
    await cmd.getMeta("telemetry_enabled");
    expect(invoke).toHaveBeenCalledWith("get_meta", { key: "telemetry_enabled" });
  });

  it("setMeta passes key and value", async () => {
    invoke.mockResolvedValue(undefined);
    await cmd.setMeta("telemetry_enabled", "1");
    expect(invoke).toHaveBeenCalledWith("set_meta", { key: "telemetry_enabled", value: "1" });
  });

  it("clearHistory invokes with empty args", async () => {
    invoke.mockResolvedValue(undefined);
    await cmd.clearHistory();
    expect(invoke).toHaveBeenCalledWith("clear_history", {});
  });

  it("setProviderKey passes id and key", async () => {
    invoke.mockResolvedValue(undefined);
    await cmd.setProviderKey("anthropic", "sk-ant-123");
    expect(invoke).toHaveBeenCalledWith("set_provider_key", { id: "anthropic", key: "sk-ant-123" });
  });

  it("getOnboardingState invokes with empty args", async () => {
    invoke.mockResolvedValue({ completed: true, has_enabled_provider: true });
    await cmd.getOnboardingState();
    expect(invoke).toHaveBeenCalledWith("get_onboarding_state", {});
  });

  it("completeOnboarding maps arg names correctly (providerId, not provider_id)", async () => {
    invoke.mockResolvedValue(undefined);
    await cmd.completeOnboarding("ollama", "ollama:llama3", false);
    expect(invoke).toHaveBeenCalledWith("complete_onboarding", {
      providerId: "ollama",
      model: "ollama:llama3",
      skipped: false,
    });
  });

  it("completeOnboarding passes nulls when skipped", async () => {
    invoke.mockResolvedValue(undefined);
    await cmd.completeOnboarding(null, null, true);
    expect(invoke).toHaveBeenCalledWith("complete_onboarding", {
      providerId: null,
      model: null,
      skipped: true,
    });
  });
});

// ── Event helpers ─────────────────────────────────────────────────────

describe("event helpers", () => {
  it("onOptChunk calls listen with 'opt_chunk' and unwraps payload", async () => {
    const cb = vi.fn();
    listen.mockResolvedValue(vi.fn());
    await onOptChunk(cb);

    expect(listen).toHaveBeenCalledWith("opt_chunk", expect.any(Function));

    const registeredCb = listen.mock.calls[0][1];
    registeredCb({ payload: { text: "chunk", session_id: "s1" } });
    expect(cb).toHaveBeenCalledWith({ text: "chunk", session_id: "s1" });
  });

  it("onOptDone calls listen with 'opt_done' and unwraps payload", async () => {
    const cb = vi.fn();
    listen.mockResolvedValue(vi.fn());
    await onOptDone(cb);

    const registeredCb = listen.mock.calls[0][1];
    registeredCb({ payload: FIXTURES.optResult });
    expect(cb).toHaveBeenCalledWith(FIXTURES.optResult);
  });

  it("onOptError calls listen with 'opt_error' and unwraps payload", async () => {
    const cb = vi.fn();
    listen.mockResolvedValue(vi.fn());
    await onOptError(cb);

    const registeredCb = listen.mock.calls[0][1];
    registeredCb({ payload: { code: "rate_limit", message: "too many requests", session_id: "s1" } });
    expect(cb).toHaveBeenCalledWith({ code: "rate_limit", message: "too many requests", session_id: "s1" });
  });

  it("onOverlayShow calls listen with 'overlay_show' and unwraps payload", async () => {
    const cb = vi.fn();
    listen.mockResolvedValue(vi.fn());
    await onOverlayShow(cb);

    const registeredCb = listen.mock.calls[0][1];
    registeredCb({ payload: { text: "captured text" } });
    expect(cb).toHaveBeenCalledWith({ text: "captured text" });
  });

  it("onProviderStatus calls listen with 'provider_status' and unwraps payload", async () => {
    const cb = vi.fn();
    listen.mockResolvedValue(vi.fn());
    await onProviderStatus(cb);

    const registeredCb = listen.mock.calls[0][1];
    registeredCb({ payload: { provider: "ollama", alive: true } });
    expect(cb).toHaveBeenCalledWith({ provider: "ollama", alive: true });
  });

  it("onHotkeyError calls listen with 'hotkey_error' and unwraps payload", async () => {
    const cb = vi.fn();
    listen.mockResolvedValue(vi.fn());
    await onHotkeyError(cb);

    const registeredCb = listen.mock.calls[0][1];
    registeredCb({ payload: { shortcut: "Ctrl+Shift+E", message: "conflict" } });
    expect(cb).toHaveBeenCalledWith({ shortcut: "Ctrl+Shift+E", message: "conflict" });
  });

  it("all event helpers return an UnlistenFn from listen", async () => {
    listen.mockResolvedValue(vi.fn());
    const unlisten1 = await onOptChunk(vi.fn());
    const unlisten2 = await onOptDone(vi.fn());
    const unlisten3 = await onOptError(vi.fn());
    const unlisten4 = await onOverlayShow(vi.fn());
    const unlisten5 = await onProviderStatus(vi.fn());
    const unlisten6 = await onHotkeyError(vi.fn());

    expect(typeof unlisten1).toBe("function");
    expect(typeof unlisten2).toBe("function");
    expect(typeof unlisten3).toBe("function");
    expect(typeof unlisten4).toBe("function");
    expect(typeof unlisten5).toBe("function");
    expect(typeof unlisten6).toBe("function");
  });
});
