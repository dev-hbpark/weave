# DR-115 — Flavor-fit 에이전트 커맨드 표면 + 핫키 정책 (EditorModeContext 확장)

- Status: ACCEPTED — 사용자 승인("구현진행해") + WI-168 P1~P3 구현 완료
  (2026-06-11; as-built 차이는 §7)
- Date: 2026-06-11
- Related: DR-114 (EditorModeContext §6-G1 열린 정책 집합), WI-167 (chart.add
  리타겟 갭 — 이 DR의 직접 동기), DR-064/WI-095 (전 커맨드 노출 — **본 DR이
  부분 개정**), DR-111 D5 (agent root-add 리타겟), WI-166

## 결정 (사용자 지시 원문 반영)

> "프레젠테이션에서 지원하지 않는 동작이 가능해질 여지를 남기는 건 좋지 않다.
> 슬라이드 페이지와 프레임의 관리 차이를 에이전트에게 따로 알려주는 노력도
> 하고 싶지 않다. 내부 커맨드는 동일하지만 에이전트에게 전달하는 유틸은
> 디자인 모드에 따라 다르게 랩핑되어 전달돼야 하고, 이전 작업처럼 디펜던시로
> 주입해야 한다. 핫키맵도 마찬가지다."

EditorModeContext에 정책 1개를 추가하고(G1: 소비처와 same-change), 핫키는
기존 정책 게이트 패턴을 확장한다:

1. **`agent: AgentSurfacePolicy`** — 에이전트-노출 도구 표면의 flavor별 랩핑.
   내부 커맨드 레지스트리는 단일 유지(Rule 4 / History 계약 불변).
2. **핫키맵** — 별도 `hotkeys` 정책을 **지금은 만들지 않는다** (아래 §5).
   핫키 분기는 기존/신규 정책 필드 게이트로 해소하는 검증된 패턴(V/H ←
   `camera.dragPan`, WI-166 P2)을 따른다. 표현 불가능한 첫 핫키 분기가
   등장하는 순간이 `hotkeys` 정책의 도입 시점(G1).

## 1. 문제 — 가드(교정) 모델의 구조적 한계

WI-153 P4가 도입하고 WI-167이 패치한 transformInput 리타겟은 **사후 교정**이다:

- 에이전트는 여전히 "root에 leaf를 두면 안 보인다 / 최상위 frame = 새
  슬라이드"라는 weave 내부 모델을 프롬프트로 학습해야 한다(시스템 프롬프트
  [페이지 편집] 라인 = 가르치는 비용, 확률적 준수).
- 노출 표면이 flavor 무관 전체 집합(DR-064)이라 **지원하지 않는 동작이 표현
  가능한 채로 남는다** — 가드가 일부를 받아내지만, 가드 등재를 "기억"해야
  하는 구조(WI-167 갭의 재발 클래스: `ROOT_ADD_COMMANDS` 누락).
- 교정은 silent rewrite라 에이전트의 멘탈 모델과 실제 실행이 어긋난다.

## 2. AgentSurfacePolicy — 설계

### 2a. 타입 (editor-mode/types.ts, 소비처는 이것만 import)

```ts
/** 에이전트에게 노출되는 도구 1개 = 내부 커맨드에 대한 어댑터.
 *  exposedName ≠ command 가능(랩핑 도구). mapInput은 순수 함수 —
 *  호스트 런타임 값(활성 페이지 등)은 AgentHostContext 인자로 받는다. */
export interface AgentToolAdapter {
  readonly exposedName: string;
  readonly command: string;            // 내부 weave.* 커맨드 (실행 진실)
  readonly schema?: AgentCommandSpec;  // 노출 스키마/설명 오버레이
  readonly mapInput?: (input: unknown, host: AgentHostContext) => unknown;
}

export interface AgentHostContext {
  readonly rootId: string;
  /** 활성 페이지 id (page-bounded; infinite = undefined). 값의 원천은
   *  InsertionPolicy.containerFor — 정책 간 이중 진실 금지. */
  readonly activeContainerId: string | undefined;
}

export interface AgentSurfacePolicy {
  /** 닫힌 allow-list: 여기 없는 커맨드는 에이전트에게 존재하지 않는다.
   *  string = 무변경 pass-through, adapter = 랩핑 노출. */
  readonly tools: ReadonlyArray<string | AgentToolAdapter>;
  /** flavor별 시스템-프롬프트 단편 (현 하드코딩 pageLine을 흡수). */
  readonly promptFragment?: (host: AgentHostContext) => string;
}
```

### 2b. flavor별 합성 (pieces/agent-surface.ts → modes/*.ts)

- **mixed / canvas-board** = `FREE_AGENT_SURFACE`: 현 노출 전체 pass-through
  (무회귀; DR-064의 "전 커맨드 노출"은 이 flavor들에서는 그대로 유효).
