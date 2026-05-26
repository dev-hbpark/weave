# QA Plan — Text Item v1

| Field | Value |
|---|---|
| Feature | Text Item v1 (Figma-equivalent paradigm) |
| WI | WI-029 |
| Owner | hbpark |
| Effective | 2026-05-26 |
| Target launch | 2026-06-08 (LG-001 T-0) |
| Source | `ENGINEERING_PLAN.md` + `RISK-001` + `LG-001-text-item-v1.md` Pillar 4 |

## 1. Scope of QA

In scope:

- 9 PropertiesPanel controls (Mode / Family / Font / Size / Align / V-Align / Decoration / Case / Color / Background / Opacity / Line height / Letter spacing / Truncate / Hyperlink)
- Lexical RichText (per-character bold/italic/underline; Cmd+B / Cmd+I / Cmd+U; textRuns ↔ Lexical roundtrip)
- 3-mode resize toggle (Auto-W / Auto-H / Fixed) + matching handle sets (none / e+w / 8-dir)
- Truncation in Fixed mode (`Truncate: ellipsis | clip` + maxLines)
- Hyperlink presentation-mode click-through
- Phase 1.5 schema migration series A+B+C (textAlignHorizontal / lineHeightSpec / textRuns canonical) — backward compat
- DR-016 paradigm: corner drag adjusts box only, not fontSize
- R5 launch comm UI (TextV1LaunchBanner / fontSize Tooltip / TextOnboardingHint) — visibility window, dismiss persist

Out of scope (deferred to v2):

- Multi-line vertical-rhythm baseline grid
- Variable font weight axes (wght 100-900 continuous)
- Markdown shortcuts
- Real-time collaborative cursors inside a text box (sync paused — WI-028)

## 2. Test pyramid for this feature

### 2a. Unit (vitest)

| File | Coverage | Status |
|---|---|---|
| `apps/web/src/document/commands.test.ts` | item.update + text-related patches | 10 tests PASS |
| `apps/web/src/document/storage.test.ts` | v9 backup + schema-version reader | 4 tests PASS |
| `apps/web/src/document/agocraft-mirror.test.ts` | TextAttrs round-trip + Y.XmlText | 13 tests PASS |
| `apps/web/src/document/migrate-frame-only.test.ts` | text inside legacy domain → frame | 11 tests PASS |
| `apps/web/src/document/agocraft-mirror-mutations.test.ts` | text patch dispatch | 8 tests PASS |
| `packages/sync/src/y-doc-bridge.test.ts` | Y.XmlText bidirectional | 21 tests PASS (CRDT path, sync currently OFF) |

agocraft side (vendor):

| Suite | Coverage | Status |
|---|---|---|
| `@agocraft/core` TextAttrs + helpers + Patch variant 9 (`item.text`) | createTextAttrs / defaultTextAttrs / getPlainText | 366 tests PASS |
| Schema migration v6→v9 round-trip | A textAlignHorizontal / B lineHeightSpec / C textRuns canonical | within 366 PASS |

Target: 100% green on every PR. Failure = block merge.

### 2b. E2E (Playwright)

| Spec | Critical path | Status |
|---|---|---|
| `e2e/text-item.spec.ts` | Add-menu → text item; toolbar mounts data-kind=text; fontSize update; corner-resize keeps fontSize unchanged (DR-016) | 1 rewrite + 5 new; PASS in isolation, **single-PASS / group-flaky** (cluster of 11 in WI-032 Phase 3c) |
| `e2e/text-v1-launch.spec.ts` | Banner dismiss persist + fontSize Tooltip retract gate | 2 PASS / 2 skip (Tooltip+Coachmark race; manual verified) |
| `e2e/history-*.spec.ts` | text mutation through editor.exec; Cmd+Z reverses every text patch (history contract) | covered by frame paradigm specs |
| `e2e/text-v1-launch.spec.ts` (forceShow on retract date) | tooltip is enabled before 2026-06-15, disabled after | PASS |
| **R4 deferred** Korean IME via CDP | typing 한 / 두 / 안 / 녕 produces text without composition leak | DEFERRED, manual PoC PASS 2026-05-25 |
| **R4 deferred** Cmd+B/I/U inside a range selection | only highlighted run becomes bold; rest unchanged | DEFERRED, Lexical RichText 단독 PASS unit-side |
| **R4 deferred** React StrictMode mount → unmount → remount | no singleton dispose; no duplicate history entries | DEFERRED |
| **R4 deferred** 2-actor concurrent edit (sync ON) | LWW + Y.XmlText conflict resolution | DEFERRED, sync OFF currently — re-enable post-WI-028 resume |

R4 4 specs status: deferred, but each is covered today by **either a unit test or a manual PoC**. Safety-net coverage = ~85%; launch is not gated on R4 reaching 100%.

### 2c. Manual exploratory (hbpark)

