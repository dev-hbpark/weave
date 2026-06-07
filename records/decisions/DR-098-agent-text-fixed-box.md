# DR-098 — 에이전트 추가 텍스트 = 고정 크기 박스

- 상태: ACCEPTED
- 날짜: 2026-06-07
- 관련: WI-143, 선례 DR-091(agent px→ratio 폰트 그라운딩, 동일한 transformInput 파이프라인)
- 무관(미변경): DR-091(폰트 크기 처리), DR-093(fontSize 단일 진실)
- 리넘버링(2026-06-08): WI-141/DR-096이 weave.subtree.add와 충돌 → 이 작업을 WI-143/DR-098로 이동.

## 맥락

요청: "에이전트의 텍스트 추가 시 고정 크기 스타일 사용." 여기서 '고정 크기'는 **폰트 px/ratio가
아니라 텍스트 박스의 리사이즈 모드**(autoresize)를 의미.

weave 텍스트 박스의 리사이즈 모드는 `attrs.layoutChild`에서 파생(`document/domains/
derive-text-auto-resize.ts`):
- `layoutChild` 미설정 → `"HEIGHT"`(자동 높이, 기본)
- anchor `scale×scale` → `"WIDTH_AND_HEIGHT"`(자동 너비)
- anchor `scale×top` → `"HEIGHT"`(자동 높이)
- 그 외(예: `left×top`) → `"NONE"` = **Fixed(고정)**

즉 "고정 크기 박스" = `layoutChild = { absolute-constraints, anchor:{left,top} }`
(= `layoutChildFromTextAutoResize("NONE")`).

## 결정

1. **에이전트가 추가하는 텍스트는 고정 크기 박스를 기본값으로 한다.** DR-091과 동일한
   agent-only `transformInput` 파이프라인에 순수 변환 `fixAgentTextBox`를 추가해, `weave.item.add`
   (kind:text)에 Fixed `layoutChild`를 주입. 툴바(사용자 직접 편집)는 이 프록시를 거치지 않으므로 무영향.

2. **자유 배치 컨테이너에만 적용**(root / `absolute-constraints` 프레임 / layout 없는 프레임).
   flex·grid 프레임의 자식 텍스트는 **건드리지 않음** — 레이아웃이 너비를 소유하고 텍스트는 래핑+자동
   높이여야 하며, absolute anchor를 강제하면 레이아웃과 충돌(`deriveTextAutoResize`가 비-absolute
   layoutChild를 "HEIGHT"로 처리하는 의미와 일치). 컨테이너의 `attrs.layout.kind`로 판정.

3. **에이전트가 명시적으로 `layoutChild`를 준 경우 존중**(예: 의도적 자동 너비) — 주입 생략.

4. **프롬프트 보강**: 고정 박스는 자동으로 안 늘어나므로, 에이전트가 `frame.height`를 내용에 맞게 충분히
   주고 넘칠 수 있으면 `textOverflow:'VISIBLE'`을 쓰도록 안내(command-schema TEXT_ATTRS_NOTE +
   capabilities text itemKind). flex/grid 텍스트는 종전대로 자동 높이라고 명시.

## Touch points

`agent-text-resize.ts`(신규 순수 변환, `layoutChildFromTextAutoResize("NONE")` 재사용 — 신규 switch
없음) · `use-aku-agent.ts` transformInput에 `fixAgentTextBox` 합성(DR-091 그라운딩 앞단) ·
TEXT_ATTRS_NOTE + text capability 보강 · `agent-text-resize.test.ts`.

## 트레이드오프 / 결과

- (+) 에이전트 텍스트가 예측 가능한 고정 크기 박스 — 의도한 레이아웃이 자동 높이로 흔들리지 않음.
- (+) 결정적 변환(LLM 신뢰 X), DR-091 패턴 재사용, 자유 배치에만 적용해 레이아웃 안전.
- (−) **고정 박스는 자동으로 안 늘어남** → 높이가 부족하면 클립(기본) 가능. 완화: 프롬프트로 충분한
  height + `textOverflow:'VISIBLE'` 안내. flex/grid 경로는 영향 없음.
- (−) 폰트 px→ratio(DR-091)는 그대로 — 반응형 폰트 + 고정 박스가 공존(폰트는 부모 높이에 반응, 박스
  크기는 고정). 의도된 조합.

## 후속

- 필요 시 toolbar에 동일 기본값 노출 여부 검토(현재는 에이전트 경로만).
