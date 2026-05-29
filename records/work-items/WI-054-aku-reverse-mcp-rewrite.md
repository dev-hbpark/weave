# WI-054 — 아쿠 (Aku) 실제 에이전트 연결 (reverse-MCP rewrite)

## Metadata

| Field | Value |
|---|---|
| ID | WI-054 |
| Title | WI-052 의 mock transport / 클라이언트 agentic 루프를 폐기하고, `@agocraft/agent-client` (reverse-MCP, small-think 서버) 기반으로 AkuAssistant 재구현. weave 의 **모든** 편집 명령을 대응 + 스트리밍 진행 표시. |
| Owner | hbpark |
| Status | **build 완료. apps/web typecheck + biome + declarativecheck(Rule 6) GREEN. 라이브 대화 e2e 는 agent-server 의존(별도 suite). 레거시 데드코드 제거 완료.** |
| Severity | P2 |
| Created | 2026-05-30 |

## Why

WI-052 는 "지금은 mock, 실제는 나중" 으로 전체 UI + 스트리밍 *프로토콜* 을 로컬 mock 으로 봉인했다. 이번 작업은 그 "나중" — agocraft 쪽에서 만든 reverse-MCP 에이전트 인프라(`@agocraft/agent-client` + `@small-think/*`)에 weave 를 실제로 연결한다. 기존 클라이언트 측 구조는 레거시로 간주하고, agocraft 작업을 토대로 재구현하며 weave 가 관리하는 모든 편집 동작을 대응한다.

## Operator 결정

- **UX = 스트리밍 확장.** request/response 가 아니라, 서버 agent loop 의 `turn`/`tool`/`response` 이벤트를 `submit({ onEvent })` 로 받아 라이브 편집-칩으로 렌더(최종 응답 도착 전부터 진행 표시).
- **설치 먼저, 구현 나중.** vendor 타볼(core/editor/agent-client + small-think-client 스트리밍본) 설치 확인 후 코드 작성.
- **레거시 데드코드 제거.** mock transport + 클라이언트 agentic 루프 + 툴셋 전부 삭제.

## 아키텍처 전환 (HANDOFF-019 / DR-009 준수)

- **이전(WI-052/053):** `AkuTransport`(mock/SSE) + `AkuToolset`(name→executor map) + `useAkuConversation`(클라이언트 agentic bounce 루프). 토큰 스트림은 클라이언트가 돌림.
- **이후(WI-054):** `connectAgocraftAgent({ editor, commands, getDocument, schema, schemas })` 가 weave 의 CommandRegistry 전체를 MCP tool 로 호스팅. **small-think 서버**가 Claude 로 추론하고 weave 명령을 링크 너머로 호출 → 모든 편집이 `editor.exec` → History 경유(undoable). 서버가 진행 이벤트를 `task` 채널로 스트리밍.
- agocraft 코어는 MCP-agnostic 유지(HANDOFF-019). 브리지/연결은 `@agocraft/agent-client` + `@small-think/client` 에만 존재.

## Scope (완료)

- `features/aku/types.ts` — UI 타입(AkuMessage/AkuImage/AkuEditRecord/AkuStatus/AkuDraft/AkuHistoryController)을 transport 계약에서 분리해 이전.
- `features/aku/agent/weave-command-schemas.ts` — weave 의 **29개** `weave.*` 명령 전부의 JSON Schema 인자 계약 + 편집-칩 라벨(`WEAVE_COMMAND_LABELS`). 킷 흡수 명령(remove/reparent/dissolve/duplicate/clipboard/reorder/layout/z-order)은 킷의 `AGENT_COMMAND_SCHEMAS` 입력 형태를 그대로 복사(reparent = `{entries:[…]}`).
- `features/aku/agent/use-aku-agent.ts` — `connectAgocraftAgent` 1회 연결(lazy) + `submit({ onEvent })` 스트리밍 → 메시지 상태. 선택(view-state)은 task 텍스트에 컨텍스트로 주입. turn-level "이 변경 되돌리기" 는 `editor.history.undoSize()` 전후 측정.
- `AkuAssistant.tsx` 재배선(mock/toolset/useAkuConversation → useAkuAgent). UI 셸(AkuPanel/MessageList/AkuComposer/Launcher/coachmark/geometry/storage) 재사용.
- `document/commands.ts` — `weave.item.update` / `weave.behavior.update` 에 **선언적 입력**(`attrs` / `behavior`) 추가. 기존 함수형 `patch` 는 optional 로 유지(UI 호출부 무손상). agent 는 JSON 직렬화 가능한 선언적 형태만 사용. → 함수-값 입력이 agent surface 의 유일한 공백이었고 이로써 29개 전부 대응.

### 모든 편집 동작 대응 (29 commands)

lifecycle(add/remove/items.remove/doc.reset) · attrs(item.update/items.resizeMulti/behavior.update) · design(setBackground/setPresentationOrder/reorderChildren) · z-order(bringForward/sendBackward/bringToFront/sendToBack) · 구조(reparent/frame.removeKeepingChildren) · behaviors(addBehavior/removeBehavior) · preset(insertSlide) · clipboard(copy/cut/paste) · duplicate(item/items) · layout(setLayout/setLayoutChild/swapGridCells/swapFlexOrder/dropGridCell). `connectAgocraftAgent` 가 레지스트리를 enumerate 하므로 신규 명령은 스키마만 추가하면 자동 노출.

## 레거시 제거 (외부 참조 0건 확인 후)

