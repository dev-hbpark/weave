# Runbook — Text Item v1

| Field | Value |
|---|---|
| Feature | Text Item v1 (Figma-equivalent paradigm) |
| WI | WI-029 |
| Owner (primary on-call) | hbpark |
| Effective | 2026-05-26 |
| Source | LG-001 Pillar 5 conditional close |

This runbook is the operator's first-stop reference when something goes
wrong with text editing in weave production. Each section walks one
failure mode end-to-end: symptom → triage → mitigation → rollback. Live
the runbook in this order.

## Quick reference

| Failure mode | Symptom signature | Severity | First mitigation |
|---|---|---|---|
| Text not editable | Double-click → no caret; toolbar mounts but Lexical empty | High | Reload tab; verify Lexical lazy chunk loaded |
| Korean IME composition leak | Typing 한글 produces "ㅎㅏㄴ" instead of "한" | High | `prefers-reduced-motion` + `composing` flag check |
| Cmd+Z does not revert text edit | Text changes but history empty / out of sync | High | Verify `editor.exec` path (no `setAgoDoc` direct call) |
| Corner drag changing fontSize | Old paradigm regression | Medium | Confirm DR-016 deploy; check `useCornerScaleSpec` returns null for text |
| Font size slider stuck | Slider visible but value never commits | Medium | Inspect `updateAll` → `weave.item.update` patch |
| Banner not auto-retracting | Banner visible past 2026-06-15 | Low | Confirm `Date.now()` not pinned; clear `weave.launch.*` localStorage |
| v5 design load = empty canvas | Loaded design has 0 frames despite v5 backup | Critical | Restore from `weave.design.v9-backup.*` key |

## 1. Text not editable (no caret on double-click)

**Symptom**: User double-clicks a text frame, expecting to enter edit
mode. Caret never appears. PropertiesPanel text section may still mount,
but typing produces no input.

**Triage**:

1. Open DevTools → Network. Reload the design. Look for a chunk named
   `Lexical-*.js` (lazy-loaded on first text mount). Status 200 expected.
2. Console: `window.__weaveEditor?.exec` should be a function (dev only).
3. Check selection: `window.__weaveVm?.itemSelection.state.get()` —
   should return `{ kind: "single", itemId: ... }` matching the
   double-clicked frame.

**Common causes**:

- Lexical lazy chunk failed to download (CDN / network). Check the
  Network tab. Retry by reloading.
- React StrictMode mount cycle disposed the Lexical singleton (known
  issue with `useWeaveEditor` first implementation — fix landed pre-v1;
  re-check if a regression appears via [[feedback_react_strictmode_singleton_dispose]]).
- Selection state desynced (multi-tab / sync race). Sync is currently
  OFF (`SYNC_ENABLED = false` in DesignPage); rule this out unless
  WI-028 has been re-enabled.

**Mitigation**:

- User-facing: ask the user to reload the tab. If the lazy chunk is the
  cause, a fresh fetch resolves it.
- Operator: if multiple reports come in within 1h, treat as Lexical
  chunk delivery issue. Check Vercel CDN / SHA pinning for the chunk.

**Rollback**:

- Revert the latest PR that touched `apps/web/src/document/domains/TextBlock.tsx`
  or `apps/web/src/document/text/LexicalTextEditor*.tsx`.
- `pnpm vendor:swap` to a known-good agocraft vendor build (latest
  pre-v1 rc is `1.0.0-rc.20260525083906`).

## 2. Korean IME composition leak

**Symptom**: User types Korean. Instead of "한" appearing in the box,
the composition jamo (ㅎ + ㅏ + ㄴ) appear as separate characters,
producing "ㅎㅏㄴ" or duplicated input.

**Triage**:

1. Manual reproduce: 4-browser check (Chromium / Safari / Firefox / Edge).
   PoC PASS 2026-05-25; if regression isolated to one browser, browser
   bug is likely.
