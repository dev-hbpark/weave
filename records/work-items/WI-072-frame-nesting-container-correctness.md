# WI-072 — Frame nesting + per-frame slide toggle + container-correctness fixes

## Problem

사용자 보고: 프레임 안 이미지를 "이미지 교체"하면 새 이미지가 **디자인 루트**에 추가됨. 전수조사 요청 → "루트가 아니라 어디서든(프레임 안/밖) 동작해야 하는데 프레임 안이면 루트를 가정"하는 버그 부류. 더해서 **프레임 중첩 허용** + **프레임별 슬라이드 포함 토글**(썸네일·퀵액션바, 비-슬라이드는 썸네일에 별도 표시) 요청.

## 전수조사 결과 (4 확정/잠재)

agocraft 커맨드 키트는 전부 부모-정확(`findItemDeep`/`findParentAndIndex`). 결함은 weave 호스트의 루트 하드코딩:
- **① 이미지/비디오 교체** — 미디어 다이얼로그가 `root.children.find`(루트 직계)로 선택 아이템 조회 → 프레임 안 미디어 못 찾아 `addNewItem(…, undefined)`로 루트 재추가.
- **② 붙여넣기** — `resolveContainerId: () => undefined` → 항상 루트 + 비율 좌표 미스케일.
- **③ dissolve**(agocraft) — 자식을 항상 루트로 올림(중첩 시 바깥 프레임 무시).
- **④ z-order 헬퍼** `readZ`/`listSiblings` — 루트 직계만 조회(중첩 아이템 -1/[]).

## Decision

- **① ②** weave `DesignPage`: 미디어 교체 조회 2곳 `findItemDeep`; paste 컨테이너를 선택 프레임/부모로 + `resolveContainerSizePx`를 그 프레임 px로 보정(`absoluteFrameBox`×host scale).
- **③** agocraft `createDissolveFrameCommand` → 직속 부모로(agocraft DR-035). 최상위는 parent==root라 현행과 동일.
- **④** `design-frame.zorder.ts` `readZ`/`listSiblings` → `findParentAndIndex` 기반.
- **중첩 허용**: 엔진은 이미 중첩 지원(재귀 렌더·히트테스트·reparent·좌표합성·선택크롬 — 조사로 확인). 막던 건 **AKU 프롬프트 텍스트뿐** → "프레임=슬라이드 ONLY, NEVER nest" 제거, "최상위=슬라이드, 중첩 가능(그룹), 단순 사각형은 shape 선호"로 개정.
- **프레임별 슬라이드 토글** (this project DR-028): 프레임 `attrs.presentable` 플래그(기본=포함, `false`만 제외). `collectPresentationIds`가 필터, `collectNonSlideFrameIds` 추가. 썸네일 패널에 **비-슬라이드 별도 섹션**(점선·"그룹"·번호 없음) + 토글, 퀵액션바 `frame.toggleSlide` 커맨드+`frameSlideToggler` 슬롯. 토글은 `weave.item.update`(History 보존).

## Verification

- e2e `frame-nested-container.spec.ts`(2): ① 프레임 안 이미지 교체 in-place(루트 미추가, src 갱신); ⑤ 슬라이드 제외 시 비-슬라이드 섹션으로 이동·재포함 복귀.
- 단위: agocraft dissolve 중첩 케이스 + 763 core green; weave zorder 중첩 getZ + 327 green. 끝점 스냅 e2e 등 회귀 green. typecheck·prod build green.
- 발견/대응: e2e 하네스에서 (a) 같은 evaluate 내 frame→child add는 tick 비동기라 `container-not-found` → 2단계 분리; (b) 포털된 썸네일 토글 버튼은 합성/force 클릭이 React onClick 미발화 + hover 애니메이션으로 actionability 불안정 → ⑤는 토글 효과(presentation-order 필터+썸네일 렌더)를 exec로 구동해 UI 결과 검증, 토글 가시성은 opacity-60으로 개선.

## 동시 편집 주의

DesignPage의 ① ② ⑤ 호스트 배선은 병행 WI-071 P2 리팩터 커밋들이 같은 working tree를 쓸어담아 함께 커밋됨(WI-071 커밋 메시지 아래). 나머지(presentation-order/editor-hotkeys/zorder/weave-capabilities/ThumbnailPanel + 재벤더)는 `feat(canvas): … (WI-072)` f744036에 분리 커밋. agocraft dissolve는 e773382.

## Links

- 결정: 이 프로젝트 DR-028(슬라이드 멤버십), agocraft DR-035(dissolve 직속부모).
- 선행: WI-070(끝점 스냅), WI-071(page decomposition — 동시 진행), DR-024(프레임 refit), DR-025(line kind).
