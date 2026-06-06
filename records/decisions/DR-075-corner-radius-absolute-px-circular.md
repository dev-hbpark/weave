# DR-075 — Corner radius: absolute-px, circular, half-short clamp (frames / images / videos)

- **Date:** 2026-06-06 · **Status:** Accepted · **WI:** WI-108
- **Relates:** `apps/web/src/document/corner-radius.ts` (new), `domains/FrameBlock.tsx`,
  `domains/ImageBlock.tsx`, `domains/VideoBlock.tsx`, `toolbar/sections/corner-radius-field.tsx` (new),
  `image-section.tsx` / `video-section.tsx` / `frame-background-section.tsx`,
  `migrate-corner-radius-px.ts` (new) + `storage.ts`, `types.ts` (`FrameAttrs.cornerRadius`,
  `Design.meta.cornerRadiusUnit`). Shapes already follow this model (agocraft `CornerRadii`,
  `rectPathWithPerCornerRadii`, clamp `min(w,h)/2`).
- **Operator directive (2026-06-06):** 도형/프레임/이미지 모서리 곡률은 짧은 변 기준 50%까지만,
  변 길이가 변해도 같은 모양 유지, 가로·세로는 항상 같은 곡률(원형)이어야 한다. 리사이즈 동작은
  **절대 px 고정(Figma 방식)** 으로 확정.

## Context

기존 프레임/이미지/비디오 곡률은 `0..1` 비율로 저장되고 **축별 퍼센트**로 렌더됐다:
- image/video: CSS `border-radius: ratio*50%` (퍼센트는 축별 → 타원)
- frame: SVG `rx = ratio*0.5*w`, `ry = ratio*0.5*h` (타원)

→ 비정사각 박스에서 가로·세로 곡률이 **달라지는**(타원) 상태로 요구사항 3 위반. 비율 저장은
리사이즈 시 곡률이 짧은변에 비례해 같이 커지므로 운영자가 고른 "절대 px 고정"과도 불일치.

## Decision

곡률을 **절대 design-px 스칼라**로 저장하고, **항상 원형(rx === ry)** 으로 그리며,
**짧은 변의 절반(`min(w,h)/2`)** 으로 클램프한다. 도형이 이미 쓰던 모델로 프레임/이미지/비디오를
통일. 세 요구사항이 이 한 모델에서 동시에 충족된다:

1. 상한 = 짧은변 50% → 렌더 시 `min(w,h)/2` 클램프.
2. 리사이즈해도 같은 모양 → px는 크기 독립. 짧은변이 `2*r` 아래로 줄 때만 클램프 재개.
3. 가로·세로 동일 곡률 → 스칼라 하나, 원형.

### D1 — 렌더 분기 (`corner-radius.ts`)
- **image/video:** CSS `border-radius: ${px}px`. 브라우저가 단일 px 값을 짧은변 절반으로 자동
  클램프 + 원형 → 통과만 하면 됨.
- **frame(SVG `<rect>`):** SVG는 rx/ry를 **독립** 클램프(넓은 박스 → 알약/타원)하므로 직접
  클램프. `cornerRadius`를 design 박스(`offsetWidth/Height`, 줌 비반영)의 반-짧은변 대비
  fraction으로 환산 후, 측정한 screen-px 박스(`getBoundingClientRect`)의 반-짧은변에 곱한다 →
  모든 줌에서 양축 동일 곡률.

### D2 — 입력 (`CornerRadiusField` 공유 컴포넌트)
슬라이더는 0..1(반-짧은변 대비 fraction, 0=각짐·1=알약)로 동작하되 저장은 px. 읽기: 첫 아이템의
절대 박스(`absoluteFrameBox`)로 px→fraction. 쓰기: **아이템별** 박스로 fraction→px(서로 다른
크기의 다중 선택도 각자 올바른 절대 px). image/video/frame 세 섹션이 한 컴포넌트 재사용 — px
수학 중복 없음. 프레임/비디오에는 곡률 컨트롤이 없었으나 이번에 추가(absolute 프레임도 `Bar.More`
"스타일" 그룹으로 노출).

### D3 — 마이그레이션 (`migrate-corner-radius-px.ts`, load-time 문서 walk)
레거시 0..1 비율을 `px = ratio*(min(absW,absH)/2)`로 변환(짧은축 곡률 보존). 절대 박스는 조상
체인의 frame 비율 곱 × design 크기이므로 **per-item agocraft `Migration`으로는 불가**(한 아이템만
보임) → 런타임 트리 + design 크기를 아는 load 시점 walk로 처리. px와 비율은 구분 불가 →
**비멱등**이므로 정확히 1회만: `Design.meta.cornerRadiusUnit`(optional, blob schemaVersion 5
유지 → 구버전 클라이언트 호환)로 게이트, 변환 후 `"px"` 스탬프. 마커는 `design.meta`에 실려
`toSerializedDesign` 통과로 저장에 자동 전파. 모든 load 반환 경로(`hydrateSerializedDesign`,
`loadDesign` v5/v4)가 `finalizeCornerRadius`를 통과 → load 후 편집+저장이 비율로 재해석될 일 없음.
신규 디자인은 생성 시 `cornerRadiusUnit:"px"`.

### D4 — 크로스 프로젝트 (agocraft, 시블링)
`ImageAttrs.borderRadius`/`VideoAttrs.borderRadius` 의미 주석을 `0..1` → "absolute design-px"로
갱신. 검증은 이미 `minValue(0)`(상한 없음)이라 px 허용 → **스키마/계약 변경 없음, 주석만**. weave가
image/video 렌더를 소유하므로 agocraft 런타임 영향 없음. (운영자가 양 프로젝트를 한 세션에서 소유 —
CLAUDE.md 시블링 편집 허용. 이 DR이 페이퍼트레일.)

## Consequences

- 비정사각 프레임/이미지/비디오 모서리가 타원 → **원형**. 기존 둥근 미디어가 있던 문서는 마이그레이션이
  짧은축 곡률을 px로 보존(장축은 더 둥글었다가 원형으로 — 의도된 수정).
- 리사이즈 시 곡률 px 고정(Figma). 줌과 무관하게 원형 유지.
- 검증: `corner-radius.test.ts`(9), `migrate-corner-radius-px.test.ts`(4, 비멱등 포함),
  e2e `corner-radius-circular.spec.ts`(비정사각 프레임 rx===ry + 클램프, 라이브 런타임). 전체
  단위 668 통과, typecheck/biome/production build 그린.

## Alternatives rejected

- **비율 유지(짧은변 대비)** — 리사이즈 시 곡률이 비례 스케일. 운영자가 "절대 px 고정"을 명시 선택.
- **값 범위 휴리스틱 게이트(>1=px)** — 0.5~1px 정당값·작은 박스에서 오인 → 비율↔px 모호. 명시
  버전/마커 게이트 채택.
- **storage blob schemaVersion 5→6 게이트** — `=== 5` 게이트 다수 + 키 프리픽스 + 구클라이언트
  forward-incompat. optional `meta.cornerRadiusUnit`로 5 유지하며 동일 효과.
