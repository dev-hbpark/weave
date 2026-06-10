# Engineering Plan — 델타 저장 선결: 패치 스트림 완결성 (WI-156, 장애물 A)

> ⚠️ **2026-06-10 정정/완료** — Build 중 이 플랜의 **A2(envelope→document.attrs, setTitle/resize 신설)는
> DROP**됐다. title/width/height는 세션 중 변경 UI가 없어 스냅샷이 캡처 → 패치 불필요(신설 시 dead command).
> 실제 산출은 **`WeaveCommandTargets`→`{reset}` 타입 잠금 + `SNAPSHOT_BOUNDARY_COMMANDS` + DesignPage
> frameDuplicator의 마지막 직접-setter bypass 제거 + 완결성 게이트**. 정본은 [WI-156](../../records/work-items/WI-156-delta-persistence-patch-completeness.md)
> "Build 완료" 절 + [DR-112](../../records/decisions/DR-112-delta-persistence-patch-completeness.md)(A2 superseded). 아래 P1 envelope 단계는 **이력용**으로 남긴다.

## Feature scope

서버 저장을 full-replacement에서 증분(델타)으로 전환하기 위한 **선결 조건만** 닫는다:
모든 문서 변경이 무손실·replay 가능한 패치로 표현되어 **패치 스트림이 전체 스냅샷의 정확한 대체물**이
되게 한다. 실제 델타 전송/서버 누적 저장(장애물 B·C)은 본 플랜 범위 밖(후속 WI).

원천 사실(탐색 확정):
- add/remove/unit/속성/reparent/text/layout/background/presentationOrder 는 **이미 무손실 패치**
  (WI-024 self-contained `item.create`/`item.remove`, DR-026, DR-107 `changeToPatch` 전수 매핑).
- 잔여 갭 2개:
  - **doc.reset** — `commands.ts:929` `targets.reset()` 직접 호출, `ok(undefined, [])` 패치 0개.
  - **envelope** — `SerializedDesignV5.title/width/height/meta`(`storage.ts:134`)는 `document`와
    별개라 패치로 재구성 불가. `commands.ts:1829`에 동일 방향 미완 메모.
- persist sink는 아직 full-blob: `use-weave-editor.ts:428` storageSink → `persist()` →
  `toSerializedDesign`(전체 직렬화). **본 플랜은 persist 경로를 바꾸지 않는다** — 패치 완결성만 확보.
- wrapper-mirror 선례: `use-design.ts:447-490`이 `doc.attrs.presentationOrder` → wrapper
  `design.presentationOrder`를 매 렌더 미러링. title/width/height는 이 패턴을 그대로 확장.

DR-112의 A1·A2 결정을 구현한다.

## Architecture

```
[A2] envelope → document.attrs (단일 패치 스트림이 전부 재구성)
  Header rename / resize UI
     │  editor.exec("weave.design.setTitle", { title })
     │  editor.exec("weave.design.resize",  { width, height })
     ▼
  command.run(ctx) → before/after = ctx.document.attrs (±title/width/height)
     │  return ok(undefined, [{ type: "document.attrs", before, after }])   ← 기존 variant 재사용
     ▼
  ChangeStream → applyChangeToDocument → doc.attrs 갱신
     ▼
  use-design.ts wrapper-mirror (확장): doc.attrs.{title,width,height} → design.{title,width,height}
     → toSerializedDesign 은 design.* 를 읽으므로 envelope 도 패치 파생값이 됨

[A1] doc.reset = 스냅샷 경계 (패치 아님)
  editor.exec("weave.doc.reset")
     │  targets.reset()  (기존 동작 유지)
     │  return ok(undefined, [])  + origin/meta 표식: "snapshot-boundary"
     ▼
  persist / sync 소비자: 패치 로그 비우고 새 스냅샷에서 재시작
     (WI-028 SnapshotPolicy 의 컴팩션 경계 개념 재사용)

[A4] 완결성 게이트 (해결의 유일한 증거)
  replay(emptyDoc, patchStream(design)) === toSerializedDesign(design)   ← round-trip 등가
```

## Phases

### P0 — Decommission Sweep (stale 주석 정정)

- `commands.ts:1-20` 헤더 주석을 WI-024/DR-026 실태로 교체: "Direct(no item.create patch)" 서술 →
  "self-contained `item.create`/`item.remove`/`unit.create`/`unit.remove` 패치 발행" 정본화.
  정본 출처를 DR-112로 링크.
- 동일 파일 내 stale 보조 주석(`commands.ts:153`, `2189-2199` 등 PendingCreations 잔재 서술)
  현행 일치 확인 후 정리.
- **검증**: 주석과 코드 동작 일치(documentation-drift). 동작 변화 0 → 기존 suite green 유지.

### P1 — envelope → document.attrs (A2)

