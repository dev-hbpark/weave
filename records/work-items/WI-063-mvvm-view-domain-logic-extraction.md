# Work Item — WI-063

## Metadata

| Field | Value |
|---|---|
| ID | WI-063 |
| Title | MVVM remediation — DesignPage/도메인 컴포넌트의 도메인 계산을 순수 모듈/VM으로 추출 |
| Owner | hbpark |
| Status | In Progress |
| Severity | P1 |
| Created | 2026-06-01 |
| Target date | 2026-06-30 |
| Closed | — |

## Summary

[AUDIT-006](../audits/AUDIT-006-2026-06-01-mvvm-layer-separation.md) MVVM 전수검사에서 발견된 "도메인 *계산*이 View에 거주" 위반(F-1/F-2/F-3/F-5)을 해소한다. 구조적 흐름(모든 변경 `editor.exec` 경유)은 무손상이므로, 작업은 **순수 계산 로직을 View `.tsx`에서 순수 `.ts` 모듈 또는 VM으로 이동 + 단위 테스트 부여**에 한정한다. 동작 변경 없음(behavior-preserving refactor).

## Scope

### In scope

1. **F-1a 좌표 투영 추출** — `DesignPage.tsx`의 `screenToDesign`/`designToHost`가 복붙하고 있는 scale/origin 도출을 순수 모듈 `document/coordinate-projection.ts`로 추출(테스트 포함). 컴포넌트는 DOM 샘플링(View 관심사)만 보유, 수학은 위임.
2. **F-1b 배치 계산 추출** — `computeAddGeometry`의 순수 코어(viewport/frame box → frame ratio + font fill)를 `document/add-geometry.ts`로 추출(테스트 포함).
3. **F-2a TextBlock auto-resize** — `domains/TextBlock.tsx`의 content-fit 비율/임계값 판정을 VM-side 파생으로 이관, 렌더러는 측정값만 보고.
4. **F-2b MediaSrcDialog ingest** — `toolbar/MediaSrcDialog.tsx`의 검증+업로드/영속화를 `ingestMedia()` 서비스 + resource-store 훅으로 분리.
5. **F-3 poly-vertex 기하학** — `selection-chrome/poly-vertex-handle.tsx`의 순수 기하학을 `poly-vertex-geometry.ts`로 추출(테스트 포함).

### Out of scope

- F-5 잔여(MED/LOW) 항목은 별도 후속(이 WI의 패턴 확립 후).
- agocraft 측 항목([AUDIT-003](../../agocraft/records/audits/AUDIT-003-2026-06-01-mvvm-layer-separation.md))은 별 트랙.

## Approach / Verification

- 각 슬라이스는 behavior-preserving: 추출 모듈에 단위 테스트, 컴포넌트는 위임만. `apps/web typecheck` + `vitest` green 게이트.
- 호출처 인터페이스(`screenToDesign(clientX,clientY)` 등) 시그니처 유지하여 호출부 변경 최소화.
- 가능 시 기존 e2e(`apps/web/e2e/*.spec.ts`)로 Continuous Self-Verification.

## Progress log

- 2026-06-01 — WI 발행. F-1a(좌표 투영 추출) 착수.
- 2026-06-01 — **F-1a 완료**. `document/coordinate-projection.ts` 신규(순수 basis 도출 + client↔design + designToHostPx), 단위 테스트 7건(round-trip inverse 포함). `DesignPage.screenToDesign`/`designToHost`가 복붙하던 scale/origin 수학을 모듈에 위임 — DOM 샘플링만 View에 잔류. typecheck exit 0, document 스위트 294건 green.
- 2026-06-01 — **F-1b 완료**. `document/add-geometry.ts` 신규(`computeAddFrame`: 해석된 placement → frame + one-line 폰트 fill), 단위 테스트 4건. `DesignPage.computeAddGeometry`의 순수 산술을 위임, DOM/모델 해석(viewport corners / `absoluteFrameBox`)만 잔류. typecheck exit 0, document 스위트 298건 green, 신규 4파일 biome-clean.
- 2026-06-01 — **F-3 완료**. `selection-chrome/poly-vertex-geometry.ts` 신규(순수 커널: `parseRotationFromTransform`, `recoverUnrotatedSize`, `localToScreen`/`screenToLocal`, `refitFrameToPoints`, `endpointSimilarityScreen`), 단위 테스트 14건(local↔screen round-trip, 45° 특이점, DR-024 refit, similarity scale+rotate). `poly-vertex-handle.tsx`는 DOM 읽기(`frameGeom`의 getComputedStyle/querySelector/offsetWidth)와 JSX만 잔류, 수학은 커널 위임. typecheck exit 0, document 스위트 312건 green. biome: 변경 파일 error/warning **감소**(HEAD 2err/27warn → 1err/25warn, 잔여는 기존 항목·새 유입 0).
- **F-1/F-3(순수 추출 클러스터) 완료.** 누계: 신규 모듈 3 + 테스트 25건. 남음: F-2a(TextBlock auto-resize→VM 이관), F-2b(MediaSrcDialog ingest 서비스 분리) — VM/서비스 경계 이동이라 상대적 고위험, 체크포인트 후 진행.
