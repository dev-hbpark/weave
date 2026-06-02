# WI-075 — 아쿠 에이전트 프레임 추가 시 70%가 아닌 100%로 핏되는 버그 + deps stale-closure 구조 제거

## Problem

에이전트(아쿠)가 슬라이드(top-level frame)를 추가하면 카메라가 공유 규격인
**70%(`FRAME_FIT_FILL`)가 아니라 로드 기본 ~100% 뷰 그대로** 남는다. 수동 추가
경로(`use-item-add.ts`)는 정상 70%로 동작하고 **에이전트 경로만** 깨진다.

### 근본 원인 — `deps` 직접 읽기로 인한 stale closure

`use-aku-agent.ts`의 `runTurn`은 비동기 수명이 길어, stable 값만 담은 의존성
배열(`[commit, editor, getHandle, patchLastAssistant, uploadImages]`)로 **최초
마운트 시 1회 생성된 뒤 고정**된다. 그 안에서 카메라 핏을 트리거하는 콜백을
`deps.onFramesAdded?.()`로 **`deps`에서 직접** 읽었다(`runTurn` 캡처 시점의
`deps` = 최초 렌더 값에 영구 고정).

`onFramesAdded`(= `handleFitAll`, `use-frame-focus.ts`)는 `[document, …]`에
의존하는 `useCallback`이라 document가 바뀔 때마다 새로 생성되고 각자 자기 시점의
`document`를 클로저에 가둔다. `runTurn`이 잡은 건 **최초(빈) 문서를 가둔
handleFitAll**:

- 에이전트가 프레임 추가 → `depsRef.current.getDocument()`(구 `getDocumentRef`)는
  최신이라 frame-count 증가 조건은 통과,
- 하지만 호출된 stale `handleFitAll`은 **초기 빈 문서의 `root.children`을 순회** →
  `found = false` → early return → 핏 자체가 일어나지 않음 → 베이스 ~100% 뷰 유지.

즉 사용자가 본 "100% 핏"은 `fillFactor=1`이 아니라 **70% 재핏이 무산되어 베이스
뷰가 남은 것**이다. (`cameraFitBox`는 항상 `fillFactor=0.7`을 넘기므로 정상 경로로는
100%가 나올 수 없음.) `use-aku-agent.ts:201-205` 주석이 이 증상을 정확히 예고하고
있었다: *"without this an agent-built deck stays at the base ~100% view instead of
the shared 70%."*

### 구조적 문제 (재발 클래스)

`use-aku-agent.ts:246`에는 *"Latest-value refs so the stable callbacks never go
stale"* 주석과 함께 `getDocumentRef` / `getSelectionRef` / `getDesignInfoRef`
**필드별 수동 ref 미러링**이 있었다. 팀은 함정을 알고 있었지만 **새 콜백
(`onFramesAdded`)을 deps에 추가하며 ref 미러링을 빠뜨렸다.** 이 방어책은
- 사람이 매번 기억해야 하는 규율이고,
- `exhaustive-deps` 린트로 못 잡는다(의존성 배열에서 의도적으로 deps를 제외하므로),

따라서 **새 콜백을 추가할 때마다 조용히 깨지는 버그 클래스**다. "매번 신경 쓰지
않아도 되는 구조"를 만드는 것이 이 WI의 핵심 목표다.

## Decision

DR-030 채택 — **단일 `depsRef` 통합**(옵션 A).

- 필드별 ref 3개(`getDocumentRef`/`getSelectionRef`/`getDesignInfoRef`)를 하나의
  `depsRef`(`depsRef.current = deps`, 매 렌더 갱신)로 통합.
- 장수 비동기 콜백 내부의 **모든 volatile dep 읽기**(getter + 콜백)는
  `depsRef.current.*`로 통일. 의존성 배열·`useMemo` identity에 쓰는 stable 값
  (`editor`, `designId`)만 구조분해 유지.
