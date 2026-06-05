# WI-103 — 아쿠 고도화: 작업상태 표정 · 작업 말풍선 · 스프라이트 표현 레이어

| Field | Value |
|---|---|
| Status | Built — Phase 1 (single-session, 2026-06-06); run-state transition e2e deferred to the server-dependent suite |
| Owner | hbpark |
| Feasibility | FR-020 (FEASIBLE WITH TRADE-OFFS) |
| Decision | DR-070 |
| Plan | `features/aku/ENGINEERING_PLAN.md` (§ WI-103) |
| Relates | WI-052(Aku chat), DR-design-024(마스코트 v2, in flight), small-think DR-010(connection lifecycle) |

## Problem (operator, 2026-06-06)

아쿠 캐릭터를 고도화하고 싶다:
1. **편집 영역에서 지금 무슨 작업을 하는 중인지** 캐릭터로 표시.
2. 재미있는 문구를 **말풍선**으로 표시.
3. **스프라이트 애니메이션**으로 움직임을 표현.

## 점검 (왜 작은 변경인가)

- "무슨 작업 중인지" 신호는 **이미 존재**: `AgentRunState`(thinking/streaming-text/
  tool-calling/applying/queued + `activeTools[].caption`)가 `use-aku-agent.ts`에서
  흐르고 `activityFor()`가 한국어 캡션으로 매핑 중. 지금은 패널 안 텍스트로만 소비됨. ← 갭.
- 말풍선 인프라(`AkuTipBubble` + 안티-Clippy `useAkuTips`)·연결 lifecycle·선택/문서
  ref도 이미 있음 → 표현 레이어는 **새 데이터 없이 구독만** 하면 됨(FR-020).
- 렌더링은 정적 PNG `<img>` + `aku-bob`(transform) 뿐 → 표현/모션 표현력이 갭.

## Change (Phase 1 — 의존성 0)

DR-070 결정에 따라 `features/aku/`에 표현 레이어 추가:

1. **상태→표정 레지스트리** `resolveAkuMood(runState, connState, selection): AkuMood`
   — 우선순위 규칙 테이블(switch 금지, Rule 6). mood: idle/thinking/working/
   finalizing/celebrating/confused/sleeping/looking.
2. **구독 훅** `useAkuExpression(...)` — 에이전트 상태머신을 구독해 mood 파생(producer 불변).
3. **렌더러 시임** `AkuExpressionRenderer`(Strategy/DIP) + Phase 1 `createCssSpriteRenderer`
   (CSS 스프라이트 `steps()` 이산 포즈 + transform 연속 모션). Rive는 이연.
4. **작업 캡션 버블** — `activityFor()` 캡션을 캐릭터 위 말풍선으로, **스트리밍 중에만**.
5. **재미 문구 버블** — mood→문구 레지스트리, **기존 `useAkuTips` 가드 재사용**(빈도 절제).
6. **시선 추적**(`looking`) — 선택/커서 방향으로 transform translate(저렴, 선택적).
7. `main.css` aku 블록에 `steps()` 키프레임 + 전부 `prefers-reduced-motion` 정지 폴백.

자산: placeholder 단일 PNG로 transform 모션 + (눈 슬라이스 시)깜빡임까지. 상태별 포즈
스프라이트 시트는 **DR-design-024(마스코트 리디자인)에 자산 요구 합류**(DR-070 D6).

## Out of scope (deferred → Phase 2, 별도 WI)

Rive/Lottie 렌더러(+`library-adoption-review` 하드 게이트), 완료 셀러브레이션 파티클,
시간대 인사, 드래그 휘청/하품 등 추가 위트, 최종 마스코트 아트 자체(DR-design-024).

## Acceptance

- [ ] 패널이 닫혀 있어도 런처 위 아쿠 표정/모션으로 "생각 중 / 편집 적용 중 / 정리 중"이
      구분되어 보인다(run-state 연동).
