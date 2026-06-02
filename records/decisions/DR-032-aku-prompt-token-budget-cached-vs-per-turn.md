# Decision Record — DR-032

> Save at `records/decisions/DR-<NNN>-<slug>.md`. For cross-team decisions, link from / to the originating handoff.

## Metadata

| Field | Value |
|---|---|
| ID | DR-032 |
| Title | 아쿠(Aku) 프롬프트 토큰 예산 — 안정 규칙은 캐시 블록 1회, per-turn primer는 컴팩트 recall로 |
| Decision Level | 1 Local (단일 프로젝트 내부 프롬프트 구조, 외부 계약·스키마 무변경) |
| Owner | hbpark |
| Required approvers | hbpark (responsible + accountable) |
| Consulted | small-think DR-019(byo-ssh dedup) · agocraft DR-038(clean boundary) · WI-054 트랙 |
| Informed | features/aku 소유 영역, WI-078 |
| Status | Accepted |
| Decided on | 2026-06-02 |
| Effective from | 2026-06-02 |
| Review-by | 2026-09-02 |

## Context

아쿠 에이전트로 보내는 LLM-facing 텍스트는 두 경로로 나뉜다.

- **캐시 블록** — `WEAVE_CAPABILITIES` + `WEAVE_DOMAIN_KNOWLEDGE`는 connect(ctl
  hello) 시 1회 서버로 넘어가 small-think `assembleDesignSystemPrompt`의 **prompt-cached**
  시스템 블록으로 들어간다(세션당 1회 과금).
- **per-turn** — `WEAVE_TASK_PRIMER`는 매 task 메시지 앞에 붙어 **매 턴 재전송**되고
  캐시되지 않는다(`use-aku-agent.ts` `runTurn` → `task = primer + designLine + …`).

감사 결과 per-turn `WEAVE_TASK_PRIMER`(~21 bullets / ~2.5KB / ~600 tok)의 상당 부분이
캐시 블록과 **내용 중복**이었다:

- 좌표=비율 → `WEAVE_DOMAIN_KNOWLEDGE` §1
- 폰트=비율 → §2
- 고정 텍스트박스 → §3
- mood>theme 색상/토큰 → §4
- 최상위 프레임=슬라이드 / 중첩=presentable:false → §0
- "a full deck is many calls" → small-think `DESIGN_RULES`(캐시)

게다가 per-turn `designLine`마저 좌표 모델("0..1 비율 … 절대 px")을 다시 서술했다
(단 캔버스 px 값 자체는 휘발성이라 필요). 즉 **세션당 1회면 충분한 안정 규칙을 매 턴
다시 보내는** 구조였다. 반대로 primer 안의 툴 사용 규율(two-commands-only,
create-fully-styled, flip, multi-selection, containerId 등)은 오히려 **안정적인데도
per-turn에만 존재**해, 캐시로 옮기는 게 맞았다.

본질 문제는 단일 낭비가 아니라 **배치 클래스**다: "안정 규칙이 어느 영역에 사는가"에
대한 기준이 없어 새 규칙이 습관적으로 per-turn primer로 흘러들었다.

## Options considered

| Option | Trade-off (gain / give up) | Risk class |
|---|---|---|
| **A — 안정 규칙은 캐시 domain 1회, primer는 컴팩트 recall(중도)** | gain: per-turn ~600→~220 tok(매 턴 ~380 tok 절감), 중복 제거, "안정 규칙은 어디에 사는가" 기준 확립. give up: recency 민감 규칙 일부는 primer에 짧은 recall로 이중 유지(의도적). | 저 (모든 규칙은 캐시+recall로 여전히 매 턴 노출) |
| B — primer를 완전 제거하고 전부 캐시로 | gain: per-turn 최대 절감. give up: 최근 턴 지시의 recency 효과 상실 → mood/슬라이드 배치 등 오류율 높은 규칙의 준수도 저하 위험. | 중 (성능 회귀 가능) |
| C — 현행 유지(중복 방치) | gain: 0 변경. give up: 매 턴 토큰 낭비 복리 + 배치 클래스 지속. | 고 (부채 복리) |

## Decision

**Option A를 채택한다.**

1. `WEAVE_TASK_PRIMER`를 **컴팩트 recall pointer**로 축소: (a) "전체 규칙은 캐시된
   weave domain/capabilities에 있으니 따르라"는 한 줄 + (b) 가장 leverage 크고
   오류율 높은 소수 규칙만 짧게 — MOOD FIRST(색상 mood>theme 1줄 포함), 좌표=비율(픽셀
   금지), 슬라이드=서로 다른 x(필름스트립 `x:i*1.1`)·중첩 presentable:false, 구조/미디어
   선택. recency가 준수도에 실측 도움이 되는 항목만 per-turn에 남긴다.
2. primer에만 있던 **안정 규칙 전부를 `WEAVE_DOMAIN_KNOWLEDGE`(캐시)로 이전**:
   §5 AUTHORING(슬라이드 배치 상세·구조·미디어·markdown→1슬라이드·이미지 배경),
   §6 COMMANDS & TOOLING(두 커맨드 add/update, create-fully-styled, containerId,
   multi-selection 두 커맨드, flip, id 타게팅·many-calls). 테마 레지스트리 §5→§7로 재번호.
3. `designLine`의 좌표 재서술 축약(휘발성 캔버스 px만 유지 + 1줄 recall).
4. 순수 중복(좌표/폰트/텍스트/슬라이드 = domain에 이미 존재, "many calls" =
   `DESIGN_RULES`에 존재)과 per-turn에서 무의미하던 첨부-이미지 bullet(assetLines가
   런타임에 문맥별로 설명) 제거.

**기준 정착**: 새 안정 규칙은 `WEAVE_DOMAIN_KNOWLEDGE`(캐시)에 추가한다. per-turn
primer는 recency가 준수도에 실측 기여하는 소수 규칙의 짧은 recall로만 유지하며
다시 부풀리지 않는다(코드 상단 주석에 명시).

## Consequences

- **토큰**: 매 턴 per-turn ~380 tok 절감(멀티턴 디자인일수록 누적 큼). 캐시 domain은
  이전된 규율만큼 소폭 증가하나 **세션당 1회 + prompt-cache** 이므로 한계비용 거의 0.
  command-schema `*_ATTRS_NOTE` 축약(WI-078 동반)으로 캐시 블록도 순감.
- **성능(준수도)**: 모든 규칙은 캐시 시스템 블록으로 매 턴 노출되며, 오류율 높은
  항목은 primer recall로 이중 노출 → 회귀 위험 낮음. `AKU_ABLATION.taskPrimer`
  토글로 사후 A/B 검증 가능.
- **계약**: agocraft 스키마·small-think 와이어 계약 무변경. 동작 보존(behavior-preserving)
  프롬프트 리팩터.

## Verification

`pnpm typecheck`(weave 통과) + `pnpm test`(통과). 프롬프트 텍스트 변경이라 런타임
준수도는 `AKU_ABLATION` 토글 기반 사후 관찰로 모니터링.

## Links

- WI-078 (본 작업 항목)
- WI-054 (아쿠 reverse-MCP capabilities/primer hardening — 원 출처)
- small-think DR-019 (byo-ssh `SYSTEM_PROMPT_RULES` ↔ `DESIGN_RULES` dedup, 동일 토큰-예산 원칙)
- agocraft DR-038 (agent-client 중립 스키마는 host override로 단일 에이전트 컨텍스트에 미도달 — 경계 clean 확인)
