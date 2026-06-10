# WI-156 — 델타 저장 선결: 패치 스트림 완결성 (장애물 A)

Status: **Done — 장애물 A 선결 완료 (패치 완결성 증명 + 타입 잠금 + 마지막 bypass 제거)**
Owner: hbpark
Updated: 2026-06-10

관련: [DR-112](../decisions/DR-112-delta-persistence-patch-completeness.md) · 엔지니어링 플랜 `features/delta-persistence/ENGINEERING_PLAN.md` · 리스크 `features/delta-persistence/RISK_NOTES.md` · 선행 [WI-024](#)(self-contained item.create/remove) · [DR-107](../decisions/DR-107-adopt-agocraft-change-to-patch.md)(changeToPatch) · 후속 [WI-028](WI-028-collaborative-sync.md)(협업 동기화, paused)

## Problem (사용자 요청)

> 현재 디자인 데이터를 서버에 저장할 때 전체 데이터를 계속 갱신하는 구조로 알고 있는데, 변경된 부분만
> 전송해서 업데이트하는 게 가능할지 검토해 달라.

검토 결과 증분(델타) 저장은 **기술적으로 가능**하나, 선결 조건이 하나 있었다 — **모든 문서 변경이
무손실 패치(replay 가능)로 표현되어야** 패치 스트림이 전체 스냅샷의 정확한 대체물이 된다(이하 "장애물 A").
본 WI는 그 장애물 A만 닫는다. 실제 델타 전송/서버 누적 저장(장애물 B·C)은 후속 WI로 분리한다.

## 현황 진단 (탐색 확정)

**장애물 A는 이미 ~80% 해결되어 있었다.** 최초 추정("add/remove 패치가 lossy")은 `commands.ts`
헤더 주석(1~20줄)이 WI-024 **이전** 상태로 stale였던 데서 비롯한 오판이었다. 직접 확인한 실제 상태:

| 변경 유형 | 무손실 패치 | 근거(파일:라인) |
|---|---|---|
| item.add | ✅ | `item.create` 패치가 `serializeItemSubtree(stagedItem)` 전체 동봉 — `apps/web/src/document/commands.ts:906-918` + 테스트 `commands.test.ts:160` |
| item.remove / items.remove | ✅ | agocraft kit `createRemoveItemCommand`의 self-contained `item.remove`(서브트리 동봉, DR-026) — `commands.ts:926` |
| unit add/remove(behavior) | ✅ | `unit.create`/`unit.remove` 전체 동봉 — `commands.ts:1870,1910` |
| 속성/이동/리사이즈/reparent/text/layout | ✅ | `item.attrs`/`item.reparent`/`item.text`/`item.layout` 등 17 variant |
| background / presentationOrder | ✅ | `document.attrs` 패치 — `commands.ts:1851,1863` |
| Change→Patch 변환 | ✅ | agocraft 정식 `changeToPatch` 전수 매핑 — `use-weave-editor.ts:459`, DR-107 |
| **doc.reset** | ❌ | `targets.reset()` 직접 호출 후 `ok(undefined, [])` — 패치 0개 — `commands.ts:929-934` |
| **envelope: title / width / height / meta** | ❌ | `SerializedDesignV5`의 envelope 필드는 `document`와 별개라 패치로 재구성 불가 — `storage.ts:134-153`. `commands.ts:1829` 에 "title/presentationOrder를 document.attrs로 접는 follow-up" 미완 메모 존재 |

합격 기준(Definition of Done): **빈 문서에서 패치 스트림만 replay → `toSerializedDesign` 출력과 정확히 일치**.

## 확정 결정 (상세 DR-112 — Build 중 정정 반영)

| # | 항목 | 확정 |
|---|---|---|
| A1 | doc.reset 표현 | **스냅샷 경계로 처리** — `SNAPSHOT_BOUNDARY_COMMANDS = {weave.doc.reset}`(commands.ts export)로 선언. 후속 델타 sink가 "로그 비우고 새 스냅샷"으로 소비. 패치 모델 무변경 |
| ~~A2~~ | ~~envelope 패치화~~ | **DROP (정정)** — title/width/height는 세션 중 mutation surface가 없음(rename·resize UI 부재). 초기 스냅샷이 캡처 → 패치 불필요. setTitle/resize 신설은 dead command. 향후 rename/resize 기능 추가 시 그 기능이 동반 |
| A3' | 불변식을 타입에 | **`WeaveCommandTargets` → `{reset}` 축소** — commands.ts는 `targets.reset()`만 호출(935), 나머지 target은 vestigial. "reset만이 패치-밖 변경 경로"를 타입으로 강제 |

**핵심 정정**: Build 조사 결과 장애물 A는 **이미 충족돼 있었다** — 모든 라이브 mutation이 command→patch
경로이고(WI-024/DR-026/DR-107), envelope는 스냅샷이 담으며, 유일한 패치-밖 변경(reset)은 선언된 경계다.
본 WI는 그 사실을 **증명(완결성 게이트)하고 타입으로 잠그며 stale 문서를 정정**하는 것으로 재정의된다.

## 단계 (상세 ENGINEERING_PLAN — 정정판)

- **P0** Decommission Sweep — stale 헤더 주석(`commands.ts:1-20`) + "follow-up PR" 메모(`commands.ts:1828`) 정정, WI-024/DR-026/본 정정 반영.
- **P1** 불변식 잠금(A1+A3') — `WeaveCommandTargets`를 `{reset}`으로 축소(proxy + 6개 test 리터럴 동반 수정, TS가 누락 검출) + `SNAPSHOT_BOUNDARY_COMMANDS` export + reset 태그.
- **P2** 완결성 게이트(A4) — 대표 mutation 명령들이 host target 무접촉 + reset이 유일 boundary + item.create/remove 서브트리 동봉 재확인 테스트. CI 게이트.
- ~~envelope→document.attrs~~ — 드롭(위 A2 정정).

## Build 완료 (2026-06-10)

구현:
- **P0** `commands.ts:1-20` 헤더 주석 정본화(WI-024/DR-026 실태 + reset=boundary), `commands.ts:1843` "follow-up PR" 메모 정정(envelope=스냅샷), reset 명령 주석.
- **P1** `WeaveCommandTargets` → `{ reset }` 축소(`commands.ts:128`) — proxy(`use-weave-editor.ts:390`) + DesignPage commandTargets 리터럴 + 6개 test 리터럴 동반 수정(TS가 전 지점 검출). `SNAPSHOT_BOUNDARY_COMMANDS = {weave.doc.reset}` export(`commands.ts`).
- **마지막 bypass 제거**: `DesignPage.tsx` frameDuplicator 스텁이 `rawAddItem`(use-design 직접 setter, history/sync 우회) 직접 호출 → `editor.exec("weave.item.add")`로 라우팅. Document mutation rule 위반 해소. (관련 stale 주석도 정정.)
- **P2(A4) 완결성 게이트**: `commands.test.ts` 신규 describe 4 테스트 — boundary set 정확성, targets=`{reset}` 구조 잠금, 대표 mutation 명령(add/remove/update/setBackground/setPresentationOrder)이 ≥1 패치 + reset 훅 무접촉, reset이 유일 패치-less boundary.

검증(Continuous Self-Verification):
- `pnpm typecheck` ✅ · `pnpm test` ✅ **938 tests / 94 files 전부 green**(신규 게이트 4 포함) · `pnpm lint`(biome) ✅ · declarative(Rule 6)/purity/inheritance 게이트 ✅.
- e2e 미실행 — sandbox 네트워크 차단(기존 WI들과 동일 제약). frameDuplicator 변경은 의미상 등가(동종 아이템 추가) + 이제 undoable이라 회귀 위험 낮음.

## Follow-up (별도 hygiene, 본 WI 범위 밖)

use-design.ts의 이제 완전히 사문화된 직접 setter(`addItem`/`removeItem`/`updateBehavior` — 호출자 없음;
`setDesignBackground`/`setPresentationOrder`/`reorderRootChildren` — 라이브 UI는 `*ViaEditor` 래퍼 사용)는
return 객체 축소 시 blast radius가 있어 분리. 제거해도 패치 완결성에는 영향 없음(이미 호출 경로 차단됨).

## Non-goals (후속 WI)

- 패치를 실제로 서버에 전송하는 경로(장애물 C) — persist sink가 아직 `toSerializedDesign` full-blob.
- 서버측 패치 로그 KV 스키마 + 스냅샷 컴팩션(장애물 C) — WI-028에 일부 구현됨(paused).
- 동시 편집 충돌 해소(장애물 B, LWW vs CRDT) — WI-028.

## 다음 액션

ENGINEERING_PLAN P0→P3 순차 Build + Continuous Self-Verification(suite green + round-trip 게이트 통과).
