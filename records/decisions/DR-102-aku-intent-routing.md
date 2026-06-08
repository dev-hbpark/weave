# DR-102 — 아쿠 의도 기반 파이프라인 라우팅 (Operation × Target × Tone, intentSource 3-mode)

- 상태: ACCEPTED (설계) — 구현 미착수
- 관련: WI-148, FR-023, RISK-012, HANDOFF-027(→small-think), features/aku/ENGINEERING_PLAN.md
- 영향: 교차 프로젝트(weave UX/컨텍스트 + small-think 하니스 의도 단계)

## 맥락

아쿠는 입력을 단일 task로 조립해 한 번 submit하고, 서버 에이전트가 추가/수정/삭제/교체/팔레트변경을
모두 같은 경로로 처리한다(의도 구분 없음). 요청: 의도를 파악해 이후 파이프라인을 다르게 라우팅하고,
오분류를 교정 가능하게 하며, 분류 위치를 설정으로 고르게 한다.

## 결정

### D1 — 의도를 평면 9개가 아니라 직교 3축으로 모델링한다

```
IntentPlan = { operation, target, tonePolicy }
```

- **Operation**(동사 — 레지스트리 키, 1핸들러/1동사, Rule 6):
  `create · add · edit · delete · replace · recolor · retone`
- **Target**(범위 리졸버 — 별도 전략): `none · selected · referenced · deck`
- **Tone policy**(수식자 — record): `inherit · ignore · match`

요청 9개 매핑:

| # | 사용자 의도 | operation | target | tone |
|---|---|---|---|---|
| 1 | 새 슬라이드/아이템 추가 | add | none/deck | inherit |
| 2 | 지칭 아이템 수정·삭제 | edit/delete | referenced | — |
| 3 | 선택 아이템 수정 | edit | selected | — |
| 4 | 지칭 아이템 공간 교체 | replace | referenced | inherit |
| 5 | 선택 아이템 공간 교체 | replace | selected | inherit |
| 6 | 팔레트 변경 | recolor | deck | — |
| 7 | 톤 유지 슬라이드 추가 | add | none | inherit |
| 8 | 디자인 무시 슬라이드 추가 | add | none | ignore |
| 9 | 선택 슬라이드 톤 맞춤 | retone | selected | match |

**왜:** 평면 9개는 새 의도(예: "선택 영역만 recolor")가 생길 때마다 조합이 폭발하고 switch를 부른다.
3축 분해는 `Operation→Plan` 레지스트리 + `Target` 리졸버 + `Tone` record로 표현되어, 신규 의도 = 행 하나
추가(OCP/Rule 6). 기존 `editDesign`/`designFromContent`, register-restraint record와 동형이다.

### D2 — 라우팅이 실제로 바꾸는 것 (파이프라인 레버)

각 operation 핸들러가 결정하는 것:

1. **러너 선택** — `editDesign` vs `designFromContent`
2. **지시문 절(directive)** — task에 덧붙는 operation별 제약(elicit의 `selectionClause`와 동형)
3. **주입 컨텍스트** — selected/referenced 스냅샷, 덱-톤 프로파일(inherit/match), 현재 팔레트(recolor)
4. **하니스 pass 오버라이드** — message/critique/prune/reflow/review pass 구성(**항상 서버**)
5. **register/temperature 자세**

| op | 러너 | 지시문 요지 | pass 오버라이드 | 톤 컨텍스트 |
|---|---|---|---|---|
| create | designFromContent | (기존) | 전체 | 스타일 선택 |
| add | editDesign | 기존 아이템 불변, 새 슬라이드를 다음 filmstrip x에 | 빌드+경량 글로벌 리뷰 | inherit=덱-톤 주입 / ignore=생략+새 스타일 |
| edit | editDesign | 대상 아이템만 수정, 추가/삭제/재구조 금지 | message/critique 경량, prune OFF, 대상 reflow | 대상 스냅샷 |
| delete | editDesign | 대상 삭제+이웃 reflow, 그 외 무변경 | 최소 pass, reflow ON | — |
| replace | editDesign | 대상 제거 후 **같은 frame/위치/크기**에 새 콘텐츠 | reflow ON, critique 경량 | 슬롯 톤 inherit |
| recolor | editDesign | **팔레트/채색만**, 텍스트/레이아웃/크기 불변 | critique/prune/reflow OFF, recolor 전용 리뷰 렌즈 | 현재 팔레트 주입 |
| retone | editDesign | 대상의 시각 톤을 덱 톤에 맞춤, 콘텐츠 불변 | reflow ON, 구조 critique 경량 | 덱-톤 프로파일 주입 |

이것이 "의도별로 파이프라인을 다르게"의 실체다.

### D3 — 분류 위치는 `intentSource` 설정(server / client / off)

클라이언트 설정으로 3-모드(`AkuSettings.intentSource`):

- **server**(기본): 서버 `withIntentRouting` 데코레이터가 분류 턴 1회 → `IntentPlan` → 라우팅.
  자동 추론 + 보정칩(아래 D4).
