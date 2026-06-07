# WI-128 — 선(line)의 bounds는 일반 박스와 다르다는 것을 에이전트에 grounding

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-07) |
| Owner | hbpark |
| Decision | DR-083 |
| Relates | DR-082(px↔ratio 단위 오인 가드) · DR-025/WI-062(line = 독립 kind) · weave-capabilities |

## Problem (operator, 2026-06-07)

> "선을 표시할때는 일반적인 바운드와 다르다는걸 ai가 알수있어야할거같아"

`line`(과 `shape` poly)은 `attrs.frame`(부모 대비 0..1 박스)이 **그려지는 선 그 자체가 아니라
점들을 감싸는 bounding box**일 뿐이다. 실제 획은 `attrs.points`(각 {x,y}가 그 bbox의 0..1 비율)을
지나는 폴리라인이다. 그런데 아쿠 에이전트는 box/text/image/filled-shape처럼 `frame`을 "보이는
사각형"으로 읽도록만 grounding 되어 있어, 선의 **방향·기울기·끝점**을 frame만 보고 오해한다.

핵심 증상 클래스: frame이 같아도 `points:[{0,0},{1,1}]`(↘)과 `[{0,1},{1,0}]`(↗)은 정반대 대각선.
에이전트가 선을 읽거나(스냅샷 해석) 편집할 때 frame만 만지면 획 전체가 평행이동/스케일될 뿐,
"어느 모서리를 잇는가 / 방향을 뒤집어라"는 의도가 반영되지 않는다.

스냅샷 자체에는 `points`가 이미 들어있다(`serializer.toJSON(document)`, vendored
`@agocraft/agent-client`). 즉 데이터 누락이 아니라 **해석 grounding 누락**이다.

## Change (prompt-grounding only)

- **A** `weave-capabilities.ts` `line` itemKind description: "BOUNDS ARE NOT THE LINE — read
  `points`, not `frame`" 문단 추가. frame=bbox일 뿐, 끝점 design-pos = `frame.x/y + point ×
  frame.width/height`, 같은 frame이 정반대 대각선이 될 수 있음, 편집 시 frame만 바꾸면 강체
  이동/스케일·방향/끝점은 points로 바꾸라고 명시.
- **B** `weave-capabilities.ts` `WEAVE_DOMAIN_KNOWLEDGE` §1(좌표 모델): "LINE / POLY EXCEPTION"
  절 추가 — 캐시되는 도메인 블록에 같은 규칙을 1회 고정.

런타임 가드는 추가하지 않음(WI-127과 달리 "복구할 잘못된 값"이 아니라 읽기/해석 문제 → DR-083 §Why not).

## Acceptance

- [x] `line` 설명에 frame≠획, points 우선 읽기, endpoint = frame + point×size 공식 포함.
- [x] 도메인 §1에 line/poly 예외 절 포함.
- [x] `editableAttrs`(구조) 불변 → capabilities coverage 테스트 green.
- [x] tsc 0.

## Verification (SVL gate — 2026-06-07)

- `npx tsc --noEmit -p tsconfig.json` (apps/web) → **0 errors**.
- `npx vitest run src/features/aku/agent/weave-capabilities.coverage.test.ts` → **9/9 green**.
