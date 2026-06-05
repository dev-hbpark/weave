# WI-094 — 에이전트 텍스트 부분편집(textRuns) + 차트 부분편집(비파괴 병합) 연결

| Field | Value |
|---|---|
| Status | Done (single-session, 2026-06-05) |
| Owner | hbpark |
| Parent | WI-093 (per-range typography), WI-092 (chart direct-manipulation) |
| Decision | DR-063 |

## Problem (operator, 2026-06-05)

추가 구현된 기능(WI-093 per-range typography, WI-092 chart 직접조작)의 **커맨드 ↔
에이전트 스키마 연결**을 점검하니, 두 기능 모두 **에디터 UI에만** 구현되고 Aku 에이전트
표면(`weave.item.update { attrs }`)에는 연결되지 않았다. 특히:

1. **텍스트 부분편집**: `textRuns`(DR-057 이후 inline 콘텐츠+per-range 스타일의 단일
   진실원천)가 에이전트 capabilities/command 스키마에 없음 → 에이전트가 부분 스타일을
   못 함. 또한 textRuns가 있는 아이템에 `attrs.text`만 보내면 **무시됨**(런이 우선).
2. **차트 부분편집**: `item.update`가 top-level shallow merge라 부분 `variant`/`encoding`/
   `overrides`가 형제 키를 **삭제**(에이전트는 delta만 보유). UI는 imperative `patch`로
   회피하지만 에이전트는 선언적 attrs만 가능.

## Change

`weave.item.update`의 병합 결과에 **per-kind 정규화 레지스트리**(Rule 6) 적용:

- text: `text`↔`textRuns` 일관성(런 설정→text 동기, text만 설정→런 재파생).
- chart: `variant`/`encoding`/`overrides`만 현재값에서 deep-merge(`null`=해당 키 제거),
  나머지(frame/chartType/palette[]/barWidth)는 wholesale 유지.
- shape: 기존 `normalizeShapeAttrs`(레지스트리 경유로 이동, 동작 불변).

스키마: text `editableAttrs`에 `textRuns` + PER-RANGE 설명, command note(text/chart)에
부분편집/비파괴 병합/`null` clear 규칙 추가.

## Acceptance

- 텍스트: `textRuns` 전송 시 부분 스타일 반영 + `text` 미러 동기; `text`만 전송 시 런
  재파생으로 실제 반영. UI patch 경로 무변경. ✔
- 차트: 부분 `variant`/`overrides` 전송 시 형제 보존, `null`로 개별 키 제거. ✔
- `palette`/scalar는 wholesale 교체 유지. ✔

## Verification (2026-06-05, SVL gate)

- **Typecheck:** `@weave/web` clean.
- **Unit:** `commands.test.ts` 93 pass (신규 WI-094 블록 7: text 재파생/런 동기/patch
  무변경, chart variant·overrides deep-merge·null-clear·palette wholesale);
  aku schema + range-style 20 pass.
- **Lint:** biome clean(변경 파일). 기존 경고(non-null assertion 등)는 무관.
- **Rule 6:** declarativecheck 기존 3건(`derive-text-auto-resize.ts`,
  `use-weave-editor.ts`, `PresentPage.tsx` — WI-093 명시)만, 신규 없음(레지스트리 사용).

See DR-063.
