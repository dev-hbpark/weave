# Decision Record — DR-031 Chart item kind + dataset(데이터 관리 아이템) 분리

## Metadata

| Field | Value |
|---|---|
| ID | DR-031 |
| Title | 차트를 새 weave-local `DomainKind` `chart` 로 추가하되, **데이터는 chart 가 인라인 소유하지 않고** 비시각 **dataset 데이터 스토어**(`doc.root.units` 의 `dataset:<id>` unit)가 소유하며, chart 는 `attrs.datasetId` 로 **참조**한다. 여러 chart 가 한 dataset 을 공유하고, dataset 수정은 참조하는 모든 chart 를 자동 재렌더한다. |
| Decision Level | **1 Project-local** — weave-side 만. agocraft Document/Unit/attrs 는 불투명(opaque)이라 **agocraft 스키마·렌더·커맨드 변경 0, vendor bump 0**. (DR-025/line 과 달리 cross-project HANDOFF 불필요.) |
| Owner | hbpark |
| Required approvers | hbpark |
| Consulted | 사용자 (2026-06-02 AskUserQuestion: 데이터 소유=「Data-source 아이템 분리」, 렌더=「라이브러리 도입 검토」 명시 선택) |
| Status | **Accepted** |
| Decided on | 2026-06-02 |
| Triggering WI | [WI-077](../work-items/WI-077-chart-item-and-dataset.md) |
| Pairs with | FR-015, FR-012(QR data-driven 선례), DR-025(distinct kind 선례), DR-012(insertable registry), DR-023(selection-chrome ownership) |

## Context

사용자가 차트 아이템 추가를 요청하며 "데이터를 관리하는 아이템의 개념 추가가 필요하다"고
명시. 검토 결과 차트는 qr(FR-012)과 같은 **data-driven 계열**(데이터=원천, 비주얼=파생)
이나, qr 의 인라인 단일 문자열과 달리 **구조화된 표(series/category/value)** 를 가지며
"여러 차트가 데이터 공유 / 한 곳 수정 시 전체 갱신" 요구가 존재.

두 모델을 제시:
- **A. 인라인** — `ChartAttrs.data` 직접 소유(qr 동형). 단순하나 공유/단일수정 불가.
- **B. dataset 분리** — 비시각 데이터 원천을 별도로 두고 chart 가 참조.

사용자는 **B** 를 명시 선택. FR-015 가 B 의 기술 성립성을 **FEASIBLE WITH TRADE-OFFS**
로 확인.

## Decision

1. **새 kind `chart`** (weave-local `DomainKind`; agocraft builtin 아님 — qr 과 동일 취급).
   `ChartAttrs`:
   - `frame: ItemFrame`
   - `datasetId: string` — 참조하는 dataset unit 의 id (dangling 허용)
   - `chartType: "bar" | "line" | "pie" | …` (registry 로 확장)
   - `encoding` — 어떤 컬럼이 카테고리/값/계열인지 매핑
   - 색/축/범례 등 표현 속성
   - dangling/빈 datasetId → **"데이터 없음" placeholder** 렌더(삭제 차단·cascade 금지; qr 빈 data 와 동일 철학).

2. **`dataset` 은 `DomainKind` 가 아니다.** `doc.root.units` 의 `dataset:<id>` unit 으로
   문서가 소유. 선례: `style.provider` unit(테마 토큰)이 동일 경로로 root.units 에 거주 +
   round-trip. `DatasetUnit` attrs: `{ name, columns, rows }`(불투명 JSON, 무손실 직렬화).
   - `ensureDatasets`(또는 `ensureStyleProvider` 패턴 확장)로 로드 시 보정.
   - **캔버스 비렌더 / z-order 비참여 / selection 비대상** — 비시각.

3. **신규 커맨드**(모두 `editor.exec` 경유 → history/undo):
   - `weave.dataset.add` → 새 dataset unit 생성, 새 id 반환
   - `weave.dataset.update` → rows/columns/name 패치 (참조 chart 자동 재렌더)
   - `weave.dataset.remove` → unit 제거 (참조 chart 는 placeholder 로 graceful)
   - chart 자체 생성/수정은 기존 `weave.item.add(kind:"chart")` / `weave.item.update` 재사용.

4. **참조 반응성은 별도 배선 없음.** 불변 doc → ChangeStream → React 재렌더 경로가 이미
   chart 의 `datasetId` 룩업을 매 렌더 수행 → dataset unit 변경 시 자동 갱신.

5. **렌더 라이브러리는 이 DR 에서 확정하지 않는다.** `/evaluate-library` 로 visx vs
   Recharts 를 3관문(ESM / `"sideEffects": false` / no reflect-metadata)으로 비교 후 별도
   DR. 데이터 소유 모델과 독립. (자체 SVG 폴백도 후보 — qr-matrix 선례.)

6. **dataset 편집 UI**는 ContextualToolbar(선택 기반) 밖 — chart 선택 시 "데이터셋 편집"
   진입점 + 별도 데이터 패널. design-system triage(신규 표면) 대상.

