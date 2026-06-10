# Engineering Plan — EditorModeContext (WI-166 / DR-114)

흩어진 모드 분기(isArtboardId, visibleFrameIds, infiniteCanvas, contextRootId,
defaultContainer, 레일 prop 삼항, FSM 게이트 하드코딩)를
`EDITOR_MODES: Record<CanvasMode, (refs) => EditorModeContext>` 레지스트리
1곳의 **정책 합성**으로 통합한다. 아키텍처·근거·SOLID/GRASP 리뷰는
`records/decisions/DR-114-editor-mode-context.md`가 진실 원천이다 — 이 문서는
실행 순서와 게이트만 담는다.

## 디렉토리 구조 (목표)

```
apps/web/src/document/editor-mode/
  types.ts          EditorModeContext + 7개 정책 인터페이스 + ModeStateRefs
  registry.ts       EDITOR_MODES (Rule 6 레지스트리, 모드당 1행)
  modes/
    infinite.ts     composeInfiniteMode(refs) — 조각 조립만
    page-bounded.ts composePageBoundedMode(refs)
  pieces/
    hit-resolution.ts   parentFirstFrom(rootId), deepestMovable — 순수 함수
    item-roles.ts       roleOf 조각 + ROLE_CAPABILITIES 테이블
    view-frames.ts      allTopFrames / activePageOnly
    camera-fit.ts       fitAllFrames / fitActivePage (WI-157 pageFitBox 흡수)
  EditorModeProvider.tsx  React 경계 1파일 (Provider + useEditorMode + ctxRef)
```

원칙(전 phase 공통):

- 정책은 **순수 data+함수** — `editor-mode/`(Provider 제외)에 React import
  금지, puritycheck 경로 포함.
- liveness는 단일 `ModeStateRefs`(activePageId ref, doc ref) — deps-[]
  제스처 클로저가 stale 없이 읽는다.
- 소비처에서 `ctx.mode ===` 인라인 비교 금지 — 분기가 필요하면 그 분기는
  정책 필드가 되어야 한다는 신호.
- **디커미션 스윕은 각 phase의 같은 변경에서** — 흡수된 술어/prop/분기를
  남겨두면 진실 원천이 둘이 된다.

## Phase 1 — RolePolicy (행동 동일)

1. `types.ts` + `registry.ts` + 두 합성 파일 골격 + `EditorModeProvider`.
2. `RolePolicy.roleOf(doc, id)` + `ROLE_CAPABILITIES`:
   - infinite: 모든 아이템 `element` (stage 없음).
   - page-bounded: root-direct frame = `stage`(이동/리사이즈/회전/삭제 불가,
     navigable 제외, hover 억제, quickActions 억제, selectable "deep-only" —
     WI-163 Cmd 딥클릭 escape hatch 보존), 나머지 `element`.
   - lock(DR-061)은 직교: 유효 능력 = role 능력 ∩ lock.
3. 소비처 치환 + 같은 변경에서 제거: `isArtboardId`(DesignPage ~15,
   FrameStage 4, NestedFrame 2), `artboardIds` set(hover projector 입력은
   RolePolicy가 계산한 데이터로 — projector 자체는 순수 유지).
4. **게이트**: tsc / vitest 전수 / 구조 게이트 4종 / e2e 기존 green —
   행동 변화 0이 합격 기준. RolePolicy 단위 테스트(roleOf × 능력 테이블).

## Phase 2 — ViewPolicy + CameraPolicy + RailPolicy (레일만 행동 변경)

1. `ViewPolicy.visibleFrames` / `pageChrome` → DesignPage visibleFrameIds
   memo와 FrameStage `visibleFrameIds !== undefined` 키잉 치환.
2. `CameraPolicy`(pan/zoom/fitBox/paddingFactor) → FrameStage
   `cameraEnabled`·`panActive`·`paddingFactor`, backswipe 게이트, WI-157
   pageFitBox 흡수.
