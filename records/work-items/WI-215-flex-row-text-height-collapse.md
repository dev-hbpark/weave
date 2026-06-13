# WI-215 — flex-ROW 텍스트 높이 0 붕괴 (auto-height observer × 크로스축 ratchet)

- **Status:** PLANNED (설계 — 루트 확정, 구현·라이브검증 대기) · 2026-06-13
- **Related:** WI-149/DR-104(flex-row 너비 squish — 본건은 그 **높이/크로스축 변종**), DR-103(렌더
  플로어 — 너비축만), DR-101(px-fixed font), WI-199/DR-128(중첩 relayout 1레벨 한계),
  agocraft HANDOFF-025(크로스축 freeze)
- **Origin:** 운영자 — 그리드 셀(=flex-row 래퍼) 안 텍스트 높이를 드래그로 바꾸니 텍스트 높이가
  0이 됨. 데이터 복구본도 **인터랙션마다 재발**, "높이를 키우면 텍스트가 오히려 작아지며 높이가
  사라짐". 실측 JSON: 2개 텍스트 frame.height = 2.46e-23 / 3.96e-08(near-zero = 곱셈 ratchet).

## 루트 원인 (확정)

`deriveTextAutoResize(layoutChild)`(`domains/derive-text-auto-resize.ts`)가
**모든 auto-flex/auto-grid 자식을 `"HEIGHT"`(높이 auto-fit)로 분류** — flex **방향을 보지 않음**:

```
if (layoutChild.kind !== "absolute-constraints") return "HEIGHT";
```

flex-COLUMN / grid 셀에선 옳다(너비=레이아웃, 높이=콘텐츠 auto). 그러나 **flex-ROW 자식은
높이가 크로스축**(메인=너비=basis, 크로스=높이=crossSize/align)이라 틀리다. layoutChild만으론
부모의 flex direction(row/col)을 알 수 없는 게 설계 갭.

**라이브 피드백 루프:**
1. flex-ROW 셀 텍스트 → mode `"HEIGHT"`.
2. `TextBlock` ResizeObserver가 `frame.height = scrollHeight / parentH` 를 써넣음(높이 소유).
3. 그러나 flex-ROW에선 agocraft 엔진도 크로스축 높이를 `crossSize`로 관리 → **두 소유자 충돌**.
4. 높이를 키우면 `parentH↑` → observer가 더 작은 height ratio 기록 → 엔진이 그 작아진 frame
   높이에서 `crossSize` 재freeze(grow:0, 일방 ratchet — DR-104 메커니즘의 크로스축판) → 0 수렴.
   → "높이를 키우면 작아지며 사라짐" + 데이터 복구가 안 붙음(매 인터랙션 재발).

## 수정 — 1순위 원칙 (운영자, 2026-06-13): "실제 크기 변화 시에만 재정리"

운영자 통찰: **프레임이 부모 레이아웃 규칙상 실제로는 안 커지는데, 핸들을 움직이는 순간
'커진 것처럼' 인식 → 폰트/auto-fit 재정리가 잘못 발동.** 어떤 상황에서든 **size가 실제로
(committed) 변할 때만** 재정리해야 함.

코드 정합: 코드베이스가 이미 반쯤 인지 — `TextBlock` 주석(L219-222)에 "WI-146 B의
height-write 트리거가 매 height 변경마다 fit 재실행 → **manual RESIZE 제스처와 싸움** → revert"
라고 박혀 있음. 그런데 refit effect는 여전히 **`a.frame.width` 변경**에 의존(L225 deps)하고,
ResizeObserver는 *지각된* resize마다 `measureAndCommit`을 돌림. flex-ROW 자식은 부모가 크기를
지배(핸들 드래그가 실제 frame 변화로 이어지지 않음)인데, 이 지각된 변화가 재정리를 발동 →
관측치(scrollHeight/parentH)를 다시 써넣어 ratchet 시동.