2. Check `compositionstart` / `compositionupdate` / `compositionend`
   listeners on the Lexical contenteditable element.
3. Verify `prefers-reduced-motion` is not forcing fade-only mounts that
   strip the editable element.

**Common causes**:

- Lexical version regression breaking `composition` flag handling.
- Custom keyboard handler in `LexicalTextEditor` consuming
  `compositionupdate` events before Lexical processes them.

**Mitigation**:

- User-facing: ask which browser. If Chromium-only, confirm Chrome
  version (Lexical supports stable Chrome only). Recommend a different
  browser as a temporary workaround.

**Rollback**:

- Revert to the Lexical version pinned in `apps/web/package.json` at
  rc.20260525 baseline if the issue traces to a Lexical upgrade.
- `pnpm verify` must PASS on the rolled-back state before redeploying.

## 3. Cmd+Z does not revert text edit

**Symptom**: User makes a text edit (typing, fontSize change, color
change), then Cmd+Z. The visible state does not roll back, or rolls
back one step too few / too many.

**Triage**:

1. Console: `window.__weaveEditor?.history.entries` — count should equal
   the number of user-visible mutations since design load.
2. Check whether the mutation path went through `editor.exec(...)`. The
   project's `CLAUDE.md` Document mutation rule mandates every mutation
   route through `editor.exec → ChangeStream → History`. Direct
   `setAgoDoc` or downstream-direct mutator calls bypass history.
3. Check `historyMergeWindowMs` — high-frequency mutations (drag at
   60Hz) should collapse to one entry via `mergeKey`.

**Common causes**:

- New mutation surface (a new SelectionLayer handle, plugin button,
  remote sync write) bypassing `editor.exec`. See [[feedback_doc_mutation_must_hit_history]].
- `mergeKey` collision producing wrong-undo behavior.

**Mitigation**:

- Operator: grep for `setAgoDoc(` in `apps/web/src/` — should appear
  ONLY in `useDocument` / `applyChange`. Any other call site is a bug.

**Rollback**:

- Revert the PR that added the new mutation surface. Re-author it
  through `editor.exec` per `CLAUDE.md` Document mutation rule.

## 4. Corner drag changing fontSize (DR-016 regression)

**Symptom**: User drags the corner handle of a text frame. Font size
scales proportionally with the box. (Pre-v1 Genially-style paradigm,
which DR-016 deprecated.)

**Triage**:

1. Check `apps/web/src/document/manipulation/capabilities/text-corner-scale-fontsize.ts`
   has been removed (Phase 1.5 R2 removed it; verify it has not been
   re-added by a regression PR).
2. `pnpm declarativecheck` must PASS — no `switch` on `kind` should
   bring this capability back.

**Common causes**:

- Accidental re-introduction of a corner-scale capability adapter for
  text kind. The registry should only allow Auto-W=[], Auto-H=[e,w],
  Fixed=8-dir handles.

**Mitigation**:

- User-facing: explain DR-016 paradigm — font size via PropertiesPanel
  Size slider. Coachmark + Tooltip will surface this in the launch week.

**Rollback**:

- Revert the regression PR. Restore the 3-mode handle gates per
  `features/text/ENGINEERING_PLAN.md` R2.

## 5. Banner not auto-retracting after 2026-06-15

**Symptom**: TextV1LaunchBanner visible on DesignPage past the
2026-06-15 retract date.

**Triage**:

1. `Date.now()` not pinned by a test fixture or extension.
2. Inspect `LAUNCH_AT` + `RETRACT_AT` constants in
   `apps/web/src/launch/TextV1LaunchBanner.tsx`.

**Mitigation**:

- Operator: confirm the deployed bundle has the date constants. Hotfix
  by pushing a new deploy with the constants verified, OR — temporary
  measure — wipe everyone's `weave.launch.text-v1.dismissed-at`
  localStorage via a one-off in-app patch (mass dismiss-by-default).

**Rollback**: low severity; banner is non-blocking. Defer to next sprint.

