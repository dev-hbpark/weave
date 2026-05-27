# DR-design-018 — Spinner (loading primitive)

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-018 |
| Date | 2026-05-27 |
| Owner | hbpark |
| Component | `@weave/design-system` → `Spinner` (new primitive) |
| Work item | DesignPage LS-miss cloud-fallback (no WI; UX gap surfaced during the cloud-only persistence refactor) |
| Triage Decision | **Step 3 — Grew** (new primitive) |

## Triage Walk

| Step | Outcome |
|---|---|
| 1. Reuse | ❌ — design-system 에 spinner / progress / skeleton primitive 부재. 검색: `grep -ni "spinner\|loading\|skeleton\|progress"` → 0 hit |
| 2. Extend | ❌ — `Icon.tsx` 는 정적 글리프 집합 (currentColor stroke). animation 책임을 거기 합치면 SRP 위반: Icon = 의미 표시, Spinner = 상태 표시 |
| 3. Grew | ✅ — 24×24 SVG 두 path (track + arc) + Tailwind `animate-spin`. 6 라인 컴포넌트, side effect 0, reflect-metadata 의존 없음 (DR-002 트리쉐이킹 3 게이트 통과) |
| 4. Escape | ❌ — loading state 는 weave 의 다른 surface (LandingPage refresh, MediaSrcDialog upload await, PresentPage 진입 등) 에서도 곧 필요. design-system 격상 정당 |

## Context

사용자 요청 (2026-05-27): "blank 잠깐 보임도 spinner로 처리해줘"

배경:
- 직전 turn 에서 useDesign 에 LS-miss → cloud-fallback 경로를 추가 (`fetchDesignCloud` + `hydrateSerializedDesign` + `setDesign`). 그 사이 (~50-300 ms) 사용자에게는 blank Design 이 렌더링됨.
- duplicate / migration 결과를 첫 클릭하는 시나리오에서 시각적으로 "비어 있는 디자인" 으로 오해될 수 있음.
- design-system 차원에서 loading 표시 primitive 가 부재 — 앞으로 다른 surface 도 같은 요구를 가질 것이므로 design-system 격상 정당.

## Decision

### Spinner API

```tsx
<Spinner size={20} className="text-[color:var(--text-strong)]" />
```

```ts
export interface SpinnerProps extends Omit<SVGAttributes<SVGSVGElement>, "children"> {
  readonly size?: number | string; // default 20, mirrors Icon API
}
```

### 시각 사양

- viewBox `0 0 24 24`, stroke-only, `currentColor`
- track: circle r=9 with `strokeOpacity=0.2` (저채도 베이스 원)
- arc: 90° quadrant (`M21 12a9 9 0 0 0-9-9`), `strokeLinecap="round"`
- strokeWidth `2.4` (Icon.tsx 의 `1.75` 보다 굵음 — 작은 사이즈에서도 인지)
- animation: Tailwind `animate-spin` (1s linear infinite)

### Loading overlay 패턴 (DesignPage 한 곳에 인라인)

`absolute inset-x-0 top-12 bottom-0 z-20` + `bg-[color:var(--bg-page)]/85 backdrop-blur-sm` + centered Spinner + 13px 한국어 label. z-20 은 canvas (z-auto) 위 + header (z-30) 아래.

inline 으로 둔 이유: 현재 단 한 호스트 (DesignPage) 만 사용. 두 번째 호출 site 가 등장하면 `LoadingOverlay` primitive 로 별도 DR-design 에서 격상.

## Tokens

신규 토큰 0. 기존 `--bg-page` + `currentColor` + Tailwind utility 만 사용.

## Accessibility

- `<div role="status" aria-live="polite">` — screen reader 가 텍스트 변화를 자동 안내
- 시각 표현 외에 텍스트 라벨 "디자인을 불러오는 중…" 동시 표시
- `aria-hidden` on the SVG (안의 의미는 외부 label 이 전달)
- 회전 애니메이션이 prefers-reduced-motion 사용자에게 거슬릴 가능성 있음 — Tailwind `animate-spin` 은 기본적으로 reduced-motion 안 봄. 후속 PR 에서 `motion-reduce:animate-none` 추가 검토 (현재 turn 의 scope 외)

## Verification

- `pnpm typecheck` PASS
- `pnpm declarativecheck` PASS
- `pnpm test` 198/198 PASS
- `pnpm build` PASS

수동 시각:
- duplicate / migration 결과 첫 클릭 → spinner overlay 등장 → cloud fetch 완료 (~200ms) → editor 정상 렌더
- 기존 LS-hit design → spinner 미등장 (isLoading=false 시작)

## Linked

- `packages/design-system/src/components/Spinner.tsx` — 신규 primitive
- `packages/design-system/src/components/index.ts` — barrel export
- `apps/web/src/document/use-design.ts` — `isLoading` 추가
- `apps/web/src/pages/DesignPage.tsx` — overlay wiring (top-12 inset, z-20)
