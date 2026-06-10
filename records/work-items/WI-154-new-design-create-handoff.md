# WI-154 — 새 디자인 생성→에디터 열기 핸드오프 (flavor/타이틀/시드 소실 리그레션)

Status: **Complete**
Owner: hbpark
Updated: 2026-06-10
관련: [WI-153](WI-153-presentation-page-bounded-editing.md)(이 버그가 page-bounded 편집을 가림) · offline-first 전환(2026-05-29, `storage.ts` saveDesign)

## Problem (사용자 보고)

> 슬라이드 덱으로 디자인을 생성했을 때 mixed와 차이가 없다 — 잘못 구현된 것 같다.

진단 결과 WI-153 구현은 정상. 진짜 원인은 **생성→열기 핸드오프가 네트워크 레이스에 의존**:

1. `NewDesignWizard.createDesign()` → `saveDesign()` — offline-first 모델(2026-05-29)에서 온라인이면
   **LS에 쓰지 않고** fire-and-forget cloud POST만 수행 (LS 엔트리 = "unsynced offline edit" 의미라
   reconcile 프롬프트를 피하기 위함).
2. 즉시 navigate → `useDesign.initialDesign()` → LS 미스 → **flavor 없는 blank placeholder**
   (`"Untitled design"` / flavor 기본 `"mixed"`).
3. mount-time cloud GET이 wizard의 POST와 레이스(또는 API 없는 dev vite에서 무조건 실패) → blank
   mixed가 편집 대상으로 확정. **선택한 flavor·타이틀·flavor 시드 첫 페이지 전부 소실.**
4. 이후 첫 편집의 push가 blank를 cloud에 덮어씀 → 영구 소실.

방증: e2e `helpers.ts`가 이 증상을 주석으로 문서화하고 **offline 강제 + reconcile 다이얼로그 수동
해소**로 우회 중이었고, online으로 도는 `new-design.spec.ts` 첫 테스트는 실제로 빨간 상태였다.

## Fix — in-memory 핸드오프 (`src/document/new-design-handoff.ts`)

- wizard가 생성한 `Design`을 모듈-레벨 stash에 넣고 navigate (`stashNewDesign`); cloud push는 그대로.
- `useDesign.initialDesign()`이 stash를 **최우선**으로 읽어 `source: "fresh"`로 오픈 — reconcile
  프롬프트 없음, mount-time cloud fetch 없음(POST와의 레이스 제거).
- **peek/clear 분리(one-shot take 금지)**: `initialDesign`은 렌더 단계에서 실행되고 React StrictMode가
  렌더를 이중 호출 — 렌더 단계 delete는 두 번째(생존) 렌더를 굶긴다(실측). 렌더는 `peekNewDesign`,
  소비 확정은 mount effect의 `clearNewDesign` (멱등). 이후 재오픈은 정상 LS→cloud 경로.

## 검증

- `new-design-handoff.test.ts` 유닛 4건 (peek 비소비/clear 멱등/id 분리).
- e2e `new-design.spec.ts` green — 단, WI-153 P2.1(한 페이지 캔버스)에 맞게 단언 갱신: slide-deck에서
  top-level frame 추가는 캔버스 frame-block 수가 아니라 **레일 썸네일 수**가 늘어남.
- e2e `cloud-only-reopen` / `history-hotkeys` / `thumbnail-order` green (인접 오픈 경로 회귀 없음).
- SVL 브라우저 확인: slide-deck 생성 → `flavor: "slide-deck"` + 타이틀 + FULL_FRAME 시드 페이지 유지,
  page-bounded UI(한 페이지 + 매트 + SLIDES 레일 + "+") 정상 표시.
- `helpers.ts`의 offline 우회 주석을 WI-154 기준으로 갱신 (offline 기본값은 spec 격리 목적으로 유지).

## 남김 (비범위)

- plain vite dev(API 미서빙)에서 온라인 세션의 **재오픈** 영속성 부재는 기존 환경 특성 그대로
  (cloud도 LS도 없음). 실배포(KV)는 wizard POST가 영속화하므로 무관.
- `fetchDesignCloud`가 404와 unreachable을 구분하지 못해 "local" 오픈의 reconcile 프롬프트가
  신규-id에도 뜨는 문제는 별도 개선 후보.
