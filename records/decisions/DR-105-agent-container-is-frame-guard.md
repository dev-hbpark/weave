# DR-105 — 에이전트 add 컨테이너=프레임 가드 (leaf containerId 거부 + 이유 전달)

- 상태: ACCEPTED
- 날짜: 2026-06-09
- 관련: WI-150 · 선례 DR-100(agent 최소 크기 하한) / DR-098(agent 텍스트 고정 박스) — **동일한 agent-only `transformInput` + 명령 내부 거부 파이프라인** 재사용
- 배경: DR-099(subtree.add 폐기 — 순차 add로 트리를 구성하므로 호출마다 containerId를 다시 지정해야 하고, "직전 프레임 재사용" 드리프트가 노출)
- 무관(미변경): WI-149/DR-104(flex-row 텍스트 share) — 이번 건은 sizing이 아니라 **parenting** 결함

## 맥락

"아쿠로 달력을 만들어줘" → 헤더(SUN…SAT)는 정상, 그러나 날짜 텍스트 전부가 **'SAT' 셀 하나**에 들어가
그 칸이 영역 전체 높이로 부풀었다.

진단(코드 근거):
- weave의 컨테이너는 **`frame`(과 doc root) 뿐**이다. 나머지 kind는 leaf(자식을 담는 의미가 없음).
  `domain-kinds.ts`의 kind 목록상 `frame`만 자식 컨테이너.
- `weave.item.add`는 매 호출 `containerId`를 명시적으로 받고, last-created-frame 같은 **암묵적 active
  parent 상태가 없다**(`findContainer`, `commands.ts`). 각 add는 stateless.
- 따라서 에이전트가 날짜들의 `containerId`를 **그리드 프레임이 아니라 직전 'SAT' 텍스트 leaf**로 지정하면
  31개가 leaf 밑에 중첩되고, 레이아웃 엔진(auto-flex 행의 cross-size = 최대 자식 높이)이 그 셀만 키워
  증상이 나타난다. **엔진은 정상, 트리가 잘못됨.**
- 프롬프트(`weave-capabilities.ts`, 634줄)는 이미 "캘린더=auto-grid", "ONE ITEM PER CELL"을 명시. 즉
  **지시 부족이 아니라 위반에 대한 런타임 피드백 부재**가 진짜 레버.

핵심 제약:
- weave 모델상 leaf 부모는 **항상** 오류이므로, leaf containerId 거부는 **오탐 0**의 안전한 하드 게이트다
  (CLAUDE.md "규칙을 관습이 아니라 게이트로 표현" 원칙에 부합).
- root는 kind가 `weave-doc`이라 kind 비교로 거를 수 없다 → id로 제외해야 한다.
- 수동 툴바 add는 막으면 안 된다(에이전트 전용).

## 결정

1. **명령 내부 거부 가드.** `weave.item.add`가 `containerId` 해석 직후(레이아웃 스테이징 **전**) 다음을 검사:
   `input.enforceContainerIsFrame === true && containerItem !== undefined && String(containerItem.id) !==
   String(root.id) && containerItem.kind !== "frame"` → `fail("container-not-frame", <이유>)` (patch 0개 =
   생성 안 됨). 스테이징 전이라 leaf 부모로 엔진을 호출하지도 않는다.

2. **에이전트 전용 게이팅.** DR-100/DR-098과 동일한 agent-only `transformInput`에 순수 변환
   `stampContainerGuard`를 추가해 `weave.item.add` 입력에 `enforceContainerIsFrame:true`를 주입. 명령은 이
   플래그가 있을 때만 가드 작동. 툴바는 이 프록시를 거치지 않으므로 무영향(자동 게이팅).

3. **무조건 stamp(설계 px 불필요).** min-size 가드와 달리 이 가드는 설계 px가 필요 없다. 따라서
   `transformInput`의 `design === undefined` early-return **이전에** stamp해, 설계 크기가 일시적으로
   없어도 항상 작동한다.

4. **root 제외는 id로.** root.kind=`weave-doc`을 kind 비교로 거르지 못하므로 `String(id)` 동등 비교로 제외.
   sub-doc/미래 컨테이너 kind 오탐을 피하려 "leaf면 거부"가 아니라 "frame이 아니고 root도 아니면 거부"로
   좁혔다(현 모델에서 leaf만 해당).

5. **이유 전달.** `fail` 메시지(한국어): containerId가 가리킨 kind + "오직 frame만 자식을 담는다" + 조치
   안내("같은 영역 항목들은 그 영역 layout FRAME을 containerId로", "직전 leaf에 이어 붙이지 말 것", "한 셀에
   여러 개면 자체 layout 가진 중첩 frame 먼저"). 아쿠가 읽고 그리드 프레임으로 재시도(Continuous
   Self-Verification 루프).

6. **프롬프트 보강(소프트, 병행).** `WEAVE_TASK_PRIMER`(매 태스크 노출되는 고-현저성 목록)에 1줄 추가 —
   "containerId IS THE PARENT FRAME, NEVER A LEAF". 하드 게이트가 1차, 프롬프트가 2차 방어.

## 대안 / 기각

- **프롬프트만 강화**: 이미 saturated(634줄)이라 한계효용 낮음. 위반 피드백 부재가 핵심이라 게이트가 필요.
- **subtree.add 부활(원자적 트리 생성)**: DR-099가 "측정 가능한 개선 없음 + 대량 생성 품질 리스크"로 폐기.
  이번 사례가 반례 후보지만, 더 작고 안전한 가드로 기전을 직접 차단하는 편이 비용 대비 효과 우위. 재검토는
  텔레메트리 누적 후.
- **active-frame 상태 도입(하베스가 현재 그리드 id 기억)**: stateful이라 새 버그면. 거부+이유가 더 단순하고
  자기수정 친화적.
- **"무-layout 셀에 N개 누적" 가드(B 기전)**: 자유 배치 합성(배경+제목 등)과 충돌해 오탐 위험 → 보류.

## 영향 / 검증

- `weave.item.add` 에이전트 경로에 신규 거부 코드 `container-not-frame`. 수동/일반 경로 무영향.
- 단위: `commands.test.ts` 4케이스(leaf 거부 / frame 허용 / root 허용 / 무플래그 허용) + 기존 128 전부 green.
- 후속: 아쿠 실호출에서 (a) leaf containerId 사용 자체가 줄어드는지, (b) 받으면 그리드 프레임으로
  재시도하는지 관찰. B 기전 관측 시 별도 WI.
