# WI-229 — Regression e2e for the Aku composer image-attachment path

## Metadata

| Field | Value |
|---|---|
| ID | WI-229 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | DONE (e2e added + green; 2 test seams) |
| Type | Test coverage (Aku composer) |
| Decision | [DR-144](../decisions/DR-144-aku-attach-e2e-offline-scope.md) |
| Note | The concurrent session's `feat(aku): WI-228 … design lock` (weave `1506334`) reuses **WI-228** in its commit message but wrote no record file; this WI-228 (handle-wheel, `f04b76a`, first-committed + only record) stays canonical. This work takes the next free number, WI-229. |

## Problem

The image attach affordance in front of the Aku composer (file pick / paste /
drag-drop → removable thumbnail → send → `AkuUserMessage.images` → agent vision +
asset upload) had **zero dedicated test coverage** (audit in this session). A
regression in the attach button, `accept`, thumbnail render, image-only send, or
the composer→payload wiring would ship silently.

## Scope (see DR-144)

The Aku suite is **backend-free** (the live model submit needs an agent server,
excluded offline — `aku-chat.spec.ts` header). So the e2e covers the fully-offline
half of the path; the model-submit leg stays in the server-dependent suite.

## Change

- `apps/web/e2e/aku-image-attach.spec.ts` (new) — 5 tests:
  1. attach button present, ordered **before** the input, `accept="image/*"` + multiple
  2. file pick → one removable data-URL thumbnail; remove empties the strip
  3. multiple files accumulate
  4. image with no text still enables 전송 (image-only send)
  5. send carries the image into the committed user message — re-renders in the
     transcript (`[data-aku-body] img` data URL) **and** persists into
     `weave.aku.conversation.<id>` with `images.length === 1`
- `apps/web/src/features/aku/AkuComposer.tsx` — two minimal test seams, consistent
  with the existing `data-aku-*` convention: `data-aku-attachments` on the
  thumbnail strip, `data-testid="aku-image-input"` on the hidden file input. No
  behavior change.

## Verification

- `apps/web`: `tsc --noEmit` clean.
- `apps/web/e2e/aku-image-attach.spec.ts` — **5/5 green** (live browser, offline).
- Pre-existing unrelated failure noted: `aku-chat.spec.ts` "token gate" fails on
  the **committed baseline** too (verified by stashing this change) — out of scope,
  not introduced here.
