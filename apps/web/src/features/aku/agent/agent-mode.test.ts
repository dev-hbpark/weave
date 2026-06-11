import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nn } from "../../../lib/nn.js";
import {
  AKU_AGENT_MODE_OPTIONS,
  connectModeOptions,
  loadAgentMode,
  saveAgentMode,
} from "./agent-mode.js";
import akuAgentSource from "./use-aku-agent.ts?raw";

// WI-175 — client-selected execution mode. The pure half (persistence +
// connect-option mapping) is unit-tested directly; the hook WIRING (the spread
// into connectAgocraftAgent + the reconnect-on-change dependency) lives inside
// getHandle, which a renderHook cannot reach without mocking the whole agocraft
// client — so, per the WI-171/174 precedent, it is pinned as source-fitness.

describe("connectModeOptions (WI-175)", () => {
  it('"server" sends NOTHING — the boot default stays untouched', () => {
    expect(connectModeOptions("server", null)).toEqual({});
    // Even with a configured key: no mode request → no key exposure.
    expect(connectModeOptions("server", "sk-ant-x")).toEqual({});
  });

  it('"api" / "byo-ssh" request the mode but never carry the key (server-side creds)', () => {
    expect(connectModeOptions("api", "sk-ant-x")).toEqual({ mode: "api" });
    expect(connectModeOptions("byo-ssh", "sk-ant-x")).toEqual({ mode: "byo-ssh" });
  });

  it('"byo-apikey" carries the key — and ONLY this mode does (least exposure)', () => {
    expect(connectModeOptions("byo-apikey", "sk-ant-x")).toEqual({
      mode: "byo-apikey",
      apiKey: "sk-ant-x",
    });
    // Key not configured → still request the mode (the server answers with an
    // auth error per task, which is the honest signal that the env is missing).
    expect(connectModeOptions("byo-apikey", null)).toEqual({ mode: "byo-apikey" });
    expect(connectModeOptions("byo-apikey", "")).toEqual({ mode: "byo-apikey" });
  });

  it("every visible option maps to a real mode request (registry coverage)", () => {
    for (const opt of AKU_AGENT_MODE_OPTIONS) {
      expect(connectModeOptions(opt.value, null).mode).toBe(opt.value);
    }
  });
});

describe("agent-mode persistence", () => {
  // jsdom 29 ships a localStorage STUB without working methods (see
  // aku-settings.test.ts), so install a real in-memory store for these tests.
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => (store.has(k) ? nn(store.get(k)) : null),
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
        key: (i: number) => [...store.keys()][i] ?? null,
        get length() {
          return store.size;
        },
      },
    });
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("round-trips a selection through localStorage", () => {
    saveAgentMode("byo-apikey");
    expect(loadAgentMode()).toBe("byo-apikey");
    saveAgentMode("server");
    expect(loadAgentMode()).toBe("server");
  });

  it("rejects garbage (stale/foreign values must not lock the client into a bad hello)", () => {
    window.localStorage.setItem("weave.aku.agent-mode", "yolo-mode");
    expect(loadAgentMode()).toBe("server");
    window.localStorage.removeItem("weave.aku.agent-mode");
    expect(loadAgentMode()).toBe("server");
  });
});

describe("useAkuAgent mode wiring (source-fitness)", () => {
  const src = akuAgentSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("spreads connectModeOptions into the connect call", () => {
    expect(src).toMatch(/\.\.\.connectModeOptions\(agentMode, apiKey\)/);
  });

  it("getHandle re-dials when the mode changes (dependency list)", () => {
    expect(src).toMatch(/\[editor, surface, designId, url, token, agentMode, apiKey\]/);
  });

  it("setAgentMode persists, drops the live link, then sets state (setToken pattern)", () => {
    expect(src).toMatch(/saveAgentMode\(next\);\s*dropLink\(\);\s*setAgentModeState\(next\)/);
  });

  it("the BYO key comes from env, not UI state (operator pre-configures it)", () => {
    expect(src).toMatch(/const apiKey = envStr\("VITE_AKU_API_KEY"\) \?\? null;/);
    // And it is never returned from the hook (secret).
    expect(src).not.toMatch(/apiKey,\s*\n\s*};\s*\n}/);
  });
});