| Scenario | Date | Result |
|---|---|---|
| Korean IME (Chromium / Safari / Firefox / Edge) — full text-input flow | 2026-05-25 | PASS — no composition leak, no double-input |
| Lexical lazy chunk first-load LCP impact | 2026-05-25 | Initial LCP unchanged (Lexical 59KB gz lazy after first text mount) |
| 3-mode toggle behaviour against all 3 themes (Aurora / Mono / Vivid) | 2026-05-25 | PASS — token-aware contrast, handles render correctly |
| R5 launch banner + Tooltip + Coachmark — Korean locale visible state | 2026-05-26 | PASS — all 3 surfaces render, Banner dismiss persists across reload |

## 3. Accessibility (WCAG 2.2 AA — self-audit)

Target: AA on critical-flow surfaces (text editing + PropertiesPanel + Launch comm UI).

| Check | Method | Status |
|---|---|---|
| Color contrast — text vs background, all 3 themes | inline computed style + WebAIM ratio | TODO before T-0 |
| Focus-visible on every interactive | manual Tab walk-through | TODO before T-0 |
| Keyboard nav inside text PropertiesPanel | Tab / Shift+Tab / Esc | TODO before T-0 |
| Screen reader — VoiceOver announces text item kind + edit mode | manual | TODO before T-0 |
| `prefers-reduced-motion: reduce` honoured | DevTools emulation | PASS 2026-05-26 (R5 primitives) |
| `aria-describedby` wiring on Tooltip / Banner role="status" | code inspection | PASS 2026-05-26 |

Audit owner: hbpark self-audit + Lighthouse a11y score ≥ 95. External a11y audit deferred to post-launch (Pillar 4 conditional).

## 4. Performance smoke

Target: INP < 200ms (50th percentile) on mid-tier (M1 Air baseline), Slow-4G network throttle. Per RISK-001 condition #8 + frontend-perf agent conditional approve.

| Metric | Tool | Target | Status |
|---|---|---|---|
| INP (typing latency, 100 frame × 50 char) | Chrome DevTools Performance + Web Vitals API | < 200ms 50p | DEFERRED — M1 launch + 1mo measurement |
| LCP on DesignPage cold load | Lighthouse | < 2.5s on Slow-4G | TODO before T-0 |
| CLS during text mount | Lighthouse | < 0.1 | TODO before T-0 |
| Bundle size (main + Lexical lazy) | rollup-plugin-visualizer | main ≤ 280KB gz, Lexical lazy ≤ 60KB gz | PASS — main 272 KB gz, Lexical 59 KB gz |

Smoke test owner: hbpark before T-0 -1day. If smoke fails, R3 lazy-load 추가 검토 or condition close 연기.

## 5. Regression suite green-gate

PR can merge only when ALL the following are green:

- `pnpm typecheck` (apps/web + packages/* + agocraft vendor)
- `pnpm test --run` (68 weave + 366 agocraft + 21 sync)
- `pnpm build` (apps/web)
- `pnpm declarativecheck` (Rule 6 — no `switch` on kind/type/mode discriminants)
- `pnpm puritycheck` (Rule 7 — library host-domain leak)
- `pnpm lint` (eslint zero warnings)
- `pnpm exec playwright test e2e/text-v1-launch.spec.ts` (2 PASS / 2 skip)

CI gate: GitHub Actions default branch protection. Local pre-push: `pnpm verify`.

## 6. Test data

- `apps/web/e2e/helpers.ts` — `prepareDesign({ flavor: "mixed" })` + `addTextViaMenu(page)` standard wizard walk.
- localStorage hygiene: `clearAllDesigns(page)` clears every `weave.*` key (including launch-comm persist keys).
- Time-pinning via `page.addInitScript(() => { Date.now = () => FAKE_NOW })` for launch-window gate testing.
- Locale-pinning via `Object.defineProperty(navigator, "language", { get: () => "ko-KR" })`.

## 7. Exit criteria for QA pillar (LG-001)

- [x] Unit pyramid 100% green (`pnpm test --run` zero fail)
- [x] e2e regression suite green or skip-with-intent (no silent fail)
- [x] Manual exploratory PoC (Korean IME 4-browser) PASS
- [ ] Accessibility self-audit completed (target before T-0)
- [ ] Performance smoke completed (LCP + CLS measured; INP deferred to M1)
- [ ] Lighthouse a11y score ≥ 95 (target before T-0)
- [ ] R4 e2e 4 specs landed (target launch -1 week, non-blocker if safety-net coverage sufficient)

## 8. Post-launch QA

- INP measurement M1 (launch + 1mo) — frontend-perf agent gate
- Korean IME 회귀 모니터링 (Sentry tag `locale=ko-KR` + custom event `text-input-anomaly`)
- Bug intake: "왜 글자가 안 커지지" (corner-drag paradigm 인식 신호) → onboarding hint duration 연장 검토

## Cross-references

- ENGINEERING_PLAN.md — feature plan, R1-R5 phases
- RISK-001 — text item v1 risks + conditions
- LG-001 — launch gate verdict
- `docs/launch/TEXT_V1_LAUNCH_NOTE.md` — user-facing copy
- `apps/web/e2e/text-v1-launch.spec.ts` — R5 e2e
- `apps/web/e2e/text-item.spec.ts` — text primitive e2e
