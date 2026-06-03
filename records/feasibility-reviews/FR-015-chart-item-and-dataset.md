# FR-015 — Chart item + dataset(데이터 관리 아이템) 분리 모델

| Field | Value |
|---|---|
| ID | FR-015 |
| Date | 2026-06-02 |
| Work item | [WI-077](../work-items/WI-077-chart-item-and-dataset.md) |
| Verdict | **FEASIBLE WITH TRADE-OFFS** → 구현 완료 검증됨 (WI-077 Phase 1–7) |
| Status | Confirmed (2026-06-02 — 빌드+브라우저 검증으로 가설 전부 입증; round-trip/반응성/dangling 확인) |

## Question

차트 아이템을, 데이터를 **별도로 소유하는 "데이터 관리 아이템"(dataset)** 과 분리한
모델로 추가할 수 있는가? 즉:

- 캔버스 위 `chart` 는 비주얼만 담당하고 `datasetId` 로 데이터를 **참조**한다.
- `dataset` 은 비시각(non-visual) 데이터 원천으로, 여러 chart 가 공유하고 한 곳에서
  수정하면 전부 갱신된다.

이 모델이 현재 weave 아키텍처(닫힌 `DomainKind` union, 불변 문서 + ChangeStream,
agocraft 미러 직렬화)와 충돌 없이 성립하는가? 차트 렌더를 검증된 라이브러리로 할 때
트리쉐이킹 게이트는 통과 가능한가?

## 도입되는 새 개념 3가지와 검증

| 개념 | 현재 모델 | 판정 |
|---|---|---|
| **① 비시각 아이템** (dataset) | 모든 `DomainKind` 는 `frame` 을 갖고 캔버스 렌더(`DOMAIN_RENDERERS`/`DESIGN_FRAME_KINDS`/z-order/selection 전부 전제). dataset 은 공간적 존재 없음. | **가능, 단 DomainKind 로 두면 안 됨** — `doc.root.units` 데이터 스토어로 둔다. 선례: `agocraft-mirror.ts` `style.provider` 가 root.units 에 비시각 데이터(테마 토큰)를 싣고 round-trip. dataset 도 동형 → 캔버스 오염 0, 닫힌 union 불변. |
| **② 아이템 간 id 참조** (`chart.datasetId`) | 선례 존재: `HotspotAction.targetId`(`reveal`/`jump-camera`), `HoverEffectBehavior.targetId` 가 다른 아이템을 id 로 참조. | **가능** — 새 메커니즘 아님. 단 참조 **무결성 정책** 필요(아래 trade-off). |
| **③ 참조 반응성** (dataset 수정 → 모든 chart 갱신) | 불변 doc → ChangeStream → React 재렌더. | **공짜** — `weave.dataset.update` 가 새 doc 스냅샷 생성 → 그 스냅샷을 읽는 모든 chart 자동 재렌더. `datasetId` 룩업만 하면 별도 구독 배선 불필요. |

## Findings

