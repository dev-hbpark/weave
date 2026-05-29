# Engineering Plan — Freeform polygon `poly` (WI-057)

## Scope

자유 정점 폴리곤. 변형은 커맨드 경유, 모델·렌더·커맨드는 agocraft, UX는 weave, 이름 `poly`.

## Architecture

```
생성: shape-section sub-kind picker "자유 다각형" → defaultSubAttrsForKind(poly)
        → weave.item.add(attrsOverride: { shape:"poly", subAttrs:{points,closed} })
변형: (Phase 1) UI 커맨드 / Aku 에이전트 → editor.exec("weave.shape.setVertices", {points, closed?})
       (Phase 2) 정점 핸들 드래그 → 동일 커맨드
        → agocraft createSetPolyPointsCommand → item.attrs Patch → History
렌더: ShapeBlock → shapeToSvgGeometry(poly) → <polygon> | <polyline>  (변경 0)
```

## agocraft (WI-027) — 모델·렌더·커맨드

- `ShapeSubAttrs`: `{ shape:"poly", points: PolyPoint[](0..1 bbox), closed }`.
- `shapeToSvgGeometry`: 정점×bbox px → closed? `<polygon>` : `<polyline>`.
- `createSetPolyPointsCommand(name)`: item.attrs 패치, clamp[0,1], ≥3/≥2 검증,
  `not-a-poly`/`invalid-points` guard.

## weave — UX + 등록 + 스키마

- `commands.ts`: `createSetPolyPointsCommand("weave.shape.setVertices")` 등록.
- `weave-command-schemas.ts`: 상세 schema(points 0..1, closed) + label.
- `shape-section.tsx` + `IconShapePoly`: 생성 UX.

## AGENT_COMMAND_SCHEMAS — `weave.shape.setVertices`

| 항목 | 값 |
|---|---|
| name | `weave.shape.setVertices` |
| label | `"다각형 정점 편집"` |
| 대상 | `shape` + `subAttrs.shape === "poly"` (`not-a-poly`) |
| points | `[{x:0..1, y:0..1}]` — bbox 비율, 완전 교체. clamp[0,1] |
| closed | optional. true(≥3)=polygon, false(≥2)=polyline. 생략 시 현재값 유지 |
| 에러 | `item-not-found` / `not-a-poly` / `invalid-points` |

```jsonc
{ "itemId":"itm_x", "points":[{"x":0,"y":0},{"x":1,"y":0},{"x":0.5,"y":1}], "closed":true }
```

## QA / SVL

- agocraft: builtin-kinds + editing-commands 단위 (85 green).
- weave: commands/fill-paint 단위 62 green, e2e `shape-poly.spec.ts` 3/3
  (생성→`<polygon>`, setVertices reshape, Cmd+Z, open→`<polyline>`, guard).

## Phase 2 (deferred) — 정점 드래그 UX

InteractionMode `vertex-edit` + selection-chrome 정점 핸들(transform/rotation-aware)
+ gesture binding(drag→normalized→setVertices) + 정점 추가(엣지 더블클릭)/삭제(Delete)
+ 진입(더블클릭)/이탈(Esc). `frame-default-view-model.tsx` 패턴 미러.

## Out of scope

정점 모서리 라운딩, ColorPicker radial 등.
