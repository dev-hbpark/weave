# WI-058 — Data-driven QR code item (`qr` kind)

Status: **Done**
Owner: hbpark
Updated: 2026-05-30

## Problem

weave had no QR item. A QR is a fully data-driven artifact (one string → a
deterministic code), which makes it the most agent-friendly item kind: the Aku
agent creates one with `weave.item.add({kind:"qr", attrsOverride:{data}})` and
edits it with `weave.item.update({attrs:{data}})` — no asset upload, no drawing.

## Decisions

- **New top-level kind `qr`, entirely weave-side** (no agocraft change, no
  vendor bump). agocraft stores items with opaque attrs; a weave-only kind
  round-trips through persistence and renders via weave's `DOMAIN_RENDERERS`.
- **Encoder: vendored Project Nayuki QR generator (MIT)** — `apps/web/src/
  document/qr/qrcodegen.ts`, verbatim + `@ts-nocheck` + biome-ignore, only
  change `namespace` → `export namespace`. Reference-quality, dependency-free.
  *(User-approved this specific external source after the auto-classifier
  flagged agent-chosen external code — see Library note below.)*
- **Foreground = `PaintSpec`** (solid OR gradient — reuses WI-056 fill machinery,
  so gradient QRs work). Background = `PaintSpec | null` (null = transparent).
- **v1 scope = data + ecLevel + module style (square/dot/rounded) + colors +
  margin.** Logo overlay deferred.

## Model (`QrAttrs`, types.ts)

`{ frame, data, ecLevel?:"L"|"M"|"Q"|"H", foreground?:PaintSpec,
background?:PaintSpec|null, margin?, moduleStyle?:"square"|"dot"|"rounded",
opacity? }`. The module matrix is regenerated from `data` on every render —
nothing matrix-shaped is persisted.

## Edits (all weave-side)

| Area | File |
|---|---|
| Encoder (vendored) + wrapper | `document/qr/qrcodegen.ts`, `document/qr/qr-matrix.ts` (`qrMatrix(data, ec)→boolean[][]`) |
| Kind | `document/types.ts` (DomainKind, QrAttrs, ItemAttrsByKind, DOMAIN_REGISTRY) |
| Seed default | `document/seed.ts` |
| Renderer | `document/domains/QrBlock.tsx` (matrix→single SVG `<path>`, square/dot/rounded, fg/bg via `paintToSvgFill`, square via `preserveAspectRatio`) + registered in `domains/index.ts` |
| **Render gate** | `agocraft-mirror.ts` `isDomainItem` += `qr` ← the hardcoded primitive allowlist; without it FrameStage culls the child and nothing mounts |
| UX | `toolbar/sections/qr-section.tsx` (data field, ecLevel, module style, fg/bg) + registry; DesignPage add-menu "QR 코드" + `IconQr` glyph |
| Agent | `weave-command-schemas.ts` ITEM_KIND += "qr" + QR_ATTRS_NOTE on the shared attrs |

## Library note — Nayuki QR (MIT)

QR encoding (Reed-Solomon + masking + version select) is non-trivial; a wrong
encoder yields unscannable codes. Per the workspace tree-shaking-first +
proven-library rules, vendoring the reference MIT implementation (dependency-free
ESM, verbatim) beats both a hand-rolled encoder (correctness risk) and an npm
dep (supply-chain/bundle). Kept `@ts-nocheck` (third-party, verbatim) with a thin
type-checked wrapper at the boundary. User explicitly approved this source.

## Verification

typecheck + declarative + purity green, biome 0 errors. Unit
`qr-matrix.test.ts` **5/5** (square matrix, three finder patterns, determinism,
all EC levels, empty→null — proves the vendored encoder is correct). e2e
`qr-item.spec.ts` **2/2** (renders QR `<path>` from seed data, longer data →
more modules, Cmd+Z reverts, empty → placeholder).

## Workflow trail

- Feasibility: [FR-012](../feasibility-reviews/FR-012-qr-code-item.md).

## Gotcha recorded

`isDomainItem` (agocraft-mirror.ts) is a hardcoded 5-kind allowlist FrameStage
uses to cull root children. **Any new weave kind MUST be added there** or it
exists in the doc but never mounts (silent — no error). This is the one
non-registry exhaustiveness site for kinds.
