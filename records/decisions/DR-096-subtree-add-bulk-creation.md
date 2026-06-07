# DR-096 — weave.subtree.add: 중첩 서브트리 원자 생성 (build turn 절감)

- 상태: ACCEPTED
- 날짜: 2026-06-07
- WI: WI-141 · From: HANDOFF-026 (small-think) · 관련: HANDOFF-003/004(serializeItemSubtree/item.create patch), weave.batch, weave.item.add, WI-021(layout onChildAdd)

## 맥락

small-think DR-046이 측정한 build 비용 지배(전체 82%, edits/turn≈0.7, 턴당 1편집)의 근본
원인은 weave 도구 표면: `weave.item.add`는 단일 생성이고 중첩 트리는 자식이 부모의 새 id를
요구해 `weave.batch`로 묶이지 않는다. 프롬프트 강화(small-think 배치 A/B)는 무효였다 — 도구
표면 변경이 유일한 레버. HANDOFF-026이 서브트리 일괄 생성 도구를 요청.

## 결정

신규 커맨드 `weave.subtree.add` 도입. 재귀 노드 스펙으로 프레임 트리를 한 호출에 생성한다.

```
NodeSpec = { kind, frame?, attrsOverride?, units?, children?: NodeSpec[] }
weave.subtree.add({ containerId?, node: NodeSpec }) → 루트 새 id
```

**구현은 `weave.batch`의 working-doc 패턴을 재사용**한다(신규 머티리얼라이즈 로직 없음):

1. 부모 노드를 기존 `addItem` 커맨드로 생성 → `item.create` 패치 + 레이아웃 sibling 패치.
2. 그 패치를 `applyChangeToDocument`로 in-memory `workingDoc`에 적용(batch와 동일).
3. **확보된 부모 id**를 `containerId`로 자식 노드를 재귀 생성 — 이때 `addItem`의 레이아웃
   엔진(`onChildAdd`)이 workingDoc의 **실제 부모**를 읽어 자식 frame을 정확히 산출(렌더는
   stored-frame이므로 생성 시 계산 필수 — FrameSurface가 children을 각자 frame에 배치).
4. 모든 노드 패치를 누적 → 하나의 결과로 반환 → 단일 ChangeStream 트랜잭션 → **단일 Cmd+Z**.

이로써 batch의 "새 id를 뒤 op이 못 씀" 한계가 사라진다(subtree.add는 부모→자식 순서를 스스로
보장). 모델은 한 번의 도구 호출로 슬라이드 프레임 트리 전체를 만든다 → N개의 id-의존 add 턴이
1콜로 붕괴.

**품질 보존:** 각 노드가 `addItem`의 전체 파이프라인(ensureUsableFrame DR-078 / normalizeShape
WI-062 / sanitizeFontSize DR-082 / applyCreationUnits WI-063 / 레이아웃 onChildAdd WI-021)을
그대로 통과 → 단일 add와 동일한 가드/배치 품질.

**원자성:** 한 노드라도 실패하면 즉시 fail + 패치 0(트랜잭션 미적용). 노드 수 상한(500)으로
폭주 방어.

## History / 경계

- 반환 패치는 기존 타입(item.create + layout sibling)뿐 → 트랜잭션 러너가 단일 트랜잭션으로
  적용, 단일 undo. CLAUDE.md 문서-뮤테이션 규칙 충족(신규 mutation surface 아님, addItem 재사용).
- coverage 테스트가 커맨드↔스키마 1:1을 강제하므로 `WEAVE_COMMAND_SCHEMAS`에 재귀 스키마
  ($defs/$ref)+라벨 동시 추가. 브리지는 registry를 필터 없이 노출 → 추가 즉시 agent 도구가 됨.

## 트레이드오프 / 결과

- (+) build의 id-의존 add 체인이 슬라이드당 1콜로 → build 턴 급감(전체 82% 지배 → 직접 절감).
- (+) 신규 머티리얼라이즈/레이아웃 로직 0 — batch 패턴 + addItem 재사용이라 회귀 위험 낮음.
- (+) 단일 undo, 원자적.
- (−) 한 콜의 입력이 커진다(트리 전체) — 모델 출력 토큰↑이지만 턴 라운드트립↓이 지배적 이득.
- (−) auto-layout 자식은 frame 생략 규칙을 모델이 지켜야(스키마/가이드로 안내). 잘못 주면
  addItem의 zero-frame 가드가 흡수.

## 검증

`apps/web` typecheck clean. commands.test.ts 114 tests(신규 4 — 단일 트랜잭션 중첩 생성/
자식이 부모 id에 parented / 깊은 중첩 frame>frame>text / 잘못된 노드 원자적 실패 / node 누락
거부) + coverage 6(커맨드↔스키마 1:1 — subtree.add 자동 검출) 그린. biome 변경 3파일 클린,
Rule 6 게이트 exit 0. addItem 재사용이라 신규 머티리얼라이즈/레이아웃 로직 0.

도입 효과(build 턴/edits-per-turn/토큰)는 small-think DR-046 텔레메트리로 before/after 측정 —
small-think `records/decision-handoffs/HANDOFF-025-from-weave-subtree-add-ready.md`로 회신.

## 후속

- small-think: 헤드리스 도구 가이드/시스템 프롬프트에서 `weave.subtree.add`를 build 1순위로
  안내(단일 item.add 연쇄 대신) + DR-046으로 측정.
