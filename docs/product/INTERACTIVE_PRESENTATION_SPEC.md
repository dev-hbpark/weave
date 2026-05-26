# Mixed 디자인 + 인터랙티브 프레젠테이션 — Product Spec

> **⚠️ Selection model 박제 supersede (2026-05-26, WI-033 / DR-017)**
>
> 본 문서의 **편집 모드 selection / drill-in / breadcrumb 관련 박제**는 `docs/product/FIGMA_SELECTION_MODEL_SPEC.md` 가 SSOT 로 supersede 했다. 영향 섹션 = §4.1 (entered frame), §4.2 (enteredFrameId 의존), §4.5 (ContextMenu "Enter frame"), §6.1 (breadcrumb layout), §6.3 (double-click drill-in 인터랙션), §6.4 (Enter hotkey 의 drill-in 의미), §6.5 (drill-in zoom transition), §7 (Phase 12c v0 roadmap). 각 섹션에 `[DEPRECATED WI-033]` 마킹.
>
> **유지되는 부분**: §3 (Frame nesting + ratio coord), §4.3 (manipulation handles), §5 (Present 모드의 camera transition — storytelling zoom 은 별건), §8 (안 함 list — *"drill-in 없이"* 가 정통 paradigm 임을 본 deprecation 이 확정).

| Field | Value |
|---|---|
| Status | **Living spec** (Phase 9~12 의 paradigm drift 정리. selection model 박제는 WI-033 / DR-017 로 supersede → `FIGMA_SELECTION_MODEL_SPEC.md`) |
| Owner | hbpark |
| Last update | 2026-05-26 (drill-in deprecation 마킹) |
| Triggers update | paradigm 결정 / 새 인터랙션 추가 / 도메인 추가 |
| Source WIs | WI-001 (kickoff), WI-009 (interactive presentation PoC), WI-013 (agocraft swap), WI-033 (Figma selection 흡수 + drill-in 폐기) |

---

## 0. 이 문서가 존재하는 이유

WI-013 Phase 9~12 에서 paradigm 이 4 차례 흔들렸다 — sub-doc → drill 없는 Figma frame → 절대 px design plane + manipulation + zoom drill-in. 이는 **product spec 부재의 결과**다. 이 문서는 향후 build phase 가 참조할 single source of truth 다. 코드보다 이 문서가 먼저, 변경은 여기서 시작.

---

## 1. 문제 정의 (Why now)

### 1.1 현재 시장의 분할

| 도구 | 강점 | 약점 |
|---|---|---|
| PowerPoint / Google Slides | linear slide, ease-of-use | 자유 spatial 구조 없음, interactivity 빈약 |
| Figma | 자유 frame nesting, design 강력 | presentation 의 storytelling 모드 약함, 비-디자이너 진입장벽 |
| Notion | 블록 doc, database, ease-of-use | spatial 자유도 없음, presentation 의 zoom storytelling 부재 |
| Miro / Mural | 자유 whiteboard, 협업 | 도메인 (slide / doc) 혼합 약, presentation 모드 약 |
| **Prezi** | spatial zoom canvas, camera path storytelling | 도메인 혼합 부족 (spatial canvas only), edit 시 messy |
| **Genially** | interactivity (hotspot, popup, trigger) 강력 | spatial zoom 부재 (page-based), 4 도메인 native 부재 |

### 1.2 weave 의 USP

> **Prezi 의 spatial zoom + Genially 의 interactivity + Notion/Figma/PPT 의 도메인 혼합 — 한 도구로.**

업무 팀이 한 캠페인 / 한 제안서 / 한 기획 안에서 slide · canvas · doc · media 를 한 캔버스에 자유 배치하고, 그 결과물을 zoom + interactivity 가 있는 storytelling 으로 발표할 수 있다.

---

## 2. 레퍼런스 분석

### 2.1 Prezi — spatial zoom canvas

