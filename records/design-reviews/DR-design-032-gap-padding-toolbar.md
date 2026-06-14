# DR-design-032 — gap/padding 숫자 toolbar + 사이징 콤보박스

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-032 |
| Date | 2026-06-14 |
| Owner | hbpark |
| Component | ContextualToolbar 섹션: `frame-sizing-section`(SegmentedControl→Select) + `frame-background-section` 레이아웃 More의 기존 gap/padding NumberSlider를 px화(별도 신규 섹션 아님 — 기존 컨트롤 in-place 업그레이드). 기존 `Select` + `NumberSlider` 재사용, 신규 primitive 없음 |
| Work item | [WI-220](../work-items/WI-220-gap-padding-toolbar-and-sizing-combobox.md) |
| Triage Decision | **Step 1 — Reuse** |

## Triage Walk

| Step | 검토 | 결과 |
|---|---|---|
| 1. Reuse | ✓ | 사이징 = `Select`(DR-design-021 콤보박스, API가 SegmentedControl과 동일 → drop-in). gap/padding = `NumberSlider`(DR-design-009, 슬라이더+숫자입력, shadow-controls 선례). **신규 primitive 불필요.** |
| 2. Extend | ✗ | 두 primitive 모두 그대로 사용. |
| 3. Grow | ✗ | 신규 토큰/테마/컴포넌트 없음. |
| 4. Escape | ✗ | app-local 캔버스 오버레이 아님 — 정규 toolbar 섹션. |

## Context

WI-219가 캔버스 드래그로 padding/grid-gap 작성을 추가했으나 **키보드/정밀 숫자 입력 경로가 없음**을
DR-design-031 한계로 남겼다. 본 작업이 그 toolbar 숫자 입력을 추가한다. 더불어 사용자가 컨테이너
너비/높이 사이징(Fixed/Hug/Fill)을 SegmentedControl → 콤보박스로 바꿔 달라 요청.

## 결정 (시각 + 인터랙션)

- **사이징 콤보박스**: `SegmentedControl` → `Select`. 트리거는 현재 값만(고정/내용맞춤/채움) 표시 →
  바 폭 절약. 옵션 가용성(Hug=자식≥1, Fill=flex 부모)은 기존 로직 유지. 라벨 동일.
- **gap/padding NumberSlider**: 디자인 px 단위. flex=간격+안쪽 여백, grid=열 간격/행 간격/안쪽 여백.
  슬라이더 드래그=transient, 커밋(blur/Enter/드래그업)=1 undo. px-first + ratio 미러(WI-219/DR-139),
  `weave.frame.setLayout`에 designWidth/Height 전달 → 엔진이 고정 px로 reflow(WI-043 P6).
- **안쪽 여백**은 v1에서 4면 균일(per-side는 캔버스 드래그가 담당). 향후 linked/per-side 토글은 후속.

## 접근성

- 콤보박스/NumberSlider 모두 키보드 접근(Radix dropdown + input). 이로써 WI-219가 남긴 a11y 공백 해소.
- reduced-motion: 별도 모션 없음.

## 검증

- 라이브 e2e(콤보박스 사이징 + gap/padding 숫자 입력 → px 필드 작성). 순수 로직은 기존 단위 재사용.
