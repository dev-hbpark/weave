# Decision Record — DR-027

> Save at `records/decisions/DR-<NNN>-<slug>.md`. For cross-team decisions, link from / to the originating handoff.

## Metadata

| Field | Value |
|---|---|
| ID | DR-027 |
| Title | 페이지 오케스트레이션 분해 — DesignPageBody / FrameStage God Component을 view-model 훅 + 서브뷰로 분리 |
| Decision Level | 1 Local (단일 프로젝트 내부 구조 결정, 외부 계약 무변경) |
| Owner | hbpark |
| Required approvers | hbpark (responsible + accountable) |
| Consulted | `solid-grasp-review` (본 DR 내장), AUDIT-006 / WI-063 트랙 |
| Informed | features/figma-frame-ux, features/zorder-peek 소유 영역 |
| Status | Proposed |
| Decided on | 2026-06-01 |
| Effective from | 2026-06-01 |
| Review-by | 2026-06-30 |

## Context

`apps/web/src/pages/DesignPage.tsx`(4574줄)와 `pages/FrameStage.tsx`(2435줄)는 각각 단일 거대 함수를 핵심으로 한다:

- `DesignPageBody` (669–3658, **~3000줄**) — `useEffect`×26, `useCallback`×23, `useRef`×5, `useState`×4가 한 함수 스코프에 평면적으로 거주. **~12개의 독립 책임 클러스터**(저장/충돌, peek+reorder, 선택 크롬 VM 등록, 아이템 추가/배치, 카메라/포커스, 핫키, command-host, presence, hover, clipboard, palette, 변이 래퍼)가 서로 ref로 클로저 안정성을 맞추며 얽혀 있다. 후반 ~1250줄은 17단 중첩 Provider 트리 + 인라인 `<header>` 툴바 + Stage + 다이얼로그가 한 JSX로 응집.
- `FrameStage` (1023–2435, **~1412줄**) — 카메라(`vm.camera` MotionValue) · 팬/줌 제스처 · GestureRouter 호스트(pan/move/resize/rotate) · 뷰포트 컬링 · 좌표 투영이 한 함수에. 추가로 재귀 컴포넌트 `NestedFrame`(316–993, ~677줄)이 동일 파일에 동거.

**이것은 AUDIT-006 / WI-063과는 다른 축의 문제다.** AUDIT-006은 "도메인 *계산*의 거주지가 View"(순수 수학의 테스트가능성) 위반을 다뤘고, WI-063이 F-1a/F-1b/F-3을 순수 `.ts` 모듈로 추출 완료했다. 본 DR이 답하는 것은 **"오케스트레이션 자체의 크기와 책임 경계"** — 순수 수학을 다 빼내도 ~3000줄 오케스트레이터는 여전히 단일 함수로 남으며, 변경 사유가 12개라 SRP를 정면 위반한다. 신규 기능 추가 시 회귀 위험이 누적되고(한 함수에 effect 26개), 코드 탐색·리뷰·테스트 격리가 모두 비싸다.

구조적 흐름(모든 변이 `editor.exec` 경유, History 계약)은 무손상이며 **본 결정은 동작 보존 리팩터(behavior-preserving)** 다.

## Options considered

| Option | Trade-off (gain / give up) | Risk class |
|---|---|---|
| **A — view-model 훅(`use-*.ts`) + 서브뷰 분리, 기존 관례 확장** | gain: SRP 회복, 클러스터별 테스트 격리, 기존 `use-*.ts` 관례 재사용(신규 패턴 0). give up: 클러스터 간 공유 ref를 오케스트레이터가 배선해야 함(완전 독립 훅 아님). | 중 (점진 이행으로 완화) |
| B — 단일 `useDesignPage()` 메가 훅으로 로직 일괄 이동 | gain: tsx에서 로직이 사라짐(표면적 분리). give up: God object를 훅으로 옮겼을 뿐 — 변경 사유 12개 그대로, SRP 미해결. | 고 (위장된 무해결) |
| C — 상태관리 라이브러리(zustand/redux) 도입해 store로 추출 | gain: 전역 상태 일원화. give up: VM(`EditorViewModel`)이 이미 단일 상태원 — 중복 레이어, DR-017과 충돌, 번들 증가. | 고 (아키텍처 역행) |
| Do nothing | gain: 0 작업. give up: 회귀 위험·탐색비용 누적, 신규 기능마다 effect 추가. | 고 (부채 복리) |

