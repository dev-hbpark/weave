// WI-161 — delta-persistence END-TO-END integration (no HTTP).
//
// Wires the real client controller to an in-memory "server" backed by the real
// `appendPatchLog` (the same pure core the Vercel endpoint uses), drives a
// realistic edit session through save flushes, then reconstructs the design the
// way a fresh load does (snapshot + replay) and asserts it equals the live doc.
// This exercises the full loop the HTTP layer only transports:
//   record patches → flush (snapshot/compact/delta) → server append → load replay.
// Live KV/HTTP is environment-blocked here (see WI-161 "검증 제약"); this is the
// integrated proof that the logic on both sides composes correctly.

import type { Document as AgocraftDocument, CommandContext, Patch } from "@agocraft/core";
import { createSerializer } from "@agocraft/core";
import { describe, expect, it } from "vitest";
import { toAgocraftDocument } from "../agocraft-mirror.js";
import { buildWeaveCommands, type WeaveCommandTargets } from "../commands.js";
import type { CameraTargetBehavior, Item, Document as WeaveDocument } from "../types.js";
import { FULL_FRAME } from "../types.js";
import { createDeltaPersistController } from "./delta-controller.js";
import { appendPatchLog } from "./patch-log.js";
import { applyPatchToDocument, replaySerializedPatches } from "./replay.js";

const META_DATE = "2026-05-22T00:00:00Z";

function makeBaseDoc(): AgocraftDocument {
  const cam: CameraTargetBehavior = {
    kind: "camera-target",
    id: "cam-root",
    position: { x: 0, y: 0 },
    scale: 1,
    order: 0,
  };
  const frame = {
    id: "frame-1",
    kind: "frame",
    attrs: { frame: FULL_FRAME },
    behaviors: [cam],
    createdAt: META_DATE,
  } as unknown as Item;
  const weave: WeaveDocument = {
    id: "doc-int",
    title: "Int",
    items: [frame],
    updatedAt: META_DATE,
    schemaVersion: 3,
  };
  return toAgocraftDocument(weave);
}

function ctxFor(doc: AgocraftDocument): CommandContext {
  return { document: doc, resolve: () => null as never, skipRelations: false };
}

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

