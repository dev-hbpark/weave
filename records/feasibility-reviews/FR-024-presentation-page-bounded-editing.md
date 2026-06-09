# FR-024 — 타입별 page-bounded(캔바식) 편집 — Technical Feasibility Review

- 관련: WI-153, DR-111
- 평가일: 2026-06-10
- 평가 대상(아이디어 전체): "디자인 타입에 맞춰 편집화면을 구성하고, 프레젠테이션/문서 타입은 캔바처럼
  **한 페이지 단위**로, **페이지 영역 안에서만** 편집되게 한다(어디에든 추가하던 기존 자유를 페이지로 한정)."

## 평결: **FEASIBLE** (저위험 · 대부분 additive)

핵심 자산이 **이미 존재**한다 — 데이터 모델 변경이 거의 없고, 풀어야 할 기존 제약도 없다(새 제약을 *더하는*
작업). 지능적/플랫폼 한계 없음. 본질은 "이미 있는 시임의 조립 + 국소적 클램프/클립 추가".

## 근거 — 필요한 메커니즘이 모두 갖춰져 있음

| 필요한 것 | 이미 있는 자산 | 출처 |
|---|---|---|
| 디자인 레벨 "타입" + 영속 | `DocFlavor`(slide-deck 포함), `root.attrs.flavor` 영속 | `document/types.ts:386`, `storage.ts:844` |
| 타입→에디터 분기 시임 | `infiniteCanvas` 단일 boolean(레지스트리로 승격할 자리) | `DesignPage.tsx:1029` |
| "페이지 = 최상위 프레임" | presentable 프레임 = 슬라이드, root 제외 | `presentation-order.ts:30-51` |
| 페이지 순서(트리 독립) | `presentationOrder` + 시퀀서 | `presentation-order.ts:1-9`, `domain-presentation/sequencer.ts` |
| 한 페이지 합성 런타임 | PresentPage(슬라이드 1장 → design.width/height 합성) | `PresentPage.tsx:428-525` |
| 페이지에 카메라 고정 primitive | `cameraFitBox` / `zoomToBox`(scale clamp 0.1~8) | `frame-camera-bridge.ts:40`, `FrameStage.tsx:401-421` |
| 페이지 네비/추가 UI 토대 | ThumbnailPanel(썸네일 레일) | ThumbnailPanel + presentationOrder |
| 컨테이너=프레임 강제(에이전트) | `enforceContainerIsFrame` 가드 | `commands.ts:831-845` (WI-150) |
| 이동/리사이즈 클램프 삽입 지점 | host `computeMove`/`computeResize` + 스냅 인터셉트 | `FrameStage.tsx:852/932`, `frame-manip.ts:73` |

## 본질적 한계 아님 — 모델링/국소 작업

- **공간 경계가 지금 0**(클램프·클립 없음, bleed는 기능). → page-bounded는 **순수 추가**: ① 기본 추가
  컨테이너 root→활성 페이지, ② 페이지 박스 클립, ③ 소프트 min-overlap 클램프. 기존 동작을 되돌릴 필요 없음.
- **slide-deck·doc-page는 이미 non-infinite**(fit-to-viewport) → 무한 캔버스(mixed/canvas-board)와 격리되어
  회귀 위험이 레지스트리로 봉인됨.

## 트레이드오프 / 경계(promise vs deliver)

- **bleed 허용 + 가장자리 클립**(확정) → full-containment 하드 클램프보다 *적은* 작업이며 기존 "슬라이드 불릿
  bleed" 기능과 호환. 단 **클립 경계를 편집·Present·Export에서 일치**시켜야 WYSIWYG(추가 정합 작업, 국소).
- **에이전트(Aku) 생성**은 프레젠테이션 포맷에서 **항상 페이지 내부 배치**여야 함 → WI-150 가드 + 포맷별
  프롬프트 변형 필요(국소, 이미 선례 있음).
- **회전된 박스의 경계 정합**(AABB vs 페이지)은 까다로움 → 후순위(소프트 클램프는 비회전 우선).

## 결론

데이터 모델 변경 0(slide-deck·페이지=프레임·presentationOrder 재사용), 되돌릴 기존 클램프 0, 재사용 카메라
primitive 존재 → **FEASIBLE**. 리스크는 클립 정합 + 에이전트 페이지 배치 두 국소 지점에 한정.
