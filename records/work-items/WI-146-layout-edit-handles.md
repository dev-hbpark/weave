# WI-146 — 레이아웃 편집 핸들 (아이템 사이 드래그로 영역 분배 · 그리드 행/열 리사이즈·병합)

Status: **Done** (코드/단위 검증 완료 · 캔버스 드래그는 실환경 확인 권장)
Owner: hbpark
Updated: 2026-06-08
관련: WI-043(레이아웃 타입 피커 + TrackSizeEditor 입력폼, 핸들 드래그는 명시적 보류),
DR-design-019(드래그 핸들 out-of-scope "v1.1 manual remove + re-add only"),
선례 WI-109/DR-032(corner-radius 온캔버스 핸들 = 드래그→비율→exec(mergeKey) 패턴)
설계: [DR-design-030](../design-reviews/DR-design-030-layout-edit-handles.md),
엔지니어링: `features/layout-edit-handles/ENGINEERING_PLAN.md`

## Problem

레이아웃(flex/grid)을 선택했을 때 **아이템 사이에 핸들(선)** 을 띄우고, 그 선을 드래그해 레이아웃
속성값을 조절(영역 분배)하고 싶다. flex·grid 모두 지원하고, 그리드는 **행/열 크기 조정**과 **셀 병합**도
원한다. WI-043은 타입 피커 + 트랙 값 *입력 폼*까지만 만들고 드래그 핸들은 보류했었음(이 WI가 그 후속).

## Scope (3 증분, 순서대로)

1. **Flex gap/basis 드래그** — flex 컨테이너 자식 사이 선을 드래그 → `gap`(또는 경계 양옆 자식 `basis`)
   재분배. (가장 단순, 선례 거의 그대로)
2. **Grid 트랙 리사이즈** — 행/열 경계선 드래그 → 해당 `columns[i]`/`rows[i]` TrackSize 조정(이웃 트랙과
   비율 재분배).
3. **Grid 셀 병합** — `columnSpan`/`rowSpan` 조절(병합/해제). UI는 툴바 스텝퍼/토글(저위험) 우선,
   셀 모서리 드래그는 옵션.

## 가능성 결론 (조사 완료)

- **데이터 모델 준비됨**: flex `gap/grow/shrink/basis`, grid `columns/rows`(TrackSize fr/ratio/auto/minmax),
  `columnGap/rowGap`, `columnSpan/rowSpan`(=병합), `areas`.
- **커맨드**: `weave.frame.setLayout`(전체 스펙), `weave.item.setLayoutChild`(자식 정책)로 충분 —
  핸들이 현재 스펙을 read-modify-write 후 exec(mergeKey)로 1 undo. **신규 커맨드 불필요**(전체-스펙 경로).
- **핸들/드래그 인프라 준비됨**: `HANDLE_INTERACTIONS` + `dragGestureStates` + `startHandleGesture`,
  view-model `handles()` + 포털 그립(corner-radius 선례 동일).
- **그리드 트랙 기하**: `resolveTrackSizes`/`trackOffset`/`sumSpan`(@agocraft/core 공개)로 도출.

## Records (이 WI)

- 본 WI / DR-design-030 / `features/layout-edit-handles/ENGINEERING_PLAN.md`(SOLID·GRASP 체크 포함).

## Verification 계획

- 순수 기하/스펙-편집 로직은 **단위 테스트**(gap 재분배, 트랙 리사이즈 재분배, span 병합 클램프).
- 커맨드 경로는 setLayout/setLayoutChild 위임이라 기존 `commands-layout-relayout` 회귀로 커버 + 추가 케이스.
- ⚠️ 실제 캔버스 드래그(핸들 히트테스트/줌≠100%/모션)는 에이전트 무관 브라우저 검증 필요 — 샌드박스 한계,
  실환경 1회 확인 권장.

## Build (실제 구현)

