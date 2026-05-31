# Decision Record — DR-023 Selection chrome ownership: kind-owned view-models + cross-cutting constraint filter (FrameStage god-resolver 해체)

## Metadata

| Field | Value |
|---|---|
| ID | DR-023 |
| Title | 선택 핸들(selection chrome) 결정 로직을 `FrameStage.resolveHandles`(중앙 god-resolver)에서 **각 item kind/sub-kind가 소유하는 등록형 view-model** 로 이전하고, 레이아웃 같은 cross-cutting 제약은 **단일 사후 필터** 로 분리한다. |
| Decision Level | **1 Local** — weave 내부 아키텍처(렌더 컨테이너 ↔ selection-chrome 정책 경계). agocraft 계약(`SelectionInfo` / `SelectionChromeRegistry`) 변경 없음. |
| Owner | hbpark |
| Required approvers | hbpark (responsible / accountable) |
| Consulted | 사용자 (2026-05-31, "핸들 관리가 너무 중앙집중형, 각 아이템이 자기 컨텍스트를 관리해야" + 옵션 1 = 기록 먼저) |
| Informed | `design-system-agent` (SelectionHandle / SelectionLayer primitive 불변 확인용) |
| Status | **Accepted** |
| Decided on | 2026-05-31 |
| Triggering Work Item | WI-060 |
| Pairs with | DR-018 (SelectionChromeRegistry / ItemSelectionViewModel 도입), DR-016·DR-022 (텍스트 resize 게이팅), CODE_STRUCTURE_DESIGN_RULES Rule 6 |

## Context

DR-018 은 "각 item kind 가 자기 selection view-model 을 author 하고 `SelectionChromeRegistry.resolve()` 가 병합한다"는 올바른 의도를 세웠다. 그러나 실제 결정 로직은 `apps/web/src/pages/FrameStage.tsx` 의 `resolveHandles` 클로저에 누적되어, 다음을 **컨테이너가 직접** 안다:

| 책임 | 현재 위치 (FrameStage.tsx) |
|---|---|
| default resize/rotate VM **inline 생성** | `:971` `createFrameDefaultViewModel({...})` (레지스트리 미등록) |
| 텍스트 모드 게이팅 `switch(mode)` | `:899-913` |
| 선 계열 도형 게이팅 `sk==="line"/"arrow"/"poly"` | `:948-959` (WI 선 카테고리에서 추가) |
| 레이아웃 제약(grid/flex) 교차 | `:926-941` |
| 확장(poly vertex / slide bullet) | ✅ 레지스트리 등록 (`DesignPage.tsx:752,759`) — 유일하게 올바른 부분 |

즉 확장만 레지스트리를 쓰고 "기본 핸들 + 게이팅"은 중앙집중. WI 가 늘 때마다(text mode, shape sub-kind, layout, 그리고 방금 선 계열) `resolveHandles` 에 분기가 누적되는 **OCP 붕괴 진행형**이다.

**근본 원인**: agocraft `SelectionInfo`(`@agocraft/editor` `index.d.ts:586`)는 `itemId/itemKind/unitKinds` 만 노출하고 attrs/sub-kind/mode 를 의도적으로 안 준다(kind-agnostic 계약). 그래서 등록 VM 이 sub-kind 를 못 보고, attrs 가 보이는 `FrameStage` 로 로직이 흘렀다. (`poly-vertex-handle` 만 `getPoly` 콜백으로 live doc 을 클로저 캡처해 우회 — 이것이 정답 패턴)

## Options considered

| Option | 설명 | 선택 |
|---|---|---|
| **A. 현행 유지 + 분기 추가** | 새 kind/sub-kind마다 `resolveHandles`에 `if/switch` 추가 | ✗ — Rule 6 / OCP 위반 누적 |
| **B. kind-owned VM + cross-cutting 필터** | 모든 kind/sub-kind가 자기 VM을 레지스트리에 등록(데이터는 `getAttrs` dep 주입), 레이아웃 등 cross-cutting 제약은 단일 사후 필터로 분리. `FrameStage`는 build-info → resolve → filter → position 의 5줄로 축소. | **✅ 선택** |
| C. agocraft `SelectionInfo`에 attrs 추가 | VM이 attrs를 직접 보도록 계약 확장 | ✗ — agocraft의 kind-agnostic 경계 침범(DR-011 mirror-type 정신 위반), 양 프로젝트 결합↑ |
| Do nothing | — | ✗ — 사용자 명시 거절 |

## Decision

**Option B 채택.** 두 개의 분리된 레지스트리/스테이지로 책임을 가른다 (CLAUDE.md "DI lookup 과 capability dispatch 를 분리하라"와 동형):

