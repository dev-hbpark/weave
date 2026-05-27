// WI-032 Phase 3c — legacy-to-frame migration on first load.
//
// Verifies the production behavior of `migrateLegacyKindsToFrame` +
// the v9 backup write inside `storage.ts.loadDesign`. The original draft
// of this spec seeded the v5 blob from scratch and ran into agocraft's
// schema validator (legacy kinds removed from `createSchema()`); this
// rewrite produces the legacy blob by *mutating* an editor-seeded design
// in localStorage — the same path a real pre-WI-032 user would have
// reached, byte-for-byte. The mutation is intentionally minimal: rewrite
// the kind of each top-level Item in the v5 JSON to a legacy value plus
// the matching legacy attrs. `serializer.fromJSON` with
// `onUnknown: "preserve"` keeps the Item shape intact and the migration
// helper rewrites it into `frame` + primitive children on first load.

import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

interface Counts {
  readonly frame: number;
  readonly text: number;
  readonly shape: number;
  readonly image: number;
  readonly video: number;
  readonly slide: number;
  readonly "canvas-design": number;
  readonly "block-doc": number;
  readonly media: number;
}

async function deepKindCounts(page: import("@playwright/test").Page): Promise<Counts> {
  return page.evaluate(() => {
    const counts: Record<string, number> = {};
    type Item = { kind: string; children: ReadonlyArray<Item> };
    const root = (window as unknown as { __weaveDoc?: { root: Item } }).__weaveDoc?.root;
    function walk(items: ReadonlyArray<Item>) {
      for (const it of items) {
        counts[it.kind] = (counts[it.kind] ?? 0) + 1;
        walk(it.children);
      }
    }
    if (root !== undefined) walk(root.children);
    return {
      frame: counts.frame ?? 0,
      text: counts.text ?? 0,
      shape: counts.shape ?? 0,
      image: counts.image ?? 0,
      video: counts.video ?? 0,
      slide: counts.slide ?? 0,
      "canvas-design": counts["canvas-design"] ?? 0,
      "block-doc": counts["block-doc"] ?? 0,
      media: counts.media ?? 0,
    } as Counts;
  });
}

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

/**
 * Seed a real v5 blob via the editor command surface, then mutate its
 * JSON to install legacy 4-domain kinds + their attrs. Returns the
 * design id so the caller can navigate to it after the mutation.
 */
async function seedLegacyV5Blob(page: import("@playwright/test").Page): Promise<string> {
  const id = await prepareDesign(page, { flavor: "mixed", title: "Legacy fixture" });

  // Add one frame per legacy kind, so the mutation has 4 Items to rewrite.
  // Helper coordinates each frame on its own quadrant so the migration
  // produces a deterministic visual outcome.
  await addFrame(page, "frame", {
    frame: { x: 0.05, y: 0.05, width: 0.4, height: 0.4, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.5, y: 0.05, width: 0.4, height: 0.4, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.05, y: 0.5, width: 0.4, height: 0.4, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.5, y: 0.5, width: 0.4, height: 0.4, rotation: 0 },
  });

  // Force a persist so the v5 blob carries the 4 frames. The host's
  // debounced ChangeStream sink writes on a 3-second delay; the polite
  // path is `__weaveEditor.persist()` if exposed, but here we just wait
  // long enough for the debounce to fire.
  await page.waitForTimeout(3500);

  // Mutate the v5 blob — rewrite kind + attrs of each top-level Item to a
  // legacy 4-domain shape. The Items currently look like
  //   { kind: "frame", attrs: { frame: {...} } }
  // and become
  //   { kind: "slide", attrs: { frame, title: "Hello", bullets: [...] } }
  //   { kind: "canvas-design", attrs: { frame, summary: "", shapes: [...] } }
  //   ...
  // We do this inside `page.evaluate` so the byte-level manipulation lives
  // close to the assertion that follows the reload.
  const key = `weave.design.v5.${id}`;
  await page.evaluate(
    ({ key }) => {
      const raw = window.localStorage.getItem(key);
      if (raw === null) throw new Error(`expected v5 blob at ${key}`);
      const blob = JSON.parse(raw) as {
        document: {
          root: {
            children: Array<{
              kind: string;
              attrs: Record<string, unknown>;
            }>;
          };
        };
      };
      const legacy: Array<{ kind: string; attrs: Record<string, unknown> }> = [
        {
          kind: "slide",
          attrs: { title: "Hello", bullets: ["one", "two"] },
        },
        {
          kind: "canvas-design",
          attrs: {
            summary: "",
            shapes: [
              {
                id: "shape-a",
                x: 0.1,
                y: 0.1,
                width: 0.2,
                height: 0.2,
                rotation: 0,
                hue: "var(--accent)",
              },
            ],
          },
        },
        {
          kind: "block-doc",
          attrs: { heading: "Doc head", paragraphs: ["A.", "B."] },
        },
        { kind: "media", attrs: { caption: "Cover", tone: "image" } },
      ];
      const items = blob.document.root.children;
      for (let i = 0; i < items.length && i < legacy.length; i += 1) {
        const orig = items[i];
        const mut = legacy[i];
        if (orig === undefined || mut === undefined) continue;
        orig.kind = mut.kind;
        orig.attrs = { ...orig.attrs, ...mut.attrs };
      }
      window.localStorage.setItem(key, JSON.stringify(blob));
    },
    { key },
  );

  // Drop the in-memory design + v9-backup keys so the next load takes
  // the persisted (now legacy-shaped) blob through `storage.loadDesign`
  // from scratch.
  await page.evaluate(() => {
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const k = window.localStorage.key(i);
      if (k !== null && k.startsWith("weave.design.v9-backup.")) {
        window.localStorage.removeItem(k);
      }
    }
  });
  return id;
}

