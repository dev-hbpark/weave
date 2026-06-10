// WI-161 — delta-persistence replay round-trip.
//
// THE proof that the delta model is lossless: take a base document, run a
// sequence of real weave commands (the same ones the UI/agent fire), evolve a
// "live" document by applying each emitted patch, then SERIALIZE every patch,
// REPLAY the serialized log onto the untouched base, and assert the replayed
// document equals the live one. A divergence means either (a) a patch did not
// survive JSON round-trip, or (b) a command's effect needed state outside its
// patches (a PendingCreations-style side-channel) — both are delta-save bugs.

import type { Document as AgocraftDocument, CommandContext, Patch } from "@agocraft/core";
import { createSerializer } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { toAgocraftDocument } from "../agocraft-mirror.js";
import { buildWeaveCommands, type WeaveCommandTargets } from "../commands.js";
import type { CameraTargetBehavior, Item, Document as WeaveDocument } from "../types.js";
import { FULL_FRAME } from "../types.js";
import { applyPatchToDocument, replaySerializedPatches, serializePatch } from "./replay.js";

const META_DATE = "2026-05-22T00:00:00Z";

function targets(): WeaveCommandTargets {
  return { reset: () => {} };
}

// A frame-root document (frames can hold children — the realistic editing base).
function makeBaseDoc(): AgocraftDocument {
  const cam: CameraTargetBehavior = {
    kind: "camera-target",
    id: "cam-root",
    position: { x: 0, y: 0 },
    scale: 1,
    order: 0,
  };
  const frame: Item = {
    id: "frame-1",
    kind: "frame",
    attrs: { frame: FULL_FRAME },
    behaviors: [cam],
    createdAt: META_DATE,
  } as unknown as Item;
  const weave: WeaveDocument = {
    id: "doc-delta",
    title: "Delta",
    items: [frame],
    updatedAt: META_DATE,
    schemaVersion: 3,
  };
  return toAgocraftDocument(weave);
}

function ctxFor(doc: AgocraftDocument): CommandContext {
  return { document: doc, resolve: () => null as never, skipRelations: false };
}

// `applyChangeToDocument` stamps every touched item's `meta.updatedAt` from the
// wall clock, so live vs replay differ by sub-millisecond timing on that field
// alone. That is clock metadata, not logical content (re-stamping on load is
// harmless), so strip every `updatedAt` before the structural comparison.
function stripUpdatedAt(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUpdatedAt);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "updatedAt") continue;
      out[k] = stripUpdatedAt(v);
    }
    return out;
  }
  return value;
}

describe("delta replay round-trip (WI-161)", () => {
  it("a real command-generated patch log replays from base to the live document", () => {
    const base = makeBaseDoc();
    const commands = buildWeaveCommands(targets());
    const run = (name: string) => {
      const c = commands.find((x) => x.name === name);
      if (c === undefined) throw new Error(`command not found: ${name}`);
      return c;
    };

    let live = base;
    const log: string[] = [];
    let patchIndex = 0;
    // Apply a command against the LIVE doc, collect + evolve with its patches.
    const exec = (name: string, input: unknown) => {
      const result = run(name).run(ctxFor(live), input as never);
      if (!result.ok) throw new Error(`${name} failed: ${result.error?.code ?? "?"}`);
      for (const patch of result.patches as ReadonlyArray<Patch>) {
        live = applyPatchToDocument(live, patch, patchIndex++);
        log.push(serializePatch(patch));
      }
      return result.value;
    };

    // A spread across the riskiest variants: subtree-carrying create, attrs,
    // unit.create (behavior), document.attrs, and remove.
    const textId = exec("weave.item.add", { kind: "text", containerId: "frame-1" }) as string;
    exec("weave.item.add", { kind: "shape", containerId: "frame-1" });
    exec("weave.item.update", {
      itemId: textId,
      patch: (it: Item) => ({ ...it, attrs: { ...it.attrs, opacity: 0.5 } as never }),
    });
    exec("weave.item.addBehavior", {
      itemId: textId,
      behavior: { kind: "interaction", id: "b-1", trigger: "click", action: { kind: "none" } },
    });
    exec("weave.design.setBackground", { color: "#0a0a0a" });
    exec("weave.item.remove", { itemId: textId });

    expect(log.length).toBeGreaterThanOrEqual(6);

    // Replay the SERIALIZED log onto the untouched base.
    const replayed = replaySerializedPatches(base, log);

    // Compare via the canonical serializer (reference-independent structural
    // equality, the same path used to persist).
    const serializer = createSerializer();
    expect(stripUpdatedAt(serializer.toJSON(replayed))).toEqual(
      stripUpdatedAt(serializer.toJSON(live)),
    );
  });

  it("replaying an empty log returns the base unchanged", () => {
    const base = makeBaseDoc();
    const serializer = createSerializer();
    expect(stripUpdatedAt(serializer.toJSON(replaySerializedPatches(base, [])))).toEqual(
      stripUpdatedAt(serializer.toJSON(base)),
    );
  });

  it("skips a corrupt log entry instead of aborting the whole replay", () => {
    const base = makeBaseDoc();
    const commands = buildWeaveCommands(targets());
    const add = commands.find((c) => c.name === "weave.item.add");
    if (add === undefined) throw new Error("no add");
    const result = add.run(ctxFor(base), { kind: "shape", containerId: "frame-1" } as never);
    if (!result.ok) throw new Error("add failed");
    const good = (result.patches as ReadonlyArray<Patch>).map(serializePatch);

    const replayed = replaySerializedPatches(base, ["{ not json", ...good, "null"]);
    // The good patch still applied — the shape is present.
    const serializer = createSerializer();
    const liveOne = (result.patches as ReadonlyArray<Patch>).reduce(
      (d, p, i) => applyPatchToDocument(d, p, i),
      base,
    );
    expect(stripUpdatedAt(serializer.toJSON(replayed))).toEqual(
      stripUpdatedAt(serializer.toJSON(liveOne)),
    );
  });
});