1. **Kind-owned VM 레지스트리** (이미 존재하는 `SelectionChromeRegistry`):
   - `frame/slide/canvas-design/media` → default resize+rotate VM 을 **등록**(현 `createFrameDefaultViewModel`). `FrameStage` inline 생성 제거.
   - `text` VM → 모드→dirs 게이팅을 자기 안으로 흡수. `switch(mode)` 대신 mode별 adapter map (Rule 6).
   - `shape` VM → sub-kind 정책을 흡수. 선 계열(line/arrow/open-poly) = resize 없음 + vertex 핸들, 닫힌 poly/polygon = resize 유지. **현 inline 선-계열 분기 + `poly-vertex-handle` 등록을 하나의 shape selection-chrome 도메인으로 통합**.
   - **데이터 주입**: weave VM 팩토리가 `getAttrs(itemId)`(또는 `getItem`) dep 를 받아 자기 attrs 를 읽는다 — `poly-vertex-handle.getPoly` 패턴의 일반화. agocraft `SelectionInfo` 불변.
2. **Cross-cutting 제약 필터** (신규 단일 스테이지):
   - `getChildConstraints`(레이아웃) 기반으로 resolve 된 spec 중 `resize-*`/`rotate` 를 사후 필터링. kind 분기 아님 — 균일 필터. provider 는 spec 을 "추가"만 하므로 "제거" 책임은 이 필터가 단독으로 가진다.
3. **`FrameStage.resolveHandles` 축소**: `buildInfo → registry.resolve → applyLayoutConstraintFilter → positionByAnchor`. kind/mode/sub-kind `switch` **0개**.

구현 단계는 `features/selection-chrome/ENGINEERING_PLAN.md` (5 phase, 행위 보존 refactor, 각 단계 e2e 가드).

## SOLID / GRASP review (CLAUDE.md 의무 — embed)

| 원칙 | 현행 위반 | B 적용 후 |
|---|---|---|
| **SRP** | `FrameStage`(렌더 컨테이너)가 selection-chrome 정책 소유 | 컨테이너는 resolve+position만; 정책은 kind VM/필터 |
| **OCP** | 새 kind/sub-kind = `FrameStage` 편집 | 새 kind = 새 VM 등록, 기존 코드 불변 |
| **Information Expert** | 핸들 정보 주체(mode/sub-kind)가 결정 못 함 | kind/sub-kind 가 자기 핸들 author |
| **Rule 6 (no switch on kind/mode)** | `switch(mode)`(:905) + sub-kind `if` 체인(:948) | mode/sub-kind adapter map → registry dispatch |
| **Two-registry 분리** | 게이팅+제약+확장이 한 클로저에 혼재 | kind-VM 레지스트리 ⟂ 제약 필터 스테이지 분리 |
| DI ⟂ capability dispatch | — | 데이터(`getAttrs` DI) ⟂ 핸들 결정(VM) 분리 |

체크리스트 게이트(구현 완료 기준): `resolveHandles` 내 kind/mode/sub-kind 직접 분기 0개 · 모든 default 핸들이 레지스트리 경유 · 선/텍스트/레이아웃 e2e green · `tsc` green.

## Consequences

### 즉시 변화
- **Code**: `FrameStage.resolveHandles` 대폭 축소; 신규 `selection-chrome/{frame,text,shape}` VM 파일 + `applyLayoutConstraintFilter`; `poly-vertex-handle` 는 shape VM 으로 흡수(또는 shape VM 이 위임).
- **행위**: 사용자 가시 변화 **0** (순수 구조 리팩토링). 가치는 유지보수성·확장성.
- **Process**: 향후 새 도형/아이템의 핸들 정책 = 해당 도메인 VM 한 곳에서. PR 리뷰 시 "FrameStage 에 kind 분기 추가" 는 reject 사유.

### Breaking / 마이그레이션
- 없음(행위 보존). 단계별 PR, 각 단계 기존 e2e 로 회귀 차단.

### Risk posture (accepted)
- VM 마다 `getAttrs` dep 주입 보일러플레이트 — 검증된 패턴이라 수용.
- resolve 가 rAF tick 마다 호출되나 VM 수(kind당 1)·필터 1패스로 성능 영향 무시 가능.
- 향후 kind별 특수 제약 등장 시 "제약=단일 필터" 가정 재검토(리뷰-by 시).

## Conditions / follow-ups

- [ ] `features/selection-chrome/ENGINEERING_PLAN.md` 5단계 순차 구현, 단계마다 e2e green.
- [ ] 완료 시 `resolveHandles` 의 kind/mode/sub-kind 분기 0 확인(grep 게이트).
- [ ] `design-system-agent`: SelectionHandle/SelectionLayer primitive 불변 확인(이 DR 은 호스트 조립부만 변경).
- [ ] WI-060 Status 갱신.

## Dissent

없음. 사용자 명시 confirm(옵션 1).

## Links

- Triggering Work Item: WI-060
- Engineering Plan: `features/selection-chrome/ENGINEERING_PLAN.md`
- Pairs with: DR-018 (registry 도입), DR-016 / DR-022 (텍스트 resize 게이팅 — 이 게이팅이 text VM 으로 이전됨)
- Rule: `docs/04-specialized-engineering/CODE_STRUCTURE_DESIGN_RULES.md` Rule 6
- Code (현행 god-resolver): `apps/web/src/pages/FrameStage.tsx:877-995`
- Code (올바른 패턴 선례): `apps/web/src/document/selection-chrome/poly-vertex-handle.tsx`, `frame-default-view-model.tsx`
