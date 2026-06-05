# WI-100 — 그룹(제외) 썸네일에도 포커스 눈 버튼 유지 + 하단우측 포함/제외 버튼

| Field | Value |
|---|---|
| Status | Done (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | DR-069 |
| Relates | WI-039(포커스 눈), WI-072(덱 포함/제외 토글) |

## Problem (operator, 2026-06-06)

- 하단 썸네일의 오른쪽 아래 아이콘을 버튼으로 슬라이드 포함/제외 동작하게.
- 슬라이드에서 제외된 **그룹 썸네일에도 눈모양(포커스) 버튼이 존재**해 편집 편의 유지.

## 점검

- 포함/제외(하단우측 DeckGlyph → `onToggleSlide` → `attrs.presentable`)는 슬라이드·그룹
  양쪽에 이미 존재·동작(WI-072, DesignPage `toggleFrameSlide` 연결). → 첫 요청은 충족 상태.
- 포커스 눈(`FocusGlyph`, off→dim→isolate)은 **슬라이드 타일에만** 렌더 → 그룹 타일엔 없음. ← 갭.

## Change

`ThumbnailPanel.tsx` 그룹(non-slide) 타일에 슬라이드 타일과 동일한 포커스 눈 버튼 추가
(Design System Triage = **reuse**: 동일 컨트롤/핸들러 재사용, 신규 primitive/token 없음).
- 그룹 타일도 `isFocused`/`tileStage`/`isDisabled` 계산, preview 슬롯에 포커스 버튼
  (pointer-events-auto), 포커스 시 inset glow 표시.
- 하단우측 덱 포함/제외 버튼은 그대로(이미 양쪽 동작).

## Acceptance

- 그룹 타일에 동작하는 포커스 눈 버튼 존재(dim/isolate 가능). ✔
- 포함/제외 버튼은 슬라이드·그룹 양쪽에서 토글. ✔

## Verification (2026-06-06, SVL gate)

- Typecheck clean; biome clean(변경 파일). 신규 e2e(`thumbnail-panel.spec.ts`):
  슬라이드 제외→그룹 이동→그룹 눈 버튼 stage 1 동작→덱 버튼으로 재포함. (브라우저 없는
  로컬에선 미실행, CI 수행.)

See DR-069.
