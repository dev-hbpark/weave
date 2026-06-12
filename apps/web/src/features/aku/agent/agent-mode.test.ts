import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nn } from "../../../lib/nn.js";
import {
  AKU_AGENT_MODE_OPTIONS,
  type AkuApiKeys,
  axesFromMode,
  connectModeOptions,
  DEFAULT_AGENT_MODE,
  loadAgentMode,
  modeFromAxes,
  saveAgentMode,
} from "./agent-mode.js";

/** Per-provider keys helper for the connect-option tests. */
const keys = (anthropic: string | null, openai: string | null = null): AkuApiKeys => ({
  anthropic,
  openai,
});

import akuAgentSource from "./use-aku-agent.ts?raw";

// WI-175 — client-selected execution mode. The pure half (persistence +
// connect-option mapping) is unit-tested directly; the hook WIRING (the spread
// into connectAgocraftAgent + the reconnect-on-change dependency) lives inside
// getHandle, which a renderHook cannot reach without mocking the whole agocraft
// client — so, per the WI-171/174 precedent, it is pinned as source-fitness.

describe("connectModeOptions (WI-175 → WI-176, DR-057 merge)", () => {
  it('"server" sends NOTHING — the boot default stays untouched', () => {
    expect(connectModeOptions("server", keys(null, null))).toEqual({});
    // Even with configured keys: no mode request → no key exposure.
    expect(connectModeOptions("server", keys("sk-ant-x", "sk-oai-x"))).toEqual({});
  });

  it('"api" carries ONLY the Anthropic key (least exposure — never the OpenAI one)', () => {
    expect(connectModeOptions("api", keys("sk-ant-x", "sk-oai-x"))).toEqual({
      mode: "api",
      apiKey: "sk-ant-x",
    });
    // Key not configured → mode only; the server falls back to its shared key
    // (DR-057 keySource:"server").
    expect(connectModeOptions("api", keys(null, "sk-oai-x"))).toEqual({ mode: "api" });
    expect(connectModeOptions("api", keys("", null))).toEqual({ mode: "api" });
  });

  it('"openai-api" carries ONLY the OpenAI key (WI-056/DR-070)', () => {
    expect(connectModeOptions("openai-api", keys("sk-ant-x", "sk-oai-x"))).toEqual({
      mode: "openai-api",
      apiKey: "sk-oai-x",
    });
    expect(connectModeOptions("openai-api", keys("sk-ant-x", null))).toEqual({
      mode: "openai-api",
    });
  });

  it('"byo-ssh" requests the mode but never carries a key (server-side creds)', () => {
    expect(connectModeOptions("byo-ssh", keys("sk-ant-x", "sk-oai-x"))).toEqual({
      mode: "byo-ssh",
    });
  });

  it('"codex-ssh" requests the mode but never carries a key (WI-204 — server-side ChatGPT creds)', () => {
    expect(connectModeOptions("codex-ssh", keys("sk-ant-x", "sk-oai-x"))).toEqual({
      mode: "codex-ssh",
    });
    expect(connectModeOptions("codex-ssh", keys(null, null))).toEqual({ mode: "codex-ssh" });
  });

  it("every mode option maps to a real mode request (registry coverage)", () => {
    for (const opt of AKU_AGENT_MODE_OPTIONS) {
      expect(connectModeOptions(opt.value, keys(null, null)).mode).toBe(opt.value);
    }
  });

  it("the modes are exactly the provider×transport matrix (WI-056/DR-070)", () => {
    expect(AKU_AGENT_MODE_OPTIONS.map((o) => o.value)).toEqual([
      "api",
      "byo-ssh",
      "openai-api",
      "codex-ssh",
    ]);
  });
});

describe("provider × transport axes (WI-056/DR-070, panel toggles)", () => {
  it("composes each axis pair to the right mode and round-trips back", () => {
    const cases = [
      { provider: "anthropic", transport: "api", mode: "api" },
      { provider: "anthropic", transport: "ssh", mode: "byo-ssh" },
      { provider: "openai", transport: "api", mode: "openai-api" },
      { provider: "openai", transport: "ssh", mode: "codex-ssh" },
    ] as const;
    for (const c of cases) {
      expect(modeFromAxes(c.provider, c.transport)).toBe(c.mode);
      expect(axesFromMode(c.mode)).toEqual({ provider: c.provider, transport: c.transport });
    }
  });

  it("toggling ONE axis holds the other (provider swap keeps transport)", () => {
    // From byo-ssh (anthropic, ssh): swap provider → openai keeps ssh → codex-ssh.
    const { transport } = axesFromMode("byo-ssh");
    expect(modeFromAxes("openai", transport)).toBe("codex-ssh");
    // From openai-api (openai, api): swap transport → ssh keeps openai → codex-ssh.
    const { provider } = axesFromMode("openai-api");
    expect(modeFromAxes(provider, "ssh")).toBe("codex-ssh");
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

  it("spreads connectModeOptions (with the per-provider keys) into the connect call", () => {
    expect(src).toMatch(/\.\.\.connectModeOptions\(agentMode, apiKeys\)/);
  });

  it("getHandle re-dials when the mode changes (dependency list)", () => {
    expect(src).toMatch(/\[editor, surface, designId, url, token, agentMode, apiKeys\]/);
  });

  it("setAgentMode persists, drops the live link, then sets state (setToken pattern)", () => {
    expect(src).toMatch(/saveAgentMode\(next\);\s*dropLink\(\);\s*setAgentModeState\(next\)/);
  });

  it("both provider keys come from env, not UI state (operator pre-configures them)", () => {
    // WI-056/DR-070 — Anthropic key for api, OpenAI key for openai-api.
    expect(src).toMatch(/anthropic: envStr\("VITE_AKU_API_KEY"\) \?\? null,/);
    expect(src).toMatch(/openai: envStr\("VITE_AKU_OPENAI_API_KEY"\) \?\? null,/);
    // And no key is ever returned from the hook (secret).
    expect(src).not.toMatch(/apiKeys,\s*\n\s*};\s*\n}/);
  });
});
