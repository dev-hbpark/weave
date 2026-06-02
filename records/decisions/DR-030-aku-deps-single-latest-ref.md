# Decision Record — DR-030

> Save at `records/decisions/DR-<NNN>-<slug>.md`. For cross-team decisions, link from / to the originating handoff.

## Metadata

| Field | Value |
|---|---|
| ID | DR-030 |
| Title | `useAkuAgent`의 deps stale-closure 제거 — 필드별 ref를 단일 `depsRef` 최신값 미러로 통합 |
| Decision Level | 1 Local (단일 프로젝트 내부 구조 결정, 외부 계약 무변경) |
| Owner | hbpark |
| Required approvers | hbpark (responsible + accountable) |
| Consulted | `solid-grasp-review` (본 DR 내장), WI-075 트랙 |
| Informed | features/aku 소유 영역, WI-052 / WI-065 |
| Status | Accepted |
| Decided on | 2026-06-02 |
| Effective from | 2026-06-02 |
| Review-by | 2026-09-02 |

## Context

`apps/web/src/features/aku/agent/use-aku-agent.ts`의 `runTurn`은 비동기 수명이
길어 stable 의존성만 담은 배열(`[commit, editor, getHandle, patchLastAssistant,
uploadImages]`)로 **최초 마운트 시 1회 생성되고 고정**된다. 렌더마다 새로
생성되는 `deps`의 콜백/게터를 `runTurn` 안에서 `deps.X`로 직접 읽으면 **최초 렌더
값에 영구 고정(stale)**된다.

