# Work Item — WI-016

## Metadata

| Field | Value |
|---|---|
| ID | WI-016 |
| Title | AITooltip 의 편집 UX 적용 — toolbar / 도메인 frame / sub-element 의 state·hotkey-aware 힌트 (DR-011 의 의 capability registry 의 첫 application) |
| Owner | hbpark |
| Status | Done (Phase A–D closed, 2026-05-23). Phase E (visual baseline + extra robustness) optional / merged into Phase D coverage. |
| Severity | P2 |
| Created | 2026-05-23 |
| Target date | M0–M1 경계 (편집 UX의 baseline 강화) |
| Closed | 2026-05-23 |
| Source | 사용자 prompt (2026-05-23) "AIToolTip을 편집 ux에 적용 ... state와 핫키 등 컨텍스트 ... 아이템별로 다른 처리를 ... 코드 구조적 다형성" |
| Pairs with | WI-015 (AITooltip 박제), DR-011 (Tooltip capability registry), DR-009 (interaction registry — 같은 패턴), DR-010 (manipulation registry — 같은 패턴) |

## Summary

WI-015 에서 박제한 `AITooltip` primitive 를 편집 UX 전반 (DesignPage toolbar / FrameStage frames / Canvas shapes / Hotspot regions) 에 실제로 wiring. 단순 정적 wiring 이 아니라 **(a) 편집 상태 (selection / entered / hovered / history) 의 reactive 반영**, **(b) 핫키 strings 의 단일 source-of-truth 박제**, **(c) 도메인 kind 별 다형 (slide / canvas-design / block-doc / media) 의 open registry dispatch** 의 3 축으로 박제. DR-011 의 의 `TooltipCapability` registry 가 (c) 의 박제.

## Scope

**In scope**
- 새 모듈 `apps/web/src/document/tooltip/` —
  - `registry.ts` — `createTooltipRegistry()`, DR-010 mirror.
  - `types.ts` — `TooltipCapability<K>`, `TooltipDescribeContext`.
  - `editor-hotkeys.ts` — `@agocraft/input/hotkey` 기반 editor scope 의 hotkey 정의 (id / keys / label / action 의 single source). `useHistoryHotkeys` 의 raw window listener 를 교체.
  - 도메인 describers: `slide.tooltip.ts`, `canvas-design.tooltip.ts`, `block-doc.tooltip.ts`, `media.tooltip.ts`.
- `@weave/design-system` 의 `AITooltipProvider` 에 `hotkeyTable?: Record<string, { keys: string; label?: string }>` prop 추가 + `AITooltipAction.hotkeyId?: string` 슬롯 추가 (literal `shortcut` 의 우선; `hotkeyId` 시 provider 가 table 에서 resolve).
- 작은 wrapper `<KindTooltip item={item} selected={...} entered={...} hovered={...}>` (apps/web/src/document/tooltip/KindTooltip.tsx) — registry lookup + describer 호출 + `useAITooltipTarget` 위임.
- DesignPage 의 toolbar 5 개 (Undo / Redo / + Add / Present / ThemeSwitcher) 의 AITooltip wiring + `editor-hotkeys` 의 hotkeyId 참조.
- `FrameStage.NestedFrame` 의 `<KindTooltip>` wiring — 도메인 별 다른 content + selection / entered 상태 반영.
- e2e: `apps/web/e2e/tooltip-editor.spec.ts` — toolbar / frame / 상태 변화 / 핫키 표시 / 도메인 다형 의 5+ 시나리오.

**Out of scope (이번 WI 에서 제외)**
- Canvas-shape / hotspot region 의 sub-element tooltips — Phase 4 (다음 WI 후보로 분리).
- 사용자 hotkey remapping UI — `editorHotkeys` 의 single source 가 그 path 를 열어두지만 UI 는 별 WI.
- Marketing landing 의 tooltip 적용 — public surface 의 별 DR 의 visual 점검 필요.

**Explicitly deferred**
- 다중 selection 의 group tooltip (e.g., "3개 선택됨") — 다음 라운드.
- Tooltip 안 인터랙티브 action (실제 클릭 가능 버튼) — DR-design-006 의 "v2" open question 으로 박제.

