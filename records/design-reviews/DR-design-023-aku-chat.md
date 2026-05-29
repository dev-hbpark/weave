# DR-design-023 — Aku chat composer primitives (Textarea + send icon)

## Metadata

| Field | Value |
|---|---|
| ID | DR-design-023 |
| Date | 2026-05-30 |
| Owner | hbpark |
| Component | `@weave/design-system` → `Textarea` (new primitive) + `IconArrowUp` (Icon set 추가) |
| Work item | WI-052 (아쿠 — design-aware chat agent) |
| Triage Decision | **Step 3 — Grew** (Textarea 신규 primitive) + **Step 2 — Extend** (Icon set 1 글리프) |

## Triage Walk

| Step | Outcome |
|---|---|
| 1. Reuse | 부분 — Aku 패널 자체는 기존 primitive 재사용: `Panel`(floating) + `IconButton`/`Button` + `Spinner` + `Icon`(`IconSparkle` 런처, `IconClose` 닫기, `IconImage` 이미지 첨부 — 모두 존재) + 토큰. 채팅 버블/스트리밍 텍스트/이미지 썸네일은 feature-local 조합(재사용 primitive 아님). |
| 2. Extend | ✅ (icon) — 전송 버튼용 위쪽 화살표 글리프가 Icon set 에 부재(`IconShapeArrow`는 도형, `IconChevron*`는 메뉴용). `Icon.tsx` 의 동일 `SvgRoot` 패턴으로 `IconArrowUp` 1개 추가 = Extend. |
| 3. Grew | ✅ (Textarea) — multiline 텍스트 입력 primitive 부재. 현존 `TextField` 는 `<input>` 단일행 전용. composer 는 여러 줄 prompt + Shift+Enter 줄바꿈이 필요. `TextField` 에 multiline 분기를 넣으면 input/textarea 두 책임 혼재(SRP 위반) → 별도 `Textarea` primitive 로 격상. |
| 4. Escape | ❌ — multiline 입력은 Aku 외에도(향후 노트/설명/alt-text 등) 재사용 가치가 분명. app-local lookalike 로 두면 design-system 표면이 갈라짐 → 격상 정당. |

## Context

WI-052: weave 캔버스에 떠 있는 어시스턴트 "아쿠" 추가 — 플로팅 런처 → 확장 패널(프롬프트 composer + 스트리밍 응답). composer 는 여러 줄 입력 + 전송 버튼이 필요하다. design-system 에 multiline 입력 primitive 와 전송(위 화살표) 아이콘이 없어 이 둘만 격상한다. 나머지 UI 는 전부 기존 primitive + 토큰 재사용.

## Decision

### `Textarea` API (TextField 미러)

```tsx
<Textarea label="아쿠에게…" rows={2} value={text} onChange={…} />
```

```ts
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly label?: ReactNode;   // TextField 와 달리 optional — composer 는 시각 라벨 없이 placeholder 사용
  readonly hint?: ReactNode;
  readonly errorText?: ReactNode;
}
```

- `TextField` 와 동일 토큰: `--surface-2` / `--surface-2-border` / `--text-strong` / `--text-muted` / `--radius-md` / `--focus-ring` / `--accent`.
- 단일행 `h-10` 대신 `min-h`/`py-2` + `resize-none`(높이는 호스트가 rows/auto-grow 로 제어). IME 정합성 위해 native `<textarea>` 사용.
- `label` 생략 시 `<label>` 미렌더(composer 는 placeholder + 외부 aria-label 사용).

### `IconArrowUp`

`Icon.tsx` 의 `SvgRoot` 패턴, 24×24 stroke-only `currentColor`. paths: `M12 19V5` + `M6 11l6-6 6 6`. 전송 버튼(`IconButton`/`Button` leadingIcon)에서 사용.

## Tokens

신규 토큰 0. 기존 토큰만 사용.

## Accessibility

- `Textarea`: `label` 제공 시 `htmlFor` 연결, `aria-describedby`(hint/error), `aria-invalid`. composer 는 `aria-label="아쿠에게 메시지"` 를 native textarea 에 직접 부여.
- `IconArrowUp`: `aria-hidden`(SvgRoot 기본) — 의미는 감싸는 버튼의 `aria-label="전송"` 이 전달.
- composer textarea 는 weave 의 `isTextEditingTarget` 계약 대상이 되어 캔버스 핫키(Cmd+Z 등)와 충돌하지 않음(앱 측 wiring, 본 primitive 범위 외).

## Verification

- design-system 패키지에는 컴포넌트 테스트 러너가 없음(기존 관례) → `Textarea`/`IconArrowUp` 는 weave typecheck + Aku e2e(composer 입력/전송 경로)로 검증.
- `pnpm verify`(design-system + weave) green.

## Linked

- `packages/design-system/src/components/Textarea.tsx` — 신규 primitive
- `packages/design-system/src/components/Icon.tsx` — `IconArrowUp` 추가
- `packages/design-system/src/components/index.ts` — barrel export
- `apps/web/src/features/aku/AkuComposer.tsx` — 소비처 (WI-052)
