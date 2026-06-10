# WI-167 — 에이전트 chart.add 페이지 리타겟 갭 수정

- Status: DONE (2026-06-11)
- Origin: 사용자 검증 요청 — "아쿠 에이전트 편집이 프레젠테이션 모드(페이지 단위
  편집)에서 정상 반영되는지 확인. 편집은 현재 편집 중인 페이지 또는 새 페이지에
  적용되어야 한다."
- Related: WI-153 P4 (`retargetAgentRootAdd` 도입), DR-111 D5, WI-166
  (InsertionPolicy.containerFor가 정책 원천), WI-077 (`weave.chart.add`)

## 검증 결과 (수정 전)

| 경로 | 판정 |
|---|---|
| `weave.item.add` leaf, containerId 생략/root | ✅ 활성 페이지로 리타겟 (WI-153 P4) |
| `weave.item.add` kind:"frame" at root | ✅ 면제 = 새 슬라이드; `reconcilePresentationOrder`가 레일 자동 append |
| 새 페이지에 내용 채우기 (명시 containerId) | ✅ 비-root 무변경 통과 |
| `weave.preset.insertSlide` | ✅ root 삽입 = 새 페이지 (의도된 동작) |
| **`weave.chart.add` containerId 생략/root** | ❌ **root에 착지 → 활성 페이지만 렌더되므로 보이지 않는 차트** |

`weave.chart.add`는 에이전트의 주력 차트 생성 도구(스키마: "containerId 생략 →
design root")인데 WI-153 P4 가드가 `weave.item.add`만 검사해 빠졌다. 시스템
프롬프트 안내([페이지 편집] 라인)가 유일한 완화책 — 강제 장치 없음.

## 수정

- `agent-page-target.ts` — `ROOT_ADD_COMMANDS = {weave.item.add, weave.chart.add}`
  Set으로 확장. 차트는 콘텐츠이지 페이지가 될 수 없으므로 frame 면제 불필요
  (chart.add input에는 `kind` 필드 자체가 없어 기존 검사 vacuous).
- `use-aku-agent.ts` [페이지 편집] 프롬프트 라인에 "차트" 명시.
- 단위테스트 4건 추가 (생략→리타겟 / 명시 root→리타겟 / 실제 frame→무변경 /
  infinite 무변경).

## Verification

- tsc clean, vitest **1019 passed / 99 files** (+4), biome 0 errors(터치 파일),
  구조 게이트 5종(token/declarative/purity/inheritance/modeboundary) 전부 OK.
- e2e 미실행 — 변경은 순수 입력 변환 함수 1곳 + 프롬프트 문자열 1단어로 e2e
  표면 무영향 (chart.add 경로의 컨테이너 해석은 단위 레벨에서 완결 검증).

## Next

~~없음. 향후 containerId-optional 신규 add 계열 커맨드를 에이전트에 노출할 때는
`ROOT_ADD_COMMANDS` 등재 여부를 체크리스트에 포함할 것 (이번 갭의 재발 방지
포인트 — weave.preset.insertSlide처럼 "root가 정답"인 커맨드는 제외).~~

**SUPERSEDED by DR-115 / WI-168 (2026-06-11)** — 가드(교정) 모델 자체가
flavor별 AgentSurfacePolicy(닫힌 allow-list + 어댑터)로 대체되었다.
`agent-page-target.ts`(`ROOT_ADD_COMMANDS` 포함)는 디커미션. 위 체크리스트의
재발 방지는 이제 `editor-mode/agent-surface.coverage.test.ts`의 exhaustiveness
가드(신규 등록 커맨드는 enlist 또는 명시 exclude를 강제)가 구조적으로 수행한다.
