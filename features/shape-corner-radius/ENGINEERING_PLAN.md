# Engineering Plan — Rectangle Corner Radius (WI-055)

## Feature scope

사각형 모서리 둥글기를 (1) 사용자가 컨텍스트 툴바에서, (2) 아쿠 에이전트가 전용
커맨드로 편집한다. agocraft 코어는 데이터·렌더를 이미 보유하므로 weave 측 얇은 배선
+ **상세 AGENT_COMMAND_SCHEMA** 가 핵심.

원천 사실(탐색 확정):
- `@agocraft/core` `ShapeSubAttrs`: `{ shape: "rectangle"; cornerRadii: { tl, tr, br, bl } }` (절대 px).
- `shapeToSvgGeometry` 렌더: 4코너 동일 → `<rect rx ry>`, 비동일 → `rectPathWithPerCornerRadii`,
  각 반경 `[0, min(w,h)/2]` 자동 캡 → 오버플로 안전.
- `weave.item.update` 의 `item.attrs` Patch = attrs **전체 교체** ([[feedback_weave_item_attrs_full_replace]]).

## Architecture

```
사용자 ─ shape-section.tsx (rectangle sub-kind 한정)
          └ <CornerRadiusControl>  (DR-design-025, @weave/design-system)
                 │ onChange(next: {tl,tr,br,bl})
                 ▼
        updateAll → weave.item.update (patch가 COMPLETE subAttrs 재구성)  ← History
          ※ 멀티셀렉트를 1 undo step 으로 묶기 위해 UI 는 기존 batch helper 사용.
            전용 setCornerRadius 와 동일한 item.attrs Patch 로 수렴.
                 │
에이전트 ─ 아쿠 ─ MCP tool "weave.shape.setCornerRadius"  (schema = 아래)
                 ▼
        commands.ts setShapeCornerRadius.run(ctx, input)
          ├ findChild → rectangle guard (not-a-rectangle 시 fail)
          ├ 현재 subAttrs 읽어 cornerRadii만 교체한 **완전한** subAttrs 재구성
          └ item.attrs Patch (before/after 전체 attrs) → ChangeStream → reducer
```

SOLID/GRASP: 커맨드는 단일 책임(반경 설정). 분기는 sub-kind guard 1곳, switch 없음.
컨트롤 primitive는 도형 종류 무지(순수 표현). Rule 6 위반 없음.

## Build steps

1. **Command** `weave.shape.setCornerRadius` (`apps/web/src/document/commands.ts`)
   - input: `{ itemId, radius? , radii? }` — `radius`(uniform, 4코너 동일) **또는**
     `radii`(per-corner 부분 merge) 중 정확히 하나.
   - rectangle guard, `Math.max(0, finite)` 정규화, full subAttrs 재구성, `item.attrs` Patch.
   - 빌더 반환 배열에 등록.
2. **Schema** `weave-command-schemas.ts` + `WEAVE_COMMAND_LABELS["weave.shape.setCornerRadius"]`.
3. **Primitive** `CornerRadiusControl.tsx` + `IconLink`/`IconLinkOff` glyph + index export.
4. **Toolbar** `shape-section.tsx`: rectangle sub-kind에서만 `<Bar.Field label="Corner radius">`.
5. **e2e** `apps/web/e2e/shape-corner-radius.spec.ts`: 편집 반영 + Cmd+Z 복원 + 멀티/언링크.

## AGENT_COMMAND_SCHEMAS — `weave.shape.setCornerRadius` (상세)

> 위치: `apps/web/src/features/aku/agent/weave-command-schemas.ts`.
> 빌더(`STR`,`NUM`,`obj`)와 `AgentCommandSpec`은 파일 상단 기존 정의 재사용.

### 계약 요약

| 항목 | 값 |
|---|---|
| name | `weave.shape.setCornerRadius` |
| label | `"모서리 둥글기"` (WEAVE_COMMAND_LABELS) |
| destructive | `false` (가역, History 복원 가능) |
| 대상 | `shape` 도메인 + `subAttrs.shape === "rectangle"` 아이템만 |
| 단위 | **절대 px** (코어 모델 1:1). 0..1 비율 아님. |
| 상한 | 렌더러가 `min(width,height)/2` 자동 캡. 스키마는 하한(≥0)만 강제. |
| 입력 배타성 | `radius` XOR `radii` — 정확히 하나. 커맨드가 런타임 검증. |

### inputSchema (정의)

```ts
// ── corner radius (WI-055) ──
"weave.shape.setCornerRadius": {
  label: label("weave.shape.setCornerRadius"),
  // 사각형(shape, subAttrs.shape === "rectangle") 전용. 모서리 반경은 도형의
  // 렌더 bbox 기준 **절대 px**(0..1 비율 아님). 렌더러가 min(w,h)/2 로 자동
  // 캡하므로 큰 값을 보내도 안전하다. `radius`(균일) 또는 `radii`(코너별)
  // 중 정확히 하나만 보낼 것 — 둘 다/둘 다 없음은 invalid-input 으로 거부된다.
  inputSchema: obj(
    {
      itemId: STR,
      // 균일: 네 모서리 모두 이 값(px)으로 설정. 0 = 직각.
      radius: { type: "number", minimum: 0 },
      // 코너별 부분 패치: 보낸 키만 갱신, 생략한 코너는 현재값 유지.
      // tl=top-left, tr=top-right, br=bottom-right, bl=bottom-left.
      radii: {
        type: "object",
        properties: {
          tl: { type: "number", minimum: 0 },
          tr: { type: "number", minimum: 0 },
          br: { type: "number", minimum: 0 },
          bl: { type: "number", minimum: 0 },
        },
        additionalProperties: false,
      },
    },
    ["itemId"], // radius/radii 의 배타성은 커맨드 run()에서 검증
  ),
},
```

### 에이전트 사용 예

```jsonc
// 균일 12px 둥글기
{ "itemId": "itm_abc", "radius": 12 }
// 좌상단만 24px, 나머지 유지
{ "itemId": "itm_abc", "radii": { "tl": 24 } }
// 직각으로 복귀
{ "itemId": "itm_abc", "radius": 0 }
```

### 에러 코드(커맨드)

| code | 조건 |
|---|---|
| `item-not-found` | `itemId` 미존재 |
| `not-a-rectangle` | 대상이 shape/rectangle 아님 |
| `invalid-input` | `radius`·`radii` 둘 다 또는 둘 다 없음 / 비유한 값 |

## QA / SVL

- e2e: 사각형 추가 → corner radius 12 적용 → DOM/geometry 둥글기 확인 → Cmd+Z 직각 복원
  → Cmd+Shift+Z 재적용. 언링크 후 tl만 변경. 멀티셀렉트 Mixed 표시.
- `pnpm verify`: tsc + lint + declarativecheck(Rule 6) + puritycheck 그린.

## Out of scope

- 비-rectangle 둥글기, 0..1 비율 입력, speech-bubble `cornerRadius` surface.
