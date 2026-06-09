# DR-111 — 포맷별 에디터 설정 레지스트리 + page-bounded 편집 모델

- 상태: ACCEPTED
- 날짜: 2026-06-10
- 관련: WI-153, FR-024 · 연동 WI-150(에이전트 컨테이너 가드) · 영향 `DesignPage.tsx`(flavor 분기), `FrameStage.tsx`(카메라/제스처), `use-item-add.ts`(기본 컨테이너), presentation/Present/Export

## 맥락

디자인 타입에 맞춰 편집화면을 구성하고, 프레젠테이션/문서 타입을 캔바식 한-페이지·페이지-바운드 편집으로
만든다. 탐색 결과(FR-024): 타입 모델(`DocFlavor`)·프레젠테이션 런타임·"페이지=최상위 프레임"이 이미 있고,
공간 경계 강제는 전무하다. 에디터가 타입으로 분기하는 곳은 단일 boolean(`DesignPage.tsx:1029`)뿐이다.

## 결정

### D1. 타입→에디터 설정은 **레지스트리**(Rule 6)
`infiniteCanvas` 단일 boolean을 포맷-키 레지스트리 `FORMAT_EDITOR_CONFIG`로 승격한다. 포맷별 설정 객체
하나(캔버스 모드, 팬/줌 정책, 기본 추가 컨테이너, 클램프/클립 on, 페이지 네비게이터, 에이전트 root 허용 등).
현재의 `flavor === "mixed" || "canvas-board"` 인라인 디스크리미넌트가 정확히 Rule 6가 금지하는 패턴 → 이번에
레지스트리로 전환. **switch/if-chain 금지, 한 포맷=한 설정.**

### D2. 타입 식별 = 기존 `slide-deck` **재사용**
`slide-deck`이 이미 "프레젠테이션"이고 영속·배선되어 있으므로 그대로 프레젠테이션 포맷으로 승격. 신규 필드/
마이그레이션 없음. 마법사는 라벨만 "프레젠테이션"으로 부각.
- 기각: 새 `presentation` format 도입 — 의미는 깔끔하나 기존 디자인 마이그레이션 비용.

### D3. 적용 범위 = **slide-deck + doc-page**
두 포맷 모두 page-bounded 프리셋을 공유(둘 다 이미 non-infinite). mixed·canvas-board는 무한 캔버스 유지.
레지스트리가 회귀를 봉인.

### D4. "페이지 = 최상위 presentable 프레임"(신규 모델 0)
페이지 개념을 새로 만들지 않는다. presentationOrder가 페이지 순서(트리 독립), ThumbnailPanel이 네비/추가.

### D5. 경계 의미 = **소속 강제 + 가장자리 클립 + bleed 허용**
- 소속: 기본 추가 컨테이너를 root→활성 페이지로 재지정(`use-item-add.ts:127`, 에이전트 `commands.ts:709`).
- 클립: 활성 페이지(최상위 프레임)가 자기 subtree를 자기 박스에서 클립. bleed는 허용되고 가장자리에서 잘림
  → 기존 "불릿 bleed" 기능과 호환(하드 클립으로 깨지 않음).
- 기각: full-containment 하드 클램프 — 더 엄격하나 작업 많고 bleed 기능과 충돌.

### D6. 오프페이지 = **소프트 클램프(min-overlap)**
아이템을 페이지 밖으로 낼 수 있으나(bleed) 최소 일부는 항상 on-page로 유지 → "안 보이는 분실 아이템" 방지.
`computeMove`(+추가 지오메트리)에 가벼운 소프트 클램프. full-containment 아님.

### D7. 캔버스 뷰 = **한 번에 한 페이지**
활성 페이지에 카메라 락(`cameraFitBox`/`zoomToBox` 재사용), 무한 팬 off, 페이지 내 줌 허용. 전환·추가·복제·
재정렬은 썸네일 레일(presentationOrder). slide-deck이 프레임을 같은 x에 겹쳐 쌓으므로 "활성 페이지 fit +
나머지 숨김"이 곧 한-페이지 뷰. 본질적으로 **PresentPage(한 슬라이드 합성)를 편집 가능하게** 만든 것.

### D8. 페이지 추가 = 빈 페이지 + 복제
기본 `+`는 빈 페이지, 페이지별 "복제" 액션 별도. 페이지 크기는 디자인 단일 크기 유지(현행 design.width/height).

### D9. 발표/출력 클립 = **편집과 동일**(WYSIWYG)
편집·Present·Export 모두 페이지 경계에서 동일하게 클립. Present는 이미 한 슬라이드를 design.width/height로
합성하므로 클립 지점을 페이지 박스로 일치시킨다.

## 영향 / 후속

- Rule 6 정리(인라인 flavor 디스크리미넌트 제거). 무한 캔버스 포맷 회귀 없음(레지스트리 격리).
- 에이전트는 프레젠테이션 포맷에서 root 배치 금지(WI-150 가드 + 포맷별 프롬프트) — P4.
- 회전 박스 경계 정합은 후순위. 단계별 SVL(타입체크+aku/editor 테스트+브라우저 확인)로 진행.
