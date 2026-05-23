# Decision Record — DR-011 Tooltip Capability Registry (open extension point)

## Metadata

| Field | Value |
|---|---|
| ID | DR-011 |
| Title | 편집 UX 의 tooltip content (context / actions / shortcuts) 는 closed switch 아닌 open Capability Registry 의 dispatch (item kind × state). 새 도메인 추가 = describer 정의 + register 한 곳. |
| Status | Proposed |
| Owner | hbpark |
| Triggering Work Item | WI-016 |
| Pairs with | agocraft DR-005 (capability registry — 원조), DR-009 (interaction registry — 같은 패턴 의 첫 적용), DR-010 (manipulation registry — 같은 패턴 의 두 번째 적용) |

## Context

WI-015 가 `AITooltip` primitive 박제. WI-016 가 그 primitive 의 편집 UX 적용. 적용 시 박힌 사용자 요구:

1. **상태에 따라 다른 hint** — 같은 frame 이라도 selection / entered / hovered / history-empty 상태에 따라 다른 context · actions 노출. ("선택 가능" vs "선택됨" vs "진입됨")
2. **핫키 context 의 단일 source** — Cmd+Z / Cmd+Shift+Z 등 의 표시 가 어디서든 단일 source 의 박제 (현재 `useHistoryHotkeys` raw window listener + PresentPage 의 `@agocraft/input/hotkey` 분리).
3. **아이템 별로 다른 처리** — 4 도메인 (slide / canvas-design / block-doc / media) + 향후 sub-element (canvas-shape / hotspot / handle) 의 각자 다른 hint 표현. 추가 도메인 시 closed switch 의 전체 변경 path 거부.

이 3 축이 같은 closed switch 안에 들어가면 도메인 추가 의 cost 가 폭증 — agocraft DR-005 / 본 프로젝트 DR-009 / DR-010 의 동일 의도 패턴 의 자연 application.

## Options

### Option A (Recommended): Open Tooltip Capability Registry

```ts
interface TooltipCapability<K extends string = string> {
  readonly targetKind: K;       // "slide" / "canvas-design" / "block-doc" / "media" / "canvas-shape" / ...
  readonly describe: (
    item: AgoItem<K>,
    ctx: TooltipDescribeContext,
  ) => UseAITooltipTargetOptions;  // (context?, actions?, showContext?, showActions?, showShortcuts?)
}

interface TooltipDescribeContext {
  readonly selected: boolean;
  readonly entered: boolean;
  readonly hovered: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly hotkeys: HotkeyTableSnapshot;   // id → { keys, label } map
}

const registry = createTooltipRegistry();
registry.register(slideTooltipCapability);
registry.register(canvasDesignTooltipCapability);
registry.register(blockDocTooltipCapability);
registry.register(mediaTooltipCapability);
```

각 describer 의 자체 도메인 의 의도 — slide 의 "title 편집 / bullets 추가", canvas-design 의 "shape 추가 / drag-resize", media 의 "교체 / 자르기" 등. context 변화 (selection 등) 에 따른 분기 도 describer 안 에서 박제.

새 wrapper `<KindTooltip item={...} selected={...} entered={...} hovered={...}>` 가 lookup + describe + `useAITooltipTarget` 위임.

### Option B: Closed switch in a shared describer

```ts
function describeTooltip(item, ctx) {
  switch (item.kind) {
    case "slide": ...;
    case "canvas-design": ...;
    case "block-doc": ...;
    case "media": ...;
    // 새 도메인 추가 시 함수 변경 의무 + 모든 호출처 의 retest
  }
}
```

거부 — DR-009 / DR-010 의 이미 거부한 같은 closed-switch 의 안티-패턴. 도메인 추가 cost 가 큼 + tree-shake 의도 위반 (사용 안 하는 case 도 bundle 의 부담).

### Option C: Component-local tooltip on each renderer

각 도메인 renderer (`SlideBlock.tsx` 등) 의 자체 tooltip 박제. Wrapper 또는 hook 의 local-only 의 호출.

거부 — (a) 상태 (selected / entered) 가 renderer 의 외부 (DesignPage) 에 있어서 prop drilling 의 의무 발생; (b) 도메인 별 의 분기 가 코드 의 흩어져 있어 한 곳에서 비교 / 변경 어려움; (c) `editor-hotkeys` 의 hotkey-id resolution 의 path 가 모든 renderer 의 의무 — registry path 가 더 정렬.

