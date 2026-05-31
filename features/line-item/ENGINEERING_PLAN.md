# Engineering Plan — Line as a distinct item kind `line` (WI-062 / DR-025 / FR-013)

## Scope

선을 agocraft 독립 kind `line` 로 분리: 스트로크 전용 + 양끝 marker + 정점/끝점 편집(DR-024 동작 이식). 도형(shape)과 완전 분리. 다패키지(agocraft + weave) + 마이그레이션 + 재벤더. **데이터/행위 보존이 게이트.**

Out of scope: 대시 패턴 UI, line cap(butt/round/square) UI, 멀티-스타일 세그먼트 — 후속.

## Architecture (target)

- **agocraft `@agocraft/core`**: `LINE_KIND="line"`, `LineAttrs { frame, points, smooth?, heads? }`(fill 없음), `defaultLineAttrs`(DR-013 factory), `lineToSvgGeometry`(strokeOnly; straight=polyline, smooth=path, heads=markers — poly 와 공유 헬퍼), builtin 등록 + serializer + v13→v14 마이그레이션. 정점/heads 커맨드.
- **weave**: `DomainKind += "line"`; `LineBlock` 렌더(또는 ShapeBlock poly 경로 공유); selection-chrome `line` VM(resize/rotate 없음) + endpoint/vertex 핸들(poly-vertex 로직 공유); `LineSection`(stroke+heads+opacity) `register("line", …)`; add-menu "선" → line kind; 기존 open-poly 선 마이그레이션; agocraft core-only repack.

## Phases (순차, 각 단계 typecheck + e2e 가드)

### Phase 1 — agocraft 스키마/지오메트리/직렬화 (LINE_KIND)
- `LineAttrs` + `defaultLineAttrs` + builtin kind 등록.
- `lineToSvgGeometry`(strokeOnly, straight/smooth, heads markers) — poly 의 `smoothPolyPath`/`freeformPolyPoints`/marker 로직을 공유 헬퍼로 추출 후 재사용.
- serializer(line attrs round-trip) + builtin-kinds.test 추가.
- **재벤더**: core-only 타겟 repack(기존 버전 파일명 유지) + `pnpm install`.
- 가드: agocraft `tsc` + builtin-kinds.test green; weave `tsc` green.

### Phase 2 — weave 렌더 + kind 등록
- `DomainKind += "line"`; `use-weave-editor` `allowedChildKinds += "line"`; renderer/domain 등록(`LineBlock` 또는 poly 경로 공유). 
- 가드: line kind 아이템(수동/seed)이 stroke 로 렌더.

### Phase 3 — weave 선택 크롬 (handles)
- `line` selection VM: resize/rotate 핸들 없음(DR-023 패턴). 
- 정점/끝점 핸들: `poly-vertex-handle` 의 frame-follows-refit + 끝점 similarity 를 line kind 대상으로 공유/이식.
- 가드: `line-selection-handles` / `line-endpoint-drag` 를 line kind 로 갱신, green.

### Phase 4 — weave 속성 패널 LineSection
- `LineSection`: StrokeControl(색/굵기) + start/end head Select(none/triangle/open/diamond/circle) + OpacityControl. fill/코너 없음.
- `register("line", LineSection)`; 툴바 resolve 가 line kind → LineSection.
- heads 편집 커맨드(`weave.line.setHeads` 또는 item.update).
- 가드: 선 선택 시 LineSection(스트로크+마커)만, fill 없음; 마커 적용이 SVG marker 로 렌더.

### Phase 5 — add-menu + 마이그레이션
- "선" 카테고리(직선/자유선/곡선/자유곡선) → `line` kind 생성(2pt/다점/smooth, heads default none).
- v13→v14 마이그레이션: 기존 `shape`+`poly`(open) / `shape`+`line`/`arrow` → `line` kind(무손실 round-trip). 닫힌 poly/도형은 shape 유지.
- 가드: add-menu 테스트를 line kind 로 갱신; 마이그레이션 round-trip 테스트; 기존 디자인 로드 무손실.

### Phase 6 — QA / 정리
- 전체 선택/편집/속성 e2e green; 도형(shape) 회귀 0; DR-025 SOLID/GRASP 게이트(공유 헬퍼·Rule 6·무손실) 확인.

## Risks

- 마이그레이션 무손실(기존 선 데이터) — round-trip 테스트 필수.
- poly↔line geometry/vertex 중복 — 공유 모듈로 관리.
- 재벤더(agent-client small-think 이슈) → core-only 타겟 repack 으로 우회.
- capability(zorder/transform 등) 새 kind 커버리지 누락 주의.

## Cross-project

agocraft Phase 1 작업은 `../agocraft/records/decision-handoffs/HANDOFF-020-from-weave-line-kind.md` 로 요청·추적(operator 가 양측 소유, 직접 구현하되 paper trail 유지).
