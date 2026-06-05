# WI-099 — 감사: 모든 아이템 attr·unit이 에이전트에 빠짐없이 전달되는지

| Field | Value |
|---|---|
| Status | Done (single-session, 2026-06-05) |
| Owner | hbpark |
| Decision | DR-068 |
| Relates | DR-059(외곽선), DR-061(lock), WI-074(crop/flip), WI-058(QR), DR-067(chart) |

## Problem (operator, 2026-06-05)

텍스트 외곽선이 가이드에서 빠진 것 같다 → 모든 아이템의 모든 attr·unit이 에이전트(capabilities
+ command 스키마)에 빠짐없이 전달되는지 검수.

## 발견된 갭

- text: `textOutline`(전체 외곽선 DR-059) 완전 누락(지적), `textOverflow`·`hyperlink` 누락.
- image: `cropRatio` 누락. video: `volume`·`playbackRate`·`borderRadius` 누락.
- **qr itemKind 자체가 capabilities에 없음**(명령 노트만).
- 모든 아이템 공통 `locked`(DR-061) 미문서화.
- unit: `transform.flip`이 capabilities unitKinds에 없음(명령 EDIT_UNITS엔 있음).
- (behavior: 등록된 camera-target/hotspot/reveal-on-step/button-trigger 4종은 모두 반영됨;
  hover-effect/entrance-animation은 미등록 타입 → 비대상.)

## Change

위 갭 전부 보강(capabilities description+editableAttrs, TEXT_ATTRS_NOTE, 도메인지식 rule6의
locked, unitKinds의 transform.flip, 신규 qr itemKind). **가드 테스트** 추가:
`weave-capabilities.coverage.test.ts` — 모든 known kind에 (a) capability itemKind 존재,
(b) 시드 attr(`defaultAttrsFor`)이 editableAttrs에 포함(명시 skip 제외) 강제.

## Acceptance

- text 외곽선/오버플로/링크, image crop, video volume/rate/radius, qr, locked, flip 모두 노출. ✔
- 가드 9케이스 통과(빠진 attr=0). ✔
- 코드/동작 변경 없음(기존 기능 문서화). ✔

## Verification (2026-06-05, SVL gate)

- Typecheck clean; aku-agent 스위트 30 통과(신규 capabilities 커버리지 9 포함); biome clean.

See DR-068.