- **client**: 클라이언트가 의도 결정(명시 칩/슬래시 선택, 또는 클라이언트 휴리스틱). **서버 분류 턴 생략.**
  클라이언트가 지시문 절·톤 컨텍스트를 `runTurn`에서 task에 직접 조립하고, **명시 `intent` 라벨**을
  `SubmitOptions.intent`로 전달 → 서버는 분류를 건너뛰고 pass 오버라이드만 적용. 서버가 의도를 모르는
  빌드에서도 task 증강만으로 동작(**graceful degradation → 클라이언트 선착륙 가능**).
- **off**: 의도 라우팅 비활성 — 현재 단일 경로 그대로.

**왜:** 사용자 요청. 명시 선택은 오분류 0·결정론적이고, 서버 분류 턴 비용/지연을 없앤다. `off`는 회귀
안전망. 라우팅 플랜 *적용*은 모드별로 클라/서버 어디든 가능하나, **pass 오버라이드는 하니스 소유이므로
항상 서버**다 — `client` 모드의 "서버 하니스 생략"은 *분류 모델 턴* 생략을 뜻한다.

### D4 — 하이브리드 노출: additive `intent` 이벤트 + 보정칩 + 명시 슬래시

- 서버 분류 결과는 **additive `AgentEvent { type:"intent", plan, confidence, source }`**로 스트리밍
  (contracts는 미지 타입 tolerate → 구버전 클라이언트 안전).
- weave: run-state로 reduce → 어시스턴트 버블에 **의도 칩**("의도: 선택 아이템 수정 ▾") 렌더.
  클릭 → `ClarifyPicker` 패턴의 작은 피커로 operation/target 교정 → reverse 채널(clarify 재사용,
  `kind:"intent"`)로 보정 전송. 진행 중 런이 확인을 대기 중이면 보정 플랜으로 진행, 이미 시작했으면
  보정 후 명시 intent로 재submit.
- 명시 상향 조향: 기존 `SlashCommandMenu`에 의도 슬래시(`/수정 /추가 /교체 /삭제 /팔레트 /톤유지
  /톤무시 /톤맞춤`) 추가 → submit에 명시 intent(서버 분류 생략).
- 설정(`AkuSettingsMenu`): `intentSource`(server/client/off) + "낮은 확신일 때만 보정 묻기"(임계값,
  기존 `askBeforeGenerate` 토글 동형).

### D5 — 덱-톤 컨텍스트는 weave `design.tone` 컨텍스트 툴(additive)

inherit/match/recolor가 쓸 "덱 톤 프로파일"(주요 팔레트·폰트·코너/그림자/스페이싱 언어, **해석된 테마
토큰** 포함)은 원시 doc 스냅샷에 없다. weave가 `getDesignInfo`처럼 뷰-상태를 소유하므로 **`design.tone`
컨텍스트 툴**을 추가해 서버/클라가 동일하게 조회. (DESIGN_CONTEXT_TOOLS에 합류, edit 툴 아님.)

## SOLID/GRASP 1차 필터

- **OCP / Rule 6:** operation→Plan = record, target = 전략, tone = record, intentSource = 모드 record.
  신규 의도/모드 = 항목 하나. `switch (operation)` 금지.
- **SRP:** 분류(의도 단계) / 플래닝(레지스트리) / 라우팅(러너·지시문) / 컨텍스트(tone 툴) / UX(칩·설정) 분리.
- **DIP:** weave↔서버는 `AgentEvent`·`SubmitOptions.intent`·`IntentPlan` 계약에만 의존.
- **Information Expert:** weave가 뷰-상태 톤(`design.tone`) 소유, 서버가 분류+pass 구성 소유.
- **Protected Variations:** 분류 위치(client/server/off)가 `intentSource` 뒤로 교체 가능 — IntentPlan이
  안정 시임. 클라이언트 라우팅은 서버 무변경에서도 동작.

## 대안 (기각)

- **평면 9-의도 enum + switch** — 조합 폭발, Rule 6 위반. 기각.
- **분류를 항상 클라이언트 휴리스틱으로만** — 자연어 의도에 취약(오분류↑). 서버 모델 분류를 옵션으로 보존.
- **항상 서버 분류(설정 없음)** — 사용자가 명시 선택/끔을 요구. 기각.
- **클라이언트가 pass 오버라이드까지** — 하니스가 서버 소유라 불가. pass는 서버, 라벨만 전달.

## 검증 (구현 시 SVL 게이트 — 본 사이클엔 설계만)

- 단위: operation→Plan 레지스트리 커버리지, target 리졸버, intentSource 모드 분기(휴리스틱/스킵).
- e2e: 각 의도가 의도된 러너/지시문으로 라우팅 · 보정칩 교정이 재라우팅 · `off`가 현재 동작 보존 ·
  `client` 모드가 서버 분류 턴 없이 동작.
- declarativecheck(서버)·deps-guard(weave) 통과.
