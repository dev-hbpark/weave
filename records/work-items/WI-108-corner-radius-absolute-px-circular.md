# WI-108 — 모서리 곡률 절대-px · 원형 · 짧은변 50% 클램프 (프레임/이미지/비디오)

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-06) |
| Owner | hbpark |
| Decision | DR-075 |
| Relates | 도형(agocraft `CornerRadii`)이 이미 따르던 모델로 프레임/이미지/비디오 통일 · WI-031(곡률 직접 드래그 — 핸들 미구현, 후속) |

## Problem (operator, 2026-06-06)

도형/프레임/이미지 모서리 곡률은 (1) 짧은 변 기준 50%까지만, (2) 변 길이가 변해도 같은 모양 유지,
(3) 가로·세로 항상 같은 곡률(원형)이어야 한다. 리사이즈 동작은 **절대 px 고정(Figma)** 으로 확정.
기존 프레임/이미지/비디오는 0..1 비율 + 축별 퍼센트로 그려져 비정사각에서 **타원**이었다(요구 3 위반).

## Change (DR-075)

- `document/corner-radius.ts` (신규) — `clampCornerRadiusPx` / `cornerRadiusPxToFraction` /
  `cornerRadiusFractionToPx` 순수 헬퍼.
- 렌더: `FrameBlock`(SVG rx===ry=fraction×screen-반짧은변, design 크기는 `offsetWidth/Height`),
  `ImageBlock`·`VideoBlock`(`border-radius:${px}px` — 브라우저 자동 원형+클램프).
- 입력: `toolbar/sections/corner-radius-field.tsx` (신규, 공유) — 슬라이더 0..1↔px 아이템별 변환.
  image/video/frame 세 섹션이 재사용. 프레임/비디오 곡률 컨트롤 신규 추가(absolute 프레임 포함).
- 저장/마이그레이션: `migrate-corner-radius-px.ts` (신규) load-time 문서 walk(비율→px,
  조상 체인×design 크기로 절대 박스). `storage.ts` `finalizeCornerRadius` 게이트 +
  `Design.meta.cornerRadiusUnit`(blob v5 유지). 신규 디자인은 px로 출생.
- 타입/주석: `types.ts` `FrameAttrs.cornerRadius`(px) · `Design.meta.cornerRadiusUnit`.
  agocraft(시블링) `Image/VideoAttrs.borderRadius` 주석 px(스키마 무변경, DR-075 §D4).

## Acceptance

- [x] 비정사각 프레임/이미지/비디오 모서리가 **원형**(rx===ry / 단일 px)로 렌더.
- [x] 곡률 상한 = 짧은변 50%(`min(w,h)/2` 클램프), 초과 입력은 알약으로 saturate.
- [x] 리사이즈 시 px 고정(늘리면 그대로, 짧은변이 2×r 아래로 줄면 클램프 재개).
- [x] 레거시 0..1 비율 문서 load 시 1회 px 변환 + 마커 스탬프(비멱등 가드).
- [x] 검증: 단위 `corner-radius.test.ts`(9)+`migrate-corner-radius-px.test.ts`(4),
  e2e `corner-radius-circular.spec.ts`(라이브 런타임 rx===ry+클램프). 전체 단위 668·typecheck·
  biome·production build 그린.

## Deferred

- WI-031 곡률 **캔버스 직접 드래그 핸들**(현재 슬라이더만). 본 WI의 px 모델 위에 후속.
- per-corner(4모서리 개별) 곡률은 프레임/이미지/비디오 미지원(도형만). 요구는 균일 원형.