핵심:
- **Infinite canvas**: 모든 콘텐츠가 한 큰 평면에 spatial 하게 배치
- **Camera path**: 카메라가 다음 위치로 zoom in/out + pan 으로 transition — 키 인터랙션이 *zoom* 자체
- **Topics / Subtopics**: hierarchy 가 visual nesting (큰 frame 안에 작은 frame). zoom in 하면 detail 보임
- **Smart branches**: 비-linear branching (hotspot click → 다른 topic 으로 jump)
- **Reveal**: step 별로 표시되는 element

배워올 것:
- Spatial canvas + zoom transition paradigm
- 도큐먼트의 hierarchy 가 visual hierarchy 와 일치 (frame nesting)
- camera-target = "이 위치를 그 step 의 카메라 안착 위치로"

피해야 할 것:
- edit 시 위치 자유도가 messy 함 (사용자가 spatial 인식 부담)
- 도메인이 사실상 "slide-as-frame" 만 — 텍스트 블록 도큐먼트 부재

### 2.2 Genially — interactive layer

핵심:
- **Interactive elements**: hotspot, button, label, tooltip, popup
- **Triggers**: click / hover / on-load → action
- **Actions**: navigate, reveal, external link, audio/video play, animation
- **Layered editing**: page 위 element 자유 배치 (Figma-like 자유도)
- **Templates**: presentation, quiz, escape-room, infographic 등 시나리오별

배워올 것:
- Interactivity 의 모듈화 — element / trigger / action 의 분리
- Genially 의 hotspot 모델 = weave 의 `HotspotBehavior` (action: next-camera / jump-camera / reveal / external)
- reveal-on-step 패턴 (이미 박제됨)
- 향후 추가: hover trigger, button trigger, audio/video autoplay

피해야 할 것:
- page-based 구조 (linear). spatial zoom 부재
- 4 도메인 native 부재 — 모든 게 흰 페이지 위 element

### 2.3 weave 의 합성

| 차원 | Prezi | Genially | weave |
|---|---|---|---|
| Spatial zoom | ✓ | × | ✓ |
| Frame hierarchy nesting | ✓ | × | ✓ (무제한) |
| Interactive hotspot | △ | ✓ | ✓ |
| Trigger 종류 | click | click / hover / on-load | click + step + (future hover) |
| 4 도메인 native | × | △ (page) | ✓ (slide / canvas / doc / media) |
| Document blocks (Notion-style) | × | × | ✓ |
| Linear + non-linear hybrid | △ | ✓ | ✓ |
| 실시간 collab | × | × | future (M3+) |

---

## 3. 핵심 모델

### 3.1 계층

```
Design                  ← 절대 px (width × height) — "캔버스 크기"
  └─ Document           ← AgocraftDocument, root 의 weave-doc Item
       └─ Frame (=도메인 Item)       ← attrs.frame (0..1 ratio of parent)
            └─ Frame (nested)        ← 부모 frame 안에서 또 0..1 ratio
                 └─ Frame (n-level)  ← 무제한 깊이
       └─ presentationOrder[]        ← frame id 순서 (parent-child tree 와 독립)
```

핵심 규칙:
- **Design 은 슬라이드가 아니다** — 캔버스(컨테이너)일 뿐. presentation 대상에서 제외.
- **모든 Frame 은 동등하다** — 4 도메인 (slide / canvas-design / block-doc / media) 이 visual 만 다른 Frame.
- **Frame 의 좌표는 부모 대비 0..1 ratio** — 부모 크기 변경 시 자동 비례 반응.
- **frame.children 은 무제한 nesting** — frame 안에 frame, 그 안에 또 frame.
- **presentationOrder 는 tree 와 독립** — 가장 깊은 frame 이 첫 슬라이드일 수 있음.

### 3.2 4 도메인의 visual identity

| 도메인 | visual identity | 의도된 사용 시나리오 | 자식 frame 가능 |
|---|---|---|---|
| **slide** | full-bleed, 텍스트 중심 (title + bullets) | "이 한 페이지가 한 메시지" — PPT 의 1 slide | ✓ (slide 안에 canvas 도) |
| **canvas-design** | 자유 shape 배치 (rect / image / sticker) | Figma 캔버스, 인포그래픽, 자유 layout | ✓ (canvas 안에 doc 도) |
| **block-doc** | 텍스트 블록 stack (heading + paragraphs + list) | Notion 페이지, 긴 호흡의 narrative | ✓ |
| **media** | 이미지 / 비디오 + caption | 인터뷰 영상, 데모 footage, 강조 이미지 | ✓ (media 위에 slide overlay 도) |

