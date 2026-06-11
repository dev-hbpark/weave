# DR-119 — 변형 모디파이어(Batch 1) 시맨틱 + D-2 더블클릭 = 그룹 진입 판정

- Status: ACCEPTED — WI-182 권고안 사용자 승인("권고안으로 진행해줘") +
  WI-183 구현 완료 (2026-06-11)
- Date: 2026-06-11
- Related: WI-182/WI-183, `docs/product/SLIDE_DECK_INTERACTION_SPEC.md` §4,
  WI-074 (Shift 회전 10° — 본 DR이 수퍼시드), WI-034 (frame 내부 Alt-draw
  암 — 본 DR이 부분 수퍼시드), WI-033 P2 (2-클릭 fit 카운터 제거 — D-2
  판정의 사실 기반), DR-022 (텍스트 코너 글리프 스케일), WI-159
  (FrameMoveSnap 랩핑 선례), DR-064/DR-115 (커맨드 커버리지 게이트)

## 결정 1 — 변형 모디파이어 시맨틱 (5-tool 합의 채택)

| 모디파이어 | 시맨틱 | 비고 |
| --- | --- | --- |
| Shift+드래그 | 축 잠금 (지배축 라이브 재평가 — 드래그 중 플립 가능) | 잠근 델타에 스냅 적용 (가이드 일관) |
| Alt+드래그 | 복제 드래그: 임계 시점 1회, **카피가 원위치·원본이 이동** | **언두 2 엔트리**(복제, 이동) — 수용. 임계 이후 Alt는 소급 복제 안 함(Figma 동일) |
| Shift+코너 | 비율 잠금 (지배축 스케일, 반대 코너 앵커, 플립 방지 0.01 플로어) | 엣지 드래그엔 미적용. 비율 공간에서 부모 인자 상쇄(nw/nh==ow/oh) |
| Alt+리사이즈 | 중심 고정 (터치 축 델타 2배) | Shift+Alt 합성 = aspect 먼저 → center 2배 = 비율 보존 |
| Shift+회전 | **15° 스텝** (10°에서 변경) | 45° 대각선 정착이 변경 사유. 5° 카디널 스냅 임계 무변경 |
| Enter | 단일 선택이 텍스트면 편집 진입 | `textEditTrigger` 자기-등록 레지스트리(Rule 6). 비텍스트 = WI-033 A3 drillDown 유지(텍스트 leaf에서 no-op라 공존) |

## 결정 2 — Alt 제스처 우선순위 재배치 (WI-034 부분 수퍼시드)

Alt+드래그의 의미를 **시작 지점**으로 라우팅한다:

- **아이템 바디에서 시작** → FrameMove의 복제 드래그.
  - altRubberBand(우선순위 90)의 `acceptTarget`을 빈 공간/페이지 배경으로
    좁힘(`acceptAltDrawTarget`) **그리고** FrameMove의 `alt:"forbidden"`
    (WI-034 b)을 제거. **둘 중 하나만 적용하면 죽은 제스처** — 실제로 본
    구현 중 forbidden 잔존 상태에서 e2e가 무동작을 검출했다.
- **빈 공간/페이지 배경에서 시작** → 러버밴드 그리기.
  - frame 안에 child 추가 어포던스는 생존: 커밋 어댑터가 최종 rect
    **중심**의 deepest frame을 컨테이너로 해석하므로, 빈 공간에서 시작해
    frame 안으로 쓸어 넣으면 된다. e2e `frame-in-frame-add.spec.ts`가 이
    경로로 마이그레이션(Decommission Sweep — 동작 이동 시 테스트 이주).
- page-bounded에서 페이지 배경은 "빈 공간" 취급(페이지가 곧 캔버스),
  infinite canvas에선 `visibleFrameIdsRef`가 undefined → 모든 frame 바디가
  복제 드래그.

## 결정 3 — D-2: 더블클릭 프레임 = 그룹 진입 (이미 현행, 감사 정정)

WI-182 스펙의 D-2 전제("현재 더블클릭 = zoom-fit")는 **stale 주석에서 나온
감사 오류**였다. 사실: fit-to-frame 2-클릭 카운터는 WI-033 P2에서 제거됐고,
현행 더블클릭은 평클릭 2회로 해석되어 parent-first → trail 재클릭 = leaf
드릴이다. 즉 **D-2의 의도(줌이 아니라 진입)는 이미 충족**.

- 수용한 뉘앙스: Figma는 더블클릭당 **한 레벨**씩 내려가고 weave는 trail
  위 재클릭 시 **leaf 직행**. WI-033 선택 모델의 의도된 동작이며, 중간
  레벨은 Shift+Enter(drillUp)/Cmd 딥클릭으로 도달 가능 — 변경하지 않는다.
- zoom-fit의 거처: 빈 캔버스 더블클릭(fit-all) + 레일 타일 더블클릭
  (해당 프레임 핏) — 무변경.
- Decommission Sweep: NestedFrame/FrameStage의 카운터-서술 주석 3곳 정리
  (다음 감사가 같은 오판을 반복하지 않도록 WI-033 P2 사실 명기).

## 결정 4 — `weave.items.duplicateInPlace` (offset-0 팩토리 인스턴스)

kit `createDuplicateItemsCommand`의 offset은 팩토리-레벨 옵션이라 입력으로
전달 불가 → offset 0 전용 커맨드를 별도 등록(weave.page.duplicate 선례).
커버리지 트리아지: free 표면은 스키마 등재(설명에 "겹침은 비가시, 일반
복제는 weave.items.duplicate" 명시), page-bounded 표면은 `PAGE_EXCLUDED`
(완전 겹침 + 페이지 입력 시 스택 중복 위험; 에이전트 경로는
items.duplicate / page.duplicate 유지).

## 기각/보류

- 더블클릭 캐럿-앳-클릭-포인트: select-all 진입 유지(기존 UX 테스트 자산),
  캐럿 위치는 후속 검토.
- 이미지 기본 비율 잠금: Shift 명시 잠금만 우선 — 기본-잠금은 스펙 §4
  미확인 항목 검증 후 별도 결정.
- 모디파이어 HUD/커서 피드백: Batch 1 스코프 밖.
