# WI-202 — reparent-modifier-drag:118 ghost 미출현 선재 실패 조사/수정

- 상태: DONE (2026-06-12)
- 출처: WI-201 SVL 중 발견 — `reparent-modifier-drag.spec.ts:118` (WI-039
  modifier-drag 스모크) red. `git stash` 후 HEAD 재실행으로 선재 실패
  확증(WI-200/201 무관). 사용자 "선재 reparent-modifier-drag:118 ghost
  미출현도 후속으로 조사부탁해".
- 관련: WI-039 (reparent drag 컨트롤러), WI-201 (data-frame-id 중복
  first-match 취약 클래스), WI-153/163 (slide-deck 페이지-바운드 편집)

## 증상

- `reparent-modifier-drag.spec.ts:118` — slide-deck flavor, 루트 frame
  2개 추가 후 마지막 frame의 bbox 중심에서 Cmd+Shift+drag →
  `[data-reparent-ghost]` visible 기대 → **1.5s 타임아웃**.
- 같은 파일 `:49` 커맨드 경로(`editor.exec("weave.item.reparent")`)는
  green → 커맨드/리듀서/undo 와이어링은 정상.

## 근인 (진단 스펙으로 확정 — 제품 버그 아님, 테스트 노후화)

진단 덤프(임시 wi202-reparent-diag.spec.ts, 삭제됨):

- slide-deck에서 테스트가 추가한 루트 frame 2개는 **캔버스에 아예
  렌더되지 않음** — 페이지-바운드 편집(WI-153/163) 이후 slide-deck
  캔버스는 **활성 페이지만** 렌더하고, 추가 루트 frame = 새 페이지 =
  레일 타일로만 존재.
- 따라서 글로벌 `.first()` 로케이터가 레일 타일(thumbnail-2,
  `plane=false stage=false`)을 해결 → 프레스 지점 elementFromPoint =
  `BUTTON[tid=thumbnail-activate-2]` (design-plane 밖) → 컨트롤러 arm
  조건 `designPlaneFromTarget(e.target) !== null` 실패 → 침묵 미발동.
- **컨트롤러 자체는 정상**: 활성 페이지의 자식 frame에서 같은
  Cmd+Shift+drag → ghost visible + 밖에서 release 시 무패치 취소,
  진단 스펙에서 실증. `enabled`도 `!handMode && !peek.isActive`뿐
  (DesignPage.tsx:1391) — flavor 게이트 없음.
- 테스트가 과거 green이던 이유: WI-039 작성 시점(페이지-바운드 편집
  이전)엔 slide-deck도 루트 frame들이 캔버스에 렌더됐음.

## 수정 (테스트만 — src 변경 없음)

`reparent-modifier-drag.spec.ts:118` 재작성:

1. 드래그 대상을 루트 frame → **활성 페이지의 자식 frame**으로 변경
   (`addFrame(..., { containerId: pageId })` ×2) — 스모크 의도(제스처
   arm + 클린 취소)는 design plane 위 요소여야 성립.
2. 로케이터를 글로벌 `.first()` → 스테이지-스코프
   `getByTestId("frame-stage").locator(...)` (WI-201 경화 패턴).
3. 취소 무패치 검증을 root children → 해당 페이지 children 목록
   비교로 변경.

## SVL (2026-06-12)

- `reparent-modifier-drag.spec.ts` **2/2 green**.
- typecheck ✓ (weave 루트, e2e 포함) / biome(변경 스펙) ✓.
- 이웃 드래그 e2e(frame-move-snap·multi-drag·selection-follows-drag):
  4 passed / 1 flaky(retry pass; multi-drag:124 — 본 변경과 다른 파일,
  e2e-only 변경이라 도달 불가).
- src 무변경 → gates/unit/build 영향 없음. 진단 스펙
  wi202-reparent-diag.spec.ts 삭제 확인.

## 로그

- 2026-06-12 — WI 생성 → 진단 스펙으로 레일-타일 오해결 + 활성-페이지-만
  렌더 확정 → 컨트롤러 정상 실증 → 테스트 재작성 → SVL green → DONE.