→ "slide 안에 canvas 가 들어가는 게 가능" 이 핵심. PPT 와 Figma 와 Notion 이 **같은 좌표계** 안에서 cohabit.

### 3.3 Frame Flavor (Design 의 layout 힌트)

| Flavor | 첫 layout | suggestedKinds | 시나리오 |
|---|---|---|---|
| **mixed** | 빈 canvas (Figma 식) | 4 도메인 모두 | 자유 — 가장 일반 |
| **slide-deck** | 첫 slide FULL_FRAME | slide / canvas / doc / media | sequential presentation |
| **canvas-board** | 첫 canvas FULL_FRAME | canvas / media / slide / doc | 화이트보드, 인포그래픽 |
| **doc-page** | 첫 doc FULL_FRAME | doc / media / slide / canvas | Notion-style narrative |

Flavor 는 **편집 시작점**의 제안일 뿐 — Frame 자체에는 강제 없음. 의도된 시나리오 외 사용 가능.

---

## 4. 편집 모드 — 인터랙션 모델

### 4.1 view 상태 — [DEPRECATED WI-033 / DR-017]

> ⚠️ **본 §4.1 의 "entered frame" 박제는 WI-033 / DR-017 로 supersede.** 편집 모드의 view 상태는 **selection state 만**. `enteredFrameStack` / drill-in zoom / breadcrumb 폐기. 새 SSOT = `FIGMA_SELECTION_MODEL_SPEC.md` §1, §2.

| 상태 | 진입 trigger | 카메라 위치 | 편집 대상 (Add target) |
|---|---|---|---|
| **root view** | 기본 / Esc (deselect) | 사용자 명시 zoom 만 (Ctrl+Wheel / Zoom controls) | root.children |
| **selected frame** | frame click (A1 parent-first) | unchanged | 그 frame 의 children (`selectedFrameId ?? root`) |
| ~~entered frame~~ | ~~frame 더블클릭 / ContextMenu "Enter frame"~~ | ~~drill-in zoom~~ | ~~enteredFrameId.children~~ |

규칙:
- selected ≫ root
- Esc → deselect
- frame 의 hierarchy 깊은 곳은 A2 Cmd-click 또는 A4 Layer Picker 또는 A3 Enter hotkey 로 접근

### 4.2 Add 인터랙션 (frame 생성) — [PARTIAL UPDATE WI-033]

- **Toolbar Dropdown "+ Add" click**: ~~enteredFrameId ?? ~~ selectedFrameId ?? root 의 자식. flavor 별 frame 위치 결정 (mixed/canvas-board = center {0.4,0.4,0.2,0.2}, slide-deck/doc-page = FULL_FRAME).
- **Drag-to-add tile drag → 대상 frame drop**: 그 frame 의 자식 + drop 좌표 frame 박제. mime type `application/x-weave-add-kind`.

### 4.3 frame manipulation (도형 처럼)

선택된 frame 에 SelectionLayer overlay:
- **8 resize handle** (n / ne / e / se / s / sw / w / nw) — corner-anchored math, MIN_FRAME = 0.02
- **Rotate handle** — frame center 기준 atan2 각도 변경
- **Move handle** (body 의 inset-0) — frame.x / y 갱신
- drag delta (viewport px) → parent rect 대비 0..1 ratio → `editor.exec("weave.item.update", { itemId, patch: { ..., frame: nextFrame } })`
- History 통합 — Cmd+Z / Cmd+Shift+Z, historyMergeWindowMs = 500 으로 drag 1 step

### 4.4 inline edit

- **slide**: title + bullets EditableText. Enter 로 bullet add, Backspace 로 remove
- **block-doc**: heading + paragraphs EditableText. Enter 로 paragraph add
- **media**: caption EditableText, tone toggle (image ↔ video)
- **canvas-design**: summary EditableText + 안의 shape 직접 manipulation (별도 SelectionLayer)

