# WI-056 — 도형 그라데이션 채우기 (gradient fill) 수정 + 에이전트 스키마

Status: **Done — committed checkpoint**
Owner: hbpark
Updated: 2026-05-30

## Problem (사용자 보고)

"도형에 그라데이션 색상이 제대로 설정되지 않는다." 그리고 "에이전트 스키마에
그라데이션 컬러 설정 가능한 것도 추가" 요청.

## Root cause (조사 결과)

그라데이션 스택은 **렌더·picker 모두 이미 완비**되어 있었다 — 단 하나의 배선 버그:

1. **렌더 ✅** — `ShapeBlock.tsx` 는 `paintToSvgFill(fill)` 로 `<linearGradient>` /
   `<radialGradient>` defs 를 만들어 정확히 렌더한다.
2. **ColorPicker ✅** — `packages/design-system/.../ColorPicker.tsx` 는 단색/그라데이션
   2 탭을 지원하고 커밋 시 정규 `linear-gradient(<deg>deg, #rrggbbaa <p>%, …)` 문자열을
   emit 한다.
3. **버그 ❌ — `shape-section.tsx`** 가:
   - (읽기) 비-solid fill 을 `#000000` 으로 폴백 → picker 가 기존 그라데이션을 못 보여줌.
   - (커밋) picker 가 그라데이션 문자열을 줘도 **항상 `{ type:"solid", color }` 로 덮어씀**
     → 사용자가 만든 그라데이션이 즉시 파괴됨. ← **사용자가 본 증상.**
4. **에이전트 ❌** — 그라데이션 전용 스키마 없음(제네릭 `weave.item.update` 만).

## Fix

| 영역 | 변경 |
|---|---|
| `apps/web/src/document/style/fill-paint.ts` (신규) | `parseLinearGradientPaint(str)` — picker 정규 문자열 → `linear-gradient` PaintSpec (ColorPicker 파서와 동일 grammar, lossless round-trip) + `isGradientEmit`. |
| `shape-section.tsx` 읽기 | solid → color, linear/radial → `paintToCss(f)` 로 picker `value` 공급 (기존 그라데이션 표시). |
| `shape-section.tsx` 커밋 (Quick + More) | `fillFromEmit(v)` = `parseLinearGradientPaint(v) ?? { type:"solid", color: pickerValueToStored(v) }` — 그라데이션 보존, 단색은 StyleRef 보존. |
| `commands.ts` | `weave.shape.setFill` 신규 — shape guard(`not-a-shape`) + PaintSpec 검증(known type + 그라데이션 ≥2 stops) + `attrs.fill` 통째 교체. return 배열 등록. |
| `weave-command-schemas.ts` | `weave.shape.setFill` 상세 schema (solid/linear/radial/none/image/video discriminated) + `WEAVE_COMMAND_LABELS` "채우기 설정". |

## Scope notes

- **Design System Triage = reuse.** 새 컴포넌트 없음 — ColorPicker 의 기존 그라데이션
  모드를 비로소 도형에 연결했을 뿐.
- agocraft 변경 **0** (paintToCss/paintToSvgFill/PaintSpec 모두 기존 export).
- **radial-gradient** 는 ColorPicker UI 가 linear 만 편집하므로 **에이전트/프로그램 경로
  전용**. UI 스와치는 radial CSS 도 표시는 함(편집 불가). 한계로 기록.
- 범위 밖: stroke 그라데이션(동일 PaintSpec 구조지만 별도 surface), ColorPicker 에
  radial 편집 탭 추가.

## Workflow trail

- Feasibility: [FR-010](../feasibility-reviews/FR-010-shape-gradient-fill.md) — **FEASIBLE**.
- Risk: [RISK-010](../risks/RISK-010-shape-gradient-fill.md).
- Plan + 상세 schema: `features/shape-gradient-fill/ENGINEERING_PLAN.md`.

## Done

- [x] `fill-paint.ts` 파서 + `fill-paint.test.ts`
- [x] `shape-section.tsx` 읽기/커밋 라운드트립 수정
- [x] `weave.shape.setFill` command + register
- [x] AGENT_COMMAND_SCHEMA + label
- [x] Verification (아래)

## Verification

declarative + purity + typecheck green, biome 0 errors. Unit: `fill-paint.test.ts` (8)
+ `commands.test.ts` (`weave.shape.setFill` 7 신규, 총 54). e2e `shape-gradient-fill.spec.ts`
**3/3** (linear 저장+`<linearGradient>` 렌더+Cmd+Z/redo, radial 렌더, malformed 거부) —
WI-055 corner-radius 3건과 함께 **6/6 green**.

## Ops note — 환경 이슈 (이번 작업과 무관)

- e2e webServer 빌드가 `react-error-boundary` 미해결로 실패했음. 원인: iCloud Drive 가
  pnpm store 의 `react-error-boundary@6.1.2` 디렉터리를 evict → dangling symlink. (이전에
  통과하던 corner-radius e2e 도 동일 실패 → 코드 무관 확정.) `pnpm install` 로 복구(+1) 후 6/6 green.
- iCloud 가 소스에 conflict copy 도 생성 중: `apps/web/src/features/aku/{types 2.ts,
  MessageList 2.tsx,agent/use-aku-agent 2.ts}` (untracked, stale, typecheck 깨뜨림). 이번엔
  검증 위해 잠시 옮겼다 복구만 함 — **삭제는 사용자 판단**(정리 권장). [[reference_weave_icloud_node_modules_corruption]]
