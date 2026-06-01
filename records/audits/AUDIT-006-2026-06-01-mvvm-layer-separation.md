# AUDIT-006 — weave MVVM 계층 분리 전수검사 (2026-06-01)

## Metadata

| Field | Value |
|---|---|
| ID | AUDIT-006 |
| Scope | `workspace/weave/apps/web/src/` 전체 (`document/` · `pages/` · `features/` · `launch/` · `dev/`) + weave-local ViewModel |
| Auditor | claude (Opus 4.8) — 2개 general-purpose subagent 병렬 정밀 검토 |
| Date | 2026-06-01 |
| Trigger | 사용자 요청 — "MVVM 패턴 책임 분리 + Model→ViewModel→View 흐름 준수 + View에 비즈니스 로직 혼입 여부" 전수검사 (agocraft + weave) |
| Status | **Active** — 후속 WI 발행 대기 (F-1 / F-2 / F-3 중심, F-4 즉시 처리 가능) |
| Cross-references | [AUDIT-003 agocraft](../../agocraft/records/audits/AUDIT-003-2026-06-01-mvvm-layer-separation.md), [DR-017 editor-vm-context](../decisions/), [DR-023 selection-chrome-ownership](../decisions/DR-023-selection-chrome-ownership.md) |

## 0. 측정 기준 (확립된 아키텍처)

- weave는 `@agocraft/editor`의 `EditorViewModel`(VM)과 `@agocraft/core`(Model)를 소비하는 React 앱.
- **Model** = `@agocraft/core`, `@agocraft/sync`, weave `packages/domain`, `packages/policy-engine`.
- **ViewModel** = `EditorViewModel`(`apps/web/src/document/interactions/editor-vm-context.tsx`의 `useEditorVMOrNull`로 제공) + weave-local `apps/web/src/document/selection-chrome/*-view-model.tsx`.
- **View** = `.tsx` 컴포넌트.
- **흐름**: Model 변경 → VM 파생 → View 렌더; View → intent → VM → Model 변경. 모든 Model 변경은 `editor.exec("weave.*")` 경유.

## 1. 종합 평가

- **전체 판정: SIGNIFICANT VIOLATIONS — 단, `pages/`의 거대 컴포넌트 2개에 국소 집중**
- **구조적 흐름은 거의 완벽.** 검사 범위 내 모든 Model 변경이 `editor.exec` 경유 — Document/History 계약 무손상. 위반은 "Views가 Model을 우회"가 아니라 **"도메인 *계산*의 거주지가 View"** 유형.
- 무거운/테스트된 도메인 수학(align/arrange/vertex 유사도/selectFromHit)은 이미 `document/multi/*.ts`·selection 모듈로 추출됨. 잔여 부채는 **`DesignPage.tsx`(4453줄)와 `FrameStage.tsx`(2430줄)** 에 좌표 투영·배치 기하·트리순회 파생이 인라인으로 남은 것.
- `features/aku`(AI), `use-weave-editor.ts`(Model→VM 배선), selection-chrome `-view-model.tsx`는 모범 수준.

### 강점 (그대로 유지)
- `features/aku/AkuAssistant.tsx` — ephemeral UI 상태만 보유, AI 오케스트레이션 전부 `agent/use-aku-agent.ts` 훅에(reverse-MCP 수명주기·턴 루프·토큰 관리). View↔로직 분리 best-in-class.
- `document/use-weave-editor.ts` — Model→VM 배선이 얇음. "산술은 agocraft, weave 지식만 여기" docblock 명시(L213-225), 변경은 `editor.exec` 프록시 경유(L387-398), 렌더 즉시/영속 디바운스로 소비자 스케줄링 분리(OS Rule 4, L409-434). `changeToPatch` `switch`(L448-485)는 문서화된 단일 Rule-6 예외.
- selection-chrome `-view-model.tsx`는 **진짜 VM**(거짓 라벨 아님). `shape/text/frame-default-view-model.tsx`는 JSX 없는 순수 팩토리, text VM의 mode→dirs는 `Record` 맵(Rule-6 준수).
- `interactions/interaction-mode.tsx`, `selection-context.tsx`는 모든 상태를 VM에 두고 컴포넌트는 signal만 읽는 모범 shim.

