import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AKU_SETTINGS_SECTIONS,
  type AkuSettingKey,
  DEFAULT_AKU_SETTINGS,
  loadAkuSettings,
  temperatureForCreativity,
} from "./aku-settings.js";

const KEY = "weave.aku.settings";

// jsdom 29 ships a localStorage STUB without working methods (see
// document/storage.test.ts), so install a real in-memory store for these tests.
function installMemoryStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

beforeEach(installMemoryStorage);
afterEach(() => {
  window.localStorage.clear();
});

describe("loadAkuSettings", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadAkuSettings()).toEqual(DEFAULT_AKU_SETTINGS);
  });

  it("merges a partial stored blob over defaults (forward-compatible)", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ designTone: false, themeAdvice: true }));
    const s = loadAkuSettings();
    expect(s.designTone).toBe(false);
    expect(s.themeAdvice).toBe(true);
    // A flag absent from the old blob falls back to its default.
    expect(s.autoFitCamera).toBe(DEFAULT_AKU_SETTINGS.autoFitCamera);
  });

  it("falls back to defaults on malformed JSON", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(loadAkuSettings()).toEqual(DEFAULT_AKU_SETTINGS);
  });
});

describe("AKU_SETTINGS_SECTIONS", () => {
  it("covers every BOOLEAN settings key exactly once, with valid dependsOn refs", () => {
    const keys = AKU_SETTINGS_SECTIONS.flatMap((s) => s.items.map((i) => i.key));
    // The sections render booleans as switches; `creativity` has its own control.
    const booleanKeys = (Object.keys(DEFAULT_AKU_SETTINGS) as AkuSettingKey[]).filter(
      (k) => typeof DEFAULT_AKU_SETTINGS[k] === "boolean",
    );
    expect(new Set(keys)).toEqual(new Set(booleanKeys));
    expect(keys.length).toBe(booleanKeys.length); // no duplicates
    for (const section of AKU_SETTINGS_SECTIONS) {
      for (const item of section.items) {
        if (item.dependsOn !== undefined) {
          expect(booleanKeys).toContain(item.dependsOn);
        }
      }
    }
  });
});

describe("temperatureForCreativity", () => {
  it("maps each level to a temperature in [0, 1], increasing with creativity", () => {
    expect(temperatureForCreativity("consistent")).toBe(0);
    expect(temperatureForCreativity("creative")).toBe(1);
    expect(temperatureForCreativity("consistent")).toBeLessThan(
      temperatureForCreativity("balanced"),
    );
    expect(temperatureForCreativity("balanced")).toBeLessThan(temperatureForCreativity("creative"));
  });
});
