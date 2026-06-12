# DR-129 — 셀렉션 크롬 visible ≠ interactive: 제스처 비행 중 플로팅 크롬 inert

- 상태: ACCEPTED (2026-06-12)
- 관련: WI-200, WI-040 (selectionChrome 게이트), WI-073 (move-snap),
  DR-114 (InputPolicy 게이트 테이블), agocraft HANDOFF-024 (pointer capture)

## 문제

`frame-move-snap.spec.ts:48` 선재 회귀의 근인: 바디 드래그 첫 commit이
드래그 아이템을 선택(Figma 패리티, FrameStage `commitFrame`) →
`SelectionToolbarOverlay`가 **드래그 도중** ContextualToolbar를
document.body 포털 + `pointerEvents: auto`로 마운트(top:60 중앙 고정).
agocraft GestureRouter는 **pointer capture 없이** 캔버스 호스트의
capture 리스너로 이벤트를 받으므로, 드래그 경로가 툴바 rect를 지나는
순간 pointermove/pointerup의 target이 body 포털 쪽이 되어 호스트
리스너에 영원히 도달하지 않음 → 활성 move 바인딩이 **1 step만 커밋하고
침묵**(스냅 가이드 없음, 이동 정지, snap.end 미발행). e2e만이 아니라
실제 앱 버그(상단 중앙을 가로지르는 드래그가 1틱에 죽음).

## 결정

1. **visible ≠ interactive를 분리한다.** `selectionChrome` 게이트는
   의도적으로 `frame-manipulating`을 admit(드래그 중 핸들이 사라지면 안
   됨) — 가시성은 유지하되, **조작 제스처 비행 중에는 플로팅 크롬이
   포인터 이벤트를 받지 않는다**.
2. 구현 = `useSelectionChromeInteractive()` 단일-소스 훅
   (`interaction-mode.tsx`, `mode !== "frame-manipulating"`) +
   `SelectionToolbarOverlay` 래퍼 `pointerEvents: interactive ? "auto" : "none"`.
3. **InputPolicy 게이트 테이블(DR-114)이 아닌 단일-소스 훅인 이유**:
   이것은 flavor별 정책이 아니라 제스처 전송 계층의 물리 불변식(모든
   flavor 동일). 게이트 테이블 7곳 확장은 과설계.
4. `text-editing`은 interactive 유지 — 그 모드의 존재 이유가 툴바 폰트
   컨트롤. `rubber-band`/`hand`/`panning`은 selectionChrome admit set에
   없어 애초에 언마운트.

## 잔여

- **구조적 근치 = GestureRouter의 `setPointerCapture`** (claim 시점에
  잡으면 target과 무관하게 이벤트 수신 — 셀렉션 핸들이 그랩 지점과
  겹치는 등 같은 클래스 전체 해결). vendored라 weave에서 직접 못 고침 →
  agocraft `records/decision-handoffs/HANDOFF-024-from-weave-gesture-router-pointer-capture.md`.
  → **해결 (2026-06-12)**: agocraft WI-040/DR-052가 변형 수용(원래
  pointerdown **target에 캡처** — host 캡처의 click-retarget 부작용
  회피), weave WI-203으로 editor rc.20260612200000 재vendor + 원-실패
  구성 재현 테스트로 근치 실증. 본 inert 훅은 UX 차원으로 유지.
- 하단 레일 타일이 캔버스 frame과 같은 `data-frame-id`를 중복 노출 —
  스냅 후보 오염(가짜 정렬 타깃) + 테스트 `nth()` 가정 취약.
  → WI-201로 해결 (스냅 후보 수집 호스트-서브트리 스코핑).
