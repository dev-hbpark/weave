# WI-026 — Command Metadata Single Source of Truth

## Metadata

| Field | Value |
|---|---|
| ID | WI-026 |
| Status | **Phase 1+2 Complete** — agocraft 기반 + weave EDITOR_COMMANDS 마이그레이션 |
| Date opened | 2026-05-25 |
| Trigger | 사용자 — "기능 규칙이 달라졌을 때 UI 도 자동으로 적용" 가능성 검토 후 "agocraft에 정석대로 처리해줘" |
| Cross-references | OS-root `CODE_STRUCTURE_DESIGN_RULES.md` § Rule 6, [weave AUDIT-002](../audits/AUDIT-002-2026-05-25-declarative-branching.md), [agocraft AUDIT-002](../../../agocraft/records/audits/AUDIT-002-2026-05-25-declarative-branching.md), 메모리 `feedback_declarative_branching_rule6` |

## 1. 동기

사용자가 그린 그림: 모든 UI 표현 (label, tooltip, keycap, command palette, screen-reader, disabled state) 이 **한 곳의 metadata 변경**으로 자동 따라가는 시스템. VSCode 의 `commandPalette` + `keybinding` + `when` clause 와 동일 패턴.

기존 weave 상태:
- TooltipRegistry (DR-011) ✓ kind 별 adapter
- AITooltipHotkeyTable ✓ hotkey id → keycap 매핑
- EDITOR_HOTKEYS ✓ id/keys/binding/label 의 single source — 단 hotkey 시스템 한정
- **빠진 한 층**: Command 의 user-facing metadata 표준 + UI 자동 wiring

## 2. 설계 결정

### 결정 1 — 별도 `CommandMetadataRegistry` (Command 와 분리)

| | Command (기존) | CommandMetadata (신규) |
|---|---|---|
| 책임 | 순수 런타임 동작 (`run`, `canRun`) | 사용자 표현 (label, hotkey, enabledWhen) |
| 위치 | `@agocraft/core/command/command-registry` | `@agocraft/core/command/metadata` |
| Lookup key | `name: string` | `id: string` (`editor.exec(id)` 와 동일) |
| 등록 의무 | 명령 실행 시 필요 | 옵션 (metadata-only 항목 가능 — hotkey 만, host action 만) |

이유: 명령은 등록 안 되어도 metadata 가 가능 (예: hotkey-only host action). 명령이 등록되어도 metadata 가 필수 아님 (test / scratch). 두 책임을 한 인터페이스에 묶으면 부담만 늘고 OCP 약화.

### 결정 2 — i18n-ready `LocalizedText` 부터

`label: { en: string; ko: string }` 로 시작. 미래에 BCP-47 locale 확장 시 union 만 늘림. `resolveLabel(meta, locale)` 가 fallback chain (`locale → en → first key → ""`) 처리. 영문화 비용은 점진 — 한국어만 비어 있어도 영문이 표시되고 그 반대도.

### 결정 3 — `EnabledWhenContext` 는 free-form `Record<string, unknown>`

호스트마다 "enabled" 의 의미가 다름 (mode, selection, history.canUndo, route, role, …). agocraft 가 shape 을 constrain 하지 않음. 호스트가 자기 context 를 wiring. 예시:

```ts
{
  id: "history.undo",
  enabledWhen: (ctx) => Boolean(ctx.canUndo),
}
```

호스트는 `metadata.isEnabled("history.undo", { canUndo: editor.history.canUndo(), mode })` 호출.

### 결정 4 — `CommandHotkey` 가 display + canonical 둘 다 carry

```ts
hotkey: { keys: "⌘ + Z" /* display */, binding: "Mod+Z" /* bus */, scope: "editor" }
```

display 는 keycap UI, binding 은 `@agocraft/input/hotkey` 등록용. 한 entry 가 두 사용처 모두 채워서 사용자가 단축키 변경 시 한 위치만 수정.

## 3. Phase 진행 (실시)

### Phase 1 ✅ — agocraft CommandMetadata 인터페이스 + Registry

