import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nn } from "../../../lib/nn.js";
import {
  AKU_AGENT_MODE_OPTIONS,
  connectModeOptions,
  DEFAULT_AGENT_MODE,
  loadAgentMode,
  saveAgentMode,
} from "./agent-mode.js";
import akuAgentSource from "./use-aku-agent.ts?raw";

// WI-175 — client-selected execution mode. The pure half (persistence +
// connect-option mapping) is unit-tested directly; the hook WIRING (the spread
// into connectAgocraftAgent + the reconnect-on-change dependency) lives inside
// getHandle, which a renderHook cannot reach without mocking the whole agocraft
// client — so, per the WI-171/174 precedent, it is pinned as source-fitness.

describe("connectModeOptions (WI-175 → WI-176, DR-057 merge)", () => {
  it('"server" sends NOTHING — the boot default stays untouched', () => {
    expect(connectModeOptions("server", null)).toEqual({});
    // Even with a configured key: no mode request → no key exposure.
    expect(connectModeOptions("server", "sk-ant-x")).toEqual({});
  });

  it('"api" carries the key when configured — and ONLY this mode does (least exposure)', () => {
    expect(connectModeOptions("api", "sk-ant-x")).toEqual({ mode: "api", apiKey: "sk-ant-x" });
    // Key not configured → mode only; the server falls back to its shared key
    // (DR-057 keySource:"server").
    expect(connectModeOptions("api", null)).toEqual({ mode: "api" });
    expect(connectModeOptions("api", "")).toEqual({ mode: "api" });
  });

  it('"byo-ssh" requests the mode but never carries the key (server-side creds)', () => {
    expect(connectModeOptions("byo-ssh", "sk-ant-x")).toEqual({ mode: "byo-ssh" });
  });

  it('"codex-ssh" requests the mode but never carries the key (WI-204 — server-side ChatGPT creds)', () => {
    expect(connectModeOptions("codex-ssh", "sk-ant-x")).toEqual({ mode: "codex-ssh" });
    expect(connectModeOptions("codex-ssh", null)).toEqual({ mode: "codex-ssh" });
  });

  it("every visible option maps to a real mode request (registry coverage)", () => {
    for (const opt of AKU_AGENT_MODE_OPTIONS) {
      expect(connectModeOptions(opt.value, null).mode).toBe(opt.value);
    }
  });

  it("the segments are exactly API / SSH / Codex (DR-057 merge + WI-204 codex)", () => {
    expect(AKU_AGENT_MODE_OPTIONS.map((o) => o.value)).toEqual(["api", "byo-ssh", "codex-ssh"]);
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
    saveAgentMode("api");
    expect(loadAgentMode()).toBe("api");
    saveAgentMode("byo-ssh");
    expect(loadAgentMode()).toBe("byo-ssh");
    saveAgentMode("codex-ssh");
    expect(loadAgentMode()).toBe("codex-ssh");
    saveAgentMode("server");
    expect(loadAgentMode()).toBe("server");
  });

  it('migrates a stored "byo-apikey" to "api" (DR-057 merged the modes)', () => {
    window.localStorage.setItem("weave.aku.agent-mode", "byo-apikey");
    expect(loadAgentMode()).toBe("api");
  });

  it("rejects garbage / missing value → DEFAULT_AGENT_MODE (WI-178: byo-ssh)", () => {
    // The default is byo-ssh — the deployment's everyday mode (subscription CLI).
    // Server allowlist still gates it: denial falls back to the boot mode and
    // serverInfo.mode announces the granted mode (WI-175), so this is safe.
    expect(DEFAULT_AGENT_MODE).toBe("byo-ssh");
    window.localStorage.setItem("weave.aku.agent-mode", "yolo-mode");
    expect(loadAgentMode()).toBe("byo-ssh");
    window.localStorage.removeItem("weave.aku.agent-mode");
    expect(loadAgentMode()).toBe("byo-ssh");
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
