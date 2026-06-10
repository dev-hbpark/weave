# DR-112 — 델타 저장 선결: 패치 스트림 완결성 결정

Status: **Accepted** (2026-06-10)
Context: [WI-156](../work-items/WI-156-delta-persistence-patch-completeness.md) · 선행 [DR-107](DR-107-adopt-agocraft-change-to-patch.md) · 후속 [WI-028](../work-items/WI-028-collaborative-sync.md)

## Context

서버 저장이 매 변경마다 전체 `Design`을 덮어쓰는 full-replacement 구조다(`cloud-sync.ts:92`
`pushDesignCloud` → POST `/api/designs` → `kv.set` 단일 blob). 증분(델타) 저장으로 가려면 **모든
문서 변경이 무손실 패치로 표현**되어야 한다(패치 스트림 = 전체 스냅샷의 정확한 대체물). 탐색 결과 이
조건은 WI-024(self-contained `item.create`/`item.remove`)와 DR-107(`changeToPatch` 전수 매핑)으로
이미 대부분 충족돼 있었고, 잔여 갭은 (A1) `doc.reset` 무패치, (A2) envelope 필드(title/width/height/
meta) 패치 밖 두 가지였다. 두 갭의 처리 방식을 확정한다.

## Decision A2 — ~~envelope 필드는 `document.attrs`로 흡수~~ → **SUPERSEDED (2026-06-10, Build 중 정정)**

> **정정**: Build P1 착수 중 코드를 직접 확인한 결과 이 결정의 전제가 **틀렸다.** envelope 필드
> `title`/`width`/`height`는 **세션 중 변경되는 mutation surface가 아예 없다** — rename UI도, 캔버스
> resize UI도 존재하지 않는다(`title`은 `NewDesignWizard`의 로컬 useState로 **생성 시 1회**만 설정,
> `width`/`height`도 생성 시 고정). 따라서 이들은 **초기 스냅샷**(`toSerializedDesign`)에 이미 캡처되며,
> 델타 모델(`snapshot + patch stream`)에서 패치가 **필요 없다**. `weave.design.setTitle`/`resize`를
> 신설하면 호출자 없는 **dead command**가 되어 no-dead-config 원칙(WI-153)을 위반한다. → **드롭.**

**정정된 결론**: envelope 필드는 패치가 아니라 **스냅샷이 담는다**. 완결성 기준은
`toSerializedDesign(open 시점 스냅샷) + replay(document 패치 스트림) === toSerializedDesign(현재)`이며,
envelope는 세션 불변이므로 자명하게 보존된다. 세션 중 변하는 doc-level 필드(`background`/
`presentationOrder`)는 **이미** `document.attrs` 패치로 흐르고 mirror(`use-design.ts:463-488`)가
wrapper에 반영한다 — 추가 작업 불요. (`commands.ts:1828` 의 "follow-up PR" 메모도 이로써 moot —
P0에서 정정.)

향후 rename / canvas-resize **기능이 추가될 때** 비로소 그 기능이 (Document mutation rule에 따라)
`document.attrs` 패치를 내는 명령을 동반해야 한다 — 지금 투기적으로 만들지 않는다.

## Decision A1 — `doc.reset`은 스냅샷 경계로 처리

`weave.doc.reset`을 패치로 표현하지 않는다. 대신 "새 빈 스냅샷 강제 커밋" 이벤트로 정의한다 — persist/
sync 소비자가 이 신호를 받으면 **패치 로그를 비우고 새 스냅샷에서 다시 시작**한다.

**근거**
- reset은 의미상 "이전 이력과의 연속성 단절"이라 스냅샷 경계와 자연스럽게 일치한다.
- 모든 루트 자식에 대해 `item.remove`를 합성하는 것보다 단순하고 정확하다(대형 문서 reset이 거대한 패치
  묶음이 되는 것을 회피). WI-028 Phase 5의 SnapshotPolicy와 동일한 컴팩션 경계 개념을 재사용.

**대안 기각**
- *합성 item.remove + document.attrs 리셋 패치*: 순수 패치 스트림은 유지되나 대형 reset이 O(n) 패치
  묶음이 되고, "비우고 새로 시작"이라는 의도를 패치 재생으로 우회 표현하는 셈. 스냅샷 경계가 더 정직. 기각.

## Decision A3 (Build 중 추가) — 불변식을 타입에 새긴다: `WeaveCommandTargets` = `{ reset }`

Build 조사로 확인한 사실: `commands.ts` 전체에서 host target setter 호출은 **`targets.reset()` 단
한 곳**(`commands.ts:935`)뿐이다. 인터페이스가 광고하던 `addItem`/`removeItem`/`updateItem`/
`updateBehavior`는 **어떤 명령도 호출하지 않는 vestigial**(WI-024에서 add/remove가 패치 기반이 되며
사문화). 따라서 `WeaveCommandTargets`를 **`{ reset: () => void }` 로 축소**한다.

**의미**: "명령이 패치 스트림을 우회해 host 상태를 바꿀 수 있는 유일한 경로는 `reset`"이라는 barrier-A
불변식이 **타입으로 강제**된다. 향후 누군가 새 bypass를 추가하려면 인터페이스를 의도적으로 넓혀야 하므로,
사고로 생기는 우회가 컴파일 단계에서 차단된다. 더불어 `SNAPSHOT_BOUNDARY_COMMANDS`(commands.ts에서
export) = `{ "weave.doc.reset" }` 를 단일 출처로 선언 — 후속 델타 sink가 "로그 비우고 새 스냅샷"
경계를 읽는 seam.

## Consequences

- **장애물 A는 사실상 이미 충족돼 있었다** — 모든 라이브 mutation은 command→patch 경로(WI-024/DR-026/
  DR-107)이고, envelope는 스냅샷이 담으며, 유일한 패치-밖 변경(`reset`)은 선언된 스냅샷 경계다. 본 WI는
  그 사실을 **증명(완결성 게이트)하고 타입으로 잠근다**.
- 완결성 게이트(WI-156 P3): 대표 mutation 명령들이 host target을 건드리지 않음 + `reset`이 유일한
  `SNAPSHOT_BOUNDARY_COMMANDS` + `item.create`/`item.remove`가 전체 서브트리 동봉을 재확인.
- 후속 WI(장애물 C, 실제 델타 전송)는 "패치 append + 주기 스냅샷 + reset=경계"라는 깨끗한 서버 계약 위에서 설계.
- `commands.ts` 헤더 주석은 WI-156 P0에서 정정(Decommission Sweep) — 본 DR이 stale 주석을 대체하는 정본.
- (follow-up) use-design.ts의 사문화된 직접 setter들(setDesignBackground/setPresentationOrder/
  reorderRootChildren/addBehavior — 라이브 UI는 `*ViaEditor` 래퍼 사용)은 별도 hygiene 정리 대상.