신규 파일: `packages/core/src/command/metadata.ts` (167 L)
- `CommandLocale`, `LocalizedText`, `CommandHotkey`, `IconRef`, `EnabledWhenContext`, `EnabledWhenFn`
- `CommandMetadata` interface
- `CommandMetadataRegistry` interface + `CommandMetadataRegistryToken`
- `CommandMetadataError` ("METADATA_DUPLICATE_ID" / "METADATA_NOT_FOUND")
- `createCommandMetadataRegistry()` factory
- `resolveLabel` / `resolveDescription` / `resolveHint` helpers

신규 spec: `metadata.test.ts` (10 tests) — register / duplicate detection / disposer / list / sort / category filter / isEnabled / fallback chain.

`packages/core/src/command/index.ts` + `packages/core/src/index.ts` 에 export 추가.

검증: `pnpm verify` 그린 (310 tests, lint 0 error, tokencheck pass, build green).

### Phase 2 ✅ — weave 측 EDITOR_HOTKEYS → CommandMetadata 마이그레이션

수정: `apps/web/src/document/tooltip/editor-hotkeys.ts`
- `EDITOR_COMMANDS: ReadonlyArray<EditorCommand>` — `CommandMetadata & { action }` 형태
- `editorCommandMetadata: CommandMetadataRegistry` — module-level singleton, import time 자동 등록
- `useEditorHotkeys(editor)` 가 `EDITOR_COMMANDS` 한 소스에서:
  - `@agocraft/input/hotkey` 등록 (binding 으로)
  - 기존 `AITooltipHotkeyTable` 빌드 (legacy 호환)
  - metadata registry 노출 (신규 consumer 용)

새 command 추가 = `EDITOR_COMMANDS` 배열에 한 entry → hotkey + tooltip table + future CommandButton 모두 자동.

검증: weave `tsc --noEmit` + `vite build` 그린.

## 4. 남은 Phase (다음 사이클)

### Phase 3 — `<CommandButton>` / `<CommandKeycap>` / `<CommandMenuItem>` (design-system)

```tsx
<CommandButton commandId="history.undo" />
// 자동:
//   - text: resolveLabel(meta, locale)
//   - tooltip: resolveHint(meta, locale) + keycap
//   - disabled: !metadata.isEnabled(commandId, ctx)
//   - onClick: dispatch via host
//   - aria-label, data-testid 자동
```

design-system 측 wrapper. context 는 props 또는 React Context.

### Phase 4 — 기존 UI button 일괄 마이그레이션

- Header 의 Undo/Redo button → `<CommandButton commandId="history.undo" />` / `"history.redo"`
- ContextualToolbar 의 각 section control 들도 점진 마이그레이션 (label/hint metadata 박제)

### Phase 5 — `enabledWhen` 와 mode / selection / history 자동 wiring

- `useInteractionMode` + `useSelection` + `editor.history` → `EnabledWhenContext` 빌드
- `<CommandButton>` 자동 disabled 처리 → hand mode 시 selection 관련 버튼 회색 처리 등

### Phase 6 — 명령 팔레트 (Cmd+K)

- `editorCommandMetadata.list()` 검색 UI
- Fuzzy search on `resolveLabel` + `resolveDescription`
- 단축키 표시 + 실행

## 5. AUDIT-002 잔여 follow-up 과의 통합

| AUDIT-002 V-id | 해결 경로 (Phase 4 이후) |
|---|---|
| V-2 PropertiesPanel (14 cases) | DomainKind metadata 가 `panelSections: ToolbarSection[]` 노출 → PropertiesPanel 도 registry dispatch |
| V-4 DOMAIN_RENDERERS | `DomainCapability.renderer` field 통합 → 별도 catalog 불필요 |
| V-6 ThumbnailPanel | `DomainCapability.thumbnailFlavor` field 통합 |
| V-7 seed.ts createDefaultItem | `DomainCapability.defaultAttrs(): Attrs` 함수 노출 |
| V-8 allowedChildKinds | `DomainCapability.canBeChildOf(parentKind): boolean` |
| V-9 BehaviorEditor | `BehaviorMetadata` (Behavior kind 의 CommandMetadata 변형) — 같은 패턴 재사용 |
| V-10 hotspot | 동일 |

→ Phase 4 의 일관 마이그레이션이 AUDIT-002 follow-up 7건 중 6건을 흡수.

## 6. 변경 이력

- 2026-05-25 — Phase 1 + 2 완료. agocraft v1.0.0-rc.20260525021229 (재벤더). WI-026 발행.
