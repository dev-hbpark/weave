# WI-169 — 에이전트 페이지 생성·배치, 레일 패리티 (page-bounded)

- Status: DONE (2026-06-11)
- Origin: 사용자 보고 — "프레젠테이션 모드에서 새 슬라이드를 만들어 편집할 때:
  ① 새 페이지를 추가하면 그 페이지만 보여야 하고 편집이 그 페이지에 적용돼야
  하는데, 지금은 믹스드처럼 특정 위치에 추가되고 이전 페이지가 옆에 보인다.
  ② 편집 내용이 화면에 보이지 않고 빈 공간(회색 영역)에서 아쿠가 돌아다닌다."
- Related: WI-168/DR-115(에이전트 표면 정책 — 본 WI는 4차 후속이자 확장),
  WI-153/DR-111(D5 페이지 클립 + D6 soft clamp), WI-157(페이지 카메라 핏),
  WI-126(working camera), WI-155(page.duplicate)

## 진단 (코드 검증 — 4개 구조 결함)

1. **`weave.preset.insertSlide` pass-through 노출**: 프리셋 슬라이드 루트는
   믹스드-캔버스 박스 `{x:0.3, y:0.3, w:0.4, h:0.4}`(presets/content 등) +
   containerId 기본 root. 라벨이 "슬라이드 추가"라 모델이 "새 슬라이드" 요청에
   page.add 대신 선택할 확률이 가장 높음 → "믹스드처럼 특정 위치에 추가" 직격.
2. **`weave.page.add`가 `frame` override 허용**: 스키마가 frame을 광고하고
   mapInput이 `base.frame ?? FULL_FRAME`. 비-FULL_FRAME 페이지는 페이지 스택/
   매트/핏 모델(page-scope.ts 전제: "every page = FULL_FRAME at the SAME
   coordinates")을 깨뜨림.
3. **페이지 생성 시 동기 활성화 없음**: 레일 "+"는 add 후 `setActivePageId`
   (DesignPage onAddPage). 에이전트 경로는 exec만 — WI-153 P4의
   handleAgentZoomToFrame 활성화는 changeStream 경유 200ms 디바운스라, 직후
   omitted-containerId add(intoActivePage)가 옛 페이지로 흘러가는 레이스.
   비활성 페이지는 렌더되지 않으므로(activePageOnly) 편집 전체가 불가시.
4. **add-time 페이지 클램프 없음**: 드래그는 D6 soft clamp(48 design px
   min-overlap)가 있으나 에이전트 add는 무클램프 — 페이지 박스 밖 frame은
   `overflow: clip`으로 불가시, 셀렉션 크롬은 body-portal이라 클립 안 됨 →
   "회색 영역에서 아쿠가 돌아다님"의 메커니즘.

## Fix (전부 page-bounded 표면 정책 레이어 — 내부 커맨드 무변경)

1. insertSlide를 PAGE 표면에서 제거(coverage test `PAGE_EXCLUDED`에 사유와
   함께 등재) — 페이지 생성은 weave.page.add 단일 경로.
2. page.add: `frame` 스키마 제거 + mapInput FULL_FRAME 무조건 스탬프.
3. `AgentToolAdapter.activatesPage`(선언) + façade `onPageActivate` 주입:
   page.add / page.duplicate ok 결과(id)에 동기 활성화. DesignPage가 레일과
   동일하게 `setSelectedFrameId` + `setActivePageId` 수행.
4. item.add/chart.add mapInput에 add-time soft clamp(활성 페이지 타깃 한정,
   순수 비율 min-overlap) — D6의 add-시점 미러.
5. 스키마/promptFragment 강화: 페이지 좌표 0..1·밖은 클립·슬라이드 나란히
   배치 금지·page.add 후 그 페이지가 곧바로 현재 페이지.

## 잔여 (수용)

- weave.batch 내부 page.add는 활성화 채널 밖(배치 결과만 façade에 보임) —
  스키마가 "페이지 추가는 별도 호출" 가이드 유지.
- 활성화 → React 재렌더 → getDefaultAddContainerId 갱신은 다음 툴콜(네트워크
  왕복) 전에 플러시되는 것을 전제(서버 왕복 ≫ 프레임). DR-115 §8 기록.

## 진행 메모

- 2026-06-11: 진단 완료(상기 4결함, 전부 코드 검증). 구현 착수.
- 2026-06-11: 구현 완료 + 검증.
  - pieces/agent-surface.ts: `intoActivePageClamped`(0.05 min-overlap, 디제너레잇
    호스트 가드 — 단위 테스트가 잡은 구멍), page.add frame 잠금 + activatesPage,
    PAGE_PAGE_DUPLICATE 어댑터, insertSlide 제외, promptFragment 강화.
  - types.ts `activatesPage` / façade `onPageActivate`(ok+string value에서만,
    동기) / use-aku-agent dep(depsRef 패턴) / AkuAssistant prop /
    DesignPage `handleAgentPageActivate`(레일 패리티: select + clickActivatesPage
    게이트 활성화).
  - 테스트: pieces 28 + façade 13 + coverage 7 + deps-guard = 49 green;
    전체 vitest 1058 green; 5 게이트 green; tsc clean.
  - 라이브 프로브 1턴(e2e, 삭제됨): "새 슬라이드 + 파란 사각형" →
    page.add FULL_FRAME → 동기 활성화(신규 페이지만 스테이지 렌더, 구 페이지
    0건) → 사각형이 신규 페이지 (0.3,0.3,0.4×0.4) 착지. PASS.
  - 기록: DR-115 §8.