7. **배선 7지점**(qr 등록 지점과 동일): `types.ts`(DomainKind+ChartAttrs+ItemAttrsByKind),
   `domain-kinds.ts`(SPECS 1엔트리), `domains/ChartBlock.tsx`, `commands.ts`(+dataset 커맨드),
   `toolbar/sections`(chart-section + index), `use-selection-chrome-registry.ts`,
   `aku/agent/weave-command-schemas.ts`. + dataset 스토어/커맨드/패널은 추가.

구현 단계·검증은 `features/chart-item/ENGINEERING_PLAN.md`(생성 예정).

## Why this option

- 사용자 명시 선택(공유/단일수정 요구를 트레이드오프 인지 후 채택).
- **agocraft 변경 0** — attrs/Unit 불투명 + `style.provider` root-unit 선례 → 비시각 데이터
  스토어가 기존 직렬화/로드 경로에 그대로 안착(qr 가 보여준 weave-side 완결성).
- id 참조는 `targetId`(hotspot/hover) 선례로 새 메커니즘 아님; 반응성은 불변-doc 경로로 공짜.
- 데이터(원천)와 차트(표현) 분리가 직렬화·확장(같은 데이터 여러 차트형/대시보드)에서 깔끔.

## Consequences

- **새 비시각 개념**: "DomainKind 아닌, 문서가 소유하는 데이터 스토어"가 코드베이스에 처음
  등장 → `root.units` 거주·로드 보정·삭제 graceful 을 일관 처리(문서화 필수).
- **참조 무결성**: dangling datasetId placeholder 정책을 ChartBlock + 테스트로 못박음.
- **신규 UI 표면**: dataset 편집 패널 — design-system triage + DR-design 트리거.
- **에이전트**: chart 1-스텝 생성을 위해 datasetId 미지정 시 인라인 시드 dataset 자동 생성
  정책 권장(스키마에 명시).
- **라이브러리 미정**: 번들/round-trip 리스크는 `/evaluate-library` 결론까지 open.
- **범위**: 다단계(데이터 스토어 + 커맨드 + chart kind + 패널 + 라이브러리). 단계별 e2e 회귀.

## SOLID/GRASP gate (요약)

- **Rule 6**: chartType 분기는 registry/adapter(차트형 1종=1어댑터), switch 금지.
- **OCP**: 새 kind = `domain-kinds.ts` SPECS 1엔트리 + 어댑터 등록, downstream per-kind 분기 0.
- **DRY/낮은 결합**: dataset 룩업/참조 무결성은 단일 헬퍼(`resolveDataset(doc, id)`)로 중앙화.
- **무손실 직렬화**: dataset unit + chart attrs `onUnknown:preserve` round-trip 테스트가 게이트.
- 정식 진행 전 `/solid-grasp` 스킬로 참조 레지스트리 경계 1차 필터 후 Engineering Plan 임베드.

## Dissent

없음(초안). 엔지니어 권고로 인라인(A, 저비용·qr 동형)을 제시했으나 사용자가 데이터 공유
요구를 들어 분리(B)를 명시 선택. 비용(개념+1, 커맨드+3, 패널+1)은 FR-015 / 본 DR Consequences
에 박제. 데이터 공유 요구가 끝내 미검증으로 남으면 "인라인 + 승격 경로"(AskUserQuestion 3안)로
다운스코프 가능 — Status=Proposed 동안 재고 여지.

## Acceptance note (2026-06-02)

Accepted after full implementation (WI-077 Phase 1–7). Every claim in this DR
held up in build + browser:
- **agocraft 변경 0 / vendor bump 0** — confirmed; dataset is a `root.units`
  unit, chart is a weave-local kind, both opaque to agocraft.
- **참조 반응성 공짜** — confirmed live (dataset edit reflows all referencing
  charts, e2e).
- **round-trip 무손실** — confirmed via the storage serializer (chart attrs +
  dataset unit + Korean column names survive save→load; `round-trip.test.ts`).
- **dangling → placeholder** — confirmed (dataset remove → chart placeholder,
  no crash, e2e).
- One refinement vs the plan: the agent surface does NOT add `chart` to
  `weave.item.add`'s kind enum — `weave.chart.add` is the sole creation path
  (avoids the empty-placeholder footgun). See ENGINEERING_PLAN Phase 6.

Render library: ~~ChartBlock ships self-rendered SVG adapters~~ — **superseded by
[DR-033](DR-033-chart-rendering-lazy-echarts.md)** (2026-06-02): rendering moved to
lazy-loaded **ECharts (SVGRenderer)**, code-split into its own chunk. The DR-031
**data model is unchanged** (chart kind + dataset root-unit + `datasetId`
reference + round-trip); only the rendering path changed. The self-SVG adapters
were decommissioned in the same change.

## Links

- [FR-015](../feasibility-reviews/FR-015-chart-item-and-dataset.md), [WI-077](../work-items/WI-077-chart-item-and-dataset.md), `features/chart-item/ENGINEERING_PLAN.md`, [DR-design-029](../design-reviews/DR-design-029-chart-icon-and-section.md)
- 선례: FR-012 / `domains/QrBlock.tsx`(data-driven), `agocraft-mirror.ts` `style.provider`(root-unit 비시각 데이터), `types.ts` `HotspotAction.targetId`(id 참조)
