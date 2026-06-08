# DR-100 — 에이전트 추가 아이템 최소 크기 하한 (생성 거부 + 이유 전달)

- 상태: ACCEPTED
- 날짜: 2026-06-08
- 관련: WI-147, 선례 DR-091(agent px→ratio 폰트 그라운딩) · DR-098(agent 텍스트 고정 박스) — **동일한 agent-only `transformInput` 파이프라인**을 재사용
- 무관(미변경): DR-078(zero/degenerate frame 복원 가드), DR-082(px↔ratio 단위 혼동 가드) — 둘 다 명령 내부 `ensureUsableFrame`이며 이 결정과 보완 관계(복원 vs 거부)

## 맥락

요청: "아이템이 추가될 때 추가 후의 크기 하한을 보장하는 안전장치를 두고 싶다. 위반이 시도되면 **이유를
설명하면서 아이템이 제거**되고, 그 **결과와 이유를 아쿠 에이전트에게 전달**해야 한다."

기준 확정 경과: 1차 응답은 "짧은 변 ≥ 10px AND 면적 ≥ 20px²"였으나, 이 경우 2px 두께 구분선처럼 의도적으로
얇은 box가 막히고 면적 조건이 변 조건에 포섭되어 독립 발화하지 않는 문제가 있었다. 사용자 확인 후 **"긴 변 ≥
10px AND 면적 ≥ 20px²"** 로 변경 — 얇은 구분선(2px×400px: 긴 변 400, 면적 800)은 통과하고, 작은 speck
(3×3: 긴 변 3 < 10)과 머리카락 슬리버(200×0.05: 긴 변 200이지만 면적 10 < 20)는 거부되어 **두 임계가 모두
독립적으로 의미**를 갖는다.

핵심 제약·발견:
- weave 좌표는 전부 부모 대비 0..1 비율. 절대 px는 `설계 px(기본 1920×1080) × 조상 width/height 비율의 곱`.
  → add 시점에 **결정적으로 px 산출 가능**. flex/grid 자식은 레이아웃 엔진이 스테이징한 프레임 비율로 동일 계산.
- 모든 추가는 `weave.item.add` 단일 명령을 통과. flex/grid 자식의 **최종 프레임은 명령 내부의 레이아웃
  스테이징 이후**에만 정확. → 정확한 px + "생성 거부"를 동시에 만족하려면 가드는 **명령 내부, 스테이징 직후,
  patch emit 직전**에 있어야 함.
- 적용 범위는 **아쿠 에이전트 추가만**(사용자 결정). 수동 툴바 드래그로 작은 요소를 그리는 것은 의도된
  행위라 막지 않음.

## 결정

1. **명령 내부 거부 가드.** `weave.item.add`가 레이아웃 스테이징 직후, 스테이징된 프레임을 절대 px로 환산해
   하한 미달이면 `fail("item-too-small", <이유>)`를 반환 → **patch 0개 = 애초에 생성 안 됨**(undo 잔재 없음).
   px 환산은 기존 검증 헬퍼 `absoluteFrameBox(doc, containerId, dW, dH)`(루트→설계 박스) × 스테이징 프레임 비율.

2. **에이전트 전용 게이팅.** DR-091/DR-098과 동일한 agent-only `transformInput`에 순수 변환
   `stampMinSizeGuard`를 추가해 `weave.item.add` 입력에 `enforceMinSize:true` + 라이브 `designWidth/Height`를
   주입. 명령은 이 플래그가 있을 때만 가드 작동. 툴바는 이 프록시를 거치지 않으므로 무영향(자동 게이팅).
   `designWidth/Height` 입력 패턴은 기존 `reparent`/`removeFrameKeepingChildren`과 동일.

3. **합격 기준(사용자 스펙) + kind 예외.** `checkAddedItemMinSize(kind, wPx, hPx)`:
   - 일반(box) kind: `긴 변 ≥ 10px AND 면적 ≥ 20px²`(짧은 변이 아니라 **긴 변** — 의도적 얇은 요소 허용).
   - `text`: 높이가 내용에 맞춰 자동(add 시점 미지)이므로 **너비만** `≥ 10px`.
   - `line`: points로 정의되는 1-D 프리미티브(bbox가 본질적으로 얇음)이므로 **길이(긴 변)만** `≥ 10px`(면적 생략).
   - **fail-open**: px를 못 구하면(조상 프레임 결손) 허용 — 측정 공백으로 잘못 막지 않음.

4. **이유 전달.** `fail` 메시지에 한국어로 `거부 사유 + 산출 px + 하한 + 조치 안내(frame 비율을 키우거나 더 큰
   컨테이너에 배치 후 재시도)`를 담아 도구 오류로 에이전트에 반환. 추가로 capabilities 프롬프트(SIZING §1)에
   "MIN SIZE FLOOR" 절을 넣어 에이전트가 **사전에** 하한을 넘게 사이즈를 잡고 `item-too-small`이면 같은 크기로
   재시도하지 말도록 안내(예방).

## 대안 (기각)

- **명령 무조건 적용**: 수동 추가까지 막아 UX 저해. 범위=에이전트만에 위배.
- **프록시에서 생성 후 측정→remove**: 사용자가 명시적으로 "생성 거부" 선택. 또 flex/grid 자식 px는
  exec 전엔 미지라 레이아웃 엔진을 프록시에서 중복 호출해야 함(취약·중복).
- **ambient 동기 플래그**: 명시적 입력 필드보다 은닉 전역이라 코드 구조 규칙(명시적 경계)에 불리.

## 동작 특성 — 긴 변 기준

box kind 합격식 `긴 변 ≥ 10px AND 면적 ≥ 20px²`에서 두 임계가 **모두 독립적으로 발화**한다:
- 2px×400px 구분선 → 긴 변 400 ✓, 면적 800 ✓ → **통과**(의도적 얇은 요소 허용).
- 3px×3px speck → 긴 변 3 ✗ → 거부.
- 200px×0.05px 슬리버 → 긴 변 200 ✓이지만 면적 10 ✗ → **면적 규칙으로 거부**.
임계를 바꾸려면 `checkAddedItemMinSize`의 box 분기(`MIN_ITEM_SIDE_PX`/`MIN_ITEM_AREA_PX2`)만 수정.

## Touch points

- `document/commands.ts`: `absoluteFrameBox` import · `MIN_ITEM_SIDE_PX`/`MIN_ITEM_AREA_PX2` ·
  `checkAddedItemMinSize`(export, 순수) · `AddItemInput`에 `enforceMinSize/designWidth/designHeight` ·
  add `run` 스테이징 직후 거부 분기.
- `features/aku/agent/agent-min-size-guard.ts`(신규 순수 변환) · `use-aku-agent.ts` transformInput 합성
  (그라운딩 뒤단).
- `features/aku/agent/weave-capabilities.ts` SIZING §1 "MIN SIZE FLOOR" 절.
- `document/commands.test.ts`: 예측자 단위 + 명령 거부/허용/수동무영향/fail-open 케이스.

## 검증

typecheck clean · biome clean · vitest 846 pass(신규 10 포함). 캔버스 실환경(에이전트 실제 호출) 확인 권장.