## 6. Font size slider stuck (value never commits)

**Symptom**: User drags the fontSize slider in PropertiesPanel. Slider
position changes, but `attrs.fontSize` in the model never updates;
Cmd+Z reveals no entry.

**Triage**:

1. Console: select the text item, then exec `weave.item.update` directly
   with a fontSize patch and confirm it applies. If it does, the
   PropertiesPanel wiring is broken; if it doesn't, the command is broken.
2. Verify `updateAll(editor, ids, patcher)` (in text-section.tsx) is
   called from the NumberSlider's `onValueChange`.

**Common causes**:

- NumberSlider's `onValueChange` not wired to the multi-aware updater.
- Tooltip wrapper consuming pointer events before the slider thumb.

**Mitigation**:

- User-facing: workaround — type the value directly into the slider's
  numeric input.

**Rollback**:

- Revert the PR that touched `apps/web/src/document/toolbar/sections/text-section.tsx`.

## 7. v5 design load = empty canvas (data loss)

**Severity**: Critical. This is the RISK-004 §1 scenario that was
Resolved by the storage.ts critical fix (raw JSON migration before
fromJSON). Re-occurrence means the fix has regressed.

**Symptom**: User opens an existing design (created before frame-only
paradigm). Canvas renders empty; design exists in localStorage
(`weave.design.v5.<id>`) but no frames visible.

**Triage**:

1. localStorage: `weave.design.v9-backup.<id>` should exist if the
   migration ran on this design at any point.
2. Inspect `storage.ts` `loadDesign` flow — verify
   `migrateLegacyKindsToFrame` is called on raw JSON BEFORE
   `serializer.fromJSON`.
3. Run `apps/web/e2e/frame-only-migration.spec.ts` — 2 specs should
   PASS.

**Mitigation**:

- User-facing: ask the user to wait; do NOT instruct them to interact
  with the design (avoids overwriting the v9 backup).
- Operator: restore from v9 backup:
  ```js
  // In DevTools console:
  const id = "<design-id>";
  const backup = JSON.parse(localStorage.getItem(`weave.design.v9-backup.${id}`));
  localStorage.setItem(`weave.design.v5.${id}`, JSON.stringify(backup));
  location.reload();
  ```

**Rollback** (production-wide):

- Revert the regressing PR. Migration logic lives in:
  - `apps/web/src/document/migrate-frame-only.ts`
  - `apps/web/src/document/storage.ts` (loadDesign + v9 backup)
- Redeploy. Existing v9 backups remain valid.

## 8. Telemetry signals to watch (post-launch)

| Signal | Source | Threshold for escalation |
|---|---|---|
| `text-input-anomaly` custom event | Sentry/datadog | > 5 events/hour |
| `lcp` on DesignPage | Web Vitals API | > 4s 95p sustained 30min |
| `inp` typing in text editor | Web Vitals + manual | > 500ms sustained |
| "왜 글자가 안 커지지" support email keyword | Support inbox | any |
| Korean IME-related bug reports | Support inbox | any |
| Banner dismiss rate | localStorage telemetry | < 30% after 1 day (low signal — banner unread) |

## 9. Escalation path

- Tier 1 (immediate): hbpark
- Tier 2 (out-of-hours): broader weave team via project alias (when
  established)
- For data-loss class incidents (§7): page hbpark immediately + start
  POSTMORTEM.md draft within 24h

## Cross-references

- LG-001: `records/launch-gates/LG-001-text-item-v1.md`
- RISK-001: `records/risks/RISK-001-text-item-v1.md`
- RISK-004: `records/risks/RISK-004-frame-only-paradigm.md`
- DR-016: `records/decisions/DR-016-text-resize-paradigm.md`
- Engineering Plan: `features/text/ENGINEERING_PLAN.md`
- QA Plan: `features/text/QA_PLAN.md`
- Incident communications: `docs/communications/INCIDENT_COMMS_TEXT_V1.md`
