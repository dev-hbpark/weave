# WI-172 — 에이전트 차트 크래시 방어 (ECharts "Invalid data provider" 클래스)

- Status: DONE (2026-06-11)
- Origin: 사용자 리포트 — 끊김 시나리오 재테스트 중 "에러가 발생하고 잇어" +
  콘솔 덤프: `[aku exec ✓] weave.chart.add` 직후 `Uncaught Error: Invalid
  data provider.` ×2 → `<EChartView>` 트리 언마운트 → 이후
  `[aku exec ✗] weave.item.update` ×2, `[aku exec ✗] weave.item.add` 연쇄 실패
- Related: DR-031(dataset root-unit), DR-032(lazy ECharts), DR-036(encoding),
  WI-092(static interaction), WI-167/169(에이전트 chart.add 레일)

## 진단

### 크래시 메커니즘 (vendored echarts@6.1.0 소스 + node 프로브로 확정)

`SeriesData.initData`(SeriesData.js:321)는
`isSourceInstance(data) || isArrayLike(data)`가 아니면 데이터를 **이미 만들어진
provider로 간주**하고, `DataStore.initData`가
`isFunction(provider.getItem) && isFunction(provider.count)` assert에서
"Invalid data provider"를 던진다. 즉 **시리즈 data에 배열이 아닌 plain
object/number가 들어가면 무조건 이 에러**. (배열, `{value}` datum, 문자열,
null, 중첩 배열은 통과 — 프로브로 검증.)

### 입력 구멍 2개 + 폭발 반경 구멍 1개

1. `normalizeDatasetPayload`가 **shape 검증을 전혀 안 함** — rows가 비배열,
   엔트리가 null/배열/원시값, 셀이 객체여도 그대로 커밋.
2. `weave.dataset.update`의 declarative shallow-merge가 에이전트 데이터를
   **정규화 없이** 적용.
3. EChartView의 setOption 이펙트에서 throw → **에러 바운더리가 없어** React가
   DesignPage 트리 전체를 언마운트 → 에디터 컨텍스트가 사라져 이후 모든
   에이전트 exec이 연쇄 실패. (크래시 한 번이 캔버스 전체 + 에이전트 턴을
   죽이는 게 진짜 피해.)

### 미확정 잔여

- **정확한 트리거 페이로드는 복구 불가** — 콘솔이 `weave.chart.add Object`로
  접혀 있었음. 퍼징 결과 `buildChartOption`은 대부분의 기형 입력에 견고하나
  **rows에 null 엔트리**가 섞이면 빌드 단계 TypeError("Cannot read properties
  of null"). 사용자 크래시는 echarts 내부 assert였으므로 별개 형상일 수 있음.
- 차선 가설: vite dep 재최적화로 인한 **echarts 모듈 이중 사본**
  (`isSourceInstance`가 `instanceof`라 사본이 다르면 오판; deps_temp 디렉터리
  존재 + 스택의 `?v=` 혼재 — 결정적이지 않음). dev 전용이며 3층 방어 중
  렌더층 catch가 이 경우도 막는다.

## Fix — 3층 방어 (defense-in-depth)

1. **커맨드 경계** (`dataset-store.ts`, `commands.ts`):
   `sanitizeCell`(원시값+유한수만, 그 외 ""), `sanitizeDatasetRows`(비배열→[],
   null/배열/원시 엔트리 드랍), `sanitizeColumns`(string 또는 `{name:string}`만)
   를 `normalizeDatasetPayload`에 내장 — chart.add/dataset.add/dataset.update
   전부 이 게이트를 통과. `migrateDatasetColumns`는 `{name}`만 있는 컬럼에
   type을 추론해 채움. dataset.update의 declarative merge도
   `normalizeDatasetPayload`로 래핑.
2. **옵션 빌더 경계** (`chart-types.ts`, `echarts-option.ts`):
   `buildChartOption`이 `sanitizeRenderRows`로 rows를 정제한 `safeInput`으로
   빌드 — 14개 빌더 전부 + **이미 저장된 오염 문서**도 보호. 미등록 aggregate
   이름(에이전트 오타 "avg" 등)은 sum 폴백 (`undefined(...)` 호출 방지).
3. **렌더 경계** (`echarts-renderer.tsx`, `ChartErrorBoundary.tsx`,
   `ChartBlock.tsx`): `chart.setOption` try/catch — 실패 시 `chart.clear()` +
   **실패한 option 객체를 console.error로 로깅**(다음 리포트가 정확한 형상을
   가져오도록) 후 빈 차트 유지. 그 외 모든 렌더 예외는 새
   `ChartErrorBoundary`(React 강제 클래스 베이스 — `.inheritance-allow` 등재)
   가 해당 차트 아이템 1개만 "차트 — 표시 오류" 플레이스홀더로 격리 — 캔버스와
   에이전트 턴은 살아남는다.

## 검증

- 신규 테스트: `dataset-store.test.ts`(shape 게이트 5건),
  `dataset-commands.test.ts`(dataset.update 오염 페이로드 정규화),
  `chart-types.test.ts`(오염 rows에서 14타입 전부 시리즈 data가 배열),
  `echarts-option.test.ts`(미등록 aggregate 폴백),
  `ChartErrorBoundary.test.tsx`(jsdom 클라이언트 렌더 — SSR은 바운더리 미지원).
- 전체 vitest 104 파일 / 1074 green, tsc clean, biome clean(내 범위 —
  `agent-surface.ts`의 useLiteralKeys red는 타 세션 pre-existing),
  5게이트(tokencheck/declarativecheck/puritycheck/inheritancecheck/
  modeboundarycheck) green.
- 임시 퍼징 하니스(`__crash-probe.test.ts`)는 진단 후 삭제 (Decommission).

## 잔여 / 후속

- setOption catch가 로깅하는 option 덤프가 재발 시의 정확한 형상 증거.
- echarts 이중 사본 가설은 재발 시 `?v=` 해시 비교로 판정 (dev 전용).
- 에이전트 스키마(`weave-command-schemas.ts`)의 dataset 설명에 행 형상 예시는
  이미 있음 — 모델이 어겨도 이제 게이트가 받아낸다.
