# DR-118 — 선택-인지 삽입 정책 + 모드-스코프 Select All (InsertionPolicy 성장)

- Status: ACCEPTED — 사용자 요청 직접 반영 + WI-180 구현 완료 (2026-06-11)
- Date: 2026-06-11
- Related: DR-114 (EditorModeContext — §6 성장 계약 G1/G4를 따르는 정책
  메서드 추가), DR-111 D5 (selection-less add의 active-page 기본 컨테이너 —
  본 DR이 selection-aware로 확장), WI-072 (paste 컨테이너), WI-163
  (페이지=아트보드), WI-166

## 결정 (사용자 지시 원문 반영)

> "각 모드별 동작을 완벽하게… 편집 기준영역이 다른것만 제외하면 대부분의
> 동작은 동일해야 해. 믹스드에서 cmd+a는 모든 첫번째 자식아이템, 프레젠테이션
> 모드에서 cmd+a는 슬라이드의 모든 첫번째 자식아이템 — 화면에 보이는
> 슬라이드가 선택된 것이기 때문에 자연스럽게. 믹스드에서는 항상 선택한
> 프레임에 요소가 추가되지만, 프레젠테이션 모드에서 슬라이드 하위 프레임은
> 그룹이므로 선택 중이어도 UX상의 아이템 추가는 슬라이드에 추가돼야 한다.
> 모드에 따라 다른 처리는 모드의 디펜던시 컨텍스트로 격리된 코드 안에서
> 다형성으로."

`InsertionPolicy`에 **필수 메서드 1개를 추가**한다 (DR-114 §6-G1: 소비처와
same-change 이주):

```ts
addContainerFor(doc, activePageId, selectedId): string | undefined
```

- **free-placement 조각 (`addIntoSelectedFrame`)** — 선택된 항목이 frame이면
  그 frame이 명시적 추가를 캡처(기존 소비처의 `selIsFrame ? sel : default`
  분기 원형 그대로), 그 외(비선택/비-frame/stale id)는 root.
- **page-bounded 조각 (`addIntoActivePage`)** — 선택과 무관하게 **항상
  ACTIVE PAGE** (서브-페이지 frame은 그룹이지 편집 표면이 아니다 — Canva
  모델). 빈 덱(active page 없음) → root 폴백(containerFor와 동일).

## 이주된 소비처 (G1 — 같은 변경에서)

1. **use-item-add** ×2 ("+" 추가 메뉴 `addNewItem` + R/T/L/F 툴 핫키 어댑터)
   — `selIsFrame` 분기 제거, 오케스트레이터(DesignPage)가 ref-미러한
   `resolveAddContainerRef`(라이브 정책+선택을 클릭/핫키 시점에 읽음) 주입.
   frame-스코프 줌은 `containerId === sel`(정책이 선택 frame을 컨테이너로
   해석한 경우)로 유도 — slide-deck에서 그룹 줌 오발동 제거.
2. **paste** (`pasteTargetContainerId` — 클립보드 paste + 파일 import 공유)
   — frame 선택/무선택 암은 `addContainerFor`로 해소. **비-frame 선택 →
   부모 옆에 붙는 paste-beside는 모드-독립으로 유지.** slide-deck에서
   무선택 paste가 root에 떨어져 **보이지 않게 추가되던 버그**(activePageOnly
   뷰 밖) 제거.
3. **Cmd+A** (DesignPage 윈도 리스너) — 폴백 스코프가 `doc.root` 하드코딩
   → 기존 `InsertionPolicy.containerFor` 값(defaultAddContainerIdRef)으로:
   infinite는 root(무변경), page-bounded는 **active page**(숨겨진 형제
   페이지는 절대 선택되지 않음). 소비처에 flavor 비교 없음(§6-G4).

## 행동 변경 (모드-독립 1건 포함)

- **Cmd+A, 비-frame leaf 선택 시**: 기존 no-op → **부모의 children(형제들)
  선택**. 두 모드 동일 규칙. 슬라이드에서 아이템 클릭 후 ⌘A가 "슬라이드
  전체 선택"이 되는 자연스러움의 전제이며, 믹스드에서도 Figma의 same-level
  select-all과 정합. frame 선택 시 drill-in(그 frame의 children)은 두 모드
  동일 유지 — "편집 기준영역 외에는 동일 동작" 원칙.
- **slide-deck 명시적 추가**: 그룹-frame 선택 중에도 active page에 추가.
- **slide-deck paste**: 무선택/frame 선택 → active page (root 불가).

## 대안 기각

- **RolePolicy 능력 행 추가(`containerSurface`)** — role은 element/stage
  2값이라 "frame인 element만" 표현에 kind 검사가 소비처에 남는다. 컨테이너
  해석은 삽입 관심사이므로 InsertionPolicy가 Information Expert.
- **별도 SelectionPolicy 신설** — Cmd+A의 모드-가변부는 "기준 컨테이너"
  하나뿐이고 이는 이미 `containerFor`가 보유한 진실. 정책 신설은 §6-G5
  (이중 진실원) 위반. 표현 불가능한 선택-스코프 분기가 처음 등장할 때가
  도입 시점.

## 알려진 사전-존재 이슈 (본 변경과 무관, 스코프 외)

- `editor-shortcuts.spec.ts:190/207` (paste가 root에 붙는다고 기대)는
  **main에서도 red** — WI-072가 paste-into-selected-frame으로 바꿀 때
  갱신되지 않은 스펙. 후속 정리 필요(스펙을 WI-072 의미로 갱신하거나
  paste-beside로 의미 재결정).
