# DR-144 — The Aku attach e2e verifies the offline half of the path; the model submit stays in the server suite

## Metadata

| Field | Value |
|---|---|
| ID | DR-144 |
| Date | 2026-06-15 |
| Status | ACCEPTED |
| Work item | [WI-229](../work-items/WI-229-aku-image-attach-regression-e2e.md) |

## Context

The image-attachment path is: composer (pick/paste/drop) → `images` state →
thumbnails → `onSend(text, images)` → `runTurn` commits an `AkuUserMessage` with
`images` → (a) `handle.submit(task, { images })` to the agent server for VISION,
and (b) `uploadImages` → asset URLs appended to the prompt. The conversational leg
(b/a, server + model) is explicitly excluded from offline CI — the Aku suite is
backend-free (`aku-chat.spec.ts` header; the agent loop runs on the small-think
server). A naive e2e that "sends and checks the model saw the image" cannot run.

## Decision

Cover the **fully-offline half** and stop at the seam where the payload is proven:

- The user message is committed **synchronously** (`use-aku-agent.ts:951`) BEFORE
  the transport attempt, and the offline transport failure is caught
  (`try/catch/finally` around `getHandle`/`submit`). So a send offline reliably
  produces the user bubble.
- Assert the image survives composer → `onSend` → `AkuUserMessage.images` by two
  independent observations: it re-renders in the transcript (`MessageList`
  `ImageThumbs`), and it persists into `weave.aku.conversation.<id>`.

The model-submit leg (`submit({ images })` → Claude vision) is left to the
server-dependent suite — asserting it offline is impossible and stubbing the WS
client would test the stub, not the wiring.

Two `data-*` test seams were added rather than scraping class names: a strip marker
(`data-aku-attachments`) and an input testid (`data-testid="aku-image-input"`),
following the established `data-aku-*` convention (`data-aku-panel`, `-body`,
`-launcher`, `-drop-overlay`). Targeting the input directly is required because its
DOM `id` is a non-deterministic `useId()`.

## Consequences

- The attach UI + payload assembly are guarded against silent regression; the test
  is deterministic and needs no network (uses an inline 1×1 PNG buffer).
- The vision/asset server legs remain uncovered offline — acceptable and explicit;
  they belong to the backend suite. If that suite gains an image case, it asserts
  the bytes reach the model there.
- The seams are inert markers, so they carry no behavior risk.