- **slide-deck / doc-page** = `PAGE_AGENT_SURFACE`:
  - `weave.item.add` — 어댑터 노출: 스키마 설명을 "containerId 생략 = 현재
    페이지"로 교체, `mapInput`이 생략/root를 `host.activeContainerId`로
    해석(= WI-153 P4 + WI-167 리타겟 가드의 흡수·디커미션). kind:"frame"
    root-add 형태는 스키마에서 제거 — 새 페이지는 아래 전용 도구로만.
  - **`weave.page.add`** (랩핑 신설, 내부 = `weave.item.add` kind:"frame",
    containerId:root) — "새 페이지/슬라이드 추가"가 도구 이름 자체가 되어
    "최상위 frame = 새 슬라이드"를 **가르칠 필요가 없어진다**.
  - `weave.chart.add` / `weave.preset.insertSlide` — 같은 원리로 어댑터.
  - free-placement 전제 도구(해당 시) 미등재 = 표현 불가.
  - `promptFragment` — 짧은 페이지-편집 안내(현 pageLine 대체, 분량 축소:
    도구가 의미를 운반하므로 설명 부담이 정책→스키마로 이동).

### 2c. 주입 경로 (DR-114 §2b 동일 패턴)

```
DesignPage (컴포지션 루트, editorModeFor(flavor))
  └─ AkuAssistant agentSurface={editorMode.agent} + host ctx (refs)
       └─ useAkuAgent deps
            ├─ makeAgentSurfaceEditor(roundGroup.editor, policy, hostRef)
            │    exposedName → {command, mapInput} 해석 후 내부 exec
            │    (가드 체인 min-size/container/text-box는 그 아래 유지 —
            │     모드-정책이 아닌 LLM 입력 신뢰성 문제라 전 flavor 공통)
            ├─ commands: 정책 allow-list 기반 read-only CommandRegistry 뷰
            │    (브릿지 `commands`는 주입 인터페이스 — façade 가능 확인됨)
            └─ schemas: retargetCommandSchemas({only, rename, patch}, 현
                 WEAVE_COMMAND_SCHEMAS) — 벤더 1급 지원, 누락 키 loud-fail
```

비-React 표면 없음(에이전트 브릿지는 React 훅 안) — 정책은 그래도 순수
데이터+함수로 유지(레지스트리 순수성 게이트).

### 2d. DR-064 개정

DR-064 "커맨드를 숨기지 않는다"는 **flavor 무관 단일 표면 시대의 결정**이다.
본 DR 이후: *mixed/canvas-board에서는 유효 유지*, page-bounded flavor는
allow-list가 표면을 소유한다. 신규 커맨드 추가 시 각 flavor 표면 등재가
명시적 단계가 된다(자동 노출 아님) — 이것이 §1의 "여지를 남기지 않는다"의
구현이며, WI-167 재발 클래스의 구조적 제거다.

## 3. 핫키맵 — 정책 게이트 패턴 (별도 정책은 보류)

조사 결과(2026-06-11): 현존 flavor-분기 핫키는 V/H(핸드툴)뿐이며 이미
`camera.dragPan` 정책 게이트로 해소되어 있다(use-hand-tool.ts `enabled`).
나머지 45개 EDITOR_COMMANDS + DesignPage keydown 리스너는 flavor 무관이거나
역할 정책(WI-163 artboard 게이트)이 이미 흡수했다.

따라서 `hotkeys: HotkeyPolicy`를 **지금 만들면 분기 0건의 죽은 정책**(G1
위반, WI-153에서 3회 기각된 패턴). 대신:

- **규칙**: 핫키의 flavor 분기는 ① 기존 정책 필드가 표현하면 그 게이트로
  (V/H 선례), ② 표현 못 하는 첫 사례가 등장하면 그때 `hotkeys` 정책을
  G1대로 소비처와 same-change로 도입.
- **후보 적재**: Cmd+A 전체선택의 컨테이너 해석(page-bounded에서 root
  children = 페이지들 — 활성 페이지 children이 맞을 수 있음)이 첫 후보.
  단 이는 "핫키맵"이 아니라 선택-범위 의미론이므로 HitPolicy 확장이 먼저
  검토 대상.

## 4. SOLID/GRASP 체크 (solid-grasp-review 요약)

- **OCP / Rule 3+6**: 새 flavor 표면 = 합성 파일의 tools 배열 1개; 신규 도구
  = 어댑터 1개. 소비처(useAkuAgent) 무변경.
- **SRP**: 커맨드(변이 의미) / 어댑터(노출·번역) / 가드(입력 신뢰성) 3책임
  분리 — 현재는 가드 체인이 노출·번역까지 떠안고 있었다.
