# DR-design-012 — QuickActionBar edge anchor + data attribute

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-012 |
| WI | WI-036 |
| Date | 2026-05-26 |
| Owner | hbpark |
| Component | `@weave/design-system` `QuickActionBar` |
| Triage Decision | **Step 2 — Extend** (기존 primitive 의 minimum API 확장) |

## Triage Walk

| Step | Outcome |
|---|---|
| 1. Reuse | ❌ — 기존 primitive 는 host 가 fixed 위치 mount 가정. edge anchor 로 사용은 host 가 mount 만 하면 되지만 hover target union 의 `[data-quick-actions-bar]` attribute 가 없으면 hover 의 union 인식 불가. |
| 2. Extend | ✅ — primitive 에 `data-quick-actions-bar="true"` attribute + (optional) `anchor` prop 만 추가. 기존 API / visual / 다른 host 의 사용 미변경. |
| 3. Grow | ❌ — 새 primitive 의 도입 불필요. |

## API 확장 (minimum)

```ts
export interface QuickActionBarProps {
  // ...기존 props 유지...

  /** WI-036 — hover target union. 박제 시 root div 에
   *  `data-quick-actions-bar="true"` 가 추가되어 host 의
   *  HoverContext 가 이 attribute 의 ancestor 도 hover 의 연속으로
   *  인식할 수 있다. Default: true (모든 호스트 hover-friendly).
   *  Host 가 명시적으로 false 로 두면 attribute 박제 안 함 (legacy
   *  fixed mount 에서 hover gap 의 영향 없음). */
  readonly hoverTargetUnion?: boolean;
}
```

```tsx
return (
  <div
    {...(hoverTargetUnion ? { "data-quick-actions-bar": "true" } : {})}
    className={...}
    data-testid={testid}
    role="toolbar"
    aria-label="Quick actions"
  >
    {commandIds.map((id) => <span key={id}>{renderItem(id)}</span>)}
  </div>
);
```

## Visual / accessibility 평가

| 측면 | 평가 |
|---|---|
| Visual | 미변경 — class / 배경 / border / shadow / blur 유지. |
| Accessibility | role="toolbar" + aria-label 유지. data attribute 는 ATG 영향 0. |
| Tokens | 미변경. |
| Variants | 미변경 — anchor prop 의 도입은 v1.x. |

## Host wrap 패턴 (DesignPage 의 사용)

QuickActionBar primitive 의 API 확장은 minimum 만. Host 의 mount 위치 변경 (frame edge anchor) 은 `apps/web/src/pages/FrameStage.tsx` 의 NestedFrame 안 absolute mount + counter-scale wrap 의 host 의무 — primitive 의 코드 0 변경.

## 영향 surface

- 기존 사용처 (DesignPage 의 fixed mount) 는 같은 attribute 박제 — hover gap 의 영향 없음 (default 가 true 라도 fixed mount 시 ancestor lookup 의 frame element 부재로 시각적 break 0).
- 다른 host 가 QuickActionBar 사용 시 default true 의 영향 없음 (data attribute 만).

## 결정

**Approved** — primitive 의 minimum 확장 (1 prop + 1 data attribute). Host wrap 의 변경은 `apps/web/src/pages/FrameStage.tsx` 의 의무.

## Links

- WI-036, FR-007, RISK-006.
- WI-027 — QuickActionBar primitive 의 도입.
- 의무: `packages/design-system/src/components/QuickActionBar.tsx`.
