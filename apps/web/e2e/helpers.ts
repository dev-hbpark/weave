// Phase 10b — shared helpers for e2e specs. The wizard creates a new Design
// with a fresh id each run; specs walk through it once and then exercise the
// design page. `prepareDesign` clears v5 storage from prior runs, walks the
// wizard with the requested flavor, and returns the design id (parsed from
// the URL).

import type { Page } from "@playwright/test";
import type { DocFlavor, DomainKind, ItemFrame } from "../src/document/types.js";

export async function clearAllDesigns(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key !== null && key.startsWith("weave.design.v5.")) {
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
}

/** Walk the new-design wizard and land on /design/:id. Returns the id. */
export async function prepareDesign(
  page: Page,
  { flavor = "mixed", presetId = "16:9", title = "E2E design" }: PrepareOptions = {},
): Promise<string> {
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
 *  thumbnails) don't need to choreograph a pixel-perfect drag every time. */
export async function addFrame(
  page: Page,
  kind: DomainKind,
  opts: AddFrameOptions = {},
): Promise<void> {
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
    { kind, frame, containerId: opts.containerId },
  );
}
