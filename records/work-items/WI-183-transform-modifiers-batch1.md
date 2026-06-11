# WI-183 — 변형 모디파이어 Batch 1 + D-2 더블클릭 판정 (슬라이드덱 편집 UX)

- **Status**: DONE (2026-06-11)
- **Date**: 2026-06-11
- **Decision Record**: DR-119
- **Origin**: WI-182 리서치(`docs/product/SLIDE_DECK_INTERACTION_SPEC.md`)의
  권고안 승인 — "프레젠테이션을 편집하는 사용자가 편집기를 사용하는
  관점에서 어떤 기능이 어떻게 동작해야 하는지" (사용자: "권고안으로
  진행해줘"). Batch 1 = 5-tool 합의(Figma/Keynote/PPT/Canva/Pitch) 변형
  모디파이어 6건 + D-2(더블클릭 프레임) 결정.

## 범위 (Batch 1 — 전부 weave-측, agocraft 재vendor 불필요)

| # | 동작 | 구현 |
| --- | --- | --- |
| ① | Shift+드래그 = 축 잠금 | `selection-chrome/move-modifiers.ts` — `FrameMoveSnap` 데코레이터, 스냅 전에 부축 0(지배축은 매 move 재평가) |
| ② | Alt+드래그 = 복제 드래그 | 같은 데코레이터 — `begin`(임계 시점, 제스처당 1회)에 `weave.items.duplicateInPlace`(offset 0) 실행, 원본이 계속 이동 |
| ③ | Shift+코너 리사이즈 = 비율 잠금 | `resize-geometry.ts` — 순수 `computeResizeFrame`에 `aspectLock`(지배축 스케일, 반대 코너 앵커, 0.01 플로어) |
| ④ | Alt+리사이즈 = 중심 기준 | 같은 헬퍼 `fromCenter`(터치 축 델타 2배, 중심 고정); Shift+Alt 합성 = 비율 유지 + 중심 고정 |
| ⑤ | Shift+회전 15° 스텝 | `rotation-snap.ts` `ROTATION_STEP_RAD` 10°→15° (45° 대각선에 정착 — WI-074 수퍼시드) |
| ⑥ | Enter = 선택 텍스트 편집 진입 | `interactions/text-edit-trigger.ts` 레지스트리(Rule 6 — kind 비교 없음, TextBlock이 자기 등록) + DesignPage 핫키 |

## 핵심 설계 결정 (상세는 DR-119)

- **modifier-tracker** (`selection-chrome/modifier-tracker.ts`):
  `FrameMoveSnap.snapDelta(dx,dy)`는 이벤트를 받지 않음 → window-레벨
  keydown/keyup/pointermove 동기화 + blur 리셋 싱글톤에서 동기 읽기.
- **`weave.items.duplicateInPlace`** 신규 커맨드: kit
  `createDuplicateItemsCommand`의 offset은 **팩토리-레벨**이라 입력으로 못
  내림 → offset 0 별도 인스턴스 등록(weave.page.duplicate 선례). 커버리지
  게이트 2건이 즉시 검출 → 스키마 등재(free 표면) + `PAGE_EXCLUDED`
  (page-bounded; 완전 겹침 복제는 비가시 + 페이지 입력 시 스택 중복).
- **Alt 제스처 충돌 해소**: altRubberBand(우선순위 90)의 `acceptTarget`을
  빈 공간/페이지 배경으로 좁힘(`acceptAltDrawTarget`) **+ FrameMove의
  WI-034 `alt:"forbidden"` 제거** — 양쪽 중 하나만 하면 아이템-바디
  Alt+드래그가 죽은 제스처가 됨(e2e가 검출). frame 안에 그리기 어포던스는
  생존: 커밋 어댑터가 최종 rect **중심**으로 컨테이너 해석
  (`rubber-band/agocraft-adapter.ts`) → 빈 공간에서 시작해 frame 안으로
  쓸어 넣으면 child 추가. WI-034의 "frame 내부 시작" 암은 수퍼시드.
- **DR-022 글리프 스케일**: 모디파이어가 적용된 **최종** nh를 읽어야 함 →
  리사이즈 파이프라인 전체(베이스 방향 수식 → aspect → center → 텍스트
  min-width → 폰트 스케일)를 순수 함수로 추출, 모디파이어는 폰트 계산
  앞에서 적용.

## D-2 — 더블클릭 프레임: 감사 정정 + 결론

- **전 세션 감사 오류 정정**: "더블클릭 = zoom-fit(현재 동작)"은 **stale
  주석**에서 나온 오판. fit-to-frame 2-클릭 카운터는 WI-033 P2에서 이미
  제거됨 — 현재 더블클릭 = 평클릭 2회 = parent-first → trail 위 재클릭 시
  leaf까지 드릴 (`hit.selectTarget`). **D-2가 요구한 "그룹 진입"은 이미
  현행 동작** (e2e `figma-parent-first-select.spec.ts:84` 런타임 검증
  green). 잔여 뉘앙스(Figma의 레벨당 1회 vs weave의 leaf 직행)는 DR-119에
  기록하고 수용.
- **Decommission Sweep**: stale 주석 3곳 갱신 — NestedFrame.tsx
  onDoubleClick 위/onClick 독스트링(2-클릭 카운터 서술 삭제),
  FrameStage.tsx handleBackgroundDoubleClick("their own click-counter does
  fit-to-frame" → WI-033 P2 사실로 교체). 빈 캔버스 더블클릭 = fit-all,
  레일 타일 더블클릭 = 카메라 핏(`thumbnail-panel.spec.ts`)은 무변경.

## 검증 (Continuous Self-Verification)

- 단위: rotation-snap 7/7(44°→45° 대각선 디스크리미네이터 포함),
  resize-geometry 14/14(합성·DR-022 최종높이·min-width), move-modifiers
  4/4 — 전체 vitest **1146/1146 green**, `tsc --noEmit` clean.
- e2e (sandbox 실행): `transform-modifiers.spec.ts` 신규 2/2(축 잠금
  실바인딩 + Enter 편집 진입/비텍스트 폴스루), `frame-in-frame-add.spec.ts`
  마이그레이션 2/2(빈 공간 스윕-인 child 추가 + 바디 시작 = 복제·팝오버
  부재), `rotation-snap.spec.ts` 3/3(Shift 52°→45°로 15° 판별),
  `figma-parent-first-select` + `figma-keyboard-selection-nav` 9/9(D-2 +
  Enter 핫키 무충돌 — 텍스트 leaf에서 drillDown은 no-op이라 공존).
- biome: 변경 파일 전부 clean (DesignPage:2692 에러는 HEAD pre-existing
  검증 완료, 1 warning은 의도된 명시 비교 스타일).
- 알려진 env red(marquee-select 등 networkidle)는 vendored sprite-engine
  `@fs` 행 — 코드 무관 기준선 (WI-153 기록 참조).

## 잔여 (Batch 1 스코프 밖 — 후속)

- 더블클릭 캐럿 위치(클릭 지점) — EditableText 진입은 select-all 유지,
  캐럿-앳-포인트는 보류.
- 이미지 기본 비율 잠금(스펙 §4 미확인 항목) — 검토 보류.
- Batch 2(슬라이드 키보드 워크플로), Batch 3(좌표 paste D-5, 스마트 복제,
  Cmd+G, 컨텍스트 메뉴, OS 이미지 paste, zoom-to-selection).