## Decision

**Option A를 채택한다.** `DesignPageBody`의 12개 책임 클러스터를 `pages/design/hooks/use-*.ts` view-model 훅으로, 뷰 JSX를 `pages/design/view/*.tsx` 서브컴포넌트로 분리하여 오케스트레이터를 "훅 조합 + Provider 트리 + 서브뷰 배치"만 남는 ~250줄로 축소한다. `FrameStage`도 동일 원칙으로 카메라/제스처/컬링 훅과 `NestedFrame` 분리. 클러스터 간 공유 ref는 오케스트레이터가 소유·주입하는 명시적 계약으로 처리한다(일부 훅은 "독립"이 아니라 "오케스트레이터가 배선하는 협력 훅"임을 수용). **`editor.exec` 변이 경로와 모든 외부 props/컨텍스트 계약은 무변경**이며, 각 추출 슬라이스는 직후 e2e + typecheck 그린 게이트를 통과해야 한다.

## Why this option

- 코드베이스에 **이미 `use-*.ts` view-model 훅 관례가 정착**(`use-weave-editor`, `use-peek-mode`, `use-clipboard-commands`, `use-reparent-drag-controller`, AUDIT-006이 모범으로 평가한 `features/aku/agent/use-aku-agent`)되어 있어, 신규 추상화·신규 의존성 없이 확장만으로 SRP를 회복한다.
- B는 분리처럼 보이나 변경 사유를 줄이지 못한다(Interface Segregation 위반: 메가 훅이 40개 필드 반환). C는 VM(DR-017)이라는 기존 단일 상태원과 중복되어 아키텍처를 역행한다.
- 동작 보존 + 점진 이행이므로 위험은 "한 슬라이스 추출 → 즉시 검증" 루프로 국소화된다.

specialist 리뷰:
- `solid-grasp-review`: 본 DR § "SOLID + GRASP review" 참조 (스킬 게이트 통과).
- `design-system-triage`: 서브뷰는 기존 `@weave/design-system` 컴포넌트 재배치일 뿐 신규 primitive/token 없음 → triage Step 1(reuse), 디자인팀 협업 트리거 없음.
- `library-adoption-review`: 신규 의존성 0 → 해당 없음.

## SOLID + GRASP review

### Surfaces
- **A. View-model 훅 레이어** (`pages/design/hooks/use-*.ts`) — 클러스터별 오케스트레이션 로직.
- **B. 서브뷰 컴포넌트 레이어** (`pages/design/view/*.tsx`) — 헤더 툴바 / 캔버스 마운트 / 다이얼로그 JSX.
- **C. 얇은 오케스트레이터** (`DesignPageBody.tsx`) — 훅 조합 + Provider 트리 + 서브뷰 배치.
- **D. FrameStage 내부 훅 + `NestedFrame` 분리** (`pages/frame-stage/`).
- **E. 오케스트레이터-소유 공유 ref 주입 계약** — 협력 훅 간 클로저 안정성 seam.

### SOLID
| Principle | Compliance | Notes |
|---|---|---|
| S | ✅ | 각 훅 = 단일 변경 사유(save / peek / focus / hotkeys / command-host …). 현재 `DesignPageBody`의 ~12개 변경 사유를 1:1 분리. |
| O | ⚠️→✅ | 분해 자체는 `switch(kind)` 무추가. 선택 크롬 등록 클러스터는 이미 DR-023 registry 기반 — 이전 시 registry 패턴 보존, 오케스트레이터 편집으로 kind 추가 금지(Rule 6). |
| L | ✅ | 훅 반환 형상은 안정적, 판별 유니온 치환 없음(대체로 N/A). |
| I | ⚠️ | **핵심 위험**: 메가 훅이 40개 필드 반환(Option B의 함정). 완화: 훅 반환 타입을 소비자별 응집 단위로 분리, 서브뷰는 자신이 쓰는 props만 수령(전체 VM 주입 금지). |
| D | ✅ | 서브뷰는 훅 추상화 + 기존 컨텍스트 Provider(`EditorVMProvider`/`SelectionProvider` 등 IoC)에 의존, 구체 editor를 직접 `import` 안 함. 검증 질문: "Provider만 교체해 서브뷰를 테스트할 수 있는가?" → 가능해야 함. |

