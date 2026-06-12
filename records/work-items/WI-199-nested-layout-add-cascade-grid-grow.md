# WI-199 — 중첩 grid/flex 아이템 추가 시 정착 (자손 캐스케이드 relayout + grid 트랙 자동 성장)

- 상태: IN PROGRESS (2026-06-12)
- 출처: "에이전트 서버에서 디자인 생성 시 grid·flex 조합으로 중첩된 컨테이너에
  아이템을 추가하면 여전히 이상하게 보이다가, 상위 레이아웃의 크기를 조정하면
  그제서야 제대로 맞춰지는 현상" 사용자 신고 + 정밀분석.
- 선행: WI-021 (LayoutEngine onChildAdd/onFrameChanged 단일 진입점), WI-149/
  DR-104 (FULL_FRAME flex-share ratchet), WI-146 (text autofit 라운드 종료
  펄스), 그리드 sizing `layout/grid-spec.ts`.
- 결정: DR-128.

## 문제 — add 경로는 "1레벨"만 재배치하고, grid는 트랙을 안 늘린다

정밀분석으로 확인한 두 구조적 결함(둘 다 `@agocraft/layout` 엔진이 의도적으로
1레벨만 처리하는 데서 비롯, 호스트가 보완해야 함):

1. **단일 레벨 relayout — 자손 캐스케이드 부재.** `onChildAdd`(`index.js:1352`)와
   `onFrameChanged`(`index.js:1285`) 모두 **직속 부모의 직속 자식**까지만 reflow.
   중첩 시: 컨테이너 G에 아이템을 추가하면 onChildAdd가 G의 자식(형제 컨테이너
   F 포함)의 frame을 바꾸는 `siblingPatches`를 내지만, **F의 자식(손자)은
   재배치되지 않아 stale**. 사용자가 G/F를 직접 리사이즈하면 ResizeObserver/
   onFrameChanged가 그 레벨을 다시 돌려 "맞춰진 것처럼" 보인다.

2. **Grid은 add 시 트랙 미성장.** grid 트랙 수는 "frame이 grid가 되는 순간"
   (`weave.frame.setLayout`, `commands.ts:2884`)에만 child count로 sizing.
   `onChildAdd`는 저장된 spec을 그대로 읽으므로(`index.js:1353`), 용량(예 2×2=4)을
   넘겨 5번째를 추가하면 `nextFreeGridCell`이 빈 칸을 못 찾고 마지막 칸을 반환
   (`index.js:1052-1059`) → 새 자식이 마지막 자식 **위에 스택(겹침)**. 리사이즈는
   트랙을 재생성하지 않으므로 이 케이스는 리사이즈로도 안 풀리고, 레이아웃을
   다시 토글해야 했다.

(텍스트 auto-height clobber=WI-146 영역, FULL_FRAME basis ratchet의 flex-col
텍스트/grid 갭=WI-149 후속은 본 WI 범위 밖 — DR-128 §비목표 참고.)

## 해결

### #1 자손 캐스케이드 relayout (보편 — 게이트 없음)
`weave.item.add`에서 onChildAdd가 낸 `siblingPatches` 중 **컨테이너이면서
frame이 바뀐** 형제마다, 그 컨테이너의 새 box 기준으로 자손을 재배치하는 패치를
추가. 엔진을 재구현하지 않고 `getLayoutEngine().onFrameChanged`를 top-down으로
재진입하되, **해당 컨테이너의 직속 자식 패치만 통과**(block-2 형제 패치는 필터로
제거)시키고, 그 자식이 다시 컨테이너이고 frame이 바뀌면 재귀. 깊이 상한 12.

### #3 Grid 트랙 자동 성장 (에이전트 전용 — `enforceGridCapacity` 플래그)
add 시 컨테이너가 auto-grid이고 (repeat/areas 없는 "auto-managed" grid이며)
`children.length+1 > cols*rows`이면 `gridSpecForChildCount(newCount, 현재spec)`로
트랙을 재생성하여 onChildAdd를 그 grown spec으로 돌리고, `item.layout` 패치를
함께 emit해 spec을 영속화. 기존 두 에이전트 전용 가드(`enforceContainerIsFrame`
/`enforceMinSize`)와 동일하게 aku `transformInput`에서만 stamp → 수동 툴바 add는
영향 없음(수동 deliberate grid의 컬럼 수가 놀랍게 바뀌는 일 방지).

## 검증 (착수)
- 신규/확장: `commands-layout-relayout.test.ts` — 중첩(grid→flex→자식 추가) 후
  손자 frame이 부모 새 box로 reflow됨, grid 5번째 add 시 트랙 3×2로 성장 +
  비겹침 + `item.layout` 패치 emit, 비컨테이너 형제만 있을 때 캐스케이드 no-op
  (무회귀).
- 게이트(tsc·lint·Rule6·inheritance) green, 기존 layout 스위트 무회귀.

## 산출물
- 코드: `document/commands.ts`(add 경로 + 캐스케이드 헬퍼 + grid grow),
  `features/aku/agent/agent-grid-capacity-guard.ts`(신규 stamp),
  `features/aku/agent/use-aku-agent.ts`(체인 등록).
- 테스트: `commands-layout-relayout.test.ts` 확장.
- 기록: 본 WI, DR-128.
