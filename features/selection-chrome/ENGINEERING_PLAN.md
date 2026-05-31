# Engineering Plan — Selection chrome ownership (WI-060 / DR-023)

## Scope

`FrameStage.resolveHandles`(중앙 god-resolver)의 핸들 결정 로직을 **kind/sub-kind 가 소유하는 등록형 view-model** + **단일 cross-cutting 제약 필터**로 이전한다. 순수 구조 리팩토링 — **사용자 가시 행위 변화 0**. 결정 근거·SOLID/GRASP 체크리스트는 DR-023.

Out of scope: agocraft `SelectionInfo`/`SelectionChromeRegistry` 계약 변경, SelectionHandle/SelectionLayer primitive 변경, 새 핸들 종류 추가.

## Architecture (target)

```
FrameStage.resolveHandles(bounds):
  info  = buildInfo(item)                       // itemId/kind/unitKinds
  specs = registry.resolve(info)                // ★ 모든 kind VM 이 자기 핸들 기여 (switch 없음)
  specs = applyLayoutConstraintFilter(specs, item, doc)   // ★ cross-cutting, 균일 (resize-*/rotate 제거)
  return specs.map(positionByAnchor)
```

- **Kind VM 레지스트리** (기존 `SelectionChromeRegistry`): kind/sub-kind 별 핸들 author. 데이터는 `getAttrs(itemId)` dep 주입(= `poly-vertex-handle.getPoly` 일반화).
- **제약 필터** (신규): provider 는 spec 추가만 하므로 "제거"(레이아웃 비허용 dir / rotate)는 이 필터가 단독 담당.
- 두 책임 분리 = DR-023 의 two-registry 결정.

신규/이동 파일 (모두 `apps/web/src/document/selection-chrome/`):
- `frame-default-view-model.tsx` (기존) → 등록 대상으로 전환
- `text-selection-view-model.tsx` (신규) — 모드 게이팅 흡수
- `shape-selection-view-model.tsx` (신규) — sub-kind 정책 + poly vertex 통합/위임
- `layout-constraint-filter.ts` (신규) — `getChildConstraints` 기반 사후 필터

## Status — **DONE** (2026-05-31)

5단계 모두 구현(행위 보존). 단계가 `resolveHandles` 한 곳에 강결합되어 있어 하나의 일관된 변경으로 적용 후 기존 e2e 오라클로 검증: `tsc` green · 핸들/텍스트모드/도형/add-menu 36 + figma-quickaction 14 + layout/rotation 18 green · `resolveHandles` 내 kind/mode/sub-kind 분기 0(게이트). 큰 묶음 실행의 6 실패는 전부 pristine 재현(기존) 또는 flaky.

## Phases (순차, 행위 보존, 단계별 e2e 가드)

### Phase 1 — default VM 등록화
- `createFrameDefaultViewModel` 을 `frame/slide/canvas-design/media` kind 로 `registerItemViewModel` 등록(DesignPage).
- `FrameStage` 의 inline `createFrameDefaultViewModel(...)` 제거; resolve 결과만 사용.
- **가드**: 기존 frame/slide/media 선택 시 8 resize + rotate 그대로 — `figma-quickaction-add.spec.ts`, 기타 핸들 가시성 e2e green.

### Phase 2 — shape VM 신설 (선 계열 + poly vertex 통합)
- `shape-selection-view-model.tsx`: `getAttrs` 로 sub-kind/closed 읽어 — 선 계열(line/arrow/open-poly)=resize 제외, 닫힌 poly/polygon=full. poly 일 때 vertex 핸들 기여(현 `poly-vertex-handle` 흡수 또는 위임).
- `FrameStage` 의 `isLineTypeShape` 블록(:948-959) 삭제.
- **가드**: `line-selection-handles.spec.ts`(선 계열 resize 0 + vertex 유지 / 닫힌 poly resize 유지), `shape-poly.spec.ts` green.

### Phase 3 — text VM 신설 (모드 게이팅 이전)
- `text-selection-view-model.tsx`: `getAttrs` 로 `layoutChild` 읽어 모드 도출, **`switch(mode)` → mode→dirs adapter map**(Rule 6).
- `FrameStage` 의 `textHandleDirs` 블록(:899-913) 삭제.
- **가드**: `text-item.spec.ts` 모드별 핸들 노출(Auto-W=n/s, Auto-H=e/w, Fixed=8) green.

### Phase 4 — 레이아웃 제약 필터 추출
- `layout-constraint-filter.ts`: inline 교차 로직(:926-941)을 `applyLayoutConstraintFilter(specs, item, doc)` 로. resize dir/rotate spec 만 trim.
- `FrameStage` 가 resolve 후 필터 호출.
- **가드**: grid/flex 자식 선택 시 비허용 핸들 제거 + rotate 게이팅 — 레이아웃 e2e green.

### Phase 5 — 정리 + 게이트
- `resolveHandles` 를 목표 형태(≈5줄)로 축소. 잔여 kind/mode/sub-kind 분기 0 확인(grep).
- DR-023 의 SOLID/GRASP 게이트 충족 확인; WI-060 / DR-023 Status 갱신.

## QA / SVL

- 각 phase 는 행위 보존 refactor → **기존 e2e 가 회귀 오라클**. 새 단언은 최소(필요 시 핸들 가시성 카운트).
- 게이트: `npm run typecheck` green · 관련 e2e(add-menu / line-selection-handles / shape-poly / text-item / figma-quickaction-add) all green · `resolveHandles` 내 `switch`/sub-kind `if` 0개.

## Risks

- VM `getAttrs` dep 주입 보일러플레이트 — 검증된 패턴(poly-vertex)이라 수용.
- rAF tick 당 resolve — VM 수·필터 1패스로 영향 무시 가능.
- "제약=단일 필터" 가정: 향후 kind별 특수 제약 등장 시 재검토.