| 영역 | 상태 |
|---|---|
| `chart` 새 kind weave-side | **가능** — qr(FR-012)과 동일. agocraft Document 는 attrs 불투명; weave-only kind 가 직렬화 round-trip + `DOMAIN_RENDERERS` 렌더. **agocraft 변경/vendor bump 0**. |
| `dataset` 데이터 스토어 | **가능** — `root.units` 에 `dataset:<id>` unit. `style.provider` 와 동일 경로로 `toAgocraftItem`/`ensureStyleProvider` 옆에 `ensureDatasets` 추가. Unit attrs 는 불투명 JSON → 중첩 표(rows/series) 무손실 round-trip. |
| 데이터 직렬화 | **무손실** — `toAgocraftItem` 이 attrs 를 통째 opaque JSON 으로 전달. chart 의 `datasetId`(스칼라)·dataset 의 `rows`(중첩 배열) 모두 `onUnknown:preserve` 정합. |
| 편집 커맨드 | 신규 `weave.dataset.add` / `weave.dataset.update` / `weave.dataset.remove` 필요 (chart 는 기존 `weave.item.add(kind:"chart")` + `weave.item.update(attrs:{datasetId,chartType,...})` 로 충분). 모든 dataset 변경은 `editor.exec` 경유 → history/undo 보장(CLAUDE.md 문서 변경 규칙). |
| 렌더 라이브러리 | **별도 게이트** — `/evaluate-library` 로 visx vs Recharts 를 3관문(ESM / `sideEffects:false` / no reflect-metadata)으로 확정. 데이터 소유 모델과 **독립**이라 병렬 진행 가능. |
| 에이전트 | `weave-command-schemas.ts` 에 `chart` kind + `weave.dataset.*` 스키마 추가. chart 생성 시 datasetId 미지정 → 인라인 시드 dataset 자동 생성 정책 권장(에이전트 1-스텝 생성성). |
| 결손(발견) | qr 가 `participatesInZorder:false` 로 z-order 제외했듯, chart 의 z-order 참여 여부 + selection-chrome 등록(`use-selection-chrome-registry.ts`) 누락 시 무음 미렌더/미선택. 배선 7지점 체크리스트로 가드. |

## Trade-offs / 한계

- **참조 무결성(dangling):** dataset 삭제 시 chart 의 `datasetId` 가 dangling. 기존 `targetId` 는 dangling 을 no-op 으로 관대 처리 → chart 도 동일하게 **"데이터 없음" placeholder** 렌더(삭제 차단/cascade 금지). qr 빈 data placeholder 와 동일 철학.
- **dataset 편집 UI 위치:** dataset 은 캔버스에 없으므로 ContextualToolbar(선택 기반)로 편집 불가. **별도 데이터 패널**(chart 선택 시 "연결된 데이터셋 편집" 진입, 또는 전역 데이터셋 목록)이 필요 — 신규 UI 표면. design-system triage 대상.
- **라이브러리 번들/벤더 마찰:** weave 는 vendored dep 체인(agocraft/small-think) 사용 → 무거운 트랜지티브 의존(D3 등) 추가가 pnpm/vite 에서 마찰 가능(메모리 기록). Recharts 는 `sideEffects` 불완전 이력 → 게이트 위험. visx 는 모듈러지만 저수준. 미확정 → `/evaluate-library` 로 결론.
- **인라인 vs 분리의 단순성 비용:** qr 류 인라인 대비 개념 1개(참조)·커맨드 3개·UI 패널 1개 추가. 데이터 공유 요구가 실재할 때만 정당화됨 — 사용자 명시 선택(2026-06-02 AskUserQuestion).
- **SSR/직렬화 검증:** 차트 라이브러리가 SVG 출력이면 round-trip/저장 무영향. canvas 출력이면 썸네일/내보내기 경로 별도 검증 필요.

## Verdict

**FEASIBLE WITH TRADE-OFFS.** 데이터 소유 모델(chart kind + dataset root-unit 스토어 +
datasetId 참조)은 현재 아키텍처로 **agocraft 변경 0** 에 성립하며, 세 새 개념 모두 선례
또는 공짜 경로가 있다. 단 (1) 참조 무결성 placeholder 정책, (2) dataset 전용 편집 패널
신설, (3) 렌더 라이브러리 3관문 통과 — 세 트레이드오프를 Engineering Plan 전에 확정해야
한다. 렌더 라이브러리 확정은 이 모델과 독립적인 병렬 결정.

## Links

- 결정: DR-031 (chart kind + dataset 데이터 스토어 모델)
- 선례: FR-012(QR data-driven item), DR-025(line as distinct kind), `domain-kinds.ts`(단일 진실의 원천 레지스트리)
- 후속 게이트: `/evaluate-library`(차트 라이브러리 3관문), design-system triage(chart 렌더 + dataset 패널), `/solid-grasp`(참조 레지스트리 경계)