### Option D: AITooltip 자체 가 polymorphism 박제

design-system primitive 가 `item.kind` 를 인지하고 분기. 거부 — primitive 의 domain-aware 의무 위반 (design-system-agent 의 첫 charter rule "Keep primitives domain-free"). DR-design-006 의 의도 위반.

## Decision

**Option A — Open Tooltip Capability Registry**.

근거:
1. **정착 패턴 의 일관 application** — agocraft DR-005 + DR-009 + DR-010 의 동일 shape. 새 reader 의 학습 비용 0.
2. **도메인 추가 의 단일 변경 지점** — describer file 정의 + `registry.register(adapter)` 한 곳. `<KindTooltip>` / DesignPage / FrameStage 변경 0.
3. **Tree-shake 의 자연** — 사용 안 하는 도메인 의 describer 의 dead-code 제거 자연. [feedback-tree-shaking-first](../../../../.claude/...) 의 의무 충족.
4. **Test 의 자연** — describer 단위 test 의 분리. 도메인 별 의 fixture 의 자연.
5. **Design-system primitive 의 domain-free 유지** — `AITooltip` / `AITooltipProvider` 가 도메인 모름. `<KindTooltip>` 가 어플리케이션 layer 의 adapter (apps/web/src/document/tooltip/) — design-system 토큰 의 깨끗.

## Capability shape — 정확 박제

```ts
// apps/web/src/document/tooltip/types.ts

import type { AgoItem, DomainKind } from "../types.js";
import type {
  AITooltipAction,
  UseAITooltipTargetOptions,
} from "@weave/design-system";

export interface HotkeyTableEntry {
  readonly keys: string;     // canonical key string (e.g., "ControlOrMeta+Z")
  readonly label?: string;   // human-readable action label, optional fallback
}

export type HotkeyTableSnapshot = Readonly<Record<string, HotkeyTableEntry>>;

export interface TooltipDescribeContext {
  readonly selected: boolean;
  readonly entered: boolean;
  readonly hovered: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly hotkeys: HotkeyTableSnapshot;
}

export interface TooltipCapability<K extends DomainKind = DomainKind> {
  readonly targetKind: K;
  /** Pure function: (item, context) → tooltip data. Referentially transparent
   *  so that memoization at the call site (KindTooltip) is safe. */
  readonly describe: (
    item: AgoItem<K>,
    ctx: TooltipDescribeContext,
  ) => UseAITooltipTargetOptions;
}

export interface TooltipRegistry {
  readonly register: <K extends DomainKind>(
    capability: TooltipCapability<K>,
  ) => () => void;   // returns disposer; warns on duplicate kind (DR-009 / DR-010 pattern)
  readonly get: <K extends DomainKind>(
    kind: K,
  ) => TooltipCapability<K> | undefined;
  readonly list: () => ReadonlyArray<TooltipCapability>;
}
```

각 describer 의 actions 의 element 에 `hotkeyId?: string` 의 박제 — provider 가 `hotkeyTable` 의 resolve. literal `shortcut` 의 fallback 도 호환 (DR-design-006 의 기존 API 의 backwards-compat).

## Hotkey table — single source of truth

```ts
// apps/web/src/document/tooltip/editor-hotkeys.ts

interface EditorHotkey {
  readonly id: string;
  readonly keys: string;
  readonly label: string;
  readonly scope: "editor" | "global";
  readonly action: () => void;
}

export function createEditorHotkeyTable(editor: Editor): {
  readonly table: HotkeyTableSnapshot;
  readonly install: () => () => void;    // returns disposer that unregisters all
} {
  const defs: EditorHotkey[] = [
    { id: "undo", keys: "ControlOrMeta+Z", label: "되돌리기", scope: "editor", action: () => editor.history.undo() },
    { id: "redo", keys: "ControlOrMeta+Shift+Z", label: "다시 실행", scope: "editor", action: () => editor.history.redo() },
    // ... add-frame, delete, enter-frame, etc.
  ];
  // ...
}
```