## Acceptance criteria

- [ ] DR-011 (Accepted) before merge — capability registry decision 박제.
- [ ] `pnpm verify` PASS (lint / typecheck / unit / build).
- [ ] **UI change** → `apps/web/e2e/tooltip-editor.spec.ts` PASS — 최소 시나리오:
  - toolbar Undo / Redo / + Add 의 각 hover ≥ 175 ms → tooltip 노출, hotkey 키캡 정상 (`⌘ + Z` / `⌘ + ⇧ + Z` 등).
  - selection 상태 변경 시 동일 frame 의 tooltip context 가 갱신 ("선택됨" ↔ "클릭하여 선택") — **`refresh()` 가 박제되어야 회귀 검출**.
  - flavor 별 frame (slide / canvas-design / block-doc / media) 의 4 종 의 다른 tooltip context — registry dispatch 검증.
  - history 가 비어있을 때 Undo button 의 tooltip 의 "되돌릴 수 없음" 의 disabled-state 메시지 노출.
  - reduced-motion + theme 3 종 의 회귀 확인.
- [ ] Hotkey registration 의 단일 source — `editorHotkeys` 안 모든 editor 핫키 (Cmd+Z / Cmd+Shift+Z / Escape 등) 가 register 되고, raw window listener 0 ( `useHistoryHotkeys` 제거).
- [ ] 새 외부 의존성 0 — `@agocraft/input/hotkey` 이미 의존, `@weave/design-system` 의 minor API 확장만.
- [ ] WI-015 의 회귀 0 — 기존 ai-tooltip e2e 10 시나리오 + 전체 e2e 47/47 (1 skip) PASS.
- [ ] `tools/validate_workspace.py` PASS.

## Context

- **사용자 요청 (2026-05-23)**: "AIToolTip을 편집 ux에 적용 ... 스테이트와 핫키 등의 컨텍스트에 관련 정보들을 넣어두고 그걸 활용해서 처리 ... 아이템별로 다른 처리를 해야할때 어떻게 코드 구조적 다형성 처리".
- **WHY now**: WI-015 가 primitive 만 박제. 실제 편집 UX 의 hint 가 박혀야 onboarding · power-user · 비전공자 가이드 의 3 use case 가 살아남. M0 가 design-system foundation 의 완성 시점이므로, M0–M1 경계에 첫 application 박제.
- **WHY central hotkey registry**: 현재 `useHistoryHotkeys` 의 raw window listener (Cmd+Z / Cmd+Shift+Z) 와 PresentPage 의 `@agocraft/input/hotkey` 가 분리. tooltip 의 shortcut 표시 의 source 가 분산되면 drift 가 발생. 단일 registry 로 정렬.
- **WHY capability registry for tooltips**: agocraft DR-005 + 본 프로젝트 DR-009 (interaction) + DR-010 (manipulation) 의 정착된 open-extension-point 패턴. 새 도메인 추가 = describer 정의 + register 한 곳. closed switch 는 [feedback-tree-shaking-first](../../.claude/...) 의 의도 위반.

## Phased plan

