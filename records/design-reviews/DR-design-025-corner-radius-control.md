# DR-design-025 — CornerRadiusControl (Figma식 링크/언링크 모서리 반경)

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-025 |
| Date | 2026-05-30 |
| Owner | hbpark |
| Component | `@weave/design-system` → `CornerRadiusControl` (1 new composite primitive) |
| Work item | [WI-055](../work-items/WI-055-shape-corner-radius.md) — rectangle corner radius |
| Triage Decision | **Step 3 — Grew × 1** (one new composite control) |

## Triage Walk

| Step | 검토 | 결과 |
|---|---|---|
| 1. Reuse | ✓ | `NumberSlider` 단독으로 단일 반경은 되지만, Figma식 "링크 1값 ↔ 언링크 4값" 토글 + 4코너 라벨 입력 묶음은 단일 컨트롤로 존재하지 않음. `TrackSizeEditor`/`AlignmentPad`는 의미가 다름. |
| 2. Extend | ✓ | `NumberSlider`에 prop을 더해 4값 모드를 넣으면 슬라이더의 단일-스칼라 책임을 오염시킴(SRP 위반). |
| 3. Grew | ✅ | `NumberSlider` + `IconButton`(링크 토글) + 4 작은 number 입력을 **합성**한 `CornerRadiusControl` 신규. 내부는 모두 기존 primitive·토큰. |
| 4. Escape | ✗ | 모서리 반경은 향후 다른 컨테이너(프레임 등)·속성창에서도 재사용될 표준 컨트롤 → app-local 일회성보다 공용 primitive가 맞다. |

## 동작 (behavior)

- **링크 모드(기본):** 단일 `NumberSlider`(px). 변경 시 4코너 동일 적용.
- **링크 해제:** 링크 `IconButton` 토글 → tl/tr/br/bl 4개 작은 number 입력 그리드(2×2).
  각 입력은 독립.
- **혼합(멀티셀렉트):** value가 `MIXED`면 placeholder/빈 표시; 호스트가 `MixedBadge`로
  배지. 컨트롤 자체는 표시만, 값 결정은 호스트.
- **commit 패턴:** 슬라이더는 `onValueChange`(transient) + 호스트가 editor.exec로 커밋.
  number 입력은 blur/Enter commit. (NumberSlider 기존 계약 따름.)
- **단위:** **절대 px** (코어 rectangle `cornerRadii` 모델과 1:1). 0..1 비율 아님.

## API (초안)

```tsx
export interface CornerRadiusValue {
  readonly tl: number;
  readonly tr: number;
  readonly br: number;
  readonly bl: number;
}

export interface CornerRadiusControlProps {
  /** 현재 4코너 값. 멀티셀렉트 혼합은 호스트가 단일 대표값으로 평탄화하거나 `mixed`. */
  readonly value: CornerRadiusValue;
  /** 링크 여부(controlled). 미지정 시 내부 상태로 4값 동일 여부를 추론. */
  readonly linked?: boolean;
  readonly onLinkedChange?: (linked: boolean) => void;
  /** 값 변경(transient + commit 동일 시그니처). 호스트가 editor.exec 위임. */
  readonly onChange: (next: CornerRadiusValue) => void;
  readonly mixed?: boolean;
  readonly min?: number; // default 0
  readonly max?: number; // 슬라이더 상한(시각), default 200
  readonly step?: number; // default 1
  readonly className?: string;
}
```

## 토큰 / 접근성

- 새 토큰 없음 — `--radius-sm`, 기존 spacing/typography 스케일 재사용.
- 아이콘: 링크/언링크는 신규 글리프 `IconLink` / `IconLinkOff` 필요할 수 있음
  (Icon.tsx, `SvgRoot` 패턴). 없으면 이 DR에서 2 글리프 추가(Grew × 3 총합).
- 각 입력 `aria-label`: "모서리 반경", "왼쪽 위 모서리" 등. 링크 토글 `aria-pressed`.
- **No emoji** — 링크 토글은 SVG 아이콘으로 첫 커밋부터.

## 비고

- 컨트롤은 rectangle sub-kind에서만 노출(`shape-section.tsx` 가 조건부 렌더). 컨트롤
  자체는 도형 종류를 모름 — 순수 표현 primitive.