- 규칙 이분화: **"의존성 배열에 들어가는 stable 값 = 구조분해, 콜백 안에서 읽는
  volatile 값 = `depsRef.current`"**. 이로써 deps에 새 콜백이 추가돼도 자동 최신이라
  ref 미러링을 기억할 필요가 없어진다.

치환 지점: `getDocument`(schema 조회·MCP 핸들 주입·frame-count 전/후 비교),
`getDesignInfo`, `getSelection`, 그리고 버그의 직접 원인인 `onFramesAdded` 호출.

## Verification

- `pnpm -C apps/web run typecheck` — green.
- `pnpm -C apps/web exec vitest run src/features/aku` — round-grouping 6 tests green.
- biome: 잔여 2건(370행 의존성 경고 / 535행 `||` 포맷)은 **본 변경과 무관한
  기존 항목**(본 변경 라인: 209, 246–256, 326, 335, 428, 449, 454, 545–546).
- 로직 검증: `depsRef.current`는 매 렌더 갱신되므로 `runTurn`이 매 턴 **최신**
  `handleFitAll`(최신 document 클로저)을 호출 → 추가된 프레임 union을 기준으로 정상
  70% 핏 적용. stale → fresh 로 의미가 동일하거나 더 정확해지는 동작 보존 변경.

### Self-verification 한계 (정직 고지)

에이전트 경로의 full 브라우저 e2e는 라이브 agent 서버(`VITE_AKU_AGENT_URL`) +
토큰 + 실제 모델 호출이 필요해 이 세션에서 끝까지 재현하지 못했다. 구조 변경의
정당성은 (a) typecheck/단위테스트 그린, (b) "최신값 읽기"로의 동작 보존 추론으로
확보. 후속으로 agent-fit e2e(프레임 추가 후 `vm.camera.scale`이 70% 규격에
부합)를 추가하면 회귀를 자동 가드할 수 있다 → Follow-up.

## Follow-up

- [x] **불변식 자동 강제 가드 추가 (2026-06-02)** —
  `apps/web/src/features/aku/agent/use-aku-agent.deps-guard.test.ts`. 소스를
  `?raw`로 읽어 주석 제거 후 `deps.<member>` 직접 접근이 0건임을 단언하는 파일
  한정 아키텍처 적합성 테스트. CI(vitest)에서 차단된다.
  - **전역 biome/ESLint 규칙은 기각**: `deps`는 레포 전역 ~95곳에서 쓰이는 일반
    파라미터 이름이라 전역 구문 금지는 거의 전부 오탐. 불변식이 파일 한정이므로
    파일 한정으로 강제 → CI 차단 효과 동일, 오탐 반경 0.
  - 가드 보강을 위해 렌더 시점 읽기였던 `deps.url`/`deps.token`도 상단 구조분해
    (`url: urlProp`, `token: tokenProp`)로 옮겨 "파일 내 `deps.<member>` 0건"
    규칙을 무모호하게 만듦. `depsRef.current.*`는 정규식이 `deps` 바로 뒤 `.`을
    요구하므로 통과(`depsRef.`는 매칭 안 됨).
  - 가드 자체 검증: 위반 라인(`deps.onFramesAdded?.()`)은 매치, 정당한 패턴
    (`depsRef.current.*`·구조분해·`useRef(deps)`)·주석 멘션은 통과 — vacuous 아님.
- [ ] (선택) agent-fit e2e: 에이전트 프레임 추가 후 카메라 스케일이 70% 규격에
  맞는지 검증(라이브 서버 모킹 필요).

## Links

- DR-030 (단일 `depsRef` 통합 결정).
- WI-052 (아쿠 어시스턴트), WI-065 (`FRAME_FIT_FILL` 70% 공유 핏 규격).
- `apps/web/src/features/aku/agent/use-aku-agent.ts` (수정 대상),
  `apps/web/src/pages/design/hooks/use-frame-focus.ts` (`handleFitAll`),
  `apps/web/src/pages/frame-camera-bridge.ts` (`cameraFitBox` / `FRAME_FIT_FILL`).
