// WI-136 — catalog registry + on-demand loader contracts.

import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TEXT_FONT_FAMILY,
  FONT_BY_ID,
  FONT_BY_STACK,
  FONT_CATALOG,
  FONT_GROUPS,
  FONT_ROLES,
  type FontEntry,
  fontIdFromFamily,
  fontLabel,
  makeGoogleFontEntry,
} from "./catalog.js";
import {
  __resetLoadedFontsForTest,
  ensureFontByStack,
  ensureFontsForValues,
} from "./font-loader.js";
import { GOOGLE_FONTS_SNAPSHOT } from "./google-fonts-snapshot.js";
import { THEME_TYPOGRAPHY_DEFAULTS } from "./theme-typography-defaults.js";

/** Look up a known-present catalog entry without a non-null assertion. */
function byId(id: string): FontEntry {
  const entry = FONT_BY_ID.get(id);
  if (entry === undefined) throw new Error(`missing catalog font: ${id}`);
  return entry;
}

afterEach(() => {
  __resetLoadedFontsForTest();
  for (const l of document.head.querySelectorAll("link[data-weave-font]")) l.remove();
});

describe("font catalog", () => {
  it("has unique stable ids and stacks", () => {
    const ids = new Set(FONT_CATALOG.map((f) => f.id));
    const stacks = new Set(FONT_CATALOG.map((f) => f.stack));
    expect(ids.size).toBe(FONT_CATALOG.length);
    expect(stacks.size).toBe(FONT_CATALOG.length);
  });

  it("derives lookup maps from the catalog", () => {
    for (const f of FONT_CATALOG) {
      expect(FONT_BY_ID.get(f.id)).toBe(f);
      expect(FONT_BY_STACK.get(f.stack)).toBe(f);
    }
  });

  it("groups cover every catalog entry exactly once", () => {
    const grouped = FONT_GROUPS.flatMap((g) => g.fonts);
    expect(grouped.length).toBe(FONT_CATALOG.length);
    expect(new Set(grouped).size).toBe(FONT_CATALOG.length);
  });

  it("system fonts load nothing; google fonts carry a family", () => {
    for (const f of FONT_CATALOG) {
      if (f.source === "system") expect(f.family).toBe("");
      else expect(f.family.length).toBeGreaterThan(0);
    }
  });

  it("korean fonts insert a Korean fallback before the category tail", () => {
    const noto = FONT_BY_ID.get("noto-sans-kr");
    expect(noto?.stack).toContain("Apple SD Gothic Neo");
  });

  it("the default text font is the theme body role", () => {
    expect(DEFAULT_TEXT_FONT_FAMILY).toBe("var(--font-sans)");
    expect(FONT_ROLES.some((r) => r.value === DEFAULT_TEXT_FONT_FAMILY)).toBe(true);
  });
});

describe("theme typography defaults", () => {
  it("only reference catalog font ids", () => {
    for (const [theme, roles] of Object.entries(THEME_TYPOGRAPHY_DEFAULTS)) {
      for (const fontId of Object.values(roles)) {
        expect(FONT_BY_ID.has(fontId), `${theme} → ${fontId}`).toBe(true);
      }
    }
  });

  it("only reference google fonts (loadable on theme activate)", () => {
    for (const roles of Object.values(THEME_TYPOGRAPHY_DEFAULTS)) {
      for (const fontId of Object.values(roles)) {
        expect(byId(fontId).source).toBe("google");
      }
    }
  });
});

describe("ad-hoc google font builder", () => {
  it("derives a stable kebab id from a family name", () => {
    expect(fontIdFromFamily("Playfair Display")).toBe("playfair-display");
    expect(fontIdFromFamily("PT Serif")).toBe("pt-serif");
  });

  it("builds a deterministic stack matching the catalog convention", () => {
    const e = makeGoogleFontEntry("Roboto Slab", "serif");
    expect(e.id).toBe("roboto-slab");
    expect(e.source).toBe("google");
    expect(e.stack.startsWith("'Roboto Slab'")).toBe(true);
    const ko = makeGoogleFontEntry("Gowun Batang", "serif", ["latin", "korean"]);
    expect(ko.stack).toContain("Apple SD Gothic Neo");
  });
});

describe("google fonts snapshot", () => {
  it("excludes fonts already in the curated catalog", () => {
    for (const f of GOOGLE_FONTS_SNAPSHOT) {
      expect(FONT_BY_ID.has(f.id)).toBe(false);
    }
  });

  it("is non-trivial and all google-source with unique ids", () => {
    expect(GOOGLE_FONTS_SNAPSHOT.length).toBeGreaterThan(50);
    expect(GOOGLE_FONTS_SNAPSHOT.every((f) => f.source === "google")).toBe(true);
    expect(new Set(GOOGLE_FONTS_SNAPSHOT.map((f) => f.id)).size).toBe(GOOGLE_FONTS_SNAPSHOT.length);
  });
});

describe("fontLabel", () => {
  it("resolves catalog stacks, theme roles, and arbitrary stacks", () => {
    const inter = FONT_BY_ID.get("inter");
    expect(inter && fontLabel(inter.stack)).toBe("Inter");
    expect(fontLabel("var(--font-display)")).toBe("제목 (테마)");
    expect(fontLabel("'Comic Sans MS', cursive")).toBe("Comic Sans MS");
  });
});

describe("on-demand loader", () => {
  it("injects a google font <link> once, deduped", () => {
    const inter = byId("inter");
    ensureFontByStack(inter.stack);
    ensureFontByStack(inter.stack);
    const links = document.head.querySelectorAll('link[data-weave-font="inter"]');
    expect(links.length).toBe(1);
    expect(links[0]?.getAttribute("href")).toContain("family=Inter");
    expect(links[0]?.getAttribute("href")).toContain("display=swap");
  });

  it("ignores theme-role var values and unquoted (system) literals", () => {
    ensureFontsForValues(["var(--font-sans)", "ui-sans-serif, system-ui, sans-serif"]);
    expect(document.head.querySelectorAll("link[data-weave-font]").length).toBe(0);
  });

  it("best-effort loads an ad-hoc / legacy quoted family not in the catalog", () => {
    // WI-136 Phase 6 — a stored stack leading with a quoted family resolves to a
    // Google Fonts load under a `gf:` key, so browse-picked fonts rehydrate.
    ensureFontByStack("'Roboto Slab', Georgia, serif");
    const links = document.head.querySelectorAll('link[data-weave-font="gf:Roboto Slab"]');
    expect(links.length).toBe(1);
    expect(links[0]?.getAttribute("href")).toContain("family=Roboto+Slab");
  });

  it("rehydrates a mixed value set: catalog stack + role + plain garbage", () => {
    const playfair = byId("playfair-display");
    ensureFontsForValues([playfair.stack, "var(--font-mono)", "garbage-no-quote"]);
    const links = document.head.querySelectorAll("link[data-weave-font]");
    expect(links.length).toBe(1);
    expect(links[0]?.getAttribute("data-weave-font")).toBe("playfair-display");
  });
});
