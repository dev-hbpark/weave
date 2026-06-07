# DR-091 — 아쿠 에이전트 폰트 사이즈 그라운딩 (px 타깃 → 반응형 ratio)

- 상태: ACCEPTED
- 날짜: 2026-06-07
- 관련: WI-136 후속, DR-082(ratio>1 px 재태깅 가드)
- 트리거: "에이전트 디자인 생성에서 fontSize 값은 px에 맞는데 kind가 ratio로 들어가는 경우" 분석 요청

## 근본 원인 (분석)

1. 렌더러(`@agocraft/core` `resolveFontSize`)는 **`fontSizeSpec`가 절대 우선**, 레거시 px `fontSize`는 무시: `spec ?? {kind:px,value:legacyPx}` → `kind==='ratio' ? value*parentH : value`.
2. 에이전트 프롬프트는 ratio를 강제하고 px를 금지하며, `ratio = 타깃px ÷ 직접 부모 프레임 px높이`를 **LLM이 직접 나누게** 함. 중첩/공유/오토레이아웃 프레임의 부모 px높이를 LLM이 자주 몰라 ratio를 틀리게 냄 → px 의도는 맞아도 무시되고 틀린 ratio가 렌더.
3. 레거시 `fontSize`(px)는 ratio spec과 동기화되지 않아 "px값 + ratio kind"가 공존(모순 표시). DR-082 가드는 `value>1`만 px로 재태깅 → 미세-오류 ratio는 통과.

## 결정 (옵션 1)

**LLM은 px 타깃만 내고, weave가 실제 지오메트리로 px→ratio 변환을 결정적으로 수행한다.**

- `apps/web/src/features/aku/agent/agent-font-grounding.ts` — 순수 변환 `groundAgentFontSize(commandName, input, doc, design)`:
  - `weave.item.add`(text, `attrsOverride`): 분모 = `containerId` 프레임의 px높이(`absoluteFrameBox`, root=디자인 높이).
  - `weave.item.update`(선언적 `attrs`, text): 분모 = 편집 대상 텍스트의 **현재 부모** px높이(`box.h ÷ frame.height`).
  - px 타깃 추출: `{kind:'px'}` 또는 `{kind:'ratio', value>1}`(px 마그니튜드 오태깅). `{kind:'ratio', value≤1}`(정상 ratio)는 그대로.
  - 변환 결과: `fontSizeSpec={kind:'ratio', value: px/부모px}` + `fontSize=px`(미러 동기화).
  - `weave.items.update`는 **혼합 부모** 위험(하나의 attrs를 여러 아이템에)으로 보류 → DR-082 가드에 위임.
- **에이전트 전용 스코핑**: 변환은 `round-grouping-editor`(에이전트 툴콜 프록시)의 새 `transformInput` 훅에서만 실행. **UI 툴바는 이 프록시를 거치지 않으므로 사용자의 명시적 px/% 선택은 무손상.**
- 프롬프트(`weave-command-schemas.ts` `TEXT_ATTRS_NOTE`): "px 타깃을 주면 weave가 반응형 ratio로 자동 변환"으로 안내. ratio 직접 전달도 여전히 허용(하위호환).

## 트레이드오프 / 결과

- (+) LLM의 오류 잦은 나눗셈 제거 — 부모 높이는 weave가 정확히 안다.
- (+) px↔ratio 모순 해소(미러 동기화). DR-082 가드는 그라운딩 미작동(디자인 정보 없음/부모높이 null) 시 **방어선**으로 유지(이중 안전).
- (+) `{kind:'ratio', value>1}`도 이제 px-재태깅 대신 **올바른 반응형 ratio**로 변환(ratio 철학과 일관).
- (−) `items.update` 폰트 그라운딩 미적용(혼합 부모) — 가드에 위임.
- (−) 변환은 add 시점 `containerId` 부모 기준 — 이후 reparent는 기존 WI-135/DR-086 ratio 보존이 담당.

## 검증

763 단위 테스트(신규 grounding 7 + round-grouping 시그니처 갱신), typecheck·빌드·Biome 클린. e2e는 샌드박스 네트워크 제약으로 별도(환경 가능 시 재검증).
