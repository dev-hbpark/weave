# features/editing/UX_DESIGN.md

> WI-004 의 Discovery 산출물. **사용자 결정 (2026-05-22)**: Notion-like 기본 패턴 + 도메인별 자연스러운 변형. 모든 후속 WI (canvas direct-manipulation / slash command / drag-reorder) 의 base.

## 가이드 원칙

1. **한 손가락으로 시작, 양손으로 깊이** — 진입 장벽 0 (클릭 → 편집). 깊이 (키보드 단축, 슬래시 command) 는 학습한 사용자에게 보상.
2. **도메인의 강점 안 죽이기** — 텍스트는 인라인, 캔버스는 direct manipulation, 미디어는 visual 우선. 일관 ≠ 단조로움.
3. **항상 reversible** — 모든 행위 undo 가능. Cmd+Z 가 single source of truth.
4. **시스템이 보이지 않을 때까지 조용히** — autosave, history, 키바인딩 hint 은 호버/포커스 시 나타나고 비활성 시 사라짐. 화면이 사용자 콘텐츠의 무대.
5. **a11y first-class** — 모든 인터랙션이 키보드만으로도 가능. ARIA roles, focus-visible, `prefers-reduced-motion`.

## 공통 인터랙션 (모든 도메인)

### A. 카드 호버 — Block Toolbar

호버 시 카드 우측 상단에 toolbar 노출. 키보드 focus 시 동일.

```
┌────────────────────────────────────────────────────┐
│ Slide · 9:21 PM           [↑] [↓] [⎘] [⋯] [✕]      │
│                                                    │
│  Headline goes here                                │
│  • Bullet one                                      │
└────────────────────────────────────────────────────┘
```

- **↑ Move up** — 한 칸 위 (Cmd+Shift+Up)
- **↓ Move down** — 한 칸 아래 (Cmd+Shift+Down)
- **⎘ Duplicate** — 즉시 다음 줄에 복제 (Cmd+D)
- **⋯ More** — drag, convert-to (도메인 transform), color override, etc. (M2)
- **✕ Remove** — 제거 (Cmd+Delete, 확인 prompt — 첫 미사용 후 학습)

### B. 인라인 텍스트 편집 (slide / doc / media)

- **클릭 → 캐럿 활성**. focus-visible 의 ring 의무.
- **Enter** = 저장 + blur. 빈 텍스트 + Enter:
  - slide bullet → 새 bullet 추가
  - doc paragraph → 새 paragraph
- **Esc** = 취소 (원본 복원) + blur
- **Tab** = 다음 편집 영역 진입
- **Shift+Enter** = soft break (텍스트 안의 줄바꿈 — newline 없이)
- **blur** (외부 클릭) = 저장 + 종료

### C. 슬래시 Command (Phase 2 / M2)

- **`/`** 빈 라인에서 → command palette popup
- 도메인 추가: `/slide`, `/canvas`, `/doc`, `/media`
- block-doc 내부 변형: `/h1`, `/h2`, `/list`, `/quote`, `/code`
- arrow key navigation, Enter = 적용, Esc = 취소
- 입력 prefix 매칭 — `/sli` → Slide 후보 first

### D. 키보드 단축 (전역)