- **순수 코어**(`selection-chrome/layout-handle-geometry.ts`, `layout-spec-edit.ts`):
  resolveTrackSizes(ratio/fr/auto), boundaryOffsets, trackStartOffset, projectPointer;
  setFlexGap(클램프), resizeGridTrackBoundary(쌍 보존·fr/auto→ratio), setGridSpan(클램프).
  단위 테스트 `layout-spec-edit.test.ts` **16/16**.
- **증분 1+2 핸들**(`selection-chrome/LayoutEditHandles.tsx`): frame kind view-model(코너radius 선례
  미러). 선택된 flex/grid 프레임에 자식/트랙 사이 드래그 선 포털. flex=gap, grid=열/행 트랙 리사이즈.
  `HANDLE_INTERACTIONS`에 `layout-line-drag` 등록, 드래그→`weave.frame.setLayout`. 레지스트리 등록
  (`use-selection-chrome-registry.ts`).
- **증분 3 병합**(`toolbar/sections/flex-child-section.tsx` GridChildSection): 열/행 병합 Select
  (columnSpan/rowSpan, clampSpan), `weave.item.setLayoutChild` 경유. 사용 가능 셀 ≤1이면 숨김.

## Verification

- typecheck(@weave/web) green, biome 클린(트리거-deps 등 사유 기재).
- 단위/통합: selection-chrome + commands + commands-layout-relayout + toolbar = **175 통과**(코어 16 포함),
  `HANDLE_INTERACTIONS` kinds 가드 갱신.
- ✅ **실환경 확인(2026-06-08)**: 1차 확인에서 그리드 트랙 선이 커서를 안 따라오는 어긋남 발견 →
  엔진 `resolveTrackSizes` 위임 + gap/2 오프셋 보정 + flex `(idx+0.5)` 보정 후 **재확인: 핸들이
  커서를 잘 따라옴**. (잔여: grow 자식 있는 flex의 미세 추종은 근사 — 필요 시 후속 보정.)

## 후속 조사 (2026-06-08) — 에이전트 슬라이드의 flex 텍스트 높이/폰트 이슈

사용자 제보: 아쿠가 만든 슬라이드에서 flex 안 텍스트가 과대 높이로 보이고, 편집 진입/종료 시
콘텐츠 높이로 줄며, undo 후엔 유지됨. 폰트도 작아 보임.

- **repro 시도(e2e `layout-text-autoheight.spec.ts`)**: flex 컬럼 + 큰 높이(0.4) 텍스트를
  `weave.item.add`→`setLayout`로 구성. 결과 **로드 직후 0.4→0.039로 정상 auto-collapse**(테스트 통과).
  → **일반 렌더 경로(개별 settle된 exec)는 정상.** 버그는 여기 없음.
- **결론**: 버그는 **에이전트의 배치 라운드**(round-grouping 트랜잭션) 특유 현상으로 보임 — auto-fit
  커밋이 라운드 트랜잭션에 묶여 후속 setLayout 패치에 덮여 사라지고, 라운드 종료 후 재발화 트리거가
  없어 큰 높이가 남음(WI-145 근본 원인의 잔존 케이스). 폰트 작음은 부모 높이 변동에 연동된 증상 가능.
- **제약**: 문제 슬라이드가 삭제되어 실제 attrs 확보 불가 + 에이전트 서버 없이는 배치 라운드 재현 불가
  → **검증 가능한 수정 불가**. 다음 발생 시 삭제 전 콘솔 스니펫으로 `layoutChild`/`fontSizeSpec`/
  `frame.height` 확보 필요. (재현되면 라운드 종료 후 auto-fit 일괄 재보정 또는 grounding 보정으로 수정.)