- [ ] 스트리밍 중 작업 캡션 버블이 캐릭터 위에 뜨고 턴 종료 시 사라진다.
- [ ] 재미 문구 버블은 `useAkuTips` 가드(쿨다운/영구끄기)를 그대로 따른다 — 빈도 미상향.
- [ ] mood 분기는 레지스트리/규칙테이블이며 phase 문자열 `switch`가 없다(Rule 6).
- [ ] 모든 신규 모션이 `prefers-reduced-motion: reduce`에서 정지한다.
- [ ] 렌더 기술이 `AkuExpressionRenderer` 시임 뒤에 있어, Rive 교체 시 mood 레지스트리/
      구독 훅 변경이 0이다(DIP 검증 — deps-guard 단위 테스트).

## Build (2026-06-06)

`features/aku/expression/` 신규:
- `mood.ts` — `resolveAkuMood` 우선순위 규칙테이블(switch 없음, Rule 6) + `moodIntensity`.
- `phrases.ts` — mood→문구 Map + 결정적 `pickPhrase`.
- `renderer-types.ts` — `AkuExpressionRenderer` 시임(DIP).
- `css-sprite-renderer.tsx` — Phase 1 렌더러(no dep): mood→`.aku-expr--*` 클래스 +
  decorative glyph(…/z/✨/?). sprite-sheet `steps()` 훅은 자산 도착 시 활성(현 placeholder).
- `use-aku-expression.ts` — 구독 훅: status/connection/messages(activity)/selection 구독,
  celebrate·looking·sleeping transient 타이머 소유. producer(`use-aku-agent`) 무변경.

배선: `AkuAssistant`가 `useAkuExpression` → `cssSpriteRenderer.render` 결과를 `mascot`
prop으로, live caption을 `caption` prop으로 `AkuLauncher`에 주입(composition root에서만
concrete 렌더러 import). `AkuLauncher`는 주입 마스코트 + 작업 캡션 말풍선 렌더(미주입 시
기존 bob 마스코트로 폴백 — coachmark/tip 앵커 호환). `main.css`에 mood별 transform/opacity
키프레임 8종 + glyph 모션 + 전부 `prefers-reduced-motion` 정지.

## Verification (SVL gate — 2026-06-06)

- typecheck 0 ✔ · biome clean(변경 파일, 의도적 reset-trigger deps는 `biome-ignore`로 사유 명시) ✔
- 단위 14/14 ✔ — `mood.test.ts`(규칙테이블 우선순위·activity 키잉 10), `phrases.test.ts`
  (커버리지·결정적 pick 3), `renderer-seam.deps-guard.test.ts`(consumer 레이어가 concrete
  렌더러 비-import 1). 아쿠 전체 단위 54/54 회귀 없음 ✔
- e2e `aku-expression.spec.ts` 2/2 ✔(오프라인) — 런처가 `data-mood="idle"` 표현 마스코트
  렌더 · 기본 애니메이션 동작 + `reducedMotion:reduce`에서 `animationName: none` 정지.
- **run-state 전이(thinking→working→finalizing→idle)·작업 캡션 버블 전이는 라이브
  reverse-MCP 에이전트 서버 의존** → 기존 `aku-chat.spec`의 대화형 단언과 동일하게
  server-dependent 스위트로 이연(오프라인 CI 미수행).
- 기존 결함 발견·수정(Decommission Sweep): `aku-chat.spec.ts:152`("composer typing…")가
  변경 전 baseline에서도 실패 → 근본원인은 **stale 테스트**. 컴포저는 토큰-설정 게이트
  (WI-054 / commit 6abe632, `AkuPanel.tsx:164` `hasToken ? <AkuComposer> : <AkuTokenSetup>`)
  뒤에 있는데, 이 테스트는 게이트 도입 전(WI-052)에 작성돼 토큰을 시드하지 않아 컴포저가
  영영 렌더되지 않았음(게이트 도입 시 미마이그레이션). 수정: navigation 전에
  `addInitScript`로 `weave.aku.token` 시드(토큰은 훅 마운트 시 1회 read).
  추가로 **토큰 게이트 e2e 신설**(`aku-chat.spec.ts` "token gate…"): 토큰 없을 때
  setup view 표시 + 컴포저 숨김 + 저장 비활성 → 토큰 저장 시 컴포저 노출 + 영속 검증
  (게이트 회귀가 조용히 red 되던 커버리지 갭 차단). 아쿠 e2e 10/10 그린.

See FR-020, DR-070.