- `features/aku/transport/mock-transport.ts`, `transport/types.ts`
- `features/aku/tools/aku-tools.ts`, `tools/types.ts`
- `features/aku/useAkuConversation.ts`
- (빈 `transport/`·`tools/` 디렉터리 제거)

## 미해결 / 후속

- **라이브 대화 e2e:** agent-server + 모델 + 키 필요 → 오프라인 CI 에서 미실행. `e2e/aku-chat.spec.ts` 는 agent 없이 검증 가능한 패널 셸 + 핫키 격리(editor.exec 시드)만 유지. agent-의존 대화 테스트(스트림 응답/배경 변경)는 서버 의존 suite 로 분리(후속).
- **이미지 첨부:** UI 버블엔 남지만 `submit` 이 이미지를 전달하지 않음(에이전트 vision 미연결). 후속.
- **선택 인식:** 스냅샷은 문서만 포함 → 선택은 task 텍스트로 주입(브리지 스냅샷 비수정). 향후 스냅샷에 selection 포함 검토.
- **운영 와이어링:** dev 기본값(`ws://localhost:8787`, `dev-token`, `VITE_AKU_AGENT_URL`/`VITE_AKU_AGENT_TOKEN` override). prod 는 실제 URL/토큰 + (익명 공유 워크스페이스이므로) 비용/남용 하드닝 필요 — apps/web/CLAUDE.md 보안 모델 참조.

## Verification

- apps/web `pnpm typecheck` = exit 0.
- biome check (변경 파일) = 에러 0 (기존 경고 2건만).
- `pnpm declarativecheck` (Rule 6) = 위반 없음.

## 고도화 2026-05-30 — 에이전트 정상 동작 견고화 (검증 전 전반 보강)

조사 결과 가장 큰 약점은 **에이전트가 받는 정보**였다. small-think design 프롬프트는 `capabilities`(캐시 블록) + 문서 스냅샷(원본 JSON, 20k자 컷)으로 구성되는데, `connectAgocraftAgent`의 자동 capabilities는 `description = kind`(플레이스홀더)뿐이라 에이전트가 attrs 의 **의미·좌표 규약**을 모른 채 추측한다. 또한 각 `submit`은 **독립 실행(대화 메모리 없음)** — 현재 문서 상태 + 주입 컨텍스트만 본다.

보강(weave-local):

- **`agent/weave-capabilities.ts`** — weave-정확 `WEAVE_CAPABILITIES`(5 itemKinds + 3 layoutKinds + 3 unitKinds)를 `connectAgocraftAgent({ capabilities })`로 주입. 각 kind에 의미·attrs·좌표(0..1 비율)·중첩(containerId) 규약을 서술 → 캐시되는 시스템 프롬프트에 들어가 정확도↑. `WEAVE_TASK_PRIMER`(좌표계/ id-discipline / create-then-adjust)는 매 task에 prepend(독립 실행이라 매번 필요, 토큰 소량).
- **연결 견고화** (`use-aku-agent.ts`): 15s 연결 타임아웃 + 실패 시 `connectingRef` 해제(다음 전송에서 깨끗이 재연결). no-token 방어 가드.
- **토큰 재설정** UX: 잘못된 토큰이 막다른 길이 되지 않게 `resetToken()` + 패널 헤더 "토큰 재설정" 버튼(저장 토큰 삭제 → 설정 게이트 복귀).

검증: apps/web typecheck exit 0 · biome(변경 파일) 0건 · declarativecheck 위반 없음. (라이브 루프는 여전히 서버+키 필요 — 아래 런북.)

### 서버 런북 (아쿠가 실제로 동작하려면)

`workspace/small-think` agent-server 를 띄울 때 필요한 env:

| 변수 | 필수 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | LLM 추론 키 (없으면 에이전트 루프 실패) |
| `SMALL_THINK_TOKEN` | ✅ | ctl 채널 공유 토큰 — weave 패널의 "토큰 재설정"/입력값과 **일치**해야 함 |
| `PORT` | — | 기본 8787. weave 클라 기본 URL은 `ws://localhost:8788`(`DEV_URL`) → **불일치 주의**. `VITE_AKU_AGENT_URL`로 맞추거나 서버 PORT를 8788로. |
| `SMALL_THINK_MODEL` | — | 기본 모델 오버라이드 |
| `SMALL_THINK_MAX_TURNS` | — | 에이전트 최대 턴(멀티스텝 편집 충분히) |
| `SMALL_THINK_CRITIQUE_PASSES` | — | self-critique 횟수. PoC 속도 우선이면 `0` 권장 |
| `SMALL_THINK_DISTILL` / `SMALL_THINK_PREF_DB` / `SMALL_THINK_PREF_DIR` | — | 취향 학습(distill/저장) 옵트인 |

> **포트 정합성**이 첫 연결 실패의 흔한 원인 — 서버 PORT와 weave `DEV_URL`/`VITE_AKU_AGENT_URL`을 반드시 일치시킬 것.

### 남은 후속 (고도화 추가분)

- **대화 메모리 없음**: 각 submit이 독립 → "방금 그거 더 크게" 같은 참조 대화 불가(현재 문서 상태로만 추론). 서버에 세션 히스토리 채널 추가가 필요(small-think HANDOFF 후보).
- **스냅샷 노이즈**: 원본 문서 JSON 그대로 → 큰 디자인은 20k 컷에 걸릴 수 있음. 에이전트-친화 요약 스냅샷(id/kind/frame/text/childIds)은 bridge(@small-think/client) 변경 필요.
- 이미지 첨부 vision 미연결(WI-054 본문 참조).