### 4.5 ContextMenu (frame 의 right-click) — [UPDATED WI-033]

> ⚠️ "Enter frame" 항목은 **WI-033 / DR-017 로 폐기**. 대신 **Layer Picker** (A4) 가 ContextMenu 상단에 mount. SSOT = `FIGMA_SELECTION_MODEL_SPEC.md` §5.

- **Select layer** (Layer Picker, A4) — 커서 아래 overlapping frame/item list, depth 순. 클릭 시 selection 이동
- ~~Enter frame — drill in (zoom 진입)~~ ← 폐기 (WI-033)
- **Delete frame** — danger 표시 + Cmd+⌫
- **Duplicate** — future (frame + children 복제, frame.x 약간 offset)
- **Move up / down** — future (parent.children 의 order 변경)

### 4.6 Selection / Add 의 가드 (현재 박제됨)

`NestedFrame outer onClick` 의 guard:
- `[data-shape-id]` 안 → shape select, frame deselect
- `[data-selection-layer]` 안 → SelectionLayer handle 자체, frame select 변화 없음
- `[contenteditable=true]` / `input,textarea` 안 → inline edit, frame select 변화 없음
- 그 외 → frame select

→ 의도: **inner element 가 우선 동작**, frame outline 영역 click 만 frame select.

---

## 5. 프레젠테이션 모드 (Present)

### 5.1 step list

- **source**: `design.presentationOrder` — frame id sequence (parent-child tree 와 독립)
- **derived**: `effectivePresentationOrder(design)` 가 reconcile + 누락 frame append
- **rule**: Design root 제외 — frame 만
- **user control**: 하단 ThumbnailPanel 에서 drag reorder

### 5.2 camera transition (Prezi 스타일)

각 step 의 카메라:
- entry frame 의 **absolute frame** 계산 (trail walk: 각 ancestor frame 의 attrs.frame 곱)
- camera position = (absX + absW/2, absY + absH/2) — frame center
- camera scale = 1 / max(absW, absH) — frame 이 viewport 가득

transition:
- design plane 의 `transform: translate(...) scale(...)` 갱신
- 520ms cubic-bezier(0.34, 1.20, 0.64, 1) — spring-like ease
- prefers-reduced-motion 시 즉시 swap

### 5.3 interactive elements (Genially 스타일)

현재 박제됨 (`InteractionBehavior`):

| Behavior | 의미 | trigger | action |
|---|---|---|---|
| `camera-target` | step 의 카메라 위치 (현재는 frame center 자동) | step 진입 | viewport 이동 |
| `hotspot` | frame 안의 region | click / hover | next-camera / jump-camera / reveal / external |
| `reveal-on-step` | step ≥ N 일 때만 표시 | step 진입 | element visibility |

향후 추가:
- **button-trigger** (Genially 의 button) — region 아닌 element 자체에 박제
- **hover-effect** — hover 로 reveal / highlight
- **animation** — entrance animation (fade / slide / zoom)
- **audio / video autoplay** — step 진입 시 자동 재생
- **branch** — 다중 분기 (Prezi smart branch)

### 5.4 navigation

| 입력 | 동작 |
|---|---|
| ← / → | 이전 / 다음 step |
| Space / Enter | 다음 step |
| 1~9 | 그 번호 step 으로 jump |
| hotspot click | hotspot 의 action 실행 |
| ThumbnailPanel tile click | 그 step 으로 jump (present 안에서도 표시) |
| Esc / close button | 편집 모드로 |

### 5.5 mode 전환

- **편집 → present**: Toolbar 의 `Present` button → `/design/:id/present` navigate
- **present → 편집**: Esc 또는 close button → `/design/:id` navigate

---

## 6. UX 패턴 — Prezi / Genially 참고

§3~§5 가 paradigm (model + interaction) 의 정의라면, 이 § 는 그 paradigm 이 **화면에서 어떻게 나타나는지** 의 정의. Prezi 와 Genially 의 검증된 UX 패턴을 weave 의 multi-domain 컨텍스트에 맞춰 적용.

### 6.1 화면 layout