기존 방어책은 `getDocumentRef` / `getSelectionRef` / `getDesignInfoRef` **필드별
수동 ref 미러링**(주석: *"Latest-value refs so the stable callbacks never go
stale"*)이었다. 그러나 새 콜백 `onFramesAdded`를 deps에 추가하며 ref 미러링을
빠뜨렸고, `deps.onFramesAdded?.()`가 최초(빈) 문서를 가둔 stale `handleFitAll`을
호출 → 카메라 핏이 early-return으로 무산 → 에이전트가 추가한 슬라이드가 공유 규격
70%가 아닌 베이스 ~100% 뷰에 머무는 회귀(WI-075)가 발생했다.

본질 문제는 단일 버그가 아니라 **재발 클래스**다: 필드별 ref는 (1) 사람이 매번
기억해야 하는 규율이고, (2) `exhaustive-deps` 린트로 못 잡는다(의존성 배열에서
deps를 의도적으로 제외하므로). 새 콜백을 추가할 때마다 조용히 깨질 수 있다.

구조적 흐름(모든 변이 `editor.exec` 경유, History 계약)은 무손상이며 **본 결정은
동작 보존 리팩터(behavior-preserving)**다.

## Options considered

| Option | Trade-off (gain / give up) | Risk class |
|---|---|---|
| **A — 단일 `depsRef` 최신값 미러로 통합** | gain: "기본적으로 최신" 보장 — 새 dep 추가 시 ref 미러링 0, stale 클래스 소멸, 필드별 ref 3개 제거. give up: 콜백 내부에서 `depsRef.current.*` 접근 1회 우회(규칙 1줄). | 저 (동작 보존, 단일 파일) |
| B — `useEvent` / `useEffectEvent` 래퍼로 콜백마다 안정 ID+최신화 | gain: 콜백을 의존성 배열에 안전 투입 가능. give up: **여전히 필드마다 래핑**을 기억해야 함(클래스 미소멸), 실험적 API/폴리필 + useLayoutEffect 타이밍 машинery. | 중 |
| C — 린트/테스트로 "함수 필드 ↔ ref 존재" 강제 | gain: 규율 자동 강제. give up: 일반화 어려움·취약, 근본 패턴(per-field)은 그대로. | 중 |
| Do nothing (이번 버그만 `onFramesAddedRef` 추가) | gain: 최소 변경. give up: 재발 클래스 그대로 — 다음 콜백에서 동일 버그. | 고 (부채 복리) |

## Decision

**Option A를 채택한다.** 필드별 ref(`getDocumentRef`/`getSelectionRef`/
`getDesignInfoRef`)를 하나의 `depsRef`(`const depsRef = useRef(deps); depsRef.current
= deps;`)로 통합하고, 장수 비동기 콜백 내부의 **모든 volatile dep 읽기**(getter +
`onFramesAdded` 등 콜백)를 `depsRef.current.*`로 통일한다. 의존성 배열·`useMemo`
identity에 쓰이는 **stable 값(`editor`, `designId`)만 구조분해 유지**한다.

규칙은 단순 이분법으로 정착한다:
**"의존성 배열에 들어가는 stable 값 = 구조분해 / 콜백 안에서 읽는 volatile 값 =
`depsRef.current`."** 이로써 deps에 새 콜백이 추가돼도 자동 최신이라 ref 미러링을
기억할 필요가 없다(= "매번 신경 쓰지 않아도 되는 구조"). 외부 인터페이스
(`UseAkuAgent`)와 `editor.exec` 변이 경로는 무변경.

## Why this option

- A는 **"fresh by default"를 구조로 보장**한다 — 재발 클래스의 원인(필드별 수동
  규율)을 제거한다. B는 분리처럼 보이나 "콜백마다 래핑을 기억"하는 동일한 규율
  비용이 남아 클래스를 없애지 못한다. C는 패턴은 그대로 둔 채 가드만 덧대 취약하다.
- A는 추가 추상화·신규 의존성 0, 기존 ref 3개를 1개로 줄여 코드도 감소한다.
- 모든 치환은 "최신값 읽기"라 stale → fresh로 의미가 동일하거나 더 정확해지는
  동작 보존 변경이며, 위험이 단일 파일·읽기 전용 카메라 핏 경로에 국한된다.

### SOLID + GRASP review (`solid-grasp-review` 게이트)

- **SRP / Information Expert**: `depsRef`는 "외부 주입값의 최신 스냅샷 보유"라는
  단일 책임을 명시적으로 가진다. 콜백은 "지금 값을 읽는다"는 의도만 표현(GRASP
  Indirection로 stale 타이밍 결합을 끊음).
- **OCP**: 새 dep 추가가 `depsRef` 미러를 수정하지 않고 자동 반영된다(확장에 열림,
  ref 배선 수정 불요).
- **DIP**: 호출부는 구체 ref 3개가 아니라 단일 최신값 표면에 의존.
- Rule 6(switch/kind 분기 금지)·History 변이 계약과 무관(읽기 전용 경로).

specialist 리뷰:
- `design-system-triage`: UI 컴포넌트 추가/변경 없음(훅 내부 로직) → 해당 없음.
- `library-adoption-review`: 신규 의존성 0 → 해당 없음.

## Consequences

- `onFramesAdded`가 매 턴 최신 `handleFitAll`을 호출 → 에이전트 프레임 추가 후
  정상 70% 핏(WI-075 회귀 해소).
- 향후 `useAkuAgent` deps에 추가되는 모든 콜백/게터가 자동 최신 — 동일 stale 버그
  재발 방지.
- 잔존 규율(콜백 내부 `deps.X` 직접 접근 금지)은 **파일 한정 가드 테스트**로 자동
  강제됨 — `use-aku-agent.deps-guard.test.ts`가 주석 제거 후 `deps.<member>` 0건을
  단언, vitest CI에서 차단. 전역 biome/ESLint 규칙은 `deps`가 레포 전역 ~95곳에서
  쓰이는 일반 이름이라 오탐 과다로 기각하고, 파일 한정 불변식을 파일 한정으로
  강제하는 적합성 테스트(fitness function)를 택함(WI-075 Follow-up 완료).

## Links

- WI-075 (버그 트랙 + 구조 제거).
- WI-052 (아쿠), WI-065 (`FRAME_FIT_FILL` 70% 공유 핏).
- `apps/web/src/features/aku/agent/use-aku-agent.ts`,
  `apps/web/src/pages/design/hooks/use-frame-focus.ts`,
  `apps/web/src/pages/frame-camera-bridge.ts`.
