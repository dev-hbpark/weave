// WI-028 Phase 3b — verify the Y.Doc → React read loop closes.
//
// The pure unit tests live in `@agocraft/sync` (round-trip, idempotent
// seed, patch → Y.Doc mirror). This spec covers the bit that no unit
// test can: that a remote-originated Y.Doc update produces a visible
// React state change inside the running app.
//
// Strategy:
//   1. Open a design (the wizard creates a fresh id; the room is
//      empty server-side).
//   2. Add one frame so we have a known item.
//   3. In page-evaluate, clone the page's Y.Doc into a sibling, mutate
//      the sibling's flat item catalogue to add a NEW item with a
//      distinctive id, encode the delta, and apply it to the page's
//      Y.Doc with origin "agocraft.sync.remote". Phase 3b's observer
//      should then fire `replaceDocumentFromRemote`, which sets the
//      Design via `replaceDocument` → React renders the new item.
//   4. Assert a `[data-frame-id]` for the injected id appears in the
//      DOM within ~1s (one debounced React tick).

import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("remote Y.Doc update reflects in React state via Phase 3b observer", async ({ page }) => {

  await prepareDesign(page, { flavor: "mixed", title: "Sync read loop" });
  await addFrame(page, "slide");

  // Wait for the dev-only globals to be wired. `__weaveYjs` resolves
  // via a dynamic import; everything else is synchronous on render.
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __weaveYjs?: unknown;
      __weaveSync?: { yDoc?: unknown };
    };
    return Boolean(w.__weaveYjs) && Boolean(w.__weaveSync?.yDoc);
  });

  const injectedId = `sync-test-${Date.now().toString(36)}`;
  const rootId = await page.evaluate(() => {
    const w = window as unknown as { __weaveDoc?: { root: { id: unknown } } };
    return String(w.__weaveDoc?.root.id ?? "");
  });
  expect(rootId.length).toBeGreaterThan(0);

  // Drive a remote update — sibling Y.Doc syncs from page's yDoc,
  // mutates, sends the diff back tagged "agocraft.sync.remote".
  const applied = await page.evaluate(
    ({ injectedId, rootId }) => {
      const w = window as unknown as {
        __weaveYjs: typeof import("yjs");
        __weaveSync: { yDoc: import("yjs").Doc };
      };
      const Y = w.__weaveYjs;
      const yDoc = w.__weaveSync.yDoc;

      // Mirror the page's yDoc into a sibling so the sibling is
      // a strict superset producer.
      const sibling = new Y.Doc();
      Y.applyUpdate(sibling, Y.encodeStateAsUpdate(yDoc));

      // Build a new item directly in the sibling — same shape
      // seedYDocFromDocument produces.
      const items = sibling.getMap<import("yjs").Map<unknown>>("items");
      const newItem = new Y.Map<unknown>();
      newItem.set("id", injectedId);
      newItem.set("kind", "slide");
      const attrs = new Y.Map<unknown>();
      attrs.set("frame", { x: 0.5, y: 0.5, width: 0.25, height: 0.25, rotation: 0 });
      attrs.set("title", "Injected via remote");
      attrs.set("bullets", []);
      newItem.set("attrs", attrs);
      newItem.set("units", new Y.Array());
      newItem.set("children", new Y.Array<string>());
      const meta = new Y.Map<unknown>();
      meta.set("createdAt", new Date().toISOString());
      meta.set("updatedAt", new Date().toISOString());
      newItem.set("meta", meta);
      items.set(injectedId, newItem);

      // Append the new id into the root's children array.
      const root = items.get(rootId);
      const rootChildren = root?.get("children") as
        | import("yjs").Array<string>
        | undefined;
      rootChildren?.push([injectedId]);

      // Encode the delta and apply back with the remote origin tag.
      const delta = Y.encodeStateAsUpdate(sibling, Y.encodeStateVector(yDoc));
      Y.applyUpdate(yDoc, delta, "agocraft.sync.remote");

      // Diagnostics so a failure isn't a black box.
      const pageItems = yDoc.getMap("items");
      const pageRoot = pageItems.get(rootId) as import("yjs").Map<unknown> | undefined;
      const pageChildren = (pageRoot?.get("children") as import("yjs").Array<string> | undefined)?.toArray();
      const w2 = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } } };
      const reactChildIds = w2.__weaveDoc?.root.children.map((c) => String(c.id));
      return {
        applied: true,
        pageChildren,
        reactChildIdsBeforeFlush: reactChildIds,
      };
    },
    { injectedId, rootId },
  );
  expect(applied.applied).toBe(true);
  // Confirm the remote update reached the Y.Doc — the read loop needs
  // this as a precondition. If the children array doesn't contain the
  // injected id, the sibling Y.Doc encoding diverged from the host's
  // Y.Doc shape and the rest of the assertions can't be trusted.
  expect(applied.pageChildren).toContain(injectedId);

  // The observer is synchronous; React's setState flushes on the next
  // microtask. One animation frame is more than enough.
  await expect(page.locator(`[data-frame-id="${injectedId}"]`)).toBeVisible({
    timeout: 2000,
  });
});
