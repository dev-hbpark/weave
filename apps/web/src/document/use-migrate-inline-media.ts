// Retro-active inline-media migration hook.
//
// On mount, scans the loaded design for image items whose `attrs.src`
// is an inline `data:` URL (legacy uploads, designs persisted before
// the dialog wired through `uploadResourceCloud`). Each such image is
// streamed to `/api/resources` (sequential — keeps payload pressure
// modest), the returned cloud URL is collected, and then the entire
// design is re-stamped under a NEW envelope id + title and POSTed to
// `/api/designs` as a *separate* server entity.
//
// Why a new id (not an in-place overwrite of the source design):
//   • The user explicitly asked for this — "BLOB으로 인해 업로드와 url
//     변환된 디자인데이터를 서버에 저장할때는 같은 아이디의 이전 저장된 정보가
//     있다고 하더라도 새로운 디자인으로 만들어줘". The source design's
//     server entry (if any) is therefore guaranteed untouched.
//   • The local editor session is also untouched — we don't dispatch
//     `weave.item.update` patches, so history stays clean and the
//     debounced save sink cannot race the migration. The user keeps
//     editing the original design at the same URL; the migrated copy
//     lives under a new id and surfaces on the workspace landing page.
//
// localStorage is not touched anywhere in this flow.

import { useEffect, useRef, useState } from "react";
import type { Document as AgocraftDocument } from "@agocraft/core";
import { createSerializer } from "@agocraft/core";
import { postDesignBlobAsNew, uploadResourceCloud } from "./cloud-sync.js";
import {
  findInlineImageItems,
  replaceInlineImageSrcs,
  synthesiseResourceName,
} from "./migrate-inline-media.js";
import type { Design } from "./types.js";

const serializer = createSerializer();

function makeMigratedDesignId(): string {
  return `design-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function migratedTitleOf(sourceTitle: string): string {
  const trimmed = sourceTitle.trim();
  if (/\(migrated\)\s*$/i.test(trimmed)) return trimmed;
  return `${trimmed} (migrated)`;
}

export interface UseMigrateInlineMediaDeps {
  readonly design: Design;
  readonly document: AgocraftDocument;
}

/** Lifecycle of the retro-active migration, surfaced to the host so a
 *  banner / toast can announce the outcome instead of relying on the
 *  dev-only console log. `idle` covers both the "nothing to migrate"
 *  case and the pre-scan window, so hosts can render a banner only
 *  for the three terminal states they care about (`done`, `failed`,
 *  `running`). */
export type MigrationStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "running"; readonly total: number }
  | {
      readonly kind: "done";
      readonly uploaded: number;
      readonly total: number;
      readonly newDesignId: string;
    }
  | {
      readonly kind: "failed";
      readonly uploaded: number;
      readonly total: number;
    };

/** Runs the migration exactly once per editor mount, but only after the
 *  document has settled to its real shape.
 *
 *  Why a settle check: useDesign returns a blank fallback (0 children)
 *  when localStorage doesn't carry the requested id, then awaits a
 *  cloud fetch and replaces the document if the blob arrives. If we
 *  scanned the blank fallback and claimed, the cloud-hydrated doc's
 *  inline images would never be migrated. The guard below skips while
 *  `root.children.length === 0` (covers both blank fallback and
 *  genuinely empty new designs) and only claims once the doc has at
 *  least one child — at that point the document reference is the one
 *  the user will edit, so any retro-active migration we're going to do
 *  must happen against that snapshot.
 *
 *  After claim, the effect refuses to re-run even on subsequent doc
 *  mutations: new uploads added through MediaSrcDialog are handled by
 *  the live `uploadResourceCloud` path at the time they're picked. */
export function useMigrateInlineMedia(deps: UseMigrateInlineMediaDeps): MigrationStatus {
  const claimedRef = useRef(false);
  const designRef = useRef(deps.design);
  designRef.current = deps.design;
  const [status, setStatus] = useState<MigrationStatus>({ kind: "idle" });

  useEffect(() => {
    if (claimedRef.current) return undefined;
    const doc = deps.document;
    if (doc.root.children.length === 0) return undefined;
    claimedRef.current = true;
    const targets = findInlineImageItems(doc);
    if (targets.length === 0) return undefined;

    let cancelled = false;
    setStatus({ kind: "running", total: targets.length });
    void (async () => {
      const urlMap = new Map<string, string>();
      for (const t of targets) {
        if (cancelled) return;
        const name = synthesiseResourceName(t.itemId, t.mime);
        const cloud = await uploadResourceCloud("image", t.src, name);
        if (cancelled) return;
        if (cloud === null) continue; // partial migration is allowed
        urlMap.set(t.itemId, cloud.src);
      }
      if (cancelled) return;
      if (urlMap.size === 0) {
        setStatus({ kind: "failed", uploaded: 0, total: targets.length });
        if (import.meta.env.DEV) {
          console.warn("[migrate-inline-media] every upload failed; source untouched");
        }
        return;
      }

      const source = designRef.current;
      const docBlob = serializer.toJSON(doc);
      const migratedDocBlob = replaceInlineImageSrcs(docBlob, urlMap);
      const now = new Date().toISOString();
      const newId = makeMigratedDesignId();
      const newBlob = {
        id: newId,
        title: migratedTitleOf(source.title),
        width: source.width,
        height: source.height,
        background: source.background,
        document: migratedDocBlob,
        presentationOrder: source.presentationOrder,
        meta: {
          ...source.meta,
          createdAt: now,
          updatedAt: now,
        },
      };
      const result = await postDesignBlobAsNew(newBlob);
      if (cancelled) return;
      if (result === null) {
        setStatus({ kind: "failed", uploaded: urlMap.size, total: targets.length });
        if (import.meta.env.DEV) {
          console.warn("[migrate-inline-media] post failed; source design untouched", {
            uploaded: urlMap.size,
            targets: targets.length,
          });
        }
        return;
      }
      setStatus({
        kind: "done",
        uploaded: urlMap.size,
        total: targets.length,
        newDesignId: result,
      });
      if (import.meta.env.DEV) {
        console.info(
          `[migrate-inline-media] migrated ${urlMap.size}/${targets.length} image(s) → new design ${result}`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deps.document]);

  return status;
}
