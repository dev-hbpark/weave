# WI-155 — 페이지 복제 (썸네일 레일 per-page duplicate)

Status: **Done** — 유닛 4건(전체 930/930) · gates green · SVL 10/10 · e2e 2건(undo/redo 포함) · 에이전트 스키마 등록(coverage 가드)
Owner: hbpark
Updated: 2026-06-10

관련: [WI-153](WI-153-presentation-page-bounded-editing.md)(P2.3 보류분) · [DR-111](../decisions/DR-111-format-editor-config-and-page-bounds.md) 결정 6("빈 페이지 `+` + 페이지별 복제 액션") · 플랜 `features/presentation-page-editing/ENGINEERING_PLAN.md`

## Problem

WI-153 결정 6의 후반부 — 썸네일 레일에서 페이지(슬라이드)를 그 자리에서 복제. P2.3에서 보류된
이유 두 가지:

1. 기존 `weave.item.duplicate`(에디팅 키트)는 클론의 루트 프레임을 **0.02 넛지** — FULL_FRAME
   페이지가 복제되면 페이지 박스에서 어긋난 "거의 페이지"가 생긴다.
2. `weave.batch`는 batch 중 생성된 id를 후속 op가 참조할 수 없어 duplicate + presentationOrder
   삽입을 한 트랜잭션으로 묶을 수 없었다.

## 결정 (kit `offset` 옵션 + 컴포지트 명령)

vendored core `rc.20260609193000`의 `createDuplicateItemCommand`가 **`offset?: number` deps
옵션**을 노출 — 보류 사유 1이 키트 레벨에서 해소됐다. 전용 subtree-clone 명령(보류 시 가정)은
불필요.

- **`weave.page.duplicate`** = 키트 duplicate(`offset: 0`) 인스턴스를 래핑한 컴포지트 명령
  (기존 `weave.items.lifecycle`과 같은 delegate-`run` 관용구):
  - 가드: 대상이 frame이어야 함(`not-a-page`) — 페이지 의미론을 명령이 직접 보증.
  - 키트 run → 클론 패치들 + 새 id 획득 → **같은 트랜잭션에** `document.attrs` 패치를 덧붙여
    presentationOrder의 **원본 바로 뒤**에 클론 id 삽입(reconcile의 "끝에 append" 기본을 교정).
  - 한 트랜잭션 → **한 번의 Cmd+Z**로 클론+순서 모두 롤백 (History 계약).
  - 원본이 덱 비멤버(presentable:false 그룹)면 순서 패치 생략 — 클론도 비멤버라 순서에 안 들어감.
- 보류 사유 2(`weave.batch` id 참조 한계)는 우회: batch가 아니라 명령 내부 컴포지션이므로 새 id를
  패치 계산에 바로 쓸 수 있다.

## UI

- `ThumbnailPanel`: 슬라이드 타일 푸터에 복제 버튼(`IconCopy`, 기존 DeckGlyph 토글과 같은
  z-10 hover-reveal 패턴, testid `thumbnail-duplicate-<idx>`). Design System Triage: **reuse**
  (기존 타일 푸터 액션 패턴 + 기존 `IconCopy`) — 신규 프리미티브/토큰 없음.
- `DesignPage`: page-bounded 포맷에서만 `onDuplicatePage` 전달(WI-153 결정 6 스코프 — infinite
  canvas는 기존 캔버스 duplicate(넛지 포함)가 적절). 성공 시 클론 선택 + 활성 페이지 전환.

## 에이전트 표면

coverage 가드(WI-095/DR-064 — "no hidden commands")가 모든 등록 명령에 큐레이트 스키마를
요구 → 라벨 "페이지 복제" + 스키마 등록. 설명에 "슬라이드/페이지 복사는 `weave.item.duplicate`
(넛지)가 아닌 이 명령" 유도 포함 — 에이전트의 페이지 복사 의도가 정렬 깨지는 경로로 새지 않게.

## 검증

- 유닛: 명령 — frame 가드, offset 0(원본과 동일 frame), presentationOrder 원본 직후 삽입,
  비멤버 생략, 단일 트랜잭션 patch 구성.
- SVL: 레일 복제 클릭 → 타일 2개(클론이 원본 바로 뒤) → 클론이 활성 페이지 + 내용 일치 →
  Cmd+Z 한 번에 클론 소멸 + 순서 복원.
- e2e (영구, `e2e/new-design.spec.ts` — Document mutation rule 체크리스트 충족): ① slide-deck
  레일 복제 → 클론 id ≠ 원본 + index 1 + 활성 → 키보드 Cmd+Z 한 번에 롤백 → Cmd+Shift+Z 재적용;
  ② mixed(무한 캔버스) 레일엔 복제 버튼 미렌더(스코프 가드). 키보드 undo 사용 — toolbar-undo
  클릭은 group-timing flake로 skip된 경로.
