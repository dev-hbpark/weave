# WI-133 — 새 레이아웃 기능을 속성 UX + 에이전트 스키마에 연결

| Field | Value |
|---|---|
| Status | Built (single-session, 2026-06-07) |
| Owner | hbpark |
| Decision | agocraft DR-047 (엔진) · 본 WI (UX/스키마 노출) |
| Relates | WI-132(엔진 구현) · `@agocraft/layout` 1.0.0-rc.20260607030000 · weave-capabilities/command-schemas · frame-background-section · e2e layout-extensions-* |

## Problem (operator, 2026-06-07)

WI-132 가 엔진(core+layout)에 CSS 기능을 전부 구현했지만, **속성설정 UX와 아쿠 에이전트
스키마는 옛 subset 그대로**라 사용자가 툴바로 설정 불가 + 에이전트가 새 필드를 생성 안 함.
"속성설정용 ux와 커맨드 에이전트 스키마까지 모두" 연결 요청.

## Change

### A. 에이전트 스키마 (위험 낮음)
- `weave-command-schemas.ts` `LAYOUT_SPEC` / `LAYOUT_CHILD_POLICY` 설명에 신규 필드 추가:
  flex `space-evenly`/`baseline`/`wrap`/`alignContent`, grid `minmax`/`columnsRepeat`/`rowsRepeat`/`autoFlow`/`dense`/`areas`, child `area`. (스키마는 `additionalProperties:true` 프로즈형 — 설명만으로 에이전트가 사용 가능.)
- `weave-capabilities.ts` layoutKinds 산문 갱신 + 낡은 "no wrap in v1.1" / "no auto-fill/minmax/areas in v1.1" 문구 제거.

### B. 속성 UX (Design System Triage: **reuse** — 기존 Switch/Select 재사용, 신규 primitive/token 없음 → design review 불요)
- `frame-background-section.tsx`:
  - Flex 분포 Select 에 `space-evenly` 추가
  - Flex "줄바꿈" Switch(`wrap`) + 켜지면 align-content Select 노출
  - Grid "자동 배치" Select(`autoFlow` 행/열 우선) + "빈칸 채우기" Switch(`dense`)
- 의도적 UI 제외 (엔진/에이전트로는 사용 가능): `baseline`(=start, 혼동 방지), `minmax` per-track 에디터, `grid-template-areas` 템플릿 에디터, `auto-fill repeat` — 각각 신규 DS primitive 가 필요해 별도 WI 로 분리(아래 Follow-up).

### C. 엔진 버그 수정 (e2e 가 잡음)
커맨드 경로 e2e 가 발견: `engine.ts` 의 grid 셀-경계 검사 2곳(`joinPolicy`, `SAME_PARADIGM_REASSIGN`)이 `columns.length` 만 보고 `columnsRepeat`/`areas` 를 무시 → 재레이아웃 시 col4 가 "범위 밖"으로 오판되어 잘못 배치. `gridDims(spec)` 헬퍼로 repeat/areas 반영. layout 재벤더 `…20260607030000`.

## Acceptance

- [x] 에이전트 스키마/capabilities 갱신, weave typecheck 0
- [x] 커맨드 경로 e2e `layout-extensions-command-path.spec.ts` 3 pass (wrap/minmax+repeat/areas 가 weave.frame.setLayout·setLayoutChild 로 저장·반영)
- [x] 툴바 UI e2e `layout-extensions-toolbar.spec.ts` 2 pass (실제 Switch/Select 조작 → spec.wrap/alignContent/dense/autoFlow 저장)
- [x] 기존 `contextual-toolbar-redesign` e2e 회귀 없음
- [x] 엔진 유닛 251 + 파리티 13(120/120,224/224,8) 유지
- [x] **에이전트 서버 전달 확인**: `LAYOUT_SPEC`/`LAYOUT_CHILD_POLICY`(신규 prose)가
      `WEAVE_COMMAND_SCHEMAS[setLayout/setLayoutChild].inputSchema` 에 참조되고, `use-aku-agent`
      이 `connectAgocraftAgent({ schemas, capabilities, domain })` 로 전달 → 벤더된 agent-client
      (`…20260605120000`)가 `applyCommandSchemas`/`describeCommands`(툴 정의) + `capabilities()` +
      `domain`(init hello)로 서버에 송신. **agent-client 재벤더 불필요**(런타임 인자만 relay).
      신규 가드 `weave-command-schemas.layout.test.ts` 5 pass — 송신되는 inputSchema+capabilities 가
      wrap/alignContent/space-evenly/baseline/minmax/columnsRepeat/auto-fill/auto-fit/autoFlow/dense/areas/area
      를 모두 포함하고, 폐기된 "no wrap/minmax/v1.1" 문구가 없음을 박제.

## Follow-up (분리)
- minmax per-track 에디터 (TrackSizeEditor 확장 + DS review)
- grid-template-areas 시각 편집기 (신규 DS 컴포넌트)
- auto-fill/auto-fit repeat 토글 UI