**A0 (1순위): 재정리 트리거를 *실제 committed 크기 델타*에 게이트.**
- 진행 중 제스처/부모-지배 no-op에서는 재정리 금지.
- refit/observer commit 전에 "직전 committed dimension과 비교해 유의미 변화가 있을 때만" 진행
  (현재 ≥0.0005 임계는 *관측치 vs frameRef* 비교라, 부모 성장으로 분모가 바뀌면 항상 델타가
  생겨 발동 — 분모(parentH)가 아닌 *콘텐츠/실제 box* 변화 기준으로 판정).
- 폰트 재정리(있다면)도 동일 게이트 — px 폰트는 parent로 안 변해야 하고, ratio 폰트면
  frame.height가 실제로 변할 때만 재계산.

아래 A/B/C는 A0를 보강(루프가 시작되더라도 화면·저장값을 방어):

## 수정 (3겹 — DR-103/104 패턴 따름)

**A — observer 방향-인지 (라이브 루프 차단, 1순위·weave):**
`TextBlock` auto-height가 **flex-ROW 자식에선 frame.height를 parent-ratio로 쓰지 않는다.**
- `deriveTextAutoResize`/observer에 **부모 flex direction**을 공급(observer는 이미 DOM parent를
  읽음 → `getComputedStyle(parent).flexDirection` 또는 레이아웃 컨텍스트로 row 판별).
- flex-ROW 자식: 높이는 레이아웃(크로스축 crossSize/align)이 소유 → observer는 height 미관여
  (mode 사실상 NONE-for-height). 콘텐츠 높이는 crossSize로 1회 반영하되 **growing parentH가 아닌
  안정 기준**(콘텐츠 px)으로 — parent 성장에 비례 축소 금지.

**B — 렌더 legibility 플로어 높이축 확장 (기존 손상 + 미래 시각 방어, weave):**
DR-103(너비축 word-break)의 높이 버전 — 저장 height/crossSize가 ~0이어도 텍스트를 **최소 1줄
(≈fontSize×lineHeight)** 로 렌더. 손상된 기존 문서가 즉시 보이게 + 어떤 ratchet도 화면에서 차단.

**C — 리사이즈 커맨드 클램프 (입력 방어, weave):**
수동 리사이즈가 `frame.height`/`crossSize`를 쓸 때 min-content(≈1줄) 하한 클램프 — 드래그·relayout이
~0을 저장 못 하게.

**+ 데이터 복구:** 로드-시점 sanitize(near-zero height/crossSize → 콘텐츠 기준 복원)로 이미
망가진 문서 자동 치유(현재 없음 — "망가진 원본 자동복구 안 됨" 갭의 이 클래스 한정 해소).

## agocraft HANDOFF-025 (durable 엔진 루트)

크로스축 `crossSize` resolve가 0으로 freeze되는 ratchet(DR-104 너비축 deferred 엔진수정의
크로스축판) — auto-flex resolve에서 near-zero crossSize를 min-content/epsilon로 floor하고
0-근처를 basis/crossSize로 freeze 금지. weave A/B/C로 미봉 가능하나 durable 근치는 엔진.

## 검증 (라이브 필수 — 이 영역 revert 빈발: WI-145/146)

이 observer는 과거 height-dep/트리거로 여러 번 revert됨 → **반드시 라이브 검증**: 그리드 셀
텍스트 높이 드래그 ↑/↓ 반복해 (a) 높이가 안정·콘텐츠 추종, (b) 0 붕괴 0건, (c) 줌≠100%에서도
정확, (d) flex-col/grid 기존 auto-height 무회귀. e2e: grid-cell-text-resize.spec.

## SOLID/GRASP

- mode 결정은 **부모 레이아웃 컨텍스트의 함수**여야 정확(현재는 layoutChild만 보는 부분정보 →
  오분류). direction은 데이터(row/col)로 분기 금지가 아니라 *입력*; observer 축-소유 규칙은 단일
  소스. 렌더 플로어/클램프는 순수 함수.

## DoD

A(루프 차단)+B(렌더 플로어)+C(클램프)+로드 sanitize 구현 + 단위그린 + 라이브 검증(높이 드래그
안정, 0붕괴 없음, 무회귀) + 복구본 재발 0. agocraft HANDOFF-025는 후속 durable.
