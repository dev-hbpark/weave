# WI-050 — 프레임 삭제 시 자식은 루트 디자인으로 보존 (dissolve frame)

## Metadata

| Field | Value |
|---|---|
| ID | WI-050 |
| Title | 프레임에 포함된 자식들을 모두 루트 디자인으로 reparent 한 뒤 프레임을 삭제하는 기능 (QuickActionBar 버튼 + 핫키) |
| Owner | hbpark |
| Status | **Implemented & verified green (2026-05-29).** |
| Severity | P2 (기능 추가) |
| Created | 2026-05-29 |
| Closed | 2026-05-29 |
| Related | [WI-039](WI-039-reparent-workflow.md)(reparent), `weave.item.reparent`/`weave.item.remove`(재사용 명령), [DR-design-022](../design-reviews/DR-design-022-ungroup-icon.md)(IconUngroup) |

## 요청 & 결정

요청: "프레임에 포함된 자식들을 모두 루트 디자인으로 reparent 한 후 (프레임이) 삭제되는 기능. QuickActionBar 에 추가하고 핫키도 등록."

사용자 확정 결정:
- **핫키 = ⌘⌫ (Cmd/Ctrl + Backspace)** — "프레임 삭제(자식 유지)".
- **아이콘 = 신규 `IconUngroup` + DR-design** (DR-design-022). 점선 컨테이너 + 자식 2개로 "상자는 사라지고 내용은 남는다"를 표현. 기존 plain delete(✕ `IconClose`)와 시각 구분.
- 자식 reparent 대상 = **루트 디자인**(요청 문구 그대로). 최상위 프레임(대부분의 경우)은 부모=루트라 동일. 중첩 프레임이면 자식이 최상위로 평탄화됨.

## 설계 — 단일 트랜잭션 / 단일 Undo

신규 명령 `weave.frame.removeKeepingChildren({ frameId, designWidth?, designHeight? })` 가 **한 exec 에서 두 patch** 를 emit:

1. `item.reparent` — 프레임의 직속 자식 전부 → 루트. 각 자식의 화면상 위치를 보존(`computeReparentFrameRatio`, rotation-aware, 조상 체인 전체 고려; null 이면 현재 frame fallback — 파괴적 연산이므로 자식 절대 유실 금지). `newIndex` 를 루트 현재 자식수부터 증가시켜 원래 stacking order 보존.
2. `item.children` — (이제 비어 있는) 프레임을 부모에서 제거.

**patch 순서가 핵심**: reparent 가 먼저 적용돼 프레임이 비워진 뒤 remove 가 빈 프레임을 지움. History 는 트랜잭션의 patch 를 **역순**으로 invert(editor `index.js:176`) → Undo: ① remove⁻¹ 가 **빈** 프레임 재추가(그래서 `pending.stage` 에 children:[] 인 빈 프레임을 stage — 원본을 stage 하면 자식이 중복 부활), ② reparent⁻¹ 가 자식을 루트→프레임으로 복귀. 결과: 프레임이 자식과 함께 복원, 루트에 자식 잔존 없음.

이는 라이브러리(agocraft)가 이미 소유한 두 검증된 동작(reparent 이동 + children 제거)을 **호스트가 조합**한 것 — 새 계산 로직 없음. `runBatch` 불필요(단일 exec 의 patch 들은 같은 transactionId → 한 history entry).

## 와이어링 (두 surface, 한 명령)

- **QuickActionBar 버튼**: `editor-hotkeys.ts` 의 메타데이터 `frame.removeKeepingChildren`(visibleWhen=frame, category=frame) + 호스트 슬롯 `frameDissolver`/`setFrameDissolver` + `tryHostSlot` 케이스(selectedId 로 디스패치). DesignPage `renderItem` 에서 `IconUngroup` 매핑.
- **핫키 ⌘⌫**: DesignPage 의 **window keydown 리스너**에서 직접 처리(agocraft 핫키 레지스트리 아님). 이유 = 레지스트리는 매치 시 action 의 focus 체크 *전에* preventDefault 하므로, Backspace 계열을 레지스트리에 등록하면 입력창/Lexical 안 native delete 를 가로챔. plain Delete/Backspace 가 이미 같은 리스너에서 처리되는 것과 동형. 메타데이터의 `hotkey` 필드는 **표시(tooltip/팔레트)용**이며, 레지스트리 등록 루프에서 `WINDOW_LISTENER_COMMAND_IDS` 로 skip.
- 두 경로 모두 DesignPage 의 공유 `dissolveFrame(frameId)` 콜백 사용(design 크기는 ref 로 읽어 stale 방지) → exec 후 selection clear.
- `selectedFrameId` 는 이미 `selection.kind === "frame"` 전용이라 핫키는 자연히 프레임 한정. 비-프레임/다중선택은 `if (mod) return` 으로 무변경 통과.

## Changes

- `commands.ts`: 신규 명령 `weave.frame.removeKeepingChildren` + `RemoveFrameKeepingChildrenInput` + 배열 등록.
- `editor-hotkeys.ts`: 슬롯 `frameDissolver`/`setFrameDissolver`, 메타데이터 엔트리(hotkey 표시 ⌘⌫), `tryHostSlot` 케이스, 레지스트리 등록 skip-set.
- `DesignPage.tsx`: import, `designSizeRef`, `dissolveFrame` useCallback, 슬롯 등록, keydown ⌘⌫ 분기(`if (mod) return` 앞), `renderItem` 에 `IconUngroup` 매핑.
- `Icon.tsx`(+ `index.ts` export): 신규 `IconUngroup`.
- `commands.test.ts`: 5 신규 unit. `frame-dissolve.spec.ts`: 2 신규 e2e.

## Verification

- typecheck(web+design-system) / declarativecheck(Rule 6 OK) / puritycheck(OK): PASS.
- web unit **229/229**(commands.test.ts 41 = 신규 5: patch 형태·forward 적용·**undo 라운드트립 무중복**·빈 프레임·root/미존재 guard).
- e2e 신규 `frame-dissolve.spec.ts` **2/2**: ① QuickActionBar ungroup 버튼 → 자식 루트 reparent + 프레임 제거, ② ⌘⌫ dissolve → ⌘Z 가 프레임+자식 복원(루트 잔존 0) → ⌘⇧Z redo. 실제 브라우저 런타임 검증(typecheck/build≠작동).
- 회귀: keyboard/bar/reparent 관련 스펙 32 pass. `reparent-context-menu.spec.ts` 3 fail 은 **baseline 에서도 동일 실패**(stash 검증) — 본 변경과 무관한 기존 이슈.
- 환경 주의: 작업 시작 시 vendored agocraft 의존성(`valibot`, `yjs`)이 iCloud 미동기화로 node_modules 에 미실현 → `pnpm install --force` 로 store(로컬)에서 재실현 후 진행. 본 기능과 무관.

## Out of scope (future)

- 중첩 프레임 dissolve 시 자식을 **루트 대신 "프레임의 직속 부모"** 로 보내는 옵션(현재는 요청대로 항상 루트). 변경 시 명령에서 `newParentId = parent.id` 한 줄.
- Undo 시 프레임이 부모의 원래 index 가 아닌 끝에 재추가됨(기존 `weave.item.remove` undo 와 동일 한계).
- 루트에 layout(flex/grid)이 있는 경우의 재배치(현재는 자식의 절대 위치 보존만; 루트 layout 무시).
