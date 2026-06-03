# Decision Record — DR-033 Chart rendering via lazy-loaded ECharts (SVGRenderer)

## Metadata

| Field | Value |
|---|---|
| ID | DR-033 |
| Title | 차트의 **렌더링**을 자체 SVG 어댑터 대신 **ECharts(모듈러 + SVGRenderer)** 로 하고, echarts 를 `React.lazy(() => import(...))` 로 **코드 스플리팅**해 별도 청크에서 온디맨드 로드한다. agocraft 플러그인(RenderableRegistry, canvas2d)이 아니라 **weave-side lazy React 모듈**로 구현한다. DR-031 의 데이터 모델(chart kind + dataset root-unit + 참조)은 **불변**; 이 DR 은 DR-031 의 "외부 라이브러리 미도입 / 자체 SVG 렌더" 부분만 **대체(supersede)**한다. |
| Decision Level | **1 Project-local** — weave-side. echarts 는 일반 npm 의존(벤더 체인 무관). agocraft 변경 0. |
| Owner | hbpark |
| Required approvers | hbpark |
| Consulted | 사용자 (2026-06-02 AskUserQuestion: 「weave-side lazy React 모듈」 + 「SVGRenderer」 명시 선택; "echarts 포함 검토 + 플러그인 + lazy" 요청) |
| Status | **Accepted** |
| Decided on | 2026-06-02 |
| Triggering WI | [WI-077](../work-items/WI-077-chart-item-and-dataset.md) |
| Supersedes | DR-031 § "render library 미도입(자체 SVG)" 부분만 |

## Context

DR-031/WI-077 Phase 1–7 은 차트를 자체 SVG 어댑터(bar/line/pie)로 렌더했고, 외부 라이브러리는
미도입으로 결론냈다. 사용자가 이를 재검토 요청: **ECharts 포함 라이브러리 평가 + agocraft 플러그인
개념으로 추가 + lazy import.**

## 발견 — agocraft 플러그인은 weave 렌더 경로에 안 맞음

조사 결과:
- agocraft `Plugin.setup(ctx).renderables` 의 `RenderableAdapter.render(item, ctx2d)` 는 **canvas2d**
  드로잉 경로다.
- **weave 는 canvas2d Renderer / RenderableRegistry / PluginManager 를 전혀 쓰지 않는다** — 순수
  React `FrameSurface` + `DOMAIN_RENDERERS`(React 컴포넌트)로 렌더한다.
- 따라서 agocraft 플러그인(renderable)으로 등록해도 **weave 화면엔 안 그려진다**(canvas 렌더러용).
- 단 `React.lazy(() => import(...))` 코드 스플리팅은 weave 에 이미 idiomatic(MarkdownMessage,
  cloud-sync). → "모듈화 + lazy 라이브러리"의 **본질**은 weave-side lazy React 모듈로 달성.

## 라이브러리 평가 (3 tree-shaking 게이트 + 번들 + 줌)

| | ESM | sideEffects | 최소 번들 | 줌 적합 | 비고 |
|---|---|---|---|---|---|
| **ECharts** ✅ | ✓ | 모듈러 `use([...])` tree-shake | ~193KB gz (bar/line/pie + grid/legend/tooltip + SVGRenderer) | **SVGRenderer = ✓**(벡터) | 축/범례/툴팁/애니메이션 내장 → "골격 수준" 해소. **lazy 필수**(별도 청크면 main 영향 0). Apache-2.0, 활발 유지. |
| visx | ✓ | ✓ | ~30–50KB gz | ✓ | 게이트 최고지만 저수준(직접 조립 — 자체 SVG 와 노동량 유사). |
| Recharts | △ | 이력상 불완전 | ~95KB gz(D3 끌림) | ✓ | tree-shaking 약 → 3관문 위험. |
| 자체 SVG(기존) | — | — | 0 | ✓ | 의존성 0, 단 모든 차트형·축·범례 직접 유지. |

**결론**: ECharts 의 큰 번들은 **lazy import 가 정확히 해결하는 케이스**(무겁고, 차트가 있을 때만
필요). SVGRenderer 로 줌 선명 + DOM 검증 용이. round-trip 무관(데이터는 dataset unit, ECharts 는
렌더 출력일 뿐).

