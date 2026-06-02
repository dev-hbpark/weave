# WI-078 — 아쿠 프롬프트 토큰 최적화 (per-turn → 캐시 재배치 + 중복 제거)

## Problem

아쿠 에이전트로 가는 LLM-facing 텍스트 중 per-turn `WEAVE_TASK_PRIMER`(매 턴 재전송,
캐시 안 됨, ~600 tok)가 캐시 블록(`WEAVE_DOMAIN_KNOWLEDGE`/`WEAVE_CAPABILITIES`,
세션 1회) 및 small-think `DESIGN_RULES`와 상당 부분 중복돼, 세션당 1회면 충분한
안정 규칙을 매 턴 다시 보내고 있었다. 동시에 primer에만 있던 안정적 툴 사용 규율은
캐시로 옮기는 게 맞았다. 배경·결정은 DR-032 참조.

## Decision

DR-032 Option A(중도). per-turn은 컴팩트 recall, 안정 규칙은 캐시 domain 1회.

## Change (weave 단독, agocraft·small-think 와이어 계약 불변)

- `apps/web/src/features/aku/agent/weave-capabilities.ts`
  - `WEAVE_TASK_PRIMER` — ~21 bullets → **5줄 recall**(전체 규칙은 캐시 domain/
    capabilities에 있음 + MOOD FIRST·좌표=비율·슬라이드 배치/markdown→1슬라이드·구조/미디어).
  - `WEAVE_DOMAIN_KNOWLEDGE` — **§5 AUTHORING**(슬라이드 필름스트립 배치 상세·구조·미디어·
    markdown→1슬라이드·이미지 배경)과 **§6 COMMANDS & TOOLING**(add/update 두 커맨드,
    create-fully-styled, containerId, multi-selection 두 커맨드, flip, id 타게팅·many-calls)
    신설. primer에서 이전. 테마 레지스트리 §5→§7 재번호.
  - 상단 주석에 "Token model" 규칙 명시(안정 규칙은 domain에, primer 재팽창 금지).
- `apps/web/src/features/aku/agent/weave-command-schemas.ts`
  - `FRAME_BASE_NOTE` / `FRAME_ATTRS_NOTE` / `TEXT_ATTRS_NOTE` / `IMAGE_ATTRS_NOTE` /
    `VIDEO_ATTRS_NOTE` / `LINE_ATTRS_NOTE` / `SHAPE_ATTRS_NOTE`를 **진짜 한 줄 reminder**로
    축약(전체 per-kind 모델은 이미 `WEAVE_CAPABILITIES` itemKinds에 존재 — 주석에 명시된
    원래 의도와 일치). `QR_ATTRS_NOTE`는 capabilities에 itemKind가 없어 **유일 출처라 유지**.
- `apps/web/src/features/aku/agent/use-aku-agent.ts`
  - `designLine`의 좌표 모델 재서술 축약(휘발성 캔버스 px만 유지 + 1줄 recall).

## Removed (중복/무효)

- primer의 좌표/유닛분리/폰트비율/고정텍스트/슬라이드·중첩프레임 bullet(= domain §0–4에 존재).
- primer의 "Issue every edit … many calls" bullet(= small-think `DESIGN_RULES`에 존재).
- primer의 첨부-이미지 bullet(런타임 `assetLines`가 첨부 있을 때만 문맥별로 설명 → per-turn 상시 보유 불필요).

## Impact

- per-turn ~380 tok/턴 절감(멀티턴일수록 누적). 캐시 domain은 이전분만큼 소폭 증가하나
  세션 1회 + prompt-cache라 한계비용 ~0. command-schema note 축약으로 캐시 블록 순감.
- 모든 규칙은 캐시 시스템 블록으로 매 턴 노출 + 고오류 항목은 primer recall 이중 노출 →
  준수도(성능) 보존. `AKU_ABLATION.taskPrimer` 토글로 사후 A/B 가능.

## Verification

- `pnpm typecheck` 통과 · `pnpm test` 통과 · `biome check`(변경 파일) clean
  (기존 useCallback deps 경고 1건은 무관·선재).
- 사후: 디자인 산출물 품질 회귀 여부를 `AKU_ABLATION` 토글 기반으로 모니터링.

## Links

- DR-032 (결정)
- WI-054 (capabilities/primer 원 출처)
- features/aku/DECISION_LOG.md (D19 라인)
