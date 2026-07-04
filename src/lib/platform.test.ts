import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isMac, modLabel, defaultHotkeyLabel } from "./platform";

describe("platform helpers", () => {
  let origPlatform: string;
  let origUserAgent: string;

  beforeEach(() => {
    origPlatform = navigator.platform;
    origUserAgent = navigator.userAgent;
  });

  afterEach(() => {
    Object.defineProperty(navigator, "platform", { value: origPlatform, configurable: true });
    Object.defineProperty(navigator, "userAgent", { value: origUserAgent, configurable: true });
  });

  // ── isMac ──────────────────────────────────────────────────────────

  describe("isMac", () => {
    it("returns true for MacIntel platform", () => {
      Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
      expect(isMac()).toBe(true);
    });

    it("returns true for iPhone platform", () => {
      Object.defineProperty(navigator, "platform", { value: "iPhone", configurable: true });
      expect(isMac()).toBe(true);
    });

    it("returns true for iPad platform", () => {
      Object.defineProperty(navigator, "platform", { value: "iPad", configurable: true });
      expect(isMac()).toBe(true);
    });

    it("returns true when UA contains 'Mac'", () => {
      Object.defineProperty(navigator, "platform", { value: "", configurable: true });
      Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", configurable: true });
      expect(isMac()).toBe(true);
    });

    it("returns false for Win32 platform", () => {
      Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });
      expect(isMac()).toBe(false);
    });

    it("returns false for Linux x86_64 platform", () => {
      Object.defineProperty(navigator, "platform", { value: "Linux x86_64", configurable: true });
      expect(isMac()).toBe(false);
    });

    it("returns false for empty platform and UA", () => {
      Object.defineProperty(navigator, "platform", { value: "", configurable: true });
      Object.defineProperty(navigator, "userAgent", { value: "", configurable: true });
      expect(isMac()).toBe(false);
    });
  });

  // ── modLabel ──────────────────────────────────────────────────────

  describe("modLabel", () => {
    it('returns "⌘" on Mac', () => {
      Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
      expect(modLabel()).toBe("⌘");
    });

    it('returns "Ctrl" on Windows', () => {
      Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });
      expect(modLabel()).toBe("Ctrl");
    });

    it('returns "Ctrl" on Linux', () => {
      Object.defineProperty(navigator, "platform", { value: "Linux x86_64", configurable: true });
      expect(modLabel()).toBe("Ctrl");
    });
  });

  // ── defaultHotkeyLabel ─────────────────────────────────────────────

  describe("defaultHotkeyLabel", () => {
    it('returns ["⌘","Shift","E"] on Mac', () => {
      Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
      expect(defaultHotkeyLabel()).toEqual(["⌘", "Shift", "E"]);
    });

    it('returns ["Ctrl","Shift","E"] on Windows', () => {
      Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });
      expect(defaultHotkeyLabel()).toEqual(["Ctrl", "Shift", "E"]);
    });

    it('returns ["Ctrl","Shift","E"] on Linux', () => {
      Object.defineProperty(navigator, "platform", { value: "Linux x86_64", configurable: true });
      expect(defaultHotkeyLabel()).toEqual(["Ctrl", "Shift", "E"]);
    });
  });
});