- [x] **A. AITooltipProvider 확장 (live data refresh)** — `useAITooltipTarget` 의 useEffect 가 매 data 변화 시 `ctx.refresh(elRef.current, data)` 호출. Provider 의 `refresh()` 가 `stateRef.target === element` 일 때 만 state 갱신 (`visible` / `pending-hide` 의 active data 교체 + `pending-show` 의 pending data 교체). 외 target → no-op. **신규 e2e PASS** — `apps/web/e2e/ai-tooltip.spec.ts` "live data refresh" — `data-tooltip-*` 속성 mutation + pointerover 재발화 후 동일 surface (count=1) 안 content 가 "초기 컨텍스트/액션" → "갱신된 컨텍스트/액션" 으로 in-place 교체. 회귀 없음 (48/48 e2e + 56/56 unit + typecheck PASS).
- [x] **B. Toolbar 정적 wiring** — `<AITooltip>` 박제: Redo (IconButton 직접 wrap), + Add (DropdownMenuTrigger asChild → AITooltip → Button, 2-layer Slot chain), Present (Button asChild 의 multi-child fragment Slot 한계로 인해 dataset path 사용 — `data-ai-tooltip`/`data-tooltip-*` 를 Link 에 직접). ThemeSwitcher 는 deferred (per-item tooltip 은 design-system component API 변경 필요 — DR 검토 후 별 phase). 작업 중 발견된 두 한계 점:<br/>① **AITooltip wrapper 가 outer Slot 의 ref 를 drop 하는 버그** — DropdownMenuTrigger asChild 가 AITooltip 에 ref 를 cloneElement 으로 전달하지만, function-component 인 AITooltip 이 그것을 무시하여 Radix dropdown 의 anchor positioning 이 깨짐. **수정**: AITooltip 을 `forwardRef` 로 전환 + 내부 `mergeRefs(forwardedRef, bind.ref)` 박제 + outer `...rest` 의 모든 prop 을 Slot 으로 forward.<br/>② **Button asChild Link 의 multi-child fragment Slot 한계** — Button 의 content fragment (`<>icon<span>{children}</span>icon</>`) 가 Radix Slot 의 다중 자식 mode 에 들어가서 props 가 inner Link 에 도달하지 못함 (className / aria-describedby / pointer events 모두 lost). Phase B 에서는 dataset path 으로 우회 — Phase D 후속 follow-up: Button 에 `<Slottable>` annotation 추가 또는 KindTooltip 의 별 host element 박제.<br/>**검증**: `apps/web/e2e/tooltip-editor.spec.ts` 3/3 PASS — Redo (single Slot), Add (2-layer Slot chain + dropdown 정상 동작), Present (dataset path).
- [x] **C. Editor hotkey 단일 registry** — `apps/web/src/document/tooltip/editor-hotkeys.ts` 박제 (단일 `EDITOR_HOTKEYS` table + `useEditorHotkeys` hook). `@agocraft/input/hotkey` + bus 위에서 동작 — Mod+Z / Mod+Shift+Z 의 binding + IME / textbox guard + table 반환. `useHistoryHotkeys` 모듈 제거 (raw window listener 제거 — single source 박제). `AITooltipProvider` 에 `hotkeyTable` prop + 내부 `HotkeyTableContext` 박제 (Floating 이 read). `AITooltipAction.hotkeyId` slot 추가 — literal `shortcut` 우선, fallback `hotkeyId → hotkeyTable[id].keys`. `readTooltipDataset` 도 dataset JSON 의 `hotkeyId` 파싱. `App.tsx` 의 AITooltipProvider 제거 → DesignPage 안 lift (provider scan="dataset" + hotkeyTable=editorHotkeyTable). Undo / Redo toolbar tooltip 을 `hotkeyId="undo"/"redo"` 로 교체 — 키 문자열 의 hard-coding 0. **신규 e2e**: hotkeyId 의 table resolve, Cmd+Z 회귀. **전체 e2e 53/53 (1 skip) + unit 56/56 + typecheck (양 패키지) + workspace validator 67/27/27 PASS**.
- [x] **D. TooltipCapability registry + describers** — `apps/web/src/document/tooltip/{types,registry,default-registry,slide.tooltip,canvas-design.tooltip,block-doc.tooltip,media.tooltip,KindTooltip}.ts` 박제. 4 도메인 describer 가 selected / entered / default 의 3-state branching + 도메인 별 attrs (title / summary+shapes 수 / heading+paragraphs 수 / caption+tone) 의 다른 context 반환. `<KindTooltip>` 의 `forwardRef + rest forwarding` (KindTooltip → AITooltip → div 의 ContextMenuTrigger asChild Slot chain 통과 의무). `TooltipDescribeContextProvider` (global slice: canUndo / canRedo / hotkeys) + per-item state (selected / entered / hovered) 의 두 path 합쳐 describer 에 전달. `FrameStage.NestedFrame` 의 wiring (`enteredId` prop 추가 + 재귀 path 의 전달). DesignPage 의 provider mount. 작업 중 발견된 한계: **KindTooltip 은 function component 였으면 ContextMenuTrigger asChild 의 ref / onContextMenu 가 drop** — Phase B 의 AITooltip 과 같은 박제 (forwardRef + rest 전달) 적용 완료.
- [x] **E. Tests + visual baseline** — `apps/web/e2e/tooltip-kind-polymorphism.spec.ts` 2 시나리오 PASS (kind dispatch: slide / canvas-design / block-doc / media 의 다른 context, state dispatch: 선택 시 in-place 갱신). 기존 `apps/web/e2e/tooltip-editor.spec.ts` 5 시나리오 + `apps/web/e2e/ai-tooltip.spec.ts` 11 시나리오 회귀 PASS. **55/55 전체 e2e (1 skip) + 56/56 unit + typecheck (양 패키지) + workspace validator 67/27/27 PASS**. Phase E 의 별도 baseline 캡처는 Phase D 의 e2e 가 이미 다양한 selection / kind 조합을 커버하므로 생략.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Editor hotkey scope 와 IME / textbox 의 충돌 | `editor-hotkeys` 의 register 시 IME composing / `INPUT/TEXTAREA/contenteditable` exclusion guard 박제 (현재 `useHistoryHotkeys` 의 guard 의 이전). |
| Tooltip context 가 매 render 의 새 객체 → describer 의 매번 새 result | `useMemo([item, selected, entered, hovered, canUndo])` 의 stable identity. Describer 도 pure function (referential transparency). |
| Capability registry 의 overhead (toolbar 의 정적 case 까지 거치면 무거움) | **registry 는 escape hatch — toolbar 는 `<AITooltip>` 직접 wiring**. domain item (frames / shapes) 만 `<KindTooltip>` 의 dispatch path. |
| 두 path (`shortcut` literal vs `hotkeyId`) 의 drift | Domain-describer file 에선 `hotkeyId` 의무. Toolbar.tsx 만 literal `shortcut` 허용. PR review 의 의무 + 향후 lint rule 후보 (`no-literal-shortcut-in-describer`). |
| `refresh()` 가 visible 상태 의 잦은 갱신 → motion morph 가 매 갱신 마다 발화 | Provider 의 `refresh()` 는 동일 target 의 data 만 교체 — `active.element` 의 identity 유지. motion 의 `layoutDependency={active.element}` 가 target 변화 시 에만 morph 발화 (Phase D 박제). data-only 변경 시 morph 없이 in-place rerender. |

