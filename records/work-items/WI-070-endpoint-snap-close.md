# WI-070 — Endpoint snap-to-close (drag a line's endpoint onto the other end → shape)

## Problem

선의 두 끝점을 이어 도형으로 만드는 기능(WI-065 우클릭 메뉴)은 있으나, 사용자: **끝점을 Option(Alt)으로 자유 이동하다가 반대쪽 끝점 가까이 가면 스냅되어 붙고, 놓으면 닫힌 도형이 되게**. 추가로 스냅은 일회성이 아니라 **앞으로의 정렬 가이드·아이템 등간격·변 중앙·그리드까지 한 메커니즘으로** 받쳐야 함.

## Decision

공용 스냅 엔진(agocraft DR-034)을 코어에 두고, weave 는 그 **첫 소비자/제공자**로 끝점-닫기를 구현(3-시임: provider → engine → consumer).

- **코어(agocraft DR-034)**: `@agocraft/core/snap` — `resolveSnap`(radial point / axis vline·hline, 6px) + `createSnapProviderRegistry`. `closeLineToShapeSerialized` + `weave.line.closeToShape` 에 **`fuseEndpoints`** 추가(닫기 전 끝점 1개 드롭; fuse 후 <3점이면 거부).
- **provider** `selection-chrome/endpoint-snap-provider.ts`: 소비자가 `ctx.extra.snapClose`(반대 끝점 화면좌표 + 인덱스)를 주면 `opposite-endpoint` point 타깃 반환. `SNAP_PROVIDERS`(`snap-registry.ts`) 모듈 싱글턴에 등록(host import 시 side-effect).
- **consumer** `poly-vertex-handle.tsx` `beginVertexDrag` sink:
  - `update`: **끝점 + free-move(Alt) + ≥4점 + onCloseBySnap 존재**일 때만 `collectTargets`→`resolveSnap`, hit 시 드래그 점을 반대 끝점에 스냅하고 `snapFeedback` 스토어에 push. (≥4 → fuse 후 ≥3 꼭지점 보장.)
  - `commit`: hit(`opposite-endpoint`) 있으면 `deps.onCloseBySnap(itemId)`. `cancel`/`commit` 모두 피드백 clear.
- **피드백**: `snap-feedback.ts`(vertex-selection 패턴 tiny store) + `SnapFeedbackLayer.tsx`(body 포털 SVG, pointer-events none, guide 렌더 — Phase 1 point, Phase 2 vline/hline 그대로 재사용). 반대 끝점 핸들은 `data-snap-target` 으로 will-fuse 하이라이트.
- **host** `DesignPage`: line VM 에 `onCloseBySnap` → `weave.line.closeToShape {fuseEndpoints:true}` + 새 id 재선택. provider side-effect import + `<SnapFeedbackLayer/>` 마운트.

## Scope

- **Phase 1(이번)**: 엔진/레지스트리/피드백 + 끝점-닫기 1개 consumer/provider.
- **Phase 2(시임만)**: 정렬 가이드·등간격·변중앙·그리드 provider + 아이템-이동 consumer. **코어/엔진/피드백 무변경**으로 추가.

## Undo 모델

스냅-닫기는 두 트랜잭션: (1) 드래그 업데이트(mergeKey 로 1 undo), (2) closeToShape(remove+create). 따라서 Cmd+Z 1회 → 스냅된(열린) 원본 line 복원, Cmd+Shift+Z → 도형 재적용. 기존 메뉴-닫기 UX 와 동일.

## Verification

- e2e `line-endpoint-snap-close.spec.ts`(3): 4점 line Alt+끝점→반대끝점 스냅(하이라이트+overlay) → release → `shape:closed:3`(fuse) → Cmd+Z `line:원본id` → Cmd+Shift+Z `shape:true`; 임계값 밖 release → 미변환(line, 4점); 3점 line → 스냅 미발동.
- 회귀: agocraft core 763 unit + 단위 snap 15 + fuse 케이스 green; weave 334 unit green; tsc·biome(경고만)·prod build green.
- 기존 declarativecheck 실패는 `migrate-shape-to-line.ts`(본 WI 미변경, HEAD 기존 부채) — 이번 변경과 무관, 별도 처리 대상.

## Links

- 코어 결정: agocraft DR-034(스냅 엔진), agocraft DR-031(shape↔line 변환 — fuse 확장 대상).
- 결정: 이 프로젝트 DR-026(끝점 스냅-닫기 UX·임계값·fuse).
- 선행: WI-065(변환 UI), WI-066(role 레지스트리), WI-067/DR-032(handle 파이프라인), DR-024(프레임 refit), DR-025(line kind).
- 인프라: `apps/web/scripts/repack-vendor.sh` 가 비-@agocraft override(@small-think/client)를 보존하도록 수정(기존 reset-to-{} 버그 정정).
