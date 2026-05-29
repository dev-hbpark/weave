// Phase 10b — shared helpers for e2e specs. The wizard creates a new Design
// with a fresh id each run; specs walk through it once and then exercise the
// design page. `prepareDesign` clears v5 storage from prior runs, walks the
// wizard with the requested flavor, and returns the design id (parsed from
// the URL).

import type { Page } from "@playwright/test";
import type { DocFlavor, DomainKind, ItemFrame } from "../src/document/types.js";

export async function clearAllDesigns(page: Page) {
  // WI-032 Phase 3c — reset the cursor before navigating so hover state from
  // a prior spec doesn't leak into the next AITooltip's show-delay timer.
  // Empirically the ai-tooltip / text-item / tooltip-editor specs all pass
  // standalone but flake in groups; cursor reset between specs is the
  // cheapest hygiene step.
  await page.mouse.move(0, 0);
  await page.goto("/");
  await page.evaluate(() => {
    // WI-032 Phase 3c — drop every `weave.*` key, not just the v5 + v9
    // backup. Empirically the ai-tooltip / text-item / tooltip-editor
    // cluster flakes because of state that leaks across specs (cloud-sync
    // queue, presence, etc.); a fresh storage between specs is the
    // cheapest hygiene step.
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key !== null && key.startsWith("weave.")) {
        window.localStorage.removeItem(key);
      }
    }
  });
}

interface PrepareOptions {
  readonly flavor?: DocFlavor;
  /** Default 16:9. */
  readonly presetId?: string;
  readonly title?: string;
  /** Keep the session online. Default `false` — see the offline note below.
   *  Set `true` only for specs that genuinely exercise the cloud path
   *  (cloud-only-reopen, sync-read-loop). */
  readonly online?: boolean;
}

/** Walk the new-design wizard and land on /design/:id. Returns the id. */
export async function prepareDesign(
  page: Page,
  { flavor = "mixed", presetId = "16:9", title = "E2E design", online = false }: PrepareOptions = {},
): Promise<string> {
  // The e2e dev server is plain `vite` (`pnpm dev`), which does NOT serve the
  // `apps/web/api/*` Vercel functions. So the online persistence path
  // (`saveDesign` → fire-and-forget `/api` push) 404s and a freshly-created
  // design — including the wizard's flavor seed — is never retrievable, so
  // `useDesign` loads an empty document. Forcing the session offline routes
  // `saveDesign` through localStorage (which `useDesign` reads first), so the
  // seed survives the navigate-to-/design/:id round-trip. This overrides only
  // the `navigator.onLine` getter — real network (the Vite bundle) still
  // loads. Test-only; production storage behavior is untouched.
  if (!online) {
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "onLine", {
        get: () => false,
        configurable: true,
      });
    });
  }
  await page.goto("/");
  await page.getByTestId("landing-new-design").click();

  const titleInput = page.getByTestId("new-design-title");
  await titleInput.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(title);

  await page.getByTestId(`new-design-flavor-${flavor}`).click();
  await page.getByTestId(`new-design-size-${presetId}`).click();
  await page.getByTestId("new-design-create").click();

  await page.waitForURL(/\/design\/[^/]+$/);
  // WI-032 Phase 3c — wait for the editor to be wired before the spec
  // starts probing the page. Without this gate, specs whose
  // `beforeEach` finishes too quickly race the React mount + the WI-032
  // first-load migration pass + cloud-sync dynamic import, surfacing as
  // timing flakes in big spec groups (text-item, ai-tooltip,
  // tooltip-editor, etc. all standalone pass).
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __weaveEditor?: unknown;
      __weaveDoc?: unknown;
      __weaveVm?: unknown;
    };
    return w.__weaveEditor !== undefined && w.__weaveDoc !== undefined && w.__weaveVm !== undefined;
  });
  // Also let the network settle — `saveDesign` triggers a fire-and-forget
  // `cloud-sync.ts` dynamic import + push, and racing the next spec
  // against that in-flight import was the root cause of several
  // toolbar-undo timeout failures (empirically: removing this wait took
  // us from 11 → 15 group fails).
  await page.waitForLoadState("networkidle");
  if (!online) {
    // Forcing offline routes the new design through localStorage, so on the
    // design page `useDesign` opens it as a "local" source and raises the
    // offline-reconcile dialog (`LocalDesignConflictDialog`). Resolve it via
    // "save": with no API served the cloud round-trip fails, which releases
    // the dialog and KEEPS the current (seeded) design loaded — see
    // `resolveLocalConflict("save")` in use-design.ts. ("discard" would fetch
    // the absent server copy and blank the canvas.) The dialog blocks all
    // implicit dismissal, so an explicit action is required.
    const conflict = page.getByTestId("local-conflict-dialog");
    if (await conflict.isVisible().catch(() => false)) {
      await page.getByTestId("local-conflict-save").click();
      await conflict.waitFor({ state: "hidden" });
    }
  }
  const url = new URL(page.url());
  const match = url.pathname.match(/^\/design\/([^/]+)$/);
  if (match === null) throw new Error(`unexpected URL after wizard: ${url.pathname}`);
  return match[1] as string;
}

interface AddFrameOptions {
  /** Container id to add into; defaults to the design root. */
  readonly containerId?: string;
  /** Frame in 0..1 ratio inside the container; defaults to a small block
   *  near the center so multiple sequential adds don't fully overlap. */
  readonly frame?: ItemFrame;
}

