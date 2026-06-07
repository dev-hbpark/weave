# DR-099 — weave.subtree.add 에이전트에서 은퇴 (decommission)

- 상태: ACCEPTED
- 날짜: 2026-06-08
- Supersedes: DR-096(subtree.add v1), DR-097(layout-at-creation)
- 관련: small-think DR-046(build 계측)·DR-047(가이드)·DR-048(롤백+v2 재측정), HANDOFF-026/025

## 맥락

`weave.subtree.add`(DR-096/097)는 small-think build 비용(전체 82%, 턴당 1편집)을 줄이려고
도입한 **에이전트 전용** 도구였다. 실측 귀결(small-think DR-048):

- v1(layout 없음): net-negative — 총 턴 +69%, 수정/생성 1.45→4.08, 폰트 작고 모양 안 맞음.
- v2(layout-at-creation, DR-097): 회귀는 해소(수정/생성 1.50, frame_setLayout 98→5)됐으나
  단일 add와 **기껏해야 parity**(턴 74 vs 67) — **이득 없음.**

DR-064는 "등록된 모든 커맨드를 필터 없이 에이전트에 노출"한다(숨겨진-채-등록 금지). 가이드를
롤백(DR-048)해도 도구가 등록돼 있으면 모델이 자발적으로 집어 쓰고, 업사이드 없이 품질 리스크만
남는다. `weave.subtree.add`는 **비-에이전트(프로그램적) 소비자가 없다**(오직 에이전트용).

## 결정

`weave.subtree.add`를 **은퇴**한다 — hide-filter(특례, DR-064 위반)가 아니라 **등록 해제 +
스키마/테스트 제거**(클린 decommission, DR-064 원칙 유지: 등록=노출):

- `commands.ts`: `addSubtree` 커맨드 + `SubtreeNodeSpec`/`AddSubtreeInput` 타입 제거,
  `buildWeaveCommands` 반환에서 제외.
- `weave-command-schemas.ts`: `"weave.subtree.add"` 스키마 + 라벨 제거(coverage 1:1 유지).
- `commands.test.ts`: subtree.add describe 블록 제거.
- DR-096/097 → SUPERSEDED, WI-141/142 → RETIRED 표기(감사 추적 보존, 본문 유지).

단일 add(프레임→레이아웃→자식 즉시정위치→피드백 반복)가 build 기본 경로로 남는다.

## 결과 / 교훈

- 에이전트가 더 이상 subtree.add를 쓰지 않음 → 검증된 단일 add 품질로 일원화.
- DR-064 "all public" 원칙 유지(숨김 없음, 그냥 미등록).
- **교훈:** "build 턴 줄이기"가 곧 개선이 아니다. 블라인드 통째 생성은 사후 수정/품질 리스크를
  낳고, 에이전트의 턴별·피드백 루프가 더 견고하다. 이득 0·리스크 有 도구는 은퇴가 정답.
- (서브트리 원자 생성이 다시 필요하면 `item.create`+`serializeItemSubtree` 인프라는 그대로
  남아 있으므로 프로그램적/preset 용도로 재구현 가능 — 단 에이전트 build 가속 목적은 기각됨.)

## 검증

`apps/web` typecheck + commands.test.ts + coverage(커맨드↔스키마 1:1, subtree 양쪽 제거로 일관) +
aku-agent 스위트 그린. biome 클린. Rule 6 게이트 OK.