## 2. 영역별 판정

| 영역 | 판정 | 비고 |
|---|---|---|
| `features/aku/` | ✅ CLEAN (모범) | AI 로직 전부 훅으로 분리 |
| `document/use-weave-editor.ts` | ✅ CLEAN (모범) | 얇은 Model→VM 배선 |
| `document/selection-chrome/` (VM들) | ✅ CLEAN | 진짜 VM. F-3 (poly-vertex-handle)만 추출 권고 |
| `document/` 컴포넌트 (그 외) | 🟡 MINOR | F-1, F-2 국소 |
| `pages/` (DesignPage, FrameStage) | 🔴 **SIGNIFICANT** | F-1 핵심 |
| `pages/` (그 외: PropertiesPanel, new-design, interaction-rows) | 🟡 MINOR | F-5 |
| `launch/` · `dev/` | ✅ CLEAN | View-local 프레젠테이션만 |

## 3. 발견 사항 (Findings)

### F-1 — `pages/` 거대 컴포넌트에 도메인 계산 인라인 — **HIGH (DesignPage 좌표투영/배치 ✅ 처리완료 2026-06-01 WI-063; FrameStage `nextPanForZoom`/`perceivedLuminance`는 잔여)**
**DesignPage.tsx**
- L925-964 `screenToDesign` / L1067-1109 `designToHost` — 화면↔디자인 좌표 역투영(스케일/원점 back-out, 레터박스 폴백). agocraft가 `toCanonical`/`canonicalToViewport` 소유 → VM projector 또는 `screen-projection.ts`로.
- L986-1057 `computeAddGeometry` — viewport/frame-centered 비율(0.4/0.3), 한 줄 폰트 채움(`fontSizePx = targetHeightPx / TEXT_LINE_HEIGHT`) 등 배치 도메인 규칙 → `add-geometry.ts`로.
- L1192~ `addNewItem` — shape/line/media attrs 조립, "frame일 때만 selected 안에 추가" 컨테이너 규칙, text Auto-width 시딩 등 모델 생성 규칙 → `weave.item.add` 커맨드/`use-add-item` 훅으로.

**FrameStage.tsx**
- (MED) L119-137 `nextPanForZoom` — 카메라 pan-anchor 대수 → 카메라 모듈로.
- (MED) L1014-1042 `perceivedLuminance` — canvas 픽셀 프로브 WCAG 휘도 계산 → `color.ts` util로.

**수정 방향**: 좌표 투영·배치 계산을 페이지에서 VM 또는 순수 `.ts` 모듈로 추출. (모든 변경은 이미 `editor.exec` 경유 — 흐름은 정상, 거주지만 이동.)

### F-2 — `document/` 렌더러·다이얼로그에 도메인 로직 — **HIGH**
- `document/domains/TextBlock.tsx:108-188` — 렌더러가 `ResizeObserver`로 content-fit 비율(`scrollHeight/parentH` 등) 계산 + 임계값(`>=0.0005`) 판정 후 `onUpdate` frame patch dispatch. View가 raw DOM 읽고 도메인 레이아웃 결정 → 측정값만 올리고 commit 판단은 VM이.
- `document/toolbar/MediaSrcDialog.tsx:38-189` — MIME/바이트 한도(`MAX_IMAGE_BYTES`/`MAX_VIDEO_BYTES`) 검증 + 업로드/영속화(`uploadResourceCloud`/`addResource`/`listResources`) 직접 오케스트레이션 → `ingestMedia()` 서비스 + resource-store 훅으로.

