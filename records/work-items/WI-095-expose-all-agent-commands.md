# WI-095 — 히든 커맨드 전체 공개 + 에이전트 편집 커버리지 감사

| Field | Value |
|---|---|
| Status | Done (single-session, 2026-06-05) |
| Owner | hbpark |
| Decision | DR-064 |
| Relates | WI-063(통합), WI-064(다중선택 흡수), WI-090(아이템 링크), WI-094/DR-063(부분편집) |

## Problem (operator, 2026-06-05)

"히든 커맨드를 모두 공개 커맨드로 바꿔줘. 그리고 weave에서 모델을 편집할 수 있는 방식 중
커맨드로 제공하지 않고 있는 게 있는지도 검사해줘." (AskUserQuestion → **전부 공개**)

`use-aku-agent.ts`가 11개 커맨드를 에이전트에서 숨김:
- 통합으로 대체된 setter 6(setFill/setCornerRadius/setVertices/setDecoration/image.setCrop/item.flip)
- 다중선택 레거시 3(items.resizeMulti/remove/duplicate)
- doc.reset(파괴적), preset.*(presetId 추측→preset-not-found)

## Change

1. 숨김 제거: `AGENT_HIDDEN_COMMANDS`·prefix·`withoutPresetCommands` 삭제 → 레지스트리
   `list()` 그대로 노출(모든 weave.* 커맨드 = 에이전트 도구).
2. 재노출 커맨드에 정식 스키마 부여: 주석 7개 해제 + 스키마 없던 2개(image.setCrop,
   item.flip) 신규 + preset.insertSlide에 **presetId enum 25개**. 각 setter 노트에
   "consolidated 커맨드로도 가능" 명시.
3. 커버리지 가드 테스트(`weave-command-schemas.coverage.test.ts`): 등록 커맨드 전부
   스키마 보유 + preset enum 25 검증.

## Audit (커맨드 없는 편집 표면?)

모든 mutation은 `editor.exec("weave.*")` 경유(History 규칙). exec 호출처 ↔ 등록 셋
대조 결과 **커맨드 없는 편집 경로 없음**, 이번 변경 후 **에이전트가 못 쓰는 커맨드도 없음**.
유일한 문서화 갭: 아이템 링크(`button-trigger` behavior, WI-090)가 capabilities에 없어
에이전트가 저작 못함 → capabilities unitKinds에 `button-trigger` 추가(HotspotAction
external/jump-camera, `present-<frameId>`).

## Acceptance

- 에이전트 도구 목록 = 등록 커맨드 전체(히든 0), 각 커맨드 스키마 보유. ✔
- preset.insertSlide presetId enum 25개. ✔
- 아이템 링크가 capabilities에 문서화. ✔

## 후속 (2026-06-05) — 커맨드별 설명이 실제 에이전트에 전달되게

오퍼레이터: "모든 항목에 적절한 설명이 에이전트에 전달되도록 정리됐나?" 점검 결과 **아니오**:
도구 description은 커맨드 이름으로 폴백(`AgentCommandSpec`에 description 없음), 게다가
어떤 커맨드도 최상위 `inputSchema.description`이 없어 ~18개가 이름만 전달됐다(z-order/swap/
clipboard/behavior/design-level/doc.reset + 재노출 setter). 풍부한 설명은 add/update의 `attrs`
속성에만 존재.

조치: 에이전트에 닿는 유일 채널인 `inputSchema.description`을 **모든 44개 커맨드**에 부여.
`obj()` 헬퍼에 description 인자 추가(39개 인라인), kit 재타겟 5개는 `withKitDesc`로 주입(인자
shape는 import 유지). 커버리지 가드에 "모든 커맨드 최상위 description 보유" 단언 추가. (코드
`//` 주석은 에이전트에 전달되지 않음 — 채널이 아님.)

## Verification (2026-06-05, SVL gate)

- **Typecheck:** `@weave/web` clean.
- **Unit:** aku-agent 스위트 + `commands.test.ts` 113 pass(신규 coverage 4).
- **Lint:** biome clean(변경 파일).
- **Rule 6:** declarativecheck 기존 3건만(WI-093), 신규 없음.

See DR-064.