- e2e는 **base-case 회귀 가드**로 유지(정상 경로가 깨지지 않도록).
- **배치 재현 시도(2번째 e2e)**: `editor.beginBatch()/endBatch()`로 에이전트 라운드를 그대로 모사
  (한 트랜잭션 안에서 frame add → text add ×2 → setLayout)했으나 **여전히 정상 collapse**(통과).
  → 단순 트랜잭션 그룹핑이 원인이 아님. 실제 버그는 그 슬라이드 특유의 attrs(예: text 자식의 **명시적
  숫자 `basis`** 또는 특정 구조)로 보이며, **삭제되어 재현/확정 불가**. 다음 발생 시 attrs 확보 필요.

## 수정 (B, 2026-06-08) — auto-height 재보정을 frame.height 변경에도 트리거

증상의 정체: auto-height 텍스트가 줄어든 뒤 **나중 작업이 frame.height를 다시 크게 써도**
ResizeObserver는 *콘텐츠* 크기 변화에만 발화하므로 재발화하지 않아 큰 채로 남고, 편집해야 보정됨.

- **수정**: `TextBlock` 재보정 effect 의존성에 `a.frame.height` 추가 → 높이 쓰기마다 재보정 1회 실행,
  콘텐츠 높이로 자동 재-collapse. measureAndCommit은 임계값(>=0.0005)으로 **1커밋 내 수렴(루프 없음)**,
  Fixed(NONE)/편집중/히스토리리플레이에서 no-op이라 안전.
- **재현+검증(e2e `layout-text-autoheight.spec.ts` 3번째 테스트)**: 줄어든 뒤 height를 0.4로 다시 쓰는
  시나리오. **수정 없이 → 0.4 유지(버그 재현 ✅)**, **수정 적용 → 자동 재-collapse(통과)**. 의존성 제거 시
  fail / 추가 시 pass로 테스트가 수정을 실제 가드함을 확인.
- **회귀**: typecheck·biome 클린, 신규 e2e 3/3, `text-item.spec.ts` 통과. (직전 광범위 e2e의 20 실패는
  세션 장시간 후 환경 타임아웃 — Fixed-mode 테스트 포함, 본 변경이 영향 줄 수 없는 경로라 환경 확정.)

## 수정 (B-2, 2026-06-08) — 에이전트 라운드 종료 시 auto-height 일괄 재보정

사용자 확정 단서: 생성 직후 겹쳐 있던 카드를 **수동 편집했다 빠져나오면 레이아웃이 정상화**됨 →
"편집 시 일어나는 보정을 라운드 종료에 자동으로 한 번 돌리면" 편집 없이 settle.

- **신규** `domains/text-autofit-signal.ts`: 단발 pub/sub(`onTextAutofitRequest`/`requestTextAutofit`).
- `round-grouping-editor.ts` `close()`: 배치 종료(endBatch) 후 `requestTextAutofit()` 펄스(라운드 밖이라
  보정 커밋은 별도 히스토리 엔트리).
- `TextBlock.tsx`: 펄스 구독 → rAF로 `measureCommit`(편집-종료와 동일 로직, NONE/편집중/리플레이 no-op).
- 효과: 에이전트 생성 후 자동으로 모든 auto-height 텍스트가 콘텐츠에 맞게 재정착 → 편집 불필요.
- 검증: 트리거(라운드 종료 펄스)는 단위 테스트로 가드(round-grouping 7/7), agent 스위트 75/75,
  typecheck·biome 클린. 비-에이전트 경로엔 펄스가 안 오므로 무영향(기존 e2e 불변).
- 한계: layout이 **NONE인 프레임의 절대배치 겹침**(예: CTA/QR 클러스터)은 이 보정으론 안 풀림 — 그 프레임엔
  setLayout이 필요(에이전트/서버 리뷰가 적용). 실환경 재생성으로 최종 확인 권장.

## 진행 로그

- 레코드 3종 → 순수 코어(테스트) → 증분1+2 핸들 → 증분3 병합. 증분별 커밋.
- 후속: base-case 정상(e2e) → 나중 height 쓰기 재발화 없음(B) → 라운드 종료 일괄 재보정(B-2).
