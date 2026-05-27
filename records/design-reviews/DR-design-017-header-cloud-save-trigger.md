# DR-design-017 — Header cloud-save trigger (IconCloudUpload + IconCloudCheck)

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-017 |
| Date | 2026-05-27 |
| Owner | hbpark |
| Component | `@weave/design-system` → 2 new icon primitives (`IconCloudUpload`, `IconCloudCheck`) |
| Work item | header manual save trigger (no WI; one-shot UX addition on user request) |
| Triage Decision | **Step 3 — Grew** (new primitives) |

## Triage Walk

| Step | Outcome |
|---|---|
| 1. Reuse | ❌ — design-system icon set 에 cloud / upload / check 를 동시에 표현하는 단일 glyph 없음. `IconRefresh` 가 비슷한 의미장이지만 의미가 "재동기" 로 굳어졌고 (LandingPage 의 cloud bootstrap refresh 가 이미 그 의미로 박제), 새로운 "수동 push" 행위와 충돌. |
| 2. Extend | ❌ — Icon.tsx 의 한 함수에 시각 swap 슬롯 추가는 anti-pattern (Composite + Strategy 위반). idle / saved 두 상태는 *다른 glyph* 이므로 두 primitive 가 자연스럽다. |
| 3. Grew | ✅ — `IconCloudUpload`, `IconCloudCheck` 두 stroke-only primitive 추가. 기존 24×24 그리드 + 1.75 currentColor 라인 컨벤션 그대로. |
| 4. Escape | ❌ — cloud save 는 weave-only UX 가 아니라 향후 agocraft 의 다른 host (resource manager, dashboard) 에서도 재사용 가능. design-system 격상 정당. |

## Context

사용자 요청 (2026-05-27): "헤더에 현재디자인을 서버에 저장하는 버튼을 추가해줘"

배경:
- 기존 auto-save 는 `useWeaveEditor` 가 `editor.changeStream` 을 debounce 한 sink 로 `persistNow` (= `saveDesign` = localStorage + fire-and-forget `pushDesignCloud`) 를 호출하는 구조 (`apps/web/src/document/cloud-sync.ts`).
- debounce window 안에 사용자가 탭을 닫을 가능성이 있고, 느린 네트워크에서 `sendBeacon` fallback 도 race 할 수 있음.
- 명시적 "지금 저장" affordance 가 header 의 design-level chrome cluster (ColorPicker · ThemeSwitcher · Present) 에 자연스럽게 들어가 cognitive load 가 낮음.

## Decision

### 2 새 primitive

```tsx
<IconCloudUpload size={18} />  // idle — cloud + upward arrow
<IconCloudCheck size={18} />   // success flash — cloud + check
```

두 글리프 모두:
- viewBox `0 0 24 24`
- `stroke="currentColor"` + `strokeWidth=1.75` + linecap/join `round` (Icon.tsx 의 `baseProps` 그대로)
- `fill="none"` — header 의 다른 outline icon (Undo / Redo / Cursor / Hand / Plus) 과 동일 tier
- 같은 cloud silhouette (`M7 18a4 4 0 1 1 .8-7.92A6 6 0 0 1 19 11a4 4 0 0 1 0 8…`) 공유 → idle/saved swap 시 outline 자체는 안정, 내부 glyph 만 arrow ↔ check 로 교체. IconButton 의 layout shift 0.

### Host wiring

`DesignPage.tsx` 의 header right cluster (`<div className="flex items-center justify-end gap-2">`):

```
[ColorPicker]  [Theme]  [Save]  [Present ▶]
```

- `IconButton size="sm"` (Undo/Redo 와 동일)
- `AITooltip` context: idle = "현재 디자인 저장", saved = "저장됨", action label "서버로 즉시 저장"
- `data-testid="toolbar-save"` + `data-state={"idle" | "saved"}` (e2e hook + future selector)
- 클릭 → `persistNow()` 호출 + `saveStatus="saved"` flip + 1500 ms 후 `idle` 복귀. timer 는 unmount / 재클릭 시 cleanup.

### 왜 fire-and-forget 인 채로 두는가

`pushDesignCloud` 는 의도적으로 fire-and-forget (cloud-sync.ts §"pushDesignCloud").  실패 시에도 localStorage 사본이 권위 (다음 부트시 cloud 가 stale 이면 LS 가 덮어씀). 따라서 success flash 는 *낙관적* 이며, 사용자에게 "전송 시도가 일어났음" 만 신호.  실패 토스트는 별도 (현재 미구현; 401/500 가 사일런트 = 기존 auto-save 와 동일 정책).

## Tokens / variants

신규 토큰 없음. 기존 `currentColor` 스트로크 + IconButton 의 default surface 토큰 그대로.

## Accessibility

- `aria-label="Save design to server"` (영문, 다른 toolbar 버튼과 일관)
- `AITooltip` 가 scan="dataset" 으로 read-aloud 컨텍스트 제공
- 색맹 분리: idle/saved 의 차이는 glyph (arrow → check) 로 표현. 색 변화에 의존 X

## Risk / open questions

- **Saved 상태 1500 ms 가 짧은가?** Material auto-snack 의 권장 표시 시간은 4-6 s, 그러나 여기서는 "지금 저장됐다" 만 알리고 다음 액션 차단 없음 → 짧은 fading bar 가 informational 으로 충분. 추후 사용자 테스트로 조정.
- **실패 path 의 시각 처리 부재**: 현재 cloud-sync 는 `cloudAvailable=false` 로 silent fallback. 미래 PR 에서 `IconCloudOff` + warn state 추가 가능 (DR-design 별도 발행).
- **Cmd+S 핫키 미연결**: WI-026 CommandMetadata SSOT 에 `design.save` 명령을 등록하면 hotkey + command palette + 이 버튼이 자연스럽게 단일 소스로 합쳐짐. 현재는 버튼 단독.

## Verification

- `pnpm verify` (typecheck + declarativecheck + puritycheck + build) PASS 필요
- 시각: 헤더 우측 cluster 의 IconButton 클릭 → 글리프가 1.5 s 동안 check 로 swap 후 복귀
- 데이터: `pushDesignCloud` POST `/api/designs` 가 즉시 발사되는지 Network 패널 확인

## Linked

- `apps/web/src/pages/DesignPage.tsx` — header right cluster wiring + `handleManualSave` callback
- `packages/design-system/src/components/Icon.tsx` — 두 primitive 정의
- `packages/design-system/src/components/index.ts` — barrel export
- `apps/web/src/document/cloud-sync.ts` — `pushDesignCloud` fire-and-forget 정책 (변경 없음)
- `apps/web/src/document/use-design.ts` — `persistNow` (변경 없음)