```
┌─────────────────────────────────────────────────────────────┐
│  Header                                                       │
│   [weave] / [design title]   (entered breadcrumb 폐기 WI-033)  │
│   ··· Toolbar ··· [Present ▶] [Theme Switcher]                │
│   Drag-to-add row · [+slide] [+canvas] [+doc] [+media]        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│              FrameStage (design plane)                        │
│              ─────────────────                                │
│              ┌─ Frame A ──────────────┐                       │
│              │  ┌─ nested Frame ──┐   │                       │
│              │  └─────────────────┘   │                       │
│              └────────────────────────┘                       │
│              ┌─ Frame B ──────────────┐                       │
│              └────────────────────────┘                       │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│  ThumbnailPanel (fixed bottom)                                │
│   [Frame A] [Frame B] [Frame C] ←→ drag reorder               │
└─────────────────────────────────────────────────────────────┘
```

| Zone | 역할 | 레퍼런스 |
|---|---|---|
| **Header — left** | weave logo + ~~breadcrumb (design title / entered frame)~~ design title 만 (entered breadcrumb 은 WI-033 으로 폐기) | Prezi 의 좌상단 path indicator |
| **Header — center / right** | Toolbar (Undo/Redo/Add menu) + Present button + Theme | Genially 의 상단 toolbar |
| **Drag-to-add row** | 4 도메인 draggable tiles (= "+slide", "+canvas", "+doc", "+media") | Genially 의 우측 insert panel — weave 는 horizontal row (drill 이 없으므로 좌우 공간 여유) |
| **FrameStage** | design plane, 모든 frame frame-in-frame 으로 표시 | Prezi 의 spatial canvas |
| **ThumbnailPanel** | fixed bottom, frame thumbnails, drag reorder, click select | Genially 좌측 page navigator 의 가로 변형 (slide-deck flow) |
| **ContextMenu** | right-click on frame → Layer Picker (overlapping nested frames) + Delete + future Duplicate / Move (WI-033: Enter frame 폐기) | Figma + Genially 양쪽 표준 |

향후 추가 zone (v1):
- **Right panel (Properties)** — selected frame 의 attrs / interactions 편집. Genially 의 interactive trigger panel 영감.
- **Left rail (Mini-nav)** — design tree (frame hierarchy) sticky thumbnails. Selection 변경 시에도 visible (drill-in 폐기 WI-033, selection model 만으로 navigate).
- **Zoom controls** — 우하단 fit / 100% / + / − 버튼. Prezi / Figma 표준.

### 6.2 편집 워크플로 (의도된 user journey)

```
Landing
   │
   ▼
"Start a new design" CTA
   │
   ▼ (modal)
NewDesignWizard
   ├─ title 입력
   ├─ flavor 선택 (mixed / slide-deck / canvas-board / doc-page)
   └─ size 선택 (16:9 / 4:3 / A4-p / A4-l / square / custom)
   │
   ▼ (saveDesign + navigate)
DesignPage — root view
   ├─ flavor 별 첫 frame seeded (mixed 는 빈 canvas)
   │
   ├─→ Toolbar "+ Add" → 새 frame at center / FULL_FRAME (flavor 따라)
   ├─→ Drag-to-add tile → 임의 frame 에 drop → drop 좌표 frame
   ├─→ Frame click → A1 parent-first auto-select / A2 Cmd-click deep
   ├─→ Frame right-click → ContextMenu (Layer Picker if overlapping / Delete / future Duplicate)
   ├─→ Frame double-click → A1 drill-down selection (no zoom, WI-033)
   ├─→ A3 keyboard nav (Enter/Shift+Enter/Tab/Shift+Tab) → drill-down/up + sibling cycle
   │
   ├─→ ThumbnailPanel → drag reorder presentationOrder
   │
   └─→ Toolbar "Present" → /design/:id/present
        ├─ keyboard ← → 으로 step navigation
        ├─ hotspot click → action (next-camera / jump / reveal / external)
        └─ Esc → 편집 모드로
```

### 6.3 인터랙션 패턴 — 어떤 입력이 무엇을 의미하나