### F-3 — `*-view-model.tsx`에 기하학 융합 — **MED ✅ 처리완료 (2026-06-01, WI-063)**
- `document/selection-chrome/poly-vertex-handle.tsx:85-262` — computed-style 행렬에서 회전 복원(`frameGeom`/`rotationOf`), 화면↔로컬 회전기저 변환, 복소수 유사 endpoint 스케일링, `refitFrameToPoints`가 `<button>` 렌더 클로저(L298-388)와 같은 `.tsx`에 융합. 변경은 `editor.exec` 경유라 Model 우회 아님 — 테스트성/분리 문제.
- **수정**: 순수 기하학을 `poly-vertex-geometry.ts`로 추출, `.tsx`엔 핸들 spec + 드래그 배선만.

### F-4 — 죽은 코드 (Decommission Sweep 대상) — **HIGH ✅ 처리완료 (2026-06-01)**
- `pages/FrameStage.tsx:139-158 `_resizeFrame` — 정의만 있고 참조 0건(grep 확인). gesture 바인딩 리팩터 잔재.
- **처리**: 삭제 완료. Decommission Sweep 규칙대로 end-to-end로 연쇄 고아까지 제거 — `_resizeFrame`(함수) + `_ALL_HANDLES`(L100, 동일 클래스 죽은 상수) + `MIN_FRAME`(L101, `_resizeFrame` 전용) + `HandleDir` import(L33, 위 둘 전용). 총 25줄 삭제. `ItemFrame` import는 타 사용처 다수로 유지. `apps/web typecheck` exit 0 / 잔여 참조 0건 검증.

### F-5 — 그 외 페이지/document 잔여 — **MED / LOW**
- (MED) DesignPage `collectFocusGateIds`(L261-294, 트리순회 dim/isolate 세트), `selectedKind`/`multiSameParent`(L1768-1807, VM이 파생해야 할 상태를 페이지 `useMemo`가 재계산), `reorderChildrenInContainerViaEditor`(L713-747, 순열병합), `ArrangePreviewOverlay` AABB(L3866-3905, 커밋 수학은 추출됐으나 프리뷰 기하만 인라인).
- (MED) `document/toolbar/sections/text-section.tsx:347-428` — px↔% 폰트 단위 변환 → `weave.text.setFontSize` 커맨드로.
- (MED) `document/marquee/MarqueeSelectionLayer.tsx:87-205` — `rectsIntersect` 마퀴 히트테스트 → 순수 헬퍼/VM 쿼리로.
- (MED) `pages/new-design/NewDesignWizard.tsx:91-113` — Design 생성+영속화 인라인 → `use-create-design` 훅으로.
- (LOW) `document/toolbar/sections/shape-section.tsx:56-99 `defaultSubAttrsForKind`(서브종류별 기본 기하 팩토리) → `@agocraft/core` 팩토리로. `domains/VideoBlock.tsx:24-49` trim 루프(미디어 playback 정책). DesignPage `swatchFor`/`labelFor`(kind→색/라벨 매핑). PropertiesPanel `describeInteraction` `switch`(읽기전용 라벨).

## 4. 후속 작업 권고

| 우선순위 | 항목 | WI 후보 |
|---|---|---|
| ~~P0~~ ✅ | ~~F-4 `_resizeFrame` 삭제 (Decommission Sweep, 안전)~~ → **완료 2026-06-01** (+`_ALL_HANDLES`/`MIN_FRAME`/`HandleDir` 연쇄 제거, 25줄) | — |
| P1 | F-1 DesignPage 좌표 투영(`screenToDesign`/`designToHost`) + 배치 계산(`computeAddGeometry`/`addNewItem`) 추출 | WI 발행 |
| P1 | F-2 TextBlock auto-resize VM 이관 + MediaSrcDialog ingest 서비스 분리 | WI 발행 |
| P2 | F-3 poly-vertex 기하학 모듈 분리, F-5 잔여 추출 | WI 발행 |

이 audit은 후속 작업이 active로 전환될 때 `records/work-items/WI-NNN-*.md`로 발행하고 본 줄에 cross-link한다(이력 보존). 단 F-4는 WI 없이도 처리 가능한 dead-code 제거.
