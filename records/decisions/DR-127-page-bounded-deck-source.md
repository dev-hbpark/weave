# DR-127 — DeckPolicy: 페이지-바운드 모드의 덱 소스는 읽기 시점 구조 필터로

- Status: ACCEPTED
- Date: 2026-06-12
- Work Item: WI-194
- Related: DR-114 (EditorModeContext v2 + growth contract §6), WI-072 (deck membership = `presentable !== false`), DR-118 (InsertionPolicy.addContainerFor), DR-125 (mixed rail multiSelect)

## Context

slide-deck(및 doc-page)의 제품 모델은 "page로 추가된 프레임만 슬라이드,
페이지 내부 프레임은 자동 제외(그룹 취급)"인데, 덱 후보 수집기
`collectPresentationIds`는 모드 무관·깊이 무관으로 모든 `frame`을 수집하고
`presentable: false`만 제외한다. WI-180(모드-스코프 add) + WI-185
Cmd+G(`weave.items.group`의 래핑 frame, 스탬프 없음)가 페이지-내부 frame
생성을 일상 경로로 만들면서 slide-deck 레일/쇼가 오염되고, slide-deck
레일에는 의도적으로(DR-114 §4) 제외 토글이 없어 복구 UI도 없다.

## Options

### A — 생성 시점 스탬핑 (rejected)

페이지-내부에 frame이 생기는 모든 경로(`weave.item.add`, `weave.items.group`,
paste, 에이전트, 향후 경로)에서 `presentable: false`를 스탬프.

거부 이유:

1. **경로 전수 커버가 불가능에 가깝다** — 새 mutation 경로가 생길 때마다
   스탬프를 잊으면 같은 버그 재발. open-set 문제를 closed-set 패치로 막는 꼴.
2. **데이터에 모드 의존 상태가 박힌다** — mixed↔slide-deck 플레이버 전환,
   루트로의 reparent 시 stale 스탬프가 남아 "루트 직속인데 보이지 않는
   페이지"라는 역버그를 만든다 (WI-135 reparent 보존 교훈과 동일 계열).
3. 기존 문서(이미 스탬프 없이 만들어진 중첩 frame)는 마이그레이션 필요.

### B — 읽기 시점 구조 필터, EditorModeContext 정책 (CHOSEN)

`EditorModeContext`에 `deck: DeckPolicy` REQUIRED 키 추가 (DR-114 §6:
소비처 마이그레이션과 같은 변경에서):

```ts
interface DeckPolicy {
  collectCandidateIds(root): string[];   // 덱 후보(레일 타일 + 스텝 모집단)
  childOwnsScene(child): boolean;        // present 렌더: 자식 frame이 own scene인가
  collectNonStepSceneIds(root): string[]; // 스텝은 아니지만 own scene인 frame
}
```

- `PAGE_DECK` (slide-deck / doc-page): 후보 = **루트 직속 frame만**,
  `presentable` **무시**(구조가 곧 의미 — 페이지=아트보드=슬라이드; stale
  스탬프 역버그 원천 차단). `childOwnsScene = () => false` → 중첩 frame은
  부모 슬라이드 씬에 **인라인 렌더**(이걸 빠뜨리면 슬라이드에 구멍).
  `collectNonStepSceneIds = () => []`.
- `FULL_DECK` (mixed / canvas-board): 기존 WI-072 동작 그대로
  (`collectPresentationIds` / `isPresentableFrame` / `collectNonSlideFrameIds`).

선택 이유: 단일 진입점(읽기) 하나만 정책화하면 **모든 생성 경로가 자동
커버**되고, 데이터는 모드-중립으로 유지되며(왕복 무손실, Rule 5), 정책은
Rule 6대로 레지스트리(editor-mode)에서 단일 해석된다. 저장된
`presentationOrder`는 superset이어도 무해 — `reconcilePresentationOrder`가
읽기 시 필터된 후보와 화해(prune + append)한다.

## Consequences

- ThumbnailPanel은 정책을 모른 채 `deckOrder` 데이터 prop만 받는다
  (DR-114의 "panel is policy-free" 유지).
- PresentFrameTree의 `isPresentableFrame` 하드코드(line 60)는
  `childOwnsScene` prop으로 치환 — PresentPage가 컴포지션 루트로서 주입.
- mixed에서 만든 `presentable:false` frame을 slide-deck으로 전환하면 루트
  직속일 경우 **슬라이드로 보인다**(의도: 구조 우선). 되돌리려면 페이지
  내부로 이동.
- follow-up (별도 WI): `link-section.tsx` 점프 타깃 목록은 여전히
  `collectPresentationIds` — slide-deck에서 중첩 frame이 링크 타깃으로
  노출. 툴바 섹션 레지스트리에 정책 주입 필요.
- `weave.page.duplicate` 등 commands.ts의 `collectPresentationIds` 사용처는
  저장 순서 위치 계산용 — superset이어도 읽기에서 필터되므로 그대로 둔다.