/** Programmatically insert a frame via the editor exposed on `window`. The
 *  rubber-band drag flow is the user-facing add path; this helper bypasses
 *  the gesture so specs that focus on something else (history, drill-in,
 *  thumbnails) don't need to choreograph a pixel-perfect drag every time.
 *
 *  WI-032 Phase 3c — legacy kinds (slide / canvas-design / block-doc /
 *  media) are silently rewritten to `frame` here so existing callers don't
 *  need to be touched in lockstep with the production code's removal of
 *  those kinds. Specs that genuinely care about a primitive kind (image /
 *  video / shape / text) still pass it through unchanged. */
export async function addFrame(
  page: Page,
  kind: DomainKind | "slide" | "canvas-design" | "block-doc" | "media",
  opts: AddFrameOptions = {},
): Promise<void> {
  const LEGACY_TO_FRAME = new Set(["slide", "canvas-design", "block-doc", "media"]);
  const resolvedKind: DomainKind = (LEGACY_TO_FRAME.has(kind) ? "frame" : kind) as DomainKind;
  const defaultFrame: ItemFrame = {
    x: 0.4,
    y: 0.4,
    width: 0.2,
    height: 0.2,
    rotation: 0,
  };
  const frame = opts.frame ?? defaultFrame;
  // Wait for DesignPage to stash the editor on `window` before exec. This
  // mirrors the readiness handshake that the hand-rolled tooltip specs do.
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __weaveEditor?: unknown;
      __weaveDoc?: unknown;
    };
    return w.__weaveEditor !== undefined && w.__weaveDoc !== undefined;
  });
  await page.evaluate(
    ({ kind, frame, containerId }) => {
      type Editor = {
        exec: (
          name: string,
          input: { kind: string; containerId: string; frame: unknown },
        ) => unknown;
      };
      type Doc = { root: { id: string | number } };
      const w = window as unknown as { __weaveEditor?: Editor; __weaveDoc?: Doc };
      const editor = w.__weaveEditor;
      const doc = w.__weaveDoc;
      if (editor === undefined || doc === undefined) {
        throw new Error("addFrame: window.__weaveEditor not ready");
      }
      editor.exec("weave.item.add", {
        kind,
        containerId: containerId ?? String(doc.root.id),
        frame,
      });
    },
    { kind: resolvedKind, frame, containerId: opts.containerId },
  );
}

/** WI-039 — read the parent id + index inside that parent for `itemId`.
 *  Returns null when the item is missing or is the doc root. */
export async function readParentInfo(
  page: Page,
  itemId: string,
): Promise<{ parentId: string; indexInParent: number } | null> {
  return page.evaluate((targetId) => {
    interface Node {
      readonly id: string | number;
      readonly children: ReadonlyArray<Node>;
    }
    type Doc = { root: Node };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return null;
    function walk(
      node: Node,
      parent: Node | null,
    ): {
      parentId: string;
      indexInParent: number;
    } | null {
      for (let i = 0; i < node.children.length; i++) {
        const c = node.children[i]!;
        if (String(c.id) === targetId) {
          return parent === null
            ? { parentId: String(node.id), indexInParent: i }
            : { parentId: String(node.id), indexInParent: i };
        }
        const inner = walk(c, node);
        if (inner !== null) return inner;
      }
      return null;
    }
    return walk(doc.root, null);
  }, itemId);
}

/** WI-039 — read `attrs.frame` for `itemId` (the 0..1 parent-relative
 *  rect). Returns null when the item is missing or the frame slot is
 *  absent. */
export async function readItemFrame(
  page: Page,
  itemId: string,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate((targetId) => {
    interface Node {
      readonly id: string | number;
      readonly attrs: Record<string, unknown>;
      readonly children: ReadonlyArray<Node>;
    }
    type Doc = { root: Node };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return null;
    function find(node: Node): Node | null {
      if (String(node.id) === targetId) return node;
      for (const c of node.children) {
        const inner = find(c);
        if (inner !== null) return inner;
      }
      return null;
    }
    const node = find(doc.root);
    if (node === null) return null;
    const f = (node.attrs as { frame?: { x: number; y: number; width: number; height: number } })
      .frame;
    if (f === undefined) return null;
    return { x: f.x, y: f.y, width: f.width, height: f.height };
  }, itemId);
}

/** WI-039 — programmatic reparent for specs that don't want to drive
 *  the pixel-perfect modifier drag (e.g. multi-entry, parent-only
 *  reparent). Dispatches the same `weave.item.reparent` command the
 *  three user-facing surfaces share. */
export async function execReparent(
  page: Page,
  entries: ReadonlyArray<{ itemId: string; newParentId: string }>,
): Promise<void> {
  await page.evaluate((es) => {
    type Editor = {
      exec: (
        name: string,
        input: { entries: ReadonlyArray<{ itemId: string; newParentId: string }> },
      ) => unknown;
    };
    const w = window as unknown as { __weaveEditor?: Editor };
    w.__weaveEditor?.exec("weave.item.reparent", { entries: es });
  }, entries);
}

/** WI-039 — set the editor's item selection to the given ids. Mirrors
 *  the multi-toolbar / multi-marquee helpers. */
export async function setSelection(page: Page, ids: ReadonlyArray<string>): Promise<void> {
  await page.evaluate((targets) => {
    type Vm = {
      itemSelection: {
        set: (x: unknown) => void;
        addMany?: (xs: ReadonlyArray<unknown>) => void;
        clear: () => void;
      };
    };
    const vm = (window as unknown as { __weaveVm?: Vm }).__weaveVm;
    if (vm === undefined) return;
    vm.itemSelection.clear();
    if (targets.length === 0) return;
    if (targets.length === 1) {
      vm.itemSelection.set(targets[0]);
      return;
    }
    if (typeof vm.itemSelection.addMany === "function") {
      vm.itemSelection.addMany(targets);
      return;
    }
    for (const id of targets) vm.itemSelection.set(id);
  }, ids);
}
