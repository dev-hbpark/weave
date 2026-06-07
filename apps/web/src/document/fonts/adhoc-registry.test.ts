// WI-136 follow-up — ad-hoc font registry contracts.

import { afterEach, describe, expect, it } from "vitest";
import {
  __resetAdHocForTest,
  adHocById,
  adHocByStack,
  registerAdHocFont,
  resolveFontEntryById,
} from "./adhoc-registry.js";
import { FONT_BY_ID, makeGoogleFontEntry } from "./catalog.js";
import { __resetLoadedFontsForTest, ensureFontByStack } from "./font-loader.js";

// NOTE: jsdom 29 ships a Storage stub without getItem/setItem methods (see
// storage.test.ts), so localStorage persistence is covered by e2e, not here.
// The registry swallows the stub's throws (try/catch), so these in-memory
// contract tests run unaffected.
afterEach(() => {
  __resetAdHocForTest();
  __resetLoadedFontsForTest();
  for (const l of document.head.querySelectorAll("link[data-weave-font]")) l.remove();
});

describe("ad-hoc registry", () => {
  it("registers and resolves by id and stack", () => {
    const e = makeGoogleFontEntry("Roboto Slab", "serif");
    registerAdHocFont(e);
    expect(adHocById(e.id)).toEqual(e);
    expect(adHocByStack(e.stack)).toEqual(e);
  });

  it("never shadows a curated catalog id", () => {
    const inter = FONT_BY_ID.get("inter");
    expect(inter).toBeDefined();
    // Attempt to register an entry colliding with a catalog id → ignored.
    registerAdHocFont(makeGoogleFontEntry("Inter", "sans"));
    expect(adHocById("inter")).toBeUndefined();
    expect(resolveFontEntryById("inter")).toBe(inter);
  });

  it("resolveFontEntryById falls through catalog → ad-hoc", () => {
    const e = makeGoogleFontEntry("Zilla Slab", "serif");
    expect(resolveFontEntryById(e.id)).toBeUndefined();
    registerAdHocFont(e);
    expect(resolveFontEntryById(e.id)).toEqual(e);
  });

  it("registering is resilient when localStorage is unavailable (jsdom stub)", () => {
    // Must not throw even though the jsdom Storage stub lacks setItem.
    expect(() => registerAdHocFont(makeGoogleFontEntry("Spectral", "serif"))).not.toThrow();
    expect(adHocById("spectral")).toBeDefined();
  });

  it("loader resolves a registered ad-hoc stack precisely (catalog-style link)", () => {
    const e = makeGoogleFontEntry("Bitter", "serif");
    registerAdHocFont(e);
    ensureFontByStack(e.stack);
    // Registered → loads under its own id, not the `gf:` best-effort key.
    const links = document.head.querySelectorAll(`link[data-weave-font="${e.id}"]`);
    expect(links.length).toBe(1);
    expect(links[0]?.getAttribute("href")).toContain("family=Bitter");
  });
});
