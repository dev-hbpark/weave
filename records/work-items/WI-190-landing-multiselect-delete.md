# WI-190 — 워크스페이스 첫 페이지 디자인/리소스 선택 삭제 + 전체 선택

- 상태: DONE (2026-06-12)
- 출처: 사용자 요청 — "weave 첫페이지의 디자인과 리소스 목록을 선택 삭제
  기능을 넣고 싶어 전체 선택도 가능하면 좋겠어."
- 결정: 경량 — 신규 DR 없음. 워크스페이스 랜딩 목록(localStorage+클라우드
  스토리지) 레벨 변경이라 에디터 문서 History 경로 비대상. 기존 단건
  `deleteDesign`/`deleteResource`(storage 경로)와 동일 패턴의 일괄화.
- 선행: WI-024 Phase 19 (랜딩 페이지 + 리소스 라이브러리)

## 문제

랜딩 페이지의 "저장된 디자인" 그리드와 "리소스" 패널은 카드별 호버 삭제
(×)만 있어 여러 항목을 정리하려면 한 건씩 확인-삭제를 반복해야 했다.
일괄 선택 / 전체 선택 / 일괄 삭제가 없었다.

## 해결

- **제너릭 선택 컨트롤러** `use-id-selection.ts` 신규 — 두 목록이 동일한
  멀티셀렉트 상태기계(toggle / toggleAll / clear, allSelected·someSelected
  파생)를 공유. raw 선택 셋은 항상 현재 present id와의 교집합으로 파생해
  타 탭 삭제 등으로 사라진 id가 카운트·전체선택·일괄삭제에 누수되지 않음.
  (UI_COMPONENT_STRUCTURE Lens 1 — DOM 없는 로직 오너, 중복 대신 합성.)
- **훅 통합** `use-landing-designs.ts` — `designSelection`/`resourceSelection`
  + `deleteSelectedDesigns`/`deleteSelectedResources`(선택 id 순회 →
  clearDesign/removeResource → clear → 단일 refresh) 노출.
- **뷰** `LandingPage.tsx` — 페이지 로컬 합성 컴포넌트 2개:
  - `SelectCheck`: 카드 코너 + 헤더 "전체 선택" 공용 체크 어포던스
    (호버/선택 시 표시, 액센트 채움, mixed=indeterminate 대시).
    카드가 `<Link>`을 감싸므로 toggle 시 `preventDefault`로 내비 차단.
  - `SelectionBar`: 섹션 헤더 일괄 바 — 전체 선택 + "N개 선택됨" +
    선택 삭제(window.confirm) + 선택 해제. 목록 비어있지 않을 때만 노출.
  - 선택 카드에 액센트 ring 하이라이트. 리소스 카드의 "이번 세션만"
    배지는 코너 충돌 회피로 top-left → bottom-left 이동.
- **디자인 시스템 트리아지**: 신규 프리미티브/토큰 없음. `Button`(ghost),
  `IconCheck`, `IconTrash`, `cn`, `--accent*` 토큰 재사용. 갤러리 선택
  크롬은 이 페이지 한정이라 escape(페이지 로컬 합성)로 결정.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/pages/use-id-selection.ts` | 신규 — 제너릭 id 선택 컨트롤러 |
| `src/pages/use-landing-designs.ts` | 선택 컨트롤러 2개 + 일괄 삭제 2개 노출 |
| `src/pages/LandingPage.tsx` | SelectCheck/SelectionBar + 카드 선택 하이라이트 |
| `e2e/workspace.spec.ts` | 멀티셀렉트 일괄삭제 / 전체선택 일괄삭제 스펙 2개 신규 |

## 검증 (Continuous Self-Verification)

- `tsc --noEmit` green, `biome check` green(role=checkbox는 카드-내 Link
  내비 차단 사유로 biome-ignore + ARIA 매핑 유지).
- `e2e/workspace.spec.ts` 6/6 통과 (기존 4 회귀 없음 + 신규 2).
- 라이브 런타임 스크린샷으로 선택 ring·헤더 바 육안 확인.

## 후속 (선택)

- 리소스 일괄 삭제 e2e는 디자인 경로가 공유 컴포넌트(useIdSelection/
  SelectionBar/SelectCheck)를 모두 커버해 미추가. 업로드 셋업 비용 대비
  가치 낮음. 필요 시 image-upload 헬퍼로 추가 가능.
- Shift-클릭 범위 선택은 범위 밖. 현재는 개별 토글 + 전체 선택.