### GRASP (적용 부분집합)
| Pattern | How applied |
|---|---|
| Information Expert | 클러스터 지식(예: 카메라 수학·focus-gate 세트)을 그 상태를 소유한 훅으로 이동. |
| High Cohesion | 훅 1개 = 같은 데이터에 말하는 메서드 집합 1개. |
| Low Coupling | 오케스트레이터는 훅 N개를 import(적음), 서브뷰는 컨텍스트 소비. |
| Controller | 각 제스처/유즈케이스가 흩어진 인라인 effect가 아니라 단일 훅으로 라우팅(use-design-hotkeys, use-design-peek …). |
| Pure Fabrication | VM 훅은 fabrication(어떤 도메인 객체도 "저장 오케스트레이션"을 소유하지 않음) — 명시적으로 lookup/mediator로 발명. |
| Indirection | 오케스트레이터-소유 ref(`addGeometryRef`/`selectFrameRef`/`docInAgocraftRef`)가 협력 훅 간 매개 — 일부 훅이 "협력"임을 문서화(Surface E). |
| Protected Variations | `editor.exec` 변이 계약을 stable seam으로 고정 — 분해가 이 경계를 절대 넘지 않음. |

### Anti-patterns avoided
- **단일 `useDesignPage()` 메가 훅** (Option B) — God object를 tsx→훅으로 이전할 뿐 SRP/ISP 미해결. 클러스터별 분리로 회피.
- **모든 상태 prop-drilling** — 서브뷰가 오케스트레이터 상태를 전부 props로 받는 대신 기존 컨텍스트 Provider 소비.
- **이동 중 History 계약 파손** — 변이를 옮길 때 `editor.exec` 경로를 우회/인라인화하지 않음(ref→effect 짝을 통째 이동).
- **선택 크롬 이전 시 `switch(kind)` 도입** — DR-023 registry/adapter 유지(Rule 6).

## Consequences

- **Code / architecture**: `pages/design/` + `pages/frame-stage/` 디렉터리 신설. `DesignPageBody` ~3000→~250줄, `FrameStage` 함수 ~1412→~300줄(+NestedFrame 분리). 신규 `use-*.ts` ~7개, 서브뷰 ~5개.
- **Process / workflow**: 슬라이스별 "추출→typecheck+vitest+관련 e2e 그린" 게이트가 표준 절차. SVL 게이트가 `history-*.spec.ts` 회귀를 막는다.
- **Cost / ops**: 런타임 비용 변화 0(동작 보존). 빌드 그래프에 파일 추가뿐.
- **User experience**: 무변경(behavior-preserving).
- **Risk posture (accepted residual)**: 협력 훅의 ref 배선 오류로 stale 클로저 회귀 가능성 — e2e(undo/redo, vertex 핸들, peek reorder)로 방어. WI-063의 순수 추출 대비 "상태 소유 이동"이라 상대적 고위험 → 점진·검증 우선.

## Conditions / follow-ups

각 항목은 `WORK_ITEM.md`(WI-071)의 Phase로 추적:
1. WI-063 잔여(F-2a TextBlock VM 이관 / F-2b MediaSrcDialog ingest)는 별 트랙 유지하되, MediaSrcDialog가 본 분해의 `DesignDialogs` 서브뷰로 이동할 때 충돌 없도록 순서 조율.
2. FrameStage `nextPanForZoom`/`perceivedLuminance`(AUDIT-006 F-1 MED 잔여)는 카메라/색 훅 추출 시 함께 순수 모듈로 이관.
3. `collectFocusGateIds`·`selectedKind`/`multiSameParent`(F-5 MED)는 각각 `use-frame-focus`·`use-command-host`로 흡수.

## Dissent (if any)

없음. 단, "FrameStage까지 동시 범위"는 작업량을 키우므로 Phase 게이트로 DesignPage 완료 후 진입(disagree-and-commit 아님, 순차 합의).

## Links

- Triggering Work Item: WI-071 (본 DR의 실행), WI-063 (인접 트랙 — 순수 계산 추출)
- Originating audit: [AUDIT-006](../audits/AUDIT-006-2026-06-01-mvvm-layer-separation.md)
- Related DRs: DR-017 (editor-vm 단일 상태원), DR-023 (selection-chrome ownership/registry)
- Engineering Plan: `features/page-decomposition/ENGINEERING_PLAN.md`
- Superseded DRs: 없음