describe("delta persistence end-to-end (WI-161)", () => {
  it("a full edit session reconstructs identically from server snapshot + log", async () => {
    const base = makeBaseDoc();
    let live = base;
    let patchIndex = 0;

    // ── In-memory server (mirrors the KV endpoints, real append core) ──
    const server: { snapshot: AgocraftDocument | null; log: string[] } = {
      snapshot: null,
      log: [],
    };

    // ── Client controller wired to that server ──
    const controller = createDeltaPersistController({
      compactThreshold: 4, // small, to force a compaction mid-session
      pushPatches: async (serialized, baseCount) => {
        const r = appendPatchLog(server.log, baseCount, serialized);
        if (!r.ok) return { ok: false };
        server.log = [...r.next];
        return { ok: true, count: r.count };
      },
      // Full snapshot = store the whole current document and clear the log
      // (exactly POST /api/designs clearing designPatchesKey).
      pushSnapshot: async () => {
        server.snapshot = live;
        server.log = [];
        return true;
      },
    });

    const commands = buildWeaveCommands({ reset: () => {} } as WeaveCommandTargets);
    const exec = (name: string, input: unknown): unknown => {
      const cmd = commands.find((c) => c.name === name);
      if (cmd === undefined) throw new Error(`no command ${name}`);
      const result = cmd.run(ctxFor(live), input as never);
      if (!result.ok) throw new Error(`${name} failed: ${result.error?.code ?? "?"}`);
      for (const patch of result.patches as ReadonlyArray<Patch>) {
        live = applyPatchToDocument(live, patch, patchIndex++);
        controller.recordPatch(patch); // editor records per change
      }
      return result.value;
    };

    // Save tick #1 — first edits, first flush ⇒ full snapshot, baseCount 0.
    const t = exec("weave.item.add", { kind: "text", containerId: "frame-1" }) as string;
    exec("weave.item.update", {
      itemId: t,
      patch: (it: Item) => ({ ...it, attrs: { ...it.attrs, opacity: 0.8 } as never }),
    });
    await controller.flush();
    expect(server.snapshot).not.toBeNull();
    expect(controller.baseCount()).toBe(0);

    // Save tick #2 — a couple more edits within the threshold ⇒ delta append.
    exec("weave.item.add", { kind: "shape", containerId: "frame-1" });
    exec("weave.design.setBackground", { color: "#222" });
    await controller.flush();
    expect(server.log.length).toBe(2);
    expect(controller.baseCount()).toBe(2);

    // Save tick #3 — enough to cross compactThreshold(4) ⇒ compaction snapshot.
    exec("weave.item.add", { kind: "shape", containerId: "frame-1" });
    exec("weave.item.add", { kind: "text", containerId: "frame-1" });
    exec("weave.item.add", { kind: "shape", containerId: "frame-1" });
    await controller.flush();
    expect(server.log.length).toBe(0); // compacted
    expect(controller.baseCount()).toBe(0);

    // Save tick #4 — one more delta after compaction.
    exec("weave.design.setBackground", { color: "#333" });
    await controller.flush();
    expect(server.log.length).toBe(1);

    // ── Fresh load: snapshot + replay(log) must equal the live document ──
    const loadedBase = server.snapshot ?? base;
    const reconstructed = replaySerializedPatches(loadedBase, server.log);

    const serializer = createSerializer();
    expect(stripUpdatedAt(serializer.toJSON(reconstructed))).toEqual(
      stripUpdatedAt(serializer.toJSON(live)),
    );
  });

  it("falls back to a snapshot on a simulated concurrent-writer conflict, staying consistent", async () => {
    const base = makeBaseDoc();
    let live = base;
    let patchIndex = 0;
    const server: { snapshot: AgocraftDocument | null; log: string[] } = {
      snapshot: null,
      log: [],
    };
    let injectConflict = false;

    const controller = createDeltaPersistController({
      pushPatches: async (serialized, baseCount) => {
        // Simulate another writer having advanced the log just before us.
        const effectiveBase = injectConflict ? baseCount + 1 : baseCount;
        const r = appendPatchLog(server.log, effectiveBase, serialized);
        if (!r.ok) return { ok: false };
        server.log = [...r.next];
        return { ok: true, count: r.count };
      },
      pushSnapshot: async () => {
        server.snapshot = live;
        server.log = [];
        return true;
      },
    });

    const commands = buildWeaveCommands({ reset: () => {} } as WeaveCommandTargets);
    const exec = (name: string, input: unknown) => {
      const cmd = commands.find((c) => c.name === name);
      if (cmd === undefined) throw new Error(`no command ${name}`);
      const result = cmd.run(ctxFor(live), input as never);
      if (!result.ok) throw new Error(`${name} failed`);
      for (const patch of result.patches as ReadonlyArray<Patch>) {
        live = applyPatchToDocument(live, patch, patchIndex++);
        controller.recordPatch(patch);
      }
    };

    exec("weave.item.add", { kind: "text", containerId: "frame-1" });
    await controller.flush(); // snapshot → base 0

    injectConflict = true; // next delta append will 409
    exec("weave.design.setBackground", { color: "#abc" });
    await controller.flush(); // delta → conflict → snapshot fallback
    expect(server.log.length).toBe(0);
    expect(controller.baseCount()).toBe(0);

    // The fallback snapshot is the full live doc → load reconstructs exactly.
    const reconstructed = replaySerializedPatches(server.snapshot ?? base, server.log);
    const serializer = createSerializer();
    expect(stripUpdatedAt(serializer.toJSON(reconstructed))).toEqual(
      stripUpdatedAt(serializer.toJSON(live)),
    );
  });
});
