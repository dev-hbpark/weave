# WI-065 — Shape ↔ line conversion UI (break at vertex / close endpoints)

## Problem

사용자: ① "도형의 특정 꼭지점의 연결을 끊어서 선으로 만들기", ② "자유선·자유곡선의 양끝점을 붙여서 일반 꼭지점으로 변경하고 도형으로 만들기". 두 동작은 `shape` ↔ `line` KIND 의 상호 변환(서로 역연산)이다.

## Decision (user directives, 2026-06-01 AskUserQuestion)

- 기능1 대상: **모든 도형**(파라메트릭은 명시적 꼭지점으로 자동 변환 후 끊기).
- 끊기 의미: **고리를 그 꼭지점에서 연다**(모든 꼭지점 유지, 인접 닫힘 엣지 1개 제거 — 일러스트 "cut path at anchor").
- 실행 UI: **꼭지점 우클릭(기능1) + 항목 우클릭(기능2)**.
- 끝점 잇기 시맨틱 변천(사용자 피드백 2회): "항상 하나로 병합" → ("크기 이상" 보고) "가까울 때만 병합" → 최종 **"두 끝점을 현재 위치에 유지한 채 연결만"**(사용자 지정, 병합 없음). 변환 후 프레임 refit. 코어 변경은 DR-031 / WI-029.
- id 정책: 변환 결과는 **새 id**(클립보드 cut+paste 와 동일, 안전).

코어 변환 로직·결정은 agocraft **DR-031** / **WI-029** (KIND 변환 = `[item.remove, item.create]` 1 트랜잭션 + 새 id, `outlineVertices` 어댑터). 본 WI 는 weave 의 명령 등록 + UI + agent 노출.

## Changes

- **명령 등록** (`document/commands.ts`): `weave.shape.breakToLine`({itemId, vertexIndex?}) / `weave.line.closeToShape`({itemId}) — agocraft kit(`createBreakShapeToLineCommand`/`createCloseLineToShapeCommand`)에 weave 어휘로 위임. (모든 doc 변이는 `editor.exec` 경유 — CLAUDE.md History 규칙.)
- **꼭지점 우클릭** (`selection-chrome/poly-vertex-handle.tsx`): 정점 핸들에 `onContextMenu` → `onBreakAtVertex(itemId, idx)`(closed poly VM 에만 주입; line VM 은 미주입). DesignPage 가 breakToLine 실행 후 반환 id 로 재선택(`selectFrameRef`).
- **항목 우클릭** (`pages/DesignPage.tsx` `FrameContextMenu`): 선택 항목의 변환 가능성을 core `canBreakShapeToLine`/`canCloseLineToShape` 로 게이트 → "선으로 끊기"(도형, vertexIndex 0) / "끝점 이어 도형으로"(선). 실행 후 새 id 재선택.
- **Decommission**: `document/migrate-shape-to-line.ts` 의 로컬 `convertFillToStroke` 제거 → core `fillUnitsToStrokeUnits` 재사용(단일 소스).
- **Agent 노출** (`features/aku/agent/`): `weave-command-schemas.ts` 라벨 + inputSchema 2종 추가; `weave-capabilities.ts` 의 shape/line 설명에 변환 명령 안내 추가.

## Design System Triage (Build step 6)

결정: **reuse (트리 1단계)**. 추가 메뉴 행은 기존 `@weave/design-system` `ContextMenuItem`/`ContextMenuSeparator` primitive 만 사용 — 신규 primitive/token/theme 없음, app-local CSS 없음. → 디자인 리뷰(DR-design) 불요.

## Verification

- weave `tsc` clean. 단위: `document/commands.test.ts` 변환 블록(등록·remove+create·새 id·invalid-vertex-index·close). `migrate-shape-to-line.test.ts` 회귀 0. **85 docs tests green**.
- **e2e (Continuous Self-Verification)**: `e2e/shape-line-convert.spec.ts` — (1) closed poly 정점 우클릭 → line(새 id, 4점 유지) → Cmd+Z 로 shape 복원, (2) free line 항목메뉴 "끝점 이어 도형으로" → closed poly(3점) → Cmd+Z 로 line 복원. **2/2 green** (live runtime).
- 재벤더: agocraft 전 패키지 repack + `pnpm install`(새 코어 심볼 반영). 부수: agocraft `agent-client` 의 `@small-think/client` file: 경로(`../../.vendor/...`)가 weave 루트 기준 `weave/.vendor/` 로 해석되어, 기존 `apps/web/vendor/small-think/` tarball 을 `weave/.vendor/` 로 복사해 설치 통과 (vendoring 경로 취약점 — 후속 정리 대상).

## Links

- agocraft DR-031 / WI-029 (코어 변환).
- 선행: WI-062(line kind) · WI-057(poly vertex handles) · WI-039(FrameContextMenu).
