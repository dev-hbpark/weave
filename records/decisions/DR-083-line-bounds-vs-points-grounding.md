# DR-083 — 선(line) bounds ≠ 그려진 획: 에이전트에 points-우선 grounding

| Field | Value |
|---|---|
| Status | Accepted (2026-06-07) |
| Owner | hbpark |
| Relates | DR-082(px↔ratio 단위 오인) · DR-025/WI-062(line 독립 kind) · WI-128 |

## Context

weave의 `frame.{x,y,width,height}`는 부모 대비 0..1 비율 박스다. box/text/image/filled-shape는
이 frame이 **곧 보이는 사각형**이라 frame만 읽으면 위치·크기를 안다.

그러나 vendored `@agocraft/core`의 `LineAttrs`는:

```ts
interface LineAttrs {
  readonly frame: ItemFrame;                 // 점들을 감싸는 bbox일 뿐
  readonly points: ReadonlyArray<PolyPoint>; // 각 {x,y}=bbox의 0..1 → 실제 획
  readonly smooth?: boolean; readonly heads?: ArrowHeads;
}
```

즉 `line`(과 `shape` poly)에서 frame은 **그려진 도형이 아니라 points의 bounding box**다.
같은 frame이라도 `points:[{0,0},{1,1}]`(↘)과 `[{0,1},{1,0}]`(↗)은 정반대 대각선.

에이전트가 읽는 스냅샷(`serializer.toJSON(document)`)에는 `points`가 이미 포함된다. 문제는
데이터가 아니라 **grounding**: 아쿠는 모든 kind를 box-frame 모델로만 안내받아, 선의 방향/끝점을
frame만으로 추정하거나 frame만 바꿔 "방향을 바꿔달라"는 의도를 놓친다. 운영자 보고(2026-06-07):
"선을 표시할때는 일반적인 바운드와 다르다는걸 ai가 알수있어야할거같아."

## Decision

DR-082와 동일 위치(에이전트 grounding 레이어)·동일 철학으로, **prompt-grounding만** 보강한다.
런타임 값 복구(WI-127 A/B 같은 sanitize)는 하지 않는다 — 여기엔 "틀린 값"이 없고 해석 규칙만 빠졌다.

- **A. `line` itemKind 설명** (`weave-capabilities.ts`): "BOUNDS ARE NOT THE LINE" 문단.
  - frame = points를 감싸는 bbox일 뿐, 그려지는 건 points를 지나는 폴리라인.
  - 끝점 design-pos = `frame.x/y + point × frame.width/height` — frame만으로 추정 금지.
  - 같은 frame이 정반대 대각선이 될 수 있음(예시 포함).
  - 편집: frame만 바꾸면 획 전체가 강체 이동/스케일(points는 0..1 유지). 잇는 모서리/방향/
    각도/단일 끝점을 바꾸려면 `points`를 편집(예: `[{x:0,y:1},{x:1,y:0}]`로 대각선 뒤집기).
- **B. `WEAVE_DOMAIN_KNOWLEDGE` §1** 좌표 모델에 "LINE / POLY EXCEPTION" 절 1회 고정(캐시 블록).

## Why not

- **core `LineAttrs`/serializer 수정해 frame을 끝점으로 재표현**: core는 vendored → re-vendor
  비용 + 다른 소비자 영향. 데이터(points)는 이미 충분, 해석만 보강하면 된다.
- **런타임 sanitize 가드 추가(WI-127식)**: 선의 frame/points는 둘 다 유효한 값이라 "복구"
  대상이 아니다. 잘못된 건 에이전트의 *해석*이므로 grounding이 올바른 레이어.
- **per-turn primer에 추가**: 토큰 모델상(WI-078) 안정적 구조 규칙은 캐시되는 도메인 블록에
  1회 — primer는 compact recall pointer. 그래서 §1(도메인) + itemKind(capabilities)에 배치.

## Consequence

- 아쿠가 선을 읽을 때 points로 방향/끝점을 해석하고, 편집 시 의도(방향 뒤집기·끝점 이동)를
  frame이 아닌 points로 수행하도록 유도된다.
- 구조(`editableAttrs`) 불변 → 기존 capabilities coverage 가드 그대로 green.
