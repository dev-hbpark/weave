# FR-023 — 아쿠 의도 기반 파이프라인 라우팅 — Technical Feasibility Review

- 관련: WI-148, DR-102, RISK-012
- 평가일: 2026-06-08
- 평가 대상(아이디어 전체): "사용자 입력의 의도를 파악해 이후 파이프라인을 의도별로 다르게 가져가고,
  분류 위치(클라이언트/서버/끔)를 설정으로 고를 수 있게 한다."

## 평결: **FEASIBLE WITH TRADE-OFFS**

핵심 메커니즘이 양 프로젝트에 **이미 존재**한다 — 새 인프라가 아니라 기존 시임의 조립이다.

## 근거 — 필요한 메커니즘이 모두 갖춰져 있음

| 필요한 것 | 이미 있는 자산 | 출처 |
|---|---|---|
| 생성 전 reverse 라운드트립을 끼우는 자리 | `withItemElicitation` TaskRunner 데코레이터 (clarify) | small-think `apps/agent-server/src/elicit-items.ts` |
| 의도/확인 신호를 weave로 스트리밍 | additive `AgentEvent`(미지 타입 tolerate) + `clarify` 채널 | contracts `agent-event.ts`, elicit `mux.channel("clarify")` |
| 의도→파이프라인 구성 매핑 | 하니스 register-restraint **레지스트리(record, Rule 6)** + 리뷰 pass 구성(message/critique/prune/reflow/review) | design `harness.ts`, `create-design-agent.ts` |
| 편집 vs 생성 분기 | `editDesign` / `designFromContent` (이미 거친 2-way "의도") | `server-agent-session.ts` |
| 명시 신호로 분류 생략 | elicit이 명시 답/미지원 시 skip하는 선례 | `withItemElicitation` 게이팅 |
| 클라이언트 task 조립 지점 | `runTurn`의 라인 조립(primer/design/selection/style…) | weave `use-aku-agent.ts` |
| 스냅샷에 없는 뷰-상태 컨텍스트 주입 | `getDesignInfo`(캔버스 px/배경) 주입 선례 | weave `use-aku-agent.ts` |
| 보정칩/설정 UI 패턴 | `ClarifyPicker`, `SlashCommandMenu`, `AkuSettingsMenu`(askBeforeGenerate 등 토글) | weave aku 피처 |

## 의도 모델의 본질적 형태 (지능적 한계 아님 — 모델링 문제)

요청된 9개는 평면 의도가 아니라 **직교 3축**이다: `Operation × Target × Tone policy`.
이 분해는 9× 조합 폭발과 switch를 피하고 Rule 6(레지스트리)에 맞는다. → 본질적으로 구현 가능,
설계상 깔끔하게 표현됨(DR-102).

## 불가피한 트레이드오프 (이상과 현실의 경계)

1. **분류 지연 vs 정확도.** 서버 모드는 빌드 전 분류 턴 1회 추가 → 지연. 완화: 빠른/저비용 모델·저토큰·
   명시 신호 시 생략. *경계*: "무지연 + 고정확 자동분류"는 불가 — 둘 중 하나를 택하거나 하이브리드로 흡수.
2. **오분류는 0이 될 수 없다.** 자연어 의도 추론은 확률적. 완화: 하이브리드 보정칩 + 슬래시 명시 +
   `client`/`off` 모드. *경계*: 자동 추론을 켠 한 오분류 가능성은 상존 — 그래서 교정 경로가 1급 요건.
3. **범위 한정 편집의 충실도는 프롬프트 준수에 의존.** "선택 아이템만 수정"·"recolor만"은 지시문+범위 리뷰
   렌즈로 강하게 유도하지만 **하드 보장은 아니다**(에이전트가 과편집할 수 있음). *경계*: 진짜 하드 가드는
   툴 스코프 제한(특정 itemId만 허용)이 필요하며 이는 별도 범위. 1차는 prompt+review 유도로 수용.
4. **지칭(referenced) 해소 모호성.** "그 제목"이 여럿일 수 있음. 완화: clarify 재사용 디스앰비규에이션.
5. **덱-톤 충실도는 weave 컨텍스트 툴을 요구.** 원시 doc 스냅샷엔 해석된 테마 토큰/뷰모델이 없음 →
   `design.tone` 컨텍스트 툴(additive) 필요.
6. **교차 프로젝트 변경.** weave + small-think 동시 — HANDOFF-027로 추적. `client` 모드는 task 증강만으로
   서버 무변경 빌드에서도 동작하므로 **클라이언트 선착륙 가능**(위험 분산).

## 범위 축소 옵션 (필요 시)

- **MVP-A (클라이언트 선착륙):** `intentSource: client|off`만, 명시 슬래시/칩 선택 + 클라이언트 task 증강
  + 덱-톤 컨텍스트. 서버 무변경. → 데모/검증 빠름, 오분류 0(명시).
- **MVP-B (+서버 자동):** `server` 모드 + 분류 턴 + additive intent 이벤트 + 보정칩.
- **확장:** 툴-스코프 하드 가드(과편집 차단), 지칭 디스앰비규에이션, recolor 전용 리뷰 렌즈.

## 결론

아이디어가 약속하는 것(의도별 다른 파이프라인 + 위치 선택)은 현재 기술로 **도달 가능**하다. 약속과 현실의
경계는 위 트레이드오프 1~3(지연·오분류·범위 충실도)이며, 하이브리드 + 모드 선택 + 범위 리뷰 렌즈로 흡수한다.
