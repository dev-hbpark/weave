# WI-096 — weave.batch: 여러 커맨드를 원자적 트랜잭션으로 묶어 호출

| Field | Value |
|---|---|
| Status | Done (single-session, 2026-06-05) |
| Owner | hbpark |
| Decision | DR-065 |
| Relates | WI-060(라운드 그룹 단일 undo), WI-095(전 커맨드 공개) |

## Problem (operator, 2026-06-05)

"에이전트가 커맨드 호출을 병합해서 호출할 수 있는 방법이 필요해 — 여러 커맨드를 트랜잭션으로
묶어 호출하는 커맨드를 공개해줘."

기존: 라운드 그룹(WI-060)은 한 라운드의 호출을 1 undo로 묶지만 **원자성 없음**(중간 실패 시 앞
편집은 적용됨). consolidated 커맨드는 한 verb 내에서만 묶음. **서로 다른 커맨드를 한 트랜잭션**으로
묶는 수단이 없었음.

## Change

`weave.batch { ops: [{ command, input }] }` 추가·공개:
- 각 op을 **진화하는 working document**(op마다 `applyChangeToDocument`)에 대해 실행 → 뒤 op이 앞
  op 효과를 봄(순차 exec와 동일). 전체 patch를 한 결과로 반환 → 1 ChangeStream 트랜잭션 → 1 Cmd+Z.
- **원자성**: 한 op이라도 실패하면 전체 중단·patch 0(부분 적용 없음).
- op별 결과값 배열 반환.
- 가드(Rule 6: Map 레지스트리 + 작은 disallow Set): `weave.batch` 중첩 금지, `weave.doc.reset`
  금지(비-patch 부작용이 배치 중단과 무관하게 발화하므로).
- 한계: 같은 배치에서 **새로 만든 아이템 id를 뒤 op이 참조 불가**(id는 적용 시 부여) → 생성 후
  편집은 후속 호출(라운드 그룹으로 여전히 1 undo).

## Acceptance

- 여러 op 순서대로 patch 연결, 1 트랜잭션. ✔
- 한 op 실패 시 전체 실패·patch 없음(원자성). ✔
- 같은 기존 아이템에 대한 순차 op이 진화 doc로 올바르게 병합. ✔
- unknown/중첩/doc.reset/빈 ops 거부. ✔

## Verification (2026-06-05, SVL gate)

- **Typecheck:** `@weave/web` clean.
- **Unit:** `commands.test.ts` 98 pass(신규 batch 6), aku 스위트 통과; coverage 가드가
  `weave.batch`의 스키마 + 최상위 description 보유 확인.
- **Lint:** biome clean(변경 파일).
- **Rule 6:** 기존 baseline 3건만, 신규 없음(배치는 Map 디스패치).

See DR-065.
