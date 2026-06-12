# DR-128 — 중첩 grid/flex add 정착: 호스트측 자손 캐스케이드 relayout + 에이전트 grid 트랙 성장

- 상태: ACCEPTED (2026-06-12)
- 맥락: WI-199. `@agocraft/layout` 엔진은 `onChildAdd`/`onFrameChanged`가
  설계상 **1레벨만** reflow(직속 부모의 직속 자식). 중첩 grid/flex에 에이전트가
  아이템을 추가하면 (a) 형제 컨테이너의 자손이 stale, (b) grid는 트랙을 안 늘려
  셀이 겹침. 사용자는 "상위 리사이즈 시 맞춰짐"으로 관측.

## 결정

### D1 — 캐스케이드는 호스트(weave)에서, 엔진 재구현 없이
엔진에 "서브트리 reflow" 능력이 없지만, 이를 엔진 변경(agocraft HANDOFF)으로
가져가는 대신 **호스트가 기존 `onFrameChanged`를 top-down 재진입**해서 해결한다.
근거: 엔진의 onFrameChanged block-1이 이미 "내 frame이 바뀌었으니 내 직속 자식을
재배치"를 정확히 수행한다. 호스트는 그 결과에서 **직속 자식 패치만 통과**시키고
(block-2 = 그 컨테이너의 형제 패치는 이미 상위에서 처리됐거나 별도 캐스케이드
엔트리로 다뤄지므로 필터 제거), 자식이 컨테이너면 재귀한다. 엔진 수학을 weave가
베끼지 않으므로 "weave는 레이아웃을 계산하지 않는다" 원칙 유지(Rule 6/단일 진입점).

### D2 — 캐스케이드는 보편(게이트 없음), grid 성장은 에이전트 전용
- **캐스케이드(#1)는 모든 add에 적용**: stale 자손 보정은 순수 correctness이고,
  수동 리사이즈 경로는 이미 1레벨 reflow를 하므로 add도 일관되게 캐스케이드하는
  게 맞다. 비컨테이너 형제만 있으면 no-op이라 무회귀.
- **grid 트랙 성장(#3)은 에이전트 전용**(`enforceGridCapacity`, aku
  transformInput stamp): 트랙 수 변경은 더 의견적이라, 수동 사용자가 deliberate
  하게 잡은 grid의 컬럼 수를 add마다 바꾸면 놀랍다. 기존 두 에이전트 전용
  가드(`enforceContainerIsFrame`/`enforceMinSize`)와 동일 패턴. 수동 overflow가
  실제 신고되면 보편 승격을 재검토(역가능 결정).

### D3 — grid 성장은 "auto-managed" grid에만
`columnsRepeat`/`rowsRepeat`/`areas`가 있는 grid는 성장 대상에서 제외(트랙을
clobber하지 않음). 에이전트 grid는 `gridSpecForChildCount`가 만든 명시 fr 배열
이므로 항상 대상. 성장은 동일 헬퍼 `gridSpecForChildCount(newCount, 현재spec)`로
계산해 생성 시점 sizing과 일관(⌈√n⌉ 컬럼). gap/justify/align/padding은 base로 보존.

### D4 — 영속화 패치
grown spec은 `{type:"item.layout", itemId, before, after}` 패치로 emit(엔진
`onLayoutChange`/`setFrameLayout`과 동일 형태)해 영속·반전 가능. `before`는 현재
저장된 layout, `after`는 grown spec. 같은 트랜잭션에 묶여 단일 Cmd+Z.

## 비목표 (별도 후속)
- 텍스트 auto-height가 배치 라운드 중 clobber → un-settled (WI-146 영역). 본 변경은
  구조적 frame/track만 바로잡고 텍스트 콘텐츠-맞춤 정착은 다루지 않는다.
- FULL_FRAME basis-freeze ratchet의 남은 갭(flex-col 텍스트, grid 진입 아이템의
  basis) — WI-149 후속.
- 에이전트가 **한 번의 item.add로 다층 서브트리**를 통째로 추가하는 경로의 내부
  reflow. 현 에이전트는 증분 추가(컨테이너 생성 후 자식 개별 추가)라 staged 자식은
  leaf → 본 캐스케이드(형제 컨테이너 대상)로 충분. 다층 staged 서브트리가
  관측되면 staged 직렬화 전 내부 reflow를 추가.

## 영향
- `document/commands.ts`: add 경로에 grid-grow 분기 + 캐스케이드 헬퍼.
- `features/aku/agent/agent-grid-capacity-guard.ts`(신규) + `use-aku-agent.ts`.
- 무회귀 기준: 기존 `commands-layout-relayout.test.ts` + 게이트 green.