- 신설 명령(레지스트리 등록, 모델/리듀서 무수정):
  - `weave.design.setTitle { title }` → `document.attrs` 패치(before/after = doc.attrs ± title).
  - `weave.design.resize { width, height }` → `document.attrs` 패치.
  - 두 명령은 `setBackground`/`setPresentationOrder`(`commands.ts:1833-1863`)와 **동형 구조**.
- `use-design.ts` wrapper-mirror(`447-490`)를 title/width/height로 확장 — wrapper 필드가 항상
  `doc.attrs`의 파생 뷰.
- title rename / 캔버스 크기 변경 UI 핸들러를 신설 명령 `editor.exec(...)`로 배선(직접 envelope
  setter 제거 — Document mutation rule 준수).
- aku 스키마(`features/aku/agent/weave-command-schemas.ts`)에 두 명령 등록(라벨 + 스키마).
- **검증**: rename/resize 후 `Cmd+Z` 복원, suite green, 신설 명령 unit 테스트(패치 shape 단언).

### P2 — doc.reset 스냅샷 경계 계약 (A1)

- `weave.doc.reset` 결과에 origin/meta "snapshot-boundary" 표식 부여(패치 모델 무변경).
- persist/sync 소비자(향후 장애물 C에서 사용할) 계약 문서화: 이 신호 = "로그 비우고 새 스냅샷".
  현 시점엔 소비자가 full-blob persist라 동작 변화 없음 — **계약 정의 + 표식 발행**까지가 P2 범위.
- **검증**: reset 후 문서 빈 상태 + 표식 emit 확인 테스트.

### P3 — 완결성 게이트 (A4) — "A 해결"의 유일한 증거

- round-trip 테스트: 빈 문서에서 시작 → 대표 시나리오(add/move/resize/text/remove/reparent/
  background/presentationOrder/setTitle/resize)의 패치 스트림을 순서대로 `applyPatch` replay →
  결과를 `toSerializedDesign` → 원본 `toSerializedDesign` 과 deep-equal.
- doc.reset은 경계로서 스트림을 분할(경계 전후 각각 등가) 검증.
- CI 게이트로 등록 — 이후 새 mutation surface가 패치 무손실성을 깨면 red.
- **검증**: 게이트 green = 장애물 A 닫힘. WI-156 Status → Done.

## SOLID / GRASP 체크리스트 (CLAUDE.md 강제 — 플랜 임베드)

| 원칙 | 적용 | 확인 |
|---|---|---|
| **Open-Closed (Rule 3)** | 신설 명령은 커맨드 **레지스트리에 등록**하는 어댑터. `Patch` union·`applyChange` reducer를 수정하지 않음(`document.attrs`는 기존 variant). | ✅ 모델 무수정 |
| **No switch on kind (Rule 6)** | reset/title/resize 어디에도 `switch(kind/type/mode)` 추가 없음. 명령 디스패치는 커맨드 레지스트리가 담당. | ✅ |
| **Single mutation path (Rule 4)** | title/resize가 직접 envelope setter를 거치지 않고 `editor.exec` → 패치 → History 단일 경로. 직접 setter 잔재 제거. | ✅ |
| **Round-trip preserve (Rule 5)** | A4 게이트가 패치 replay = 직렬화 등가를 강제. `onUnknown:"preserve"` serializer 불변. | ✅ 게이트로 증명 |
| **SRP / 정보 전문가(GRASP)** | wrapper-mirror가 "doc.attrs → wrapper 파생"의 단일 책임지점. envelope 진실원천을 doc.attrs로 일원화(이중 진실원천 제거). | ✅ |
| **컴포지션 > 상속** | 신설 명령은 `setBackground`와 동형 객체(함수 컴포지션), 클래스 계층/상속 0. | ✅ |
| **Producer policy-free (Rule 4 변형)** | reset은 "snapshot-boundary" 표식만 발행, 소비 스케줄(언제 컴팩션)은 소비자 결정. | ✅ |

## Test plan

- `commands.test.ts`: `weave.design.setTitle`/`weave.design.resize` 가 올바른 `document.attrs`
  패치(before/after) 발행 + `Cmd+Z` 역패치.
- `use-design` mirror: `doc.attrs.title/width/height` 변경 시 wrapper 필드 미러 동기.
- reset: 표식 emit + 빈 문서.
- **P3 round-trip 완결성 게이트**(핵심): replay === snapshot, 전 변경 유형 커버.
- 회귀: 기존 persist/cloud-sync 동작 무변경(full-blob 유지) 확인.

## Decommission targets (이 변경이 obsolete화하는 것)

- `commands.ts:1-20` stale 헤더 주석(P0에서 교체 — 삭제가 아니라 정본화).
- `commands.ts:1829` "follow-up PR 예정" 미완 메모(P1 완료 시 제거, 본문이 그 follow-up).
- 직접 envelope setter 경로(title/size)가 있으면 제거하고 명령 경로로 일원화.