// WI-032 — storage.loadDesign now runs migrate-frame-only on the raw JSON
// BEFORE serializer.fromJSON, so legacy 4-domain Items survive the schema
// validator. The spec seeds a v5 blob via the editor command surface,
// rewrites each top-level Item's `kind` + `attrs` to a legacy shape, and
// reloads — the migration produces the documented frame + primitive
// children mapping (FRAME_ONLY_PARADIGM_SPEC §3) and stashes the original
// blob under `weave.design.v9-backup.<id>` for 1-week rollback (RISK-004
// §1 controls).
test("legacy 4 domains → frame on first load + v9 backup persisted", async ({ page }) => {
  const id = await seedLegacyV5Blob(page);

  await page.goto(`/design/${id}`);
  await page.waitForFunction(() => {
    const w = window as unknown as { __weaveDoc?: unknown };
    return w.__weaveDoc !== undefined;
  });

  const counts = await deepKindCounts(page);
  // All four legacy kinds are gone — replaced by `frame`.
  expect(counts.slide).toBe(0);
  expect(counts["canvas-design"]).toBe(0);
  expect(counts["block-doc"]).toBe(0);
  expect(counts.media).toBe(0);
  expect(counts.frame).toBe(4);

  // The documented mapping (FRAME_ONLY_PARADIGM_SPEC §3) produces, per the
  // legacy-attr table seeded in `seedLegacyV5Blob`:
  //   slide → 1 text(title) + 2 text(bullets) = 3 text
  //   canvas-design → 1 shape (summary empty → 0 text)
  //   block-doc → 1 text(heading) + 1 text(paragraphs joined) = 2 text
  //   media   → 1 image + 1 text(caption) = 1 image + 1 text
  // Totals: 6 text, 1 shape, 1 image.
  expect(counts.text).toBe(6);
  expect(counts.shape).toBe(1);
  expect(counts.image).toBe(1);

  // RISK-004 condition #1 — pre-migration blob is stashed for rollback.
  const backup = await page.evaluate((d) => {
    const raw = window.localStorage.getItem(`weave.design.v9-backup.${d}`);
    if (raw === null) return null;
    return JSON.parse(raw) as { v5: string; savedAt: string };
  }, id);
  expect(backup).not.toBeNull();
  expect(typeof backup?.v5).toBe("string");
  expect(typeof backup?.savedAt).toBe("string");
  // The backup's payload is the original v5 JSON — round-trip identity.
  const restored = JSON.parse(backup?.v5 ?? "{}");
  expect(restored.id).toBe(id);
});

test("migration is idempotent — second load does not rewrite the backup", async ({ page }) => {
  const id = await seedLegacyV5Blob(page);
  await page.goto(`/design/${id}`);
  await page.waitForFunction(() => {
    const w = window as unknown as { __weaveDoc?: unknown };
    return w.__weaveDoc !== undefined;
  });
  const backupFirst = await page.evaluate((d) => {
    const raw = window.localStorage.getItem(`weave.design.v9-backup.${d}`);
    return raw === null ? null : (JSON.parse(raw) as { savedAt: string });
  }, id);
  expect(backupFirst).not.toBeNull();
  const firstSavedAt = backupFirst?.savedAt ?? "";

  // Re-navigate — the persisted blob is now frame-shaped (migrated +
  // saved), so loadDesign sees a no-op migration. The backup must not
  // be overwritten (storage.saveBackupBlob is first-write-wins).
  await page.goto("/");
  await page.goto(`/design/${id}`);
  await page.waitForFunction(() => {
    const w = window as unknown as { __weaveDoc?: unknown };
    return w.__weaveDoc !== undefined;
  });
  const backupSecond = await page.evaluate((d) => {
    const raw = window.localStorage.getItem(`weave.design.v9-backup.${d}`);
    return raw === null ? null : (JSON.parse(raw) as { savedAt: string });
  }, id);
  expect(backupSecond?.savedAt).toBe(firstSavedAt);
});
