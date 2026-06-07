# WI-137 — 종료 셀레브레이션 후 사라지기 + 말풍선 타자기 효과

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-07) |
| Owner | hbpark |
| Decision | WI-135(피날레) · WI-127(런처 streaming 중 유지) 후속 |
| Relates | WI-130(phrase 말풍선) |

## Problem (operator, 2026-06-07)

1. 편집 완료 시 아쿠가 **편집 종료로 인해 (셀레브레이션 전에) 사라짐**. 종료 시 셀레브레이션을
   재생한 **후에** 사라지게.
2. 아쿠 **말풍선이 항상 스트리밍처럼 글씨가 한 글자씩 나타나게**.

## Root cause (1)

런처 렌더 조건이 `!open || streaming`. 패널이 열린 채 작업하면(WI-127로 streaming 중 런처 표시)
턴 종료(idle) 순간 조건이 false가 되어 런처가 즉시 언마운트 → 셀레브레이션(런처에서 재생)이
시작도 못 함.

## Change

- **AkuAssistant**: 런처 렌더 조건에 `|| celebrating` 추가(`!open || streaming || celebrating`).
  celebrate 윈도우(~2.4s, WI-135) 동안 런처 유지 → 피날레 재생 후, 윈도우 종료 시
  (패널 열림이면) 사라짐.
- **AkuLauncher**: `useTypewriter` 추가 — `caption`이 바뀔 때마다 한 글자씩 노출(≈26 cps).
  말풍선이 항상 스트리밍처럼 타이핑되어 나타남. reduced-motion에선 즉시 전체 표시. 말풍선
  표시 여부는 기존대로 전체 `caption` 기준, 내용만 `typed`로 렌더.

## Acceptance

- [x] 패널 열린 채 작업 종료 시에도 셀레브레이션이 재생된 뒤 아쿠가 사라짐.
- [x] 패널 닫힘이면 셀레브레이션 후 idle 런처로 유지(기존).
- [x] 말풍선이 항상 타자기처럼 글자가 나타남(reduced-motion 즉시).

## Verification (SVL gate — 2026-06-07)

- tsc 0 · biome clean(변경 파일) · 아쿠 단위 104/104 · 아쿠 e2e 11 pass(+1 무관 flaky 재시도 통과).
- 셀레브레이션/타자기는 streaming→idle·말풍선 표시 경로 — 오프라인 e2e 직접 구동 제한. 렌더 조건
  + useTypewriter 로직으로 구성.

See WI-135 / WI-127.
