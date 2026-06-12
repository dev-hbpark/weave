# WI-200 — frame-간 정렬 스냅 가이드 선재 회귀 조사/수정

- 상태: DONE (2026-06-12)
- 출처: WI-198 SVL 중 발견 — `frame-move-snap.spec.ts:48` (WI-073 정렬
  스냅 가이드) red. 깨끗한 HEAD ec5138e worktree에서도 동일 실패 확증 →
  WI-197/198 무관 선재 회귀. 사용자 "선재 frame-move-snap 정렬 가이드
  실패도 후속으로 조사부탁해".
- 결정: DR-129. 크로스팀: agocraft HANDOFF-024.

## 증상

- `frame-move-snap.spec.ts:48` — frame B를 A의 left edge 3px 옆까지
  드래그 → `snap-feedback` 가이드 visible 기대 → **element not found**.
- 같은 파일 `:91` grid-snap 가이드는 green → 파이프라인 자체는 정상.
- **e2e만이 아닌 실제 앱 버그**: 미선택 frame을 뷰포트 상단 중앙을
  가로질러 드래그하면 1틱 만에 드래그가 죽음.

## 근인 (계측으로 확정)

진단 시그니처: `snap.begin` 발화, `snap.delta` 정확히 1회, 이후 move
전무, `snap.end` 미발행, 모델은 정확히 1 step만 이동. 가설 2개를
계측으로 **기각**한 끝에 확정:

- ~~가설 1: `vm.requestMode("frame-manipulating")` 거부~~ — monkey-patch
  트레이스 결과 `req:frame-manipulating(cur=idle)->ok` **승인됨**.
- ~~가설 2: 바인딩 등록 effect가 doc 변경에 재실행되어 클로저 고아화~~ —
  deps 전부 stable 확인.
- **확정: 셀렉션 툴바의 포인터 이벤트 가로채기.** 체인:
  1. 바디 드래그 첫 commit → `commitFrame`의 once-per-gesture 선택
     (Figma 패리티, FrameStage.tsx:1051)이 드래그 아이템을 선택.
  2. `SelectionToolbarOverlay`가 ContextualToolbar를 document.body 포털
     + `pointerEvents:auto` + fixed top:60 중앙으로 마운트
     (`selectionChrome` 게이트는 의도적으로 frame-manipulating admit).
  3. agocraft GestureRouter는 **pointer capture 없이** 캔버스 호스트
     capture 리스너로 수신 → 드래그 경로(y≈106)가 툴바 rect를 지나는
     2번째 move부터 target이 body 포털 → 호스트 리스너 미발화 → 활성
     바인딩 침묵 고사. `elementFromPoint` 스텝 샘플링으로 실증
     (step1=frame, step2~6=`div[tid=contextual-toolbar]`→body).

테스트가 과거 green이었던 이유 추정: 툴바 섹션 증가(LinkSection 등)로
바가 넓어져 인터셉트 존이 테스트 드래그 경로를 덮게 됨.

## 수정 (DR-129 — visible ≠ interactive)

- `interaction-mode.tsx` — `useSelectionChromeInteractive()` 단일-소스
  훅 신설: `mode !== "frame-manipulating"`. flavor 불변의 제스처 전송
  물리 법칙이므로 InputPolicy 게이트 테이블 확장 대신 훅.
- `SelectionToolbarOverlay.tsx` — 래퍼
  `pointerEvents: interactive ? "auto" : "none"`. 마운트는 유지(60Hz
  드래그 중 mount/unmount churn 회피), `text-editing`은 interactive
  유지(폰트 컨트롤이 그 모드의 존재 이유).

## SVL (2026-06-12)

- `frame-move-snap.spec.ts` **2/2 green** (계측 원복 후 — :48 가이드
  visible + 모델 스냅 x=0.6000033≈0.6, :91 grid 유지).
- typecheck ✓ / gates(inheritance + editor-mode boundary) ✓ /
  unit 1228/1228 ✓ / build ✓ / biome(변경 4파일) ✓.
- 드래그·툴바 e2e 서브셋: contextual-toolbar-redesign, frame-manipulation,
  multi-drag, selection-follows-drag, history-shape-drag, rotation-snap
  등 15 passed. multi-toolbar 3건 + toolbar-overflow 2건 실패는 전부
  `prepareDesign`의 `waitForLoadState("networkidle")` 타임아웃 = 선재
  문서화된 sandbox vite @fs 환경 이슈(페이지 로드 단계 사망 — 본 변경
  도달 불가).
- 진단 계측(frame-move-snap.ts / snap-feedback.ts console.log, 임시
  wi200-snap-diag.spec.ts) 전부 원복/삭제 확인.

## 잔여 / 후속

1. **agocraft HANDOFF-024** — GestureRouter `setPointerCapture` 도입
   (같은 클래스 근치: 셀렉션 핸들이 그랩 지점과 겹치는 경우 등).
2. **하단 레일 타일 `data-frame-id` 중복** — mixed flavor에서 레일
   타일이 캔버스 frame과 같은 id 노출(frame 2개에 엘리먼트 4개):
   ① 스냅 후보 오염(타일 rect가 가짜 정렬 타깃으로 수집됨 — 진단에서
   `{x:120,y:588,w:160}` 후보 확인), ② 테스트 `els.nth()` 가정 취약.
   → **WI-201로 해결** (후보 수집 호스트-서브트리 스코핑 + 테스트
   id-짝지음 경화; 타일 속성 자체는 WI-039 소비자가 있어 유지).

## 로그

- 2026-06-12 — WI 생성, 진단 시작.
- 2026-06-12 — requestMode 거부 가설 기각(승인 확인) → elementFromPoint
  스텝 샘플링으로 툴바 인터셉트 확정 → DR-129 수정 → SVL green → DONE.