- **DIP (§2b)**: 소비처는 types.ts 인터페이스만; 합성은 루트에서 수동 주입.
  modeboundarycheck가 빌드-그래프로 강제(기존 게이트 재사용, 신규 게이트
  불필요).
- **Information Expert**: 활성 페이지 해석은 InsertionPolicy가 유일 원천 —
  AgentHostContext는 그 값을 전달만 한다(이중 진실 금지).
- **기각한 대안**: ① 커맨드 레지스트리 자체를 flavor별 포크(변이 레이어
  이원화 — undo/패치/테스트 2배, Rule 4 훼손) ② 스키마 required로 거부
  (에러→재시도 라운드트립 증가, 결정성 하락) ③ 프롬프트 강화만(확률적,
  지금 모델).

## 5. 성장 규칙 (DR-114 §6 준용)

- G1: `agent` 정책은 P1에서 4 flavor 합성과 소비처 전환이 same-change.
- G5: 어댑터 mapInput과 가드 체인에 같은 해석을 중복하지 않는다 — 리타겟
  가드는 어댑터 흡수와 함께 **디커미션**(Decommission Sweep).
- 신규 커맨드 노출 절차: 내부 커맨드 추가 → 각 flavor tools 등재(또는 의도적
  미등재) — 등재 누락은 "노출 안 됨"으로 안전하게 실패.

## 6. 검증 계획

- 단위: 어댑터 mapInput(생략/root/명시/page.add), façade 레지스트리 뷰
  (allow-list 차단·rename 해석), promptFragment.
- 가짜 정책 직접 주입 테스트(DR-114 §2b 패턴 — interaction-mode.test.tsx
  선례).
- e2e: 기존 aku 스펙 무회귀 + slide-deck에서 page.add 경로 1건.
- 게이트 5종 + 기존 비교가능 서브셋 무회귀.

## 7. As-built 노트 (구현 중 확정된 차이, WI-168)

1. **어댑터 `schema`는 함수형** — §2a의 리터럴 `schema?: AgentCommandSpec`
   대신 `schema?: (base: AgentCommandSpec | undefined) => AgentCommandSpec`.
   pieces(editor-mode 모듈)가 앱-레이어 카탈로그(WEAVE_COMMAND_SCHEMAS)를
   import하지 않고 베이스 위 오버레이만 기술 — 모듈 경계(Rule 1) 유지.
   base 부재 시 어댑터가 loud-fail(`requireBase`). 이 함수형이 §2c의
   `retargetCommandSchemas` 역할(only/rename/patch + 누락 키 loud-fail)을
   흡수해 **벤더 유틸은 미사용**.
2. **`tools: "all"` variant 추가** — free-placement 표면을 45개 열거가 아닌
   `"all"`(identity triple: editor/commands/schemas 레퍼런스 동일)로 표현.
   열거식이면 신규 커맨드마다 mixed/canvas-board 등재가 추가 의무가 되는데,
   그 flavor들의 결정은 "전부 노출"(DR-064 유효 유지)이므로 의도를 그대로
   타입에 둔다.
3. **등록 검증 시점: bind가 아니라 `list()`** — bind는 첫 렌더 useMemo에서
   실행되고 커맨드 등록은 useWeaveEditor 이펙트(마운트 후)다. bind-시점
   "unregistered command" loud-fail은 page-bounded flavor 전체를 블랭크
   마운트시켰다(e2e 서브셋이 검출 → 수정). 정적 판정(중복 exposedName,
   스키마 누락)만 bind-시점, 등록 검증은 connect-시점인 `list()`에서
   loud-fail. 정적 드리프트는 `editor-mode/agent-surface.coverage.test.ts`
   (등록 커맨드 전수 triage 강제)가 테스트 레벨에서 닫는다.
4. **`weave.preset.insertSlide`는 pass-through** — §2b는 어댑터 후보로
   적었으나 이 커맨드는 "root에 삽입"이 정답인 페이지-수명주기 커맨드라
   번역할 것이 없다(WI-167 Next의 제외 사례와 동일 판정).
5. **어댑터 5종 확정**: item.add / chart.add / clipboard.paste(활성 페이지
   해석) + item.reparent(root→활성 페이지) + batch(inner-op 번역 — 내부
   batch는 byName 디스패치로 표면을 재진입하지 않으므로 어댑터가 직접
   번역). 노출명 신설은 `weave.page.add` 1건.
6. **e2e page.add 경로는 단위로 대체** — 에이전트 e2e는 small-think 서버
   의존이라 이 환경(no-network sandbox)에서 실행 불가. page.add 경로는
   순수 입력 변환 + façade exec 프록시 단위로 완결 검증(28 tests).
   비교가능 e2e 서브셋 13파일은 기준선 정확 복원(40 passed / 3 known-red).
