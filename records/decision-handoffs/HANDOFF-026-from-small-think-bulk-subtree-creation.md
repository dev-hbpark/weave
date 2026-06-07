# HANDOFF-026 — (from small-think) bulk 서브트리 생성 도구로 build turn 비용 절감

- **From:** small-think (consumer / 측정 근거 보유) · **To:** weave (디자인 도구 소유자)
- **Date:** 2026-06-07 · **Status:** Proposed (weave 측 WI/DR 생성 요청)
- **Evidence:** small-think DR-046 (build turn 계측 + 배치 A/B 음성 결과), DR-044 (stage-pass)
- **Relates(weave):** HANDOFF-003/004 (serializeItemSubtree / item.create patch 수용), `weave.preset.insertSlide`(서브트리 생성 선례), `weave.batch`

## 왜 (small-think 실측 근거)

byo-ssh 디자인 생성 비용을 계측한 결과(풀 파이프라인 n=5, 비용≈모델 턴):

- **build 한 패스가 전체 비용의 82%** (평균 69턴). 리뷰 단계 축소 ROI는 ~5% 천장.
- build는 **edits/turn ≈ 0.7** — 편집턴의 99.6%가 **턴당 정확히 1편집**, 다중편집 턴 0건.
- **배치 강화 프롬프트 A/B = 무효** (강화 arm도 0.71, 다중편집 0; n=10). → 프롬프트로는 안 풀린다.

**근본 원인(도구 표면):** weave 도구 중 가장 많이 호출되는 `weave.item.add`(단일, 209회)는
한 번에 한 아이템만 만든다. 슬라이드는 중첩 프레임 트리(frame → child → grandchild)인데,
**자식 생성은 부모의 새 id가 필요**(`containerId`)하고, `weave.batch`는 "한 op에서 만든 id를
같은 batch 뒤 op에서 못 쓴다"는 한계가 있어 **중첩 생성을 batch로 묶을 수 없다.** 그래서
add 체인이 턴마다 쪼개져 build 턴이 폭증한다.

## 도구 표면 분석 (현재 weave)

- 단일 생성: `weave.item.add`(kind/containerId/frame/attrsOverride/units를 1콜에 받음 —
  생성 시점 스타일링은 됨). **그러나 중첩 children 입력은 없음.**
- 복수형 존재: `items.update / items.remove / items.duplicate / items.resizeMulti /
  items.lifecycle` — **하지만 `items.add`(복수 생성)는 없음.**
- `weave.batch`: 여러 커맨드를 1 트랜잭션으로 — 단, id-의존 중첩 생성엔 무력(상기 한계).
- `weave.preset.insertSlide`: **슬라이드 서브트리 전체를 1콜로 생성**(cover.*/agenda.*/content.*…)
  — 즉 "서브트리 일괄 생성"은 이미 가능. 다만 고정 템플릿이라 임의 구조엔 부적합.

**핵심 실현성:** `weave.item.add`는 이미 `item.create` 패치에 **`serializeItemSubtree(stagedItem)`
=전체 서브트리**를 실어 보낸다(commands.ts:744). 즉 **하부 패치/머티리얼라이즈 인프라는 이미
임의 중첩 서브트리를 원자적으로(단일 Cmd+Z, 내부 id 할당) 생성할 수 있다.** 빠진 건 *중첩
children을 입력으로 받아 그 서브트리를 빌드하는 커맨드*뿐이다.

## 제안 설계 — `weave.subtree.add` (중첩 서브트리 원자 생성)

신규 커맨드 `weave.subtree.add`(또는 `weave.items.addTree`):

- **입력:** `{ containerId?, units?, node: NodeSpec }`, 재귀 `NodeSpec = { kind, frame?,
  attrsOverride?, units?, children?: NodeSpec[] }`. 즉 프레임 + 그 자식들(재귀)을 한 번에 기술.
- **동작:** `node`를 재귀 순회하며 각 노드에 `item.add`와 **동일한 시드/가드 파이프라인**을
  적용 — `createDefaultItem` → frame/attrs 머지 → `ensureUsableFrame`(DR-078) →
  `normalizeShapeAttrs`(WI-062) → `sanitizeFontSizeSpec`(DR-082) → `applyCreationUnits`(WI-063).
  자식은 부모 AgocraftItem의 `children`으로 in-memory 조립(외부 id 불필요) → 레이아웃 엔진은
  컨테이너별 `onChildAdd`로 자식 배치(absolute는 frame 필수, auto-layout은 frame 생략 —
  item.add 규칙 그대로). 최종 **하나의 `item.create` 패치**(`serializeItemSubtree`) + 필요한
  sibling 패치를 emit. 반환은 루트 새 id(필요 시 노드별 id 맵).
- **History:** 단일 `item.create` = 단일 undo. 기존 패턴 그대로(HANDOFF-004). 신규 mutation
  surface가 아니라 기존 패치 타입 재사용 → CLAUDE.md 문서-뮤테이션 규칙 충족.
- **스키마 안내(LLM):** "슬라이드/섹션의 전체 프레임 트리를 한 콜로 만들어라. add를 연쇄하지
  말 것. children에 중첩하라." + small-think `BATCH_HINT`/system 프롬프트가 이 도구를 1순위로
  안내(헤드리스 도구 가이드와 연계).

이러면 "frame add → child add → child add …"(N턴)가 **1콜**로 붕괴 → build 턴이 급감.

## 기대 효과 / 검증

- build의 add 체인이 슬라이드당 1콜로 → build 턴 대폭 감소(슬라이드당 수십 턴 → 한 자릿수).
  build가 전체 82%이므로 전체 지연/비용에 직접 반영(추정 수십 % 절감 — 정확치는 측정).
- **검증:** small-think DR-046 텔레메트리(`turn-summary` edits/turn, `pass-cost` 토큰)를
  그대로 사용. 도구 도입 전/후 동일 디자인으로 edits/turn·build 턴·pass-cost 토큰 비교
  (`/tmp/analyze-build.sh` 패턴). 목표: 다중편집/서브트리 1콜로 build 턴 ≪ 편집 수.

## 리스크 / 주의

- **레이아웃 엔진 재귀 적용:** 컨테이너별 `onChildAdd`를 서브트리 빌드 순서에 맞춰 호출해야
  배치/sibling-shift가 정확. (item.add의 단일 경로를 재귀로 일반화.)
- **가드 재귀 적용:** ensureUsableFrame/shape/fontSize 가드를 모든 노드에 적용(누락 시 회귀).
- **부분 실패 원자성:** 한 노드라도 실패하면 전체 미적용(item.create는 본디 원자적).
- **깊이/크기 상한:** 비정상적으로 큰 트리 방어(노드 수 제한 + 명확한 에러).

## weave 측 액션 요청

1. 이 핸드오프로 weave WI + DR 생성(예: "weave.subtree.add — 중첩 서브트리 원자 생성").
2. 구현(기존 item.add 파이프라인을 재귀로 일반화 + 새 스키마) + commands.test.ts 커버리지
   (중첩 생성/가드 재귀/레이아웃 자식 배치/단일 undo).
3. small-think에 회신 핸드오프(`workspace/small-think/records/decision-handoffs/`)로 도구
   준비 통지 → small-think가 헤드리스 도구 가이드/프롬프트에서 이 도구를 1순위로 안내하고
   DR-046 텔레메트리로 before/after 측정.

— small-think 측 측정 근거: `workspace/small-think/records/decisions/DR-046-*.md`
