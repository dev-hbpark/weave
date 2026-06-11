# WI-181 — slide-deck 커맨드 검증 스윕 (WI-180 후속)

- **Status**: DONE (2026-06-11)
- **Date**: 2026-06-11
- **Related**: WI-180 / DR-118 (컨테이너-스코프 3건 수정), WI-163 (페이지=아트보드), WI-166 (EditorModeContext)
- **Origin**: 사용자 질문 — "현재 프레젠테이션모드에서 커맨드 동작이 모두
  정상적이라고 검증된건가?" → 정직한 답: WI-180은 3건만 검증. 나머지
  선택-기반 커맨드는 기존 회귀가 mixed 전용이라 slide-deck에서 미관찰.

## 스윕 결과 (`apps/web/e2e/slide-deck-command-sweep.spec.ts` — 6/6 green)

| 커맨드 | slide-deck 기대 동작 | 결과 |
| --- | --- | --- |
| Backspace 삭제 + Cmd+Z | 삭제 → undo로 **페이지 안에** 복원 | ✅ |
| Cmd+D 복제 | 클론 부모 = 페이지, 클론 선택 | ✅ |
| Cmd+X → Cmd+V (무선택) | 페이지로 재귀속 | ✅ |
| Cmd+V (그룹-frame 선택) | **페이지**에 paste, 그룹은 캡처 못 함 (addContainerFor paste 암 — WI-180 e2e는 무선택만 커버했음) | ✅ |
| 화살표 nudge / Shift+화살표 | 이동함 (페이지 nudge 금지는 WI-163 capability 게이트) | ✅ |
| Cmd+Backspace (그룹 dissolve) | 자식이 **페이지**(frame의 자기 부모)로 — root 아님; Cmd+Z 1회 복원 | ✅ |

코드 확인: `weave.frame.removeKeepingChildren`은 frame의 **자기 부모**로
자식을 올리는 구조 (`commands.ts` createDissolveFrameCommand wrapper) —
페이지-스코프 뷰 밖으로 자식이 탈출하는 경로 없음.

## 잔여 (구조상 모드-안전, 관찰 미검증)

- z-order (bringToFront/sendToBack/forward/backward) — 부모 내 형제
  재정렬이므로 컨테이너 해석 없음 → 모드-가변 표면 아님.
- Escape / 페이지 보호(삭제·nudge 불가)는 기존 `page-artboard.spec.ts`가
  slide-deck에서 커버.
