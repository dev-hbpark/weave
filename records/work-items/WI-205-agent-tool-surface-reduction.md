# WI-205 — Aku 에이전트 도구 표면 축소 (page surface)

- **Status:** Done · **DR:** DR-130 · **From:** HANDOFF-028 (small-think) · **Relates:** DR-115/WI-168, DR-064, small-think DR-067

## Problem

small-think DR-067: Aku 입력 토큰 ≈ 턴수 × 정적 prefix, prefix 최대 미탐색 덩어리 = page surface
광고 도구 스키마 ~19.5K(매 턴 재독). 정규 funnel(weave-capabilities §6)이 이미 비정규로 선언한
도구들이 광고되어 낭비.

## Change

- `pieces/agent-surface.ts` `PAGE_PASSTHROUGH_TOOLS`: 비정규/니치/파괴적 19개 de-list
  (setFill·setCornerRadius·setVertices·setDecoration·items.resizeMulti·items.remove·
  items.duplicate·items.duplicateWithDelta·image.setCrop·item.flip·shape.breakToLine·
  line.closeToShape·item.bringForward·item.sendBackward·item.swapGridCells·item.dropGridCell·
  item.swapFlexOrder·frame.removeKeepingChildren·doc.reset). `items.update`/`items.lifecycle`
  유지(정규 bulk·고유 align/distribute).
- `agent-surface.coverage.test.ts` `PAGE_EXCLUDED`: 19개를 사유와 함께 추가(triage 완전).
- `weave-capabilities.ts`: 제거 도구를 언급하던 니치 절 6개를 정규 도구 기준으로 일반화
  (단일 소스 유지, page 정확·free 무해).

## 측정/결과

- 광고 스키마 **19,525 → 16,973 tok (−13%)**, **46 → 27 도구**.
- 인간 기능 손실 0(커맨드 등록 유지). prose funnel 문장이 page에서 *참*이 됨.
- 큰 잔여(상위 3개 61%)는 frame/text 노트 3중 중복 → 후속 description-dedup WI 후보.

## Acceptance

- PAGE allow-list 트림 + PAGE_EXCLUDED 사유 기재. ✔
- coverage(7) + capabilities-coverage(10) + aku/editor-mode 294 그린, tsc 클린. ✔
- FREE는 DR-064대로 `tools:"all"` 유지. ✔
- 효과 before/after는 small-think 텔레메트리 재측정(HANDOFF-029). ☐(운영)

## Links

- DR-130 · HANDOFF-028 · HANDOFF-029 · small-think DR-067