`AITooltipProvider` 의 새 prop `hotkeyTable?: HotkeyTableSnapshot` — 호스트 가 `createEditorHotkeyTable(editor).table` 의 전달. Provider 의 floating render 시 `action.hotkeyId` 를 resolve.

## Wrapper — KindTooltip

```tsx
// apps/web/src/document/tooltip/KindTooltip.tsx

interface KindTooltipProps {
  readonly item: AgoItem;
  readonly selected: boolean;
  readonly entered: boolean;
  readonly hovered: boolean;
  readonly children: ReactElement;
}

export function KindTooltip({ item, selected, entered, hovered, children }: KindTooltipProps) {
  const ctx = useTooltipDescribeContext(); // canUndo / canRedo / hotkeys from a thin React context
  const cap = useMemo(() => tooltipRegistry.get(item.kind), [item.kind]);
  const options = useMemo<UseAITooltipTargetOptions>(() => {
    if (cap === undefined) return {};
    return cap.describe(item, { selected, entered, hovered, ...ctx });
  }, [cap, item, selected, entered, hovered, ctx]);
  return <AITooltip {...options}>{children}</AITooltip>;
}
```

FrameStage 의 `NestedFrame` 의 inner element 를 `<KindTooltip item={...} selected={isSelected} entered={isEntered} hovered={false}>` 로 wrap.

## Polymorphism — 3 축 의 분리 유지

CLAUDE.md 의 인용:
> Keep DI (instance lookup) and capability dispatch (data × behavior) as separate registries.

본 DR 의 적용:
- **Behavior dispatch (DI / instance lookup)** — `editor.history.undo()` 의 같은 호출, 같은 효과 어디서나.
- **Data × kind dispatch (capability)** — `tooltipRegistry.get(item.kind).describe(...)` 의 도메인 별 다른 content.
- **State × instance dispatch (per-item)** — 같은 describer 가 `ctx.selected` / `ctx.hovered` 에 따라 다른 result. registry 의 차원 아님 — describer 내부 의 branching.

이 3 축이 합쳐지면 closed switch 가 폭증. 분리 시 각 축 의 단순 책임.

## Consequences

- `apps/web/src/document/tooltip/` 새 폴더 + adapter file 의 새 추가 = 미래 도메인 의 자연 자리.
- `useHistoryHotkeys` 의 raw window listener 제거 + `editor-hotkeys.ts` 의 single source 박제. 향후 hotkey remapping UI 의 path 가 열림.
- WI-015 의 `AITooltipProvider` API 의 minor 확장 — `hotkeyTable?` prop + `AITooltipAction.hotkeyId?` slot. 둘 다 optional → backwards-compat.
- 새 sub-element 도메인 (canvas-shape, hotspot region, selection handle) 추가 시 = describer 하나 + `registry.register(adapter)`. 본 WI Phase 4 가 시작점.

## Mitigations

- **Capability conflict** — 같은 targetKind 의 다중 register 시 dev-warning (DR-009 / DR-010 의 패턴 동일).
- **Hotkey id collision** — `createEditorHotkeyTable` 가 dedupe + dev-warning.
- **Live data update during visible state** — WI-015 의 `AITooltipProvider` 가 snapshot-only 였음. WI-016 Phase A 에서 `refresh(target, data)` 박제 — describer 의 result 가 매 render 갱신 시 active target 의 data 도 함께 갱신. 시각 morph 의 발화 없음 (target identity 유지).
- **Domain-describer 의 hotkey hardcoding 회귀** — PR review 의 의무. 향후 lint rule (`no-literal-shortcut-in-describer`) 후보.

## Links

- WI-016 — `records/work-items/WI-016-tooltip-editor-integration.md`
- WI-015 — `records/work-items/WI-015-ai-agentic-tooltip.md` (primitive 박제)
- DR-design-006 — `records/design-reviews/DR-design-006-ai-agentic-tooltip.md`
- DR-009 — `records/decisions/DR-009-interaction-registry-extension-point.md` (interaction registry — 같은 패턴)
- DR-010 — `records/decisions/DR-010-manipulation-capability-registry.md` (manipulation registry — 같은 패턴)
- agocraft DR-005 (capability registry — 원조)
- code structure rules — [feedback-tree-shaking-first](../../../../.claude/...) + extension-point 의 의무 (CLAUDE.md "Core Engineering Principles")