3. `RailPolicy` → DesignPage ThumbnailPanel 호출부가 정책을 읽어 optional
   prop을 채움/비움(패널은 정책을 모름). ThumbnailPanel에는 non-slide 섹션
   게이트만 추가.
   - **행동 변경 2건**: mixed 레일 "+"(addPage) 제거 / page-bounded 레일
     non-slide 섹션·슬라이드 토글·눈동자 제거.
4. `infiniteCanvas` prop + DesignPage ~20 참조 디커미션(이 phase에서 마지막
   소비자가 사라짐). FORMAT_EDITOR_CONFIG는 `canvas` 1필드로 수렴,
   `defaultContainer`는 InsertionPolicy로 이동.
5. **게이트**: 신규 e2e — (a) mixed 레일에 `thumbnail-add-page` 부재,
   (b) slide-deck 레일에 `thumbnail-slide-toggle-*`/`thumbnail-nonslide-*`/
   눈동자 부재 + addPage/duplicate 존재. 기존 e2e 중 위 행동 변경과 충돌하는
   스펙은 같은 변경에서 마이그레이션(디커미션 스윕 — red로 방치 금지).

## Phase 3 — HitPolicy 통합 (요청 행동 변경 본체)

1. `pieces/hit-resolution.ts`: `parentFirstFrom(rootId)` /
   `deepestMovable` 순수 함수화 — selectFromHit의 contextRootId 로직과
   FrameStage `resolveTarget`→`climbToMovable`→`movableTargetOrNull`에서 추출.
2. 클릭 선택(selection-context)과 드래그 이동(FrameStage)이 **같은
   HitPolicy를 소비**:
   - infinite: select=parentFirst(docRoot), move=deepestMovable — 무회귀.
   - page-bounded: select=move=parentFirst(activePage).
3. `commitFrame`의 제스처당 1회 선택(`moveSelectionSessionRef`)은 그대로 —
   move-target이 parent-first가 되는 순간 원제스처 선택+이동이 성립.
4. **게이트**: 신규 e2e — page-bounded에서 비선택 깊은 자식 위 드래그 시작
   → 페이지 직속 조상이 선택+이동(geometry 변화 단언). infinite 무회귀
   e2e(깊은 자식 직접 이동 유지). selection-context 단위 테스트를
   HitPolicy 조각 테스트로 마이그레이션.

## Phase 4 — InputPolicy (FSM 구성 주입)

1. `InputPolicy.gates: Record<GateKey, ReadonlySet<InteractionMode>>` —
   interaction-mode.tsx의 useTooltipsAllowed(idle|hand) 등 하드코딩 리스트를
   정책 테이블 조회로 치환. **FSM은 단일 기계 유지** — 전이 로직/토큰 부기
   불변, 도달 가능 집합만 컨텍스트가 결정.
2. `InputPolicy.bindings` — hand tool/rubber-band 등 제스처 바인딩의 모드별
   마운트 여부 (page-bounded에서 pan 계열 비마운트가 CameraPolicy와 정합).
3. **게이트**: 기존 FSM/게이트 단위 테스트 green + 게이트 훅 치환 후 e2e
   전수. 우선순위 낮음 — P1-P3 안정 후.

## Phase 5 — 마무리 스윕 + 기록

- 흡수 완료 검증: `grep -rn "infiniteCanvas\|isArtboardId\|artboardIds"`
  결과 0 (테스트/주석 제외). FORMAT_EDITOR_CONFIG 잔여 필드 점검.
- WI-166 레코드 DONE 갱신, 메모리/PROJECT_MAP 갱신, declarativecheck에
  `ctx.mode ===` 패턴 추가 검토.

## 게이트 (전 phase 공통)

`pnpm tokencheck && pnpm declarativecheck && pnpm puritycheck &&
pnpm inheritancecheck` / `pnpm exec tsc --noEmit` / `pnpm vitest run` /
`pnpm exec biome check --write apps/web` / 관련 e2e (apps/web cwd).
Playwright 알려진 pre-existing red: frame-handles.spec.ts:32 (WI-165 기록),
hover-affordance :58/:87 + mode-gate-hardening :110 (WI-164 배너 오버랩) —
이들은 본 작업의 합격 판정에서 제외하되 악화 금지.
