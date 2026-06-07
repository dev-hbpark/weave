# DR-097 — weave.subtree.add 생성 시점 레이아웃 (v1 회귀 수정)

- 상태: SUPERSEDED (DR-099에서 은퇴) · 날짜: 2026-06-07
- WI: WI-142 · 관련: WI-141/DR-096(subtree.add v1), small-think DR-048(롤백·근거), DR-046(계측)

> **SUPERSEDED (2026-06-08, DR-099):** 이 layout 수정으로 회귀는 해소됐으나 결과는 단일 add와
> parity(이득 없음). subtree.add 전체가 DR-099로 에이전트에서 은퇴됐다. 역사적 기록.

## 맥락

subtree.add v1(DR-096)은 NodeSpec에 `layout`이 없었다. 그래서 auto-layout으로 의도된 프레임이
**레이아웃 없이** 생성 → 자식이 onChildAdd 배치를 못 받고 **seed 크기**로 떨어짐 → 텍스트
auto-fit으로 폰트 작아지고 도형 모양 안 맞음 + 모델이 사후 `frame_setLayout`/`item_update` storm.
small-think 라이브 측정에서 net-negative(DR-048)로 확인돼 subtree-first 가이드가 롤백됐다.

## 결정

NodeSpec에 `layout?: LayoutSpec`을 추가하고, addNode가 노드 생성 시 이를 `attrsOverride.layout`
(`normalizeLayoutSpec`로 정규화)로 접어 **프레임을 레이아웃과 함께 생성**한다. working-doc
리플레이 구조상, 프레임이 레이아웃을 가진 채 workingDoc에 적용된 뒤 자식이 추가되므로
addItem의 `onChildAdd`가 **실제 부모 레이아웃을 읽어 자식을 생성 시점에 정위치**한다 — seed-크기
문제와 후속 setLayout storm을 동시에 제거. 스키마 node에 `layout: LAYOUT_SPEC` + "auto-arrange할
프레임엔 반드시 layout 지정" 안내.

기존 working-doc 재생/addItem 재사용 구조(DR-096)는 그대로 — 변경은 "프레임 attrs에 layout을
실어 생성"하는 한 줄(+스키마/안내). 신규 레이아웃 로직 없음(normalizeLayoutSpec은 기존 것).

## 트레이드오프 / 결과

- (+) auto-layout 서브트리가 한 콜로 **정위치/정크기** 생성 → v1의 seed-크기·setLayout storm 해소.
- (+) 최소 변경(addItem + normalizeLayoutSpec 재사용), 회귀 위험 낮음.
- (−) 블라인드 생성 특성(모델이 렌더 결과를 못 보고 트리 기술)은 남음 — absolute 프레임의
  frame 값 오류나 콘텐츠 미세조정은 여전히 사후 수정 가능. net-win 여부는 **재측정으로 확인**.
- (−) 가이드는 아직 재안내하지 않는다(DR-048) — 재측정에서 단일 add 대비 net-win(총 턴↓ +
  품질 동등 이상) 실증 시에만 small-think가 subtree-first를 다시 켠다.

## 검증

`apps/web` typecheck + commands.test.ts(신규: node.layout이 생성 프레임 attrs에 정규화 적용) +
coverage + biome + Rule 6 그린. 효과(턴/품질)는 small-think 측 재측정으로 후속.
