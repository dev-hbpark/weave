# WI-141 — weave.subtree.add: 중첩 서브트리 원자 생성 도구

- **Status:** Done · **DR:** DR-096 · **From:** HANDOFF-026 (small-think) · **Relates:** HANDOFF-003/004(serializeItemSubtree/item.create), weave.batch, weave.item.add

## Problem

small-think DR-046 실측: byo-ssh 디자인 생성 비용의 82%가 build 패스이고, build는
**edits/turn ≈ 0.7**(턴당 1편집, 배치 0). 근본 원인은 weave 도구 표면 — 최다 호출
`weave.item.add`는 단일 생성이고, **중첩 프레임 트리는 자식이 부모의 새 id를 필요**로 해
`weave.batch`로 묶을 수 없다("batch에서 만든 id를 같은 batch 뒤 op이 못 씀"). 그래서 add
체인이 턴마다 쪼개져 build 턴이 폭증.

## Change

신규 커맨드 **`weave.subtree.add`** — 재귀 `node` 스펙(`{kind, frame?, attrsOverride?, units?,
children?[]}`)으로 프레임 트리 전체를 **한 호출/한 트랜잭션(단일 Cmd+Z)** 으로 생성.

- **구현:** `weave.batch`의 working-doc 패턴 재사용 — 부모를 `addItem`으로 생성→그 패치를
  `applyChangeToDocument`로 in-memory working-doc에 적용→**확보된 부모 id로 자식을 재귀
  생성**(레이아웃 엔진이 working-doc의 실제 부모를 보고 정확히 배치). batch의 id 한계가
  해소됨. 모든 노드가 `addItem`의 시드+가드 파이프라인(ensureUsableFrame/normalizeShape/
  sanitizeFontSize/applyCreationUnits/레이아웃 onChildAdd)을 그대로 통과 → 단일 add와 동일
  품질, N턴이 1콜로 붕괴.
- **원자성:** 한 노드라도 실패하면 fail 반환 + 패치 0(all-or-nothing). 노드 수 상한(500) 가드.
- **스키마:** `weave-command-schemas.ts`에 재귀 스키마($defs/$ref) + 라벨 추가. coverage 테스트가
  커맨드↔스키마 1:1 강제(브리지는 registry를 필터 없이 노출 → 자동으로 agent 도구가 됨).

## Acceptance

- 중첩 spec → 단일 트랜잭션으로 전체 서브트리 생성, 자식이 부모 내부에 배치. ✔
- absolute 부모(frame 필수) / auto-layout 부모(frame 생략 → 엔진 배치) 모두 정확. ✔
- 노드별 가드(zero-frame/shape/fontSize) 재귀 적용. ✔
- 실패 시 원자적 미적용. ✔
- coverage/schemas/commands typecheck + test 그린, History 단일 undo. ✔

## Links

- DR-096 · `apps/web/src/document/commands.ts` · `apps/web/src/features/aku/agent/weave-command-schemas.ts`
- 측정: small-think DR-046 텔레메트리(edits/turn, build 턴, pass-cost)로 before/after.