## Status updates

- 2026-05-23: **WI-016 발행** — 사용자 명시 prompt 기반. DR-011 동시 작성. Phase A (refresh) 시작.
- 2026-05-23: **Phase A 완성** — `AITooltipContextValue` 에 `refresh(target, data)` 추가. Provider 의 refresh = `stateRef.target === element` 일 때만 stateRef.data 갱신, visible/pending-hide 시 setActive 도 호출 (UI 즉시 update); idle / 다른 target 무시. `useAITooltipTarget` 에 useEffect 박제 (data dep) — 매 data 변화 시 `ctx.refresh(...)` 호출 (provider 가 active 아니면 no-op). 신규 e2e PASS, 회귀 없음. Phase B (toolbar 정적 wiring) 다음.
- 2026-05-23: **Phase B 완성** — Redo / + Add / Present 의 3 개 toolbar surface 박제. **두 디자인 시스템 한계 점 발견 + 수정/우회**: ① AITooltip 이 outer Slot 의 ref 를 drop → `forwardRef + mergeRefs` 로 수정. ② Button asChild 의 multi-child fragment Slot 한계 → Present 만 dataset path 으로 우회 (Phase D follow-up). ThemeSwitcher 는 ToggleGroup 의 per-item tooltip 이 design-system API 변경을 요구하므로 deferred. 신규 e2e (3/3 PASS in isolation, 전체 e2e 51/51 PASS 1 skip), typecheck (양 패키지) + workspace validator 67/27/27 PASS. Phase C (editor hotkey registry 단일 source) 다음.
- 2026-05-23: **Phase C 완성** — Editor hotkey 의 single source of truth 박제. (1) `apps/web/src/document/tooltip/editor-hotkeys.ts` — `EDITOR_HOTKEYS` table (id / keys 표시 문자열 / binding canonical / label / action) + `useEditorHotkeys(editor)` hook. (2) Legacy `useHistoryHotkeys` 모듈 제거 — raw window listener path 제거됨, `@agocraft/input/hotkey` + bus 가 단일 path. binding 문자열은 lib 의 cross-platform alias `Mod+Z` 사용 (먼저 시도한 `ControlOrMeta+Z` 는 lib parser 가 literal unknown key 로 해석 — Mod 가 canonical). IME / textbox guard 는 action 안 박제 (ctx.event.target → INPUT/TEXTAREA/contenteditable check). (3) `AITooltipProvider.hotkeyTable` prop + `AITooltipAction.hotkeyId` slot + 내부 `HotkeyTableContext` 박제 — literal `shortcut` 가 우선, fallback `hotkeyId → table[id].keys`. `readTooltipDataset` 의 actions JSON parse 도 hotkeyId 지원. (4) `App.tsx` 의 AITooltipProvider 제거 → DesignPage 안 lift (scan="dataset" + hotkeyTable={editorHotkeyTable}). Landing / Present 는 tooltip 사용 없음. (5) Undo / Redo toolbar tooltip 의 literal `"⌘ + Z"` 를 `hotkeyId: "undo"` / `"redo"` 로 교체. 키 문자열 hard-coding 0. (6) **신규 e2e 2개** — hotkeyId 의 table 에서 resolve, Cmd+Z 가 여전히 undo (useHistoryHotkeys 제거 회귀 검증). **전체 e2e 53/53 (1 skip) + unit 56/56 + typecheck (양 패키지) + build PASS** — 회귀 없음. Phase D (TooltipCapability registry + KindTooltip + 도메인 describers) 다음.
- 2026-05-23: **Phase D + E 완성 — WI-016 Done**. (1) **types + registry** (`apps/web/src/document/tooltip/{types,registry,default-registry}.ts`): `TooltipCapability<K>` / `TooltipDescribeContext` / `TooltipRegistry` 의 정착 패턴 (DR-010 mirror), `createTooltipRegistry()` 의 Map + dev-warning 중복 register, default-registry 의 4 도메인 register 한 줄 each. (2) **4 도메인 describer**: slide (title + 선택/진입/기본 3 state), canvas-design (summary + 도형 수 + 3 state), block-doc (heading + 문단 수 + 3 state), media (caption + tone + 3 state). 각각 자체 file (file-per-domain) 으로 새 도메인 추가 의 path 가 자연. (3) **`<KindTooltip>`** (`KindTooltip.tsx`) — `forwardRef + rest 전달` (Phase B 의 AITooltip 박제 mirror — ContextMenuTrigger asChild → KindTooltip → AITooltip → div 의 4 layer chain 통과 의무). `TooltipDescribeContext` (canUndo / canRedo / hotkeys 의 global slice) 을 React Context 로 mount + per-item state 의 prop 으로 받음. (4) **`FrameStage.NestedFrame` 의 wiring** + `enteredId` prop 추가 + 재귀 path 의 전달. DesignPage 가 `<TooltipDescribeContextProvider>` mount. (5) **신규 e2e**: `tooltip-kind-polymorphism.spec.ts` 2 시나리오 — kind dispatch (4 도메인 의 다른 context) + state dispatch (선택 변화 시 in-place 갱신, Phase A 의 refresh 가 깨지지 않게). **전체 e2e 55/55 (1 skip) + 56/56 unit + typecheck (양 패키지) + workspace validator 67/27/27 PASS**. WI-016 Done — 핫키 단일 source + 도메인 다형 (registry) + 상태 변화 (refresh) 의 3 축이 모두 박제되어 새 도메인 / 새 hotkey 추가의 path 가 명확.

## Cross-references

- WI-015 (`AITooltip` primitive)
- DR-011 (Tooltip capability registry — 본 WI 의 architecture 결정)
- DR-design-006 (AITooltip Design Review)
- DR-009 (interaction registry — 같은 open-registry 패턴, 첫 번째 application)
- DR-010 (manipulation registry — 같은 open-registry 패턴, 두 번째 application)
- agocraft DR-005 (capability registry — 원조 패턴)
- `features/design-system/RULE.md`, OS-root `.claude/skills/design-system-triage/SKILL.md`
