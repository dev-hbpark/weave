# Engineering Plan — Shape Gradient Fill (WI-056)

## Scope

도형 그라데이션 채우기 버그 수정 + 에이전트 전용 채우기 스키마. 렌더·picker 는 이미
완비(FR-010) — 작업은 weave 배선 + 얇은 파서 + 커맨드/스키마.

## Root cause (요약)

`shape-section.tsx` 가 ColorPicker 의 그라데이션 emit 을 무시하고 항상
`{ type:"solid", color }` 로 커밋 → 그라데이션 파괴. 읽기도 비-solid 를 `#000000` 폴백.

## Build steps

1. `apps/web/src/document/style/fill-paint.ts` — `parseLinearGradientPaint(str): PaintSpec|null`
   (ColorPicker 정규 grammar 미러, hex stop≥2) + `isGradientEmit`. 단위 테스트.
2. `shape-section.tsx`:
   - 읽기: `f.type==="solid" ? f.color : paintToCss(f)` (linear/radial) → picker `value`.
   - 커밋(Quick+More): `fillFromEmit(v) = parseLinearGradientPaint(v) ?? { type:"solid", color: pickerValueToStored(v) }`.
3. `commands.ts` — `weave.shape.setFill` (PaintSpec, shape guard, 그라데이션 ≥2 stops 검증) + register.
4. `weave-command-schemas.ts` — `weave.shape.setFill` 상세 schema + label.

## Data flow

```
사용자 ─ ColorPicker (solid/gradient 2탭) ─ onValueCommit(string)
          └ shape-section fillFromEmit ─ updateAll → weave.item.update(attrs.fill)
                                                          ▼
에이전트 ─ MCP tool weave.shape.setFill ─ run(guard+검증) ─ item.attrs Patch
                                                          ▼
            ChangeStream → reducer → ShapeBlock paintToSvgFill → <linearGradient>/<radialGradient>
```

## AGENT_COMMAND_SCHEMAS — `weave.shape.setFill` (상세)

> 위치: `apps/web/src/features/aku/agent/weave-command-schemas.ts`.

| 항목 | 값 |
|---|---|
| name | `weave.shape.setFill` |
| label | `"채우기 설정"` |
| destructive | `false` (가역) |
| 대상 | `shape` 도메인 아이템만 (`not-a-shape` guard) |

`fill` = `PaintSpec` discriminated union (`type` 분기):

| type | 필드 | 비고 |
|---|---|---|
| `solid` | `color: "#rrggbb"|"#rrggbbaa"|"var(--token)"` | StyleRef 토큰 허용 |
| `linear-gradient` | `angle:0..360(deg, 0=up 90=right)`, `stops:[{offset:0..1, color:"#rrggbbaa"}, …]` | **≥2 stops** |
| `radial-gradient` | `cx:0..1, cy:0..1, stops:[…]` | **≥2 stops**, UI 미편집(에이전트 전용) |
| `none` | — | 투명 |
| `image`/`video` | `src, fit?, opacity?(, muted?, loop?)` | 미디어 채우기 |

### inputSchema 예시 (에이전트 호출)

```jsonc
// 좌→우 빨강→파랑
{ "itemId": "itm_x", "fill": { "type":"linear-gradient", "angle":90,
  "stops":[{"offset":0,"color":"#ff0000"},{"offset":1,"color":"#0000ff"}] } }
// 중심 방사형
{ "itemId": "itm_x", "fill": { "type":"radial-gradient", "cx":0.5, "cy":0.5,
  "stops":[{"offset":0,"color":"#ffffff"},{"offset":1,"color":"#000000"}] } }
// 단색
{ "itemId": "itm_x", "fill": { "type":"solid", "color":"#22c55e" } }
```

### 에러 코드

| code | 조건 |
|---|---|
| `item-not-found` | `itemId` 미존재 |
| `not-a-shape` | 대상이 shape 아님 |
| `invalid-input` | 미지 `fill.type` / 그라데이션 stops<2 |

## QA / SVL

- unit: `fill-paint.test.ts`(파서 round-trip) + `commands.test.ts`(setFill 7).
- e2e `shape-gradient-fill.spec.ts`: linear 저장+`<linearGradient>` 렌더+Cmd+Z/redo,
  radial 렌더, malformed 거부.
- `pnpm verify`: tsc+lint+declarative+purity 그린.

## Out of scope

stroke 그라데이션, ColorPicker radial 편집 탭.