## Decision

1. **echarts(^6) 모듈러 도입**: `echarts/core` + `echarts/charts`(Bar/Line/Pie) +
   `echarts/components`(Grid/Legend/Tooltip) + `echarts/renderers`(**SVGRenderer**) 를 `use([...])`
   로만 등록(트리쉐이크).
2. **코드 스플리팅**: echarts 참조는 `document/domains/chart/echarts-renderer.tsx` 한 파일에만 두고,
   `ChartBlock` 이 `React.lazy(() => import("./chart/echarts-renderer.js"))` 로만 도달 → echarts 가
   별도 청크(`echarts-renderer-*.js`, 193KB gz)로 분리, 첫 차트 렌더 시 온디맨드 로드. main 번들 영향 0.
3. **ChartBlock = thin shell**: 데이터 해석 + placeholder + 프레임 채움 컨테이너(테스트용 data-attrs:
   `data-chart-type`/`data-chart-rows`/`data-chart-empty`)만 소유. 실제 드로잉은 `<Suspense
   fallback>` 뒤 lazy `EChartView` 에 위임.
4. **순수 option 빌더**(`echarts-option.ts`, echarts-free): `{rows,encoding,chartType,palette,
   showAxis,showLegend}` → ECharts option. chartType→builder 는 registry(Rule 6, no switch).
   단위 테스트는 이 순수 함수에 집중(echarts 미로드).
5. **Decommission**: 자체 SVG 어댑터(bar/line/pie) + chart-type-registry + default-registry +
   그 테스트 제거(렌더는 ECharts 가 전담). `toNumber`/`seriesMax` 는 echarts-option 으로 이전.

## Consequences

- **번들**: main 무변, lazy 청크 ~193KB gz(첫 차트 1회 로드 후 캐시). 차트 없는 디자인은 0 비용.
- **공급망**: echarts(Apache-2.0, 대형·활발). 신규 트랜지티브 의존(zrender). `pnpm-lock` 갱신.
- **줌**: SVGRenderer 로 CSS transform 캔버스 줌에서 벡터 선명(canvas 렌더러였다면 래스터 흐림).
- **테스트 전략 변화**: ECharts 는 useEffect 에서 imperative 렌더 → `renderToStaticMarkup` 로 도형
  카운트 불가. 대신 (a) 순수 option 빌더 단위 테스트, (b) ChartBlock 분기(placeholder/컨테이너/
  Suspense fallback) SSR 테스트(echarts mock), (c) **실제 시각은 e2e**(브라우저에서 echarts svg 마운트).
- **round-trip 무영향**: 데이터는 dataset unit 그대로(DR-031), ECharts 는 저장 안 됨.

## SOLID/GRASP gate (요약)

- Rule 6: chartType→option 은 registry(builder map), ChartBlock/렌더러에 switch 없음.
- 단일 책임: ChartBlock(분기/placeholder) · echarts-option(순수 매핑) · echarts-renderer(imperative
  echarts 수명주기) 분리.
- 낮은 결합: echarts 는 단 한 파일(lazy 경계)에만 의존 → main 번들/타 모듈 비오염.

## Dissent

자체 SVG(의존성 0)도 유효했고 DR-031 에서 그렇게 결정했으나, 사용자가 ECharts(풍부한 기능)+lazy 를
명시 선택. 비용(193KB lazy 청크 + echarts 공급망)은 본 DR Consequences 에 박제. richer 기능 요구가
번들을 정당화. 추후 번들 압박 시 visx(저수준·경량)로 재고 가능.

## Links

- [WI-077](../work-items/WI-077-chart-item-and-dataset.md), [DR-031](DR-031-chart-kind-and-dataset-store.md)(데이터 모델 — 불변), `features/chart-item/ENGINEERING_PLAN.md`
- 구현: `document/domains/ChartBlock.tsx`(shell), `document/domains/chart/echarts-renderer.tsx`(lazy), `document/domains/chart/echarts-option.ts`(순수)
- 선례(lazy): `features/aku/MessageList.tsx`(MarkdownMessage), `document/storage.ts`(cloud-sync)