| 키 | 행위 |
|---|---|
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` / `Cmd+Y` | Redo |
| `Cmd+S` | Force-save (autosave 보강 — 인디케이터 visual 피드백) |
| `Cmd+Enter` | 다음 block (또는 새 block 추가) |
| `Cmd+Delete` | 현재 block 제거 |
| `Cmd+D` | 현재 block 복제 |
| `Cmd+Shift+↑/↓` | 현재 block move up/down |
| `Tab` / `Shift+Tab` | 다음/이전 편집 영역 |
| `Esc` | 편집 종료 (변경 cancel) |

### E. Autosave 인디케이터

- top-right (ThemeSwitcher 옆) 의 작은 텍스트:
  - "**Saved**" — 마지막 저장 후 변경 없음 (default)
  - "**Saving…**" — 저장 진행 중 (Phase 1: localStorage 즉시. Phase 3: 서버 호출)
  - "**Unsaved**" — Phase 3 의 offline 상태
- 호버 시 마지막 저장 시간 tooltip.

### F. Focus / Selection Model

- **선택된 block** = 카드 의 outer ring (`--focus-ring`). 키보드 화살표로 block 간 이동.
- **편집 중 (edit mode)** = 내부 element 의 caret.
- **multi-select** (M2) = Cmd+클릭 / Shift+클릭.

## 도메인별 변형

### Slide (`presentation.slide`)

- 제목 = h3 inline edit. 큰 텍스트 (28-32px).
- bullets = 별 inline element. Enter = 새 bullet. Backspace 빈 줄 = 제거.
- Tab = nested level (M2; Phase 1 은 flat).
- **차별점**: 16:9 비율 fixed. layout 의 직접 변경은 M2 (template picker).

### Block-doc (`block-doc.section`)

- heading = h3 inline edit.
- paragraphs = 별 inline editable text. Enter = 새 paragraph.
- backspace 빈 paragraph = 제거 + 이전 paragraph 의 끝으로 caret.
- **차별점**: 텍스트 우선. heading toggle (`Cmd+Alt+1/2/3`) M2.

### Canvas-design (`canvas-design.surface`)

- **Phase 1**: read-only. shapes 의 시각만.
- **Phase 2+** (별 WI-005): shape 클릭 → selected, drag = move, corner = resize, 더블클릭 = 색 picker, Delete = 제거.
- **차별점**: direct manipulation. 텍스트 편집과 별 inter action mode.

### Media (`media.block`)

- caption = inline edit (작은 텍스트).
- tone toggle = 작은 switch (image ↔ video). Phase 1: visual 만 변경 (실제 upload 는 M2).
- **차별점**: visual 우선 — 미디어 placeholder 가 주연. caption 보조.

## 새 컴포넌트 (Design System Triage)

| 컴포넌트 | Triage outcome | 위치 |
|---|---|---|
| `EditableText` | 🌱 **Grew (primitive)** — Design Review DR-design-002 의무 | `packages/design-system/src/components/EditableText.tsx` |
| `BlockToolbar` | 🌱 **Grew (primitive)** — DR-design-002 의 일부 | `packages/design-system/src/components/BlockToolbar.tsx` |
| `KbdHint` (`<kbd>Cmd+Z</kbd>` 스타일링) | 🌱 **Grew (primitive)** — DR-design-002 의 일부 | `packages/design-system/src/components/Kbd.tsx` |
| `SaveIndicator` | 🌱 **Grew (primitive)** — DR-design-002 의 일부 | `packages/design-system/src/components/SaveIndicator.tsx` |

→ **DR-design-002** 발행 의무. `design-system-agent` + `frontend-design-pattern-agent` 사인.

## a11y 의무

- **EditableText** 의 ARIA: `role="textbox" aria-multiline="false|true" aria-label` (visible label 없을 때).
- **BlockToolbar** 의 ARIA: `role="toolbar" aria-orientation="horizontal"`.
- **포커스 trap 안 함** — Tab 의 자연 흐름 유지.
- **키바인딩 announce** — `aria-keyshortcuts` 의 hint.
- **prefers-reduced-motion**: 캐럿 의 모션, 호버 toolbar 의 fade-in, undo 의 visual feedback 모두 단순 fade 또는 OFF.

## 성능 의무

- **EditableText** 의 contentEditable 사용 — uncontrolled (React state 와 contentEditable 의 잦은 충돌 회피). `onBlur` / `onKeyDown` 으로 commit.
- 카드 호버 toolbar — CSS `opacity` only, layout shift 없음.
- localStorage save — debounce 150ms (typing burst 동안 과다 호출 방지).

## 테스트 의무 (Phase 1 의 acceptance)

- **단위**: `useEditableText`, `useHistory` (mock undo stack), `useDocument` 의 patch 함수.
- **playwright e2e** (M1 후속): 4 도메인 카드 의 텍스트 편집 + undo + reload round-trip.

## 향후 (Phase 3 의 swap 의 단순화)

mock `useHistory` 의 patch 형식이 agocraft `History` API 와 호환 가능하도록:
- 각 change 가 `{ kind: "set" | "add" | "remove" | "move", ... }` 형식.
- transaction id (Date.now() base) 박제.
- mergeWindow (200ms) 으로 typing burst 의 한 transaction 묶음.

agocraft swap 시 이 mock 의 shape 가 그대로 ChangeStream + History 의 인터페이스 와 매칭.

### Input + Hotkey 모듈 의 mirror (HANDOFF-002)

사용자 요구 2026-05-22 — agocraft 측 Input Event Normalization + Hotkey Management 통합 모듈 발행 의무. weave Phase 1 의 mock 도 이 두 모듈의 contract shape mirror:

- **Mock InputBus** — `apps/web/src/input/input-bus.ts` (Phase 1 신설). pointer + key 의 합쳐진 normalized stream + realtime modifier state. agocraft swap 시 `createInputBus` 호출만 교체.
- **Mock HotkeyRegistry** — `apps/web/src/input/hotkey-registry.ts`. `{ keys, scope, action }` 의 declarative register API. `getCandidates(modifiers, scope)` 의 query. swap 시 `createHotkeyRegistry` 호출만 교체.
- **Realtime modifier hint UI** (M2 candidate) — modifier key 누르면 화면 우측 하단 / 캐럿 옆 popup 으로 사용 가능한 hotkey list. `HotkeyHintOverlay` 의 새 design-system 컴포넌트 (Design Review 의무).

Phase 1 의 키바인딩 (Cmd+Z / Cmd+S / Cmd+Enter 등) 은 직접 keyboard listener 아닌 mock HotkeyRegistry 의 declarative register 를 통과 — Phase 3 swap 의 단순화 박제.