| 입력 | 대상 | 의미 |
|---|---|---|
| **left-click on frame outline** | empty area / frame chrome | select frame |
| **left-click on frame body** | inner element 위 | 그 element 의 native action (text edit / shape select / link) |
| **left-click on stage background** | design plane 의 빈 영역 | deselect |
| **double-click on frame** | frame chrome | drill-down selection (Enter hotkey 의 mouse alternative — **no zoom**, WI-033) |
| **right-click on frame** | frame chrome | ContextMenu (Layer Picker if overlapping nested frames / Delete / future Duplicate / Move; WI-033) |
| **drag on selected frame's Move handle** | frame body inset | move frame |
| **drag on selected frame's 8 handles** | corner / edge | resize frame (corner-anchored) |
| **drag on selected frame's Rotate handle** | top stem | rotate frame |
| **drag on drag-to-add tile → drop on frame** | tile → frame | add child frame at drop position |
| **drag on drag-to-add tile → drop on stage** | tile → empty | add at root container |
| **drag on ThumbnailPanel tile → drop on another tile** | tile reorder | swap presentationOrder |
| **click on ThumbnailPanel tile** | tile | select that frame (no drill) |
| **Toolbar "+ Add" click → kind** | menu item | add frame at center / FULL_FRAME (current container) |

### 6.4 단축키 (keyboard shortcuts)

| Shortcut | 동작 | scope |
|---|---|---|
| **Cmd/Ctrl + Z** | undo (도형 drag 포함, 1 step 으로 merge) | 편집 모드 |
| **Cmd/Ctrl + Shift + Z** | redo | 편집 모드 |
| **Esc** | (a) 편집: deselect / cancel inline edit (~~exit entered frame~~ 폐기 WI-033) (b) present: → 편집 모드로 | 양쪽 |
| **Backspace / Delete** | selected frame 또는 shape 삭제 (text input 안에서는 native) | 편집 모드 |
| **← / →** | present step navigation | 프레젠테이션 |
| **Space / Enter** | next step | 프레젠테이션 |
| **1 ~ 9** | 그 번호 step 으로 jump | 프레젠테이션 |
| **Enter** (frame selected 시) | drill-down selection 1 level (WI-033 A3, **no zoom**) | 편집 모드 |
| **Shift+Enter** | drill-up selection 1 level (WI-033 A3) | 편집 모드 |
| **Tab / Shift+Tab** | next / prev sibling selection (WI-033 A3) | 편집 모드 |
| **Cmd/Ctrl + Click on frame** | deep select to leaf (WI-033 A2) | 편집 모드 |

### 6.5 visual 의 의도 — Prezi / Genially / Figma 의 차용

| 패턴 | weave 채택 | 출처 |
|---|---|---|
| **Aurora glass + 3 theme** (Aurora / Vivid / Midnight) | ✓ (DR-001) | Genially 의 강한 visual identity / Figma 의 design system |
| **Frame outline = 1px subtle** (selected 시 2px accent) | ✓ | Figma frame outline 패턴 |
| **선택 시 SelectionLayer 의 8 handles + rotate stem** | ✓ | Figma + Genially 의 공통 표준 |
| ~~**drill-in zoom transition** (cubic-bezier spring)~~ | ~~✓~~ → **Present 모드 한정 (PresentPage camera transition)**, 편집 모드는 폐기 (WI-033) | Prezi 의 시그니처 — present 모드의 storytelling zoom 으로만 유지 |
| **ContextMenu (right-click on frame)** | ✓ | Figma / Genially 양쪽 표준 |
| **fixed bottom thumbnail panel** | ✓ | Genially 좌측 navigator 의 가로 변형 |
| **Drag-to-add tiles** | ✓ | Genially 우측 insert panel 의 horizontal 변형 |
| **prefers-reduced-motion** 시 transition 즉시 swap | ✓ | a11y 표준 |

