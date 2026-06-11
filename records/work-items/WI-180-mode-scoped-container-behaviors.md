# WI-180 — 모드-스코프 컨테이너 동작 (Cmd+A / 아이템 추가 / paste)

- **Status**: DONE (2026-06-11)
- **Date**: 2026-06-11
- **Decision Record**: DR-118
- **Origin**: 사용자 요청 — "각 모드별 동작을 완벽하게. 편집 기준영역
  (디자인 vs 페이지 하위)이 다른 것만 제외하면 동작은 동일해야 한다.
  프레젠테이션 Cmd+A = 슬라이드의 첫번째 자식들(보이는 슬라이드가 암묵
  선택). 슬라이드 하위 프레임은 그룹 — 선택 중이어도 UX 추가 버튼은
  슬라이드에 추가. 모드별 차이는 모드 디펜던시 컨텍스트로 격리된 코드의
  다형성으로."

## 문제 (slide-deck에서 깨지던 컨테이너-스코프 동작 3건)

| 동작 | 기존 (slide-deck) | 수정 후 |
| --- | --- | --- |
| Cmd+A (무선택) | `doc.root` 하드코딩 → 숨겨진 페이지들이 선택 | active page의 children |
| 추가 버튼/툴 핫키 (그룹-frame 선택) | 그룹 내부에 추가 + 그룹 줌 | active page에 추가, 줌 없음 |
| paste (무선택) | root에 추가 → page-scoped 뷰 밖, **보이지 않음** | active page에 추가 |

mixed는 3건 모두 무회귀 (선택 frame 캡처 / root 폴백 유지).

## 구현

- `editor-mode/types.ts` — `InsertionPolicy.addContainerFor(doc,
  activePageId, selectedId)` 필수 메서드 추가 (DR-114 §6-G1).
- `editor-mode/pieces/insertion.ts` — `addIntoSelectedFrame`(free) /
  `addIntoActivePage`(page-bounded) 조각.
- `pages/design/hooks/use-item-add.ts` — `defaultAddContainerIdRef` →
  `resolveAddContainerRef`(선택-인지 리졸버) 교체, `selIsFrame` 분기 제거,
  줌 조건 = `containerId === sel`.
- `pages/DesignPage.tsx` — 리졸버 ref 조립(컴포지션 루트), Cmd+A 폴백
  스코프 = `defaultAddContainerIdRef`(= `containerFor`), 비-frame leaf
  선택 시 부모 스코프(형제 선택 — 모드-독립 행동 변경, DR-118),
  `pasteTargetContainerId`의 frame/무선택 암을 `addContainerFor`로.

## 검증 (Continuous Self-Verification)

- 단위: `editor-mode.test.ts`에 `addContainerFor` 정책 표 추가 — 전체
  vitest **1127/1127 green**.
- e2e 신규 `editor-mode-add-container.spec.ts` **5/5 green**: slide-deck
  Cmd+A 무선택/leaf-선택, mixed leaf-형제, slide-deck 툴핫키 add→page,
  slide-deck paste→page.
- e2e 회귀(editor-shortcuts / add-menu / clipboard-items /
  frame-in-frame-add / figma-tool-hotkeys / editor-mode-hit /
  editor-mode-rail): 33 passed. 실패 3건은 **모두 사전-존재**:
  `editor-shortcuts:190/207`(main에서도 red — WI-072 미갱신 스펙, DR-118
  §알려진 이슈), `editor-shortcuts:264`(helpers networkidle 플레이크).
- `tools/check_editor_mode_boundary.sh` OK (소비처 types-only, G4 비교
  없음). tsc clean. biome: 신규 에러 없음(DesignPage 2679 포맷 드리프트는
  사전-존재).