### 6.6 프레젠테이션 모드의 UX

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│              [zoomed Frame visual]                            │
│              ──────────────────                               │
│                                                               │
│              (hotspot button overlay)                         │
│                                                               │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│   1 / 5  ← →            [theme]              [✕ exit]         │
└─────────────────────────────────────────────────────────────┘
```

- **PresentChrome 하단** — step counter + prev/next + exit button. 보통 hover/keyboard 활성 시 visible.
- **fullscreen 진입** (future): brower fullscreen API + Esc fallback.
- **transition**: 카메라 spring 520ms cubic-bezier(0.34, 1.20, 0.64, 1).
- **fallback**: 카메라 target 없는 frame 도 step 으로 (frame center auto-fit).
- **hotspot 시각**: 기본은 visible (semi-transparent button). future: hide-until-hover 옵션.
- **reveal-on-step**: 해당 step 도달 전까지 frame 의 hotspot/element 가 visually fade-out 또는 hidden.

### 6.7 onboarding UX

현재 (v0):
- Landing 의 "Start a new design" CTA → wizard 단일 모달.
- wizard 의 flavor / size 선택 → 첫 frame seeded.
- empty state: "Empty design — use the + Add menu in the toolbar to drop a frame."

향후 (v1):
- **template gallery** — flavor + scenario (proposal / pitch / report / brainstorm) 별 starter.
- **first-run tooltip tour** — Toolbar → drag-to-add → drill → ThumbnailPanel → Present 의 4 step 가이드.
- **example design** — 신규 user 의 첫 design 으로 walkthrough sample seed (스킵 가능).

### 6.8 가시성 / 접근성 (a11y)

- **prefers-reduced-motion**: 모든 transition 즉시 swap (이미 박제).
- **focus ring**: 모든 button / handle / textbox 에 `focus-visible:[box-shadow:var(--focus-ring)]` (design system 표준).
- **aria-label**: SelectionHandle 의 "Resize n / ne / ..." / "Move selection" / "Rotate selection" 박제됨.
- **role**: `Toolbar` 의 `role="toolbar"`, ContextMenu 의 Radix `role="menu"` 표준.
- **keyboard navigation**: 모든 인터랙티브 element 가 Tab 로 reachable + Enter / Space 로 활성.
- **contrast**: 3 theme 모두 WCAG AA — Aurora/Vivid/Midnight 의 token 검증.

### 6.9 향후 UX 결정의 기준

새 UX 패턴 추가 시:
1. **Prezi / Genially 의 검증된 패턴 우선 차용** — 새로 발명하지 말 것.
2. **multi-domain context 에 fit 한지 검증** — Prezi 의 spatial-only 패턴은 그대로 안 적합, Genially 의 page-based 패턴도 그대로 안 적합. weave 의 Frame 모델에 맞춰 변형.
3. **paradigm 충돌 시 §7 (안 함) 갱신** — 안 하기로 한 패턴은 명시.
4. **§6.3 의 인터랙션 표 갱신** — 새 입력 패턴 박제.

---

## 7. Phase 별 roadmap

### v0 (현재, Phase 12 까지 완성)

- [x] Design + Frame + n-level nesting + 0..1 ratio
- [x] FrameStage absolute px design plane + ResizeObserver scale (Phase 12a)
- [x] frame manipulation 8 handles + Rotate + Move (Phase 12b)
- [~~deprecated WI-033~~] ~~drill-in zoom + breadcrumb + Esc / segment click exit (Phase 12c)~~ → WI-033 / DR-017 으로 폐기. 편집 모드의 navigation 은 selection 만 (`FIGMA_SELECTION_MODEL_SPEC.md`)
- [x] ThumbnailPanel + drag reorder + Design 제외 (Phase 12d)
- [x] Toolbar Present button (Phase 12d)
- [x] camera-target / hotspot / reveal-on-step 박제 (WI-009)

### v1 — interactive 강화

- [x] hover trigger / button trigger / Genially 식 모듈화 (Phase 13d-1+2+4 — HoverEffectBehavior {highlight/dim-others/reveal} + ButtonTriggerBehavior + PresentPage 적용)
- [x] entrance animation (fade / slide / zoom) (Phase 13d-1+2+3 — EntranceAnimationBehavior + PresentScene 의 Web Animations API)
- [ ] audio / video autoplay
- [x] hotspot region 의 visual editor (Phase 13c-1+2 — number-input + frame 안 drag overlay)
- [x] camera-target 의 수동 위치 / scale 설정 (Phase 13b — manual flag + PropertiesPanel x/y/scale)
- [ ] Branch (Prezi smart branch) — 다중 분기 path
- [ ] Sticker / icon library
- [ ] Properties panel 의 layout polish — collapsible / resize / nested interaction grouping

### v2 — 협업 + 공유 + 템플릿

- [ ] 실시간 collab (Yjs / Liveblocks) — M3+
- [ ] public share link (read-only present mode)
- [ ] template library — flavor 별 / scenario 별
- [ ] export (PDF / video / standalone HTML)
- [ ] embed widgets — Google Map / YouTube / Spotify

---

## 8. 명시적으로 *하지 않는* 것

향후 paradigm drift 방지를 위해 명시:

- **slide 와 frame 의 1:1 매핑 안 함** — slide 는 한 도메인 (visual style), 모든 frame 이 slide 후보
- **drill-in 없이 한 화면에 모두 표시** — Figma 식 spatial, Notion 식 page navigation 아님 ← **정통 paradigm (WI-033 / DR-017 로 확정)**. 편집 모드의 navigation 은 selection 만. Present 모드의 storytelling zoom 은 별건 유지
- **Design 자체를 슬라이드로 취급 안 함** — Design 은 캔버스
- **linear-only 또는 spatial-only 양자택일 안 함** — 둘 다 지원 (presentationOrder + frame nesting)
- **자체 design system 안 함** — `@weave/design-system` 의 aurora / vivid / midnight theme 사용
- **모바일 편집 미지원 (M2 까지)** — desktop 전용. 모바일 view-only
- **PPT / Figma 호환 import 안 함 (M4 까지)** — weave 만의 paradigm

---

## 9. 변경 의 책임

- 이 문서가 single source of truth. 코드 paradigm 변경 시 이 문서 우선 갱신 → 코드.
- 새 interaction kind 추가 시 §5.3 의 표에 추가.
- 새 도메인 kind 추가 시 §3.2 의 표에 추가.
- 새 UX 패턴 추가 시 §6.3 의 인터랙션 표 + 필요 시 §6.1 의 layout 갱신.
- Phase 새 완성 시 §7 의 roadmap 의 checkbox 갱신.
- 사용자 명시로 paradigm 변경 시 (Phase 9~12 와 같은 케이스) 이 문서의 해당 절을 *먼저* 갱신, 그것을 reference 로 build.

---

## Appendix A — 박제된 핵심 코드 위치

| 컴포넌트 | 역할 | 파일 |
|---|---|---|
| `DesignPage` | 편집 모드 의 chrome | `apps/web/src/pages/DesignPage.tsx` |
| `FrameStage` | design plane + NestedFrame recursion + zoom transform | `apps/web/src/pages/FrameStage.tsx` |
| `ThumbnailPanel` | 하단 패널 + drag reorder | `apps/web/src/pages/ThumbnailPanel.tsx` |
| `PresentPage` | 프레젠테이션 모드 + Stage camera | `apps/web/src/pages/PresentPage.tsx` |
| `useDesign` | Design 상태 + Command target | `apps/web/src/document/use-design.ts` |
| `presentation-order.ts` | collectPresentationIds / reconcile / reorder | `apps/web/src/document/presentation-order.ts` |
| `agocraft-mirror.ts` | applyChangeToDocument reducer + findItemDeep / findTrailDeep | `apps/web/src/document/agocraft-mirror.ts` |
| `commands.ts` | `weave.*` editor command set | `apps/web/src/document/commands.ts` |
| `interactions/` | InteractionAdapter + registry (camera-target / hotspot / reveal-on-step) | `apps/web/src/document/interactions/` |

## Appendix B — 관련 records

- **WI-001** — service kickoff (multi-domain workspace USP)
- **WI-009** — interactive presentation PoC (camera-target / hotspot / reveal-on-step 박제)
- **WI-013** — agocraft Document swap (Phase 1~12 의 모든 paradigm 작업)
- **FR-001** — feasibility (FEASIBLE WITH TRADE-OFFS)
- **DR-design-005** — editor chrome primitives (Dialog / RadioTile / Toolbar / ContextMenu / DropdownMenu / IconButton)
